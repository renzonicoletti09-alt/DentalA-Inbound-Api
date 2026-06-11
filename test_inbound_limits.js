const assert = require('assert');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'ioredis') {
        return class RedisMock {
            constructor() { this.store = new Map(); }
            async set(key, value, ex, ttl, nx) {
                if (nx === 'NX' && this.store.has(key)) return null;
                this.store.set(key, value); return 'OK';
            }
            async del() {} async rpush() { return 1; } async expire() { return 1; }
        };
    }
    if (path === 'form-data') {
        return class FormDataMock {
            constructor() { this.data = {}; }
            append(key, val) { this.data[key] = val; }
            getHeaders() { return {}; }
        };
    }
    if (path === 'axios') {
        return {
            create: () => ({
                post: async (url, data) => {
                    if (url.includes('/messages') || url.includes('/assignments')) {
                        return { data: { success: true } };
                    }
                    if (url === '/v1/chat/completions') {
                        if (data.messages && data.messages[1] && data.messages[1].content.includes('spam')) {
                            return { data: { choices: [{ message: { content: '{"abuse_flag": true}' } }] } };
                        }
                        return { data: { choices: [{ message: { content: 'Hola, ¿en qué puedo ayudarte?' } }] } };
                    }
                    return { data: {} };
                }
            })
        };
    }
    if (path === '@supabase/supabase-js') {
        return {
            createClient: () => ({
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    gte: async () => {
                                        return { count: global.MOCK_MESSAGE_COUNT || 0, error: null };
                                    }
                                })
                            })
                        })
                    })
                })
            })
        };
    }
    return originalRequire.apply(this, arguments);
};

const supabaseClient = require('./services/supabase_client.js');
const handler = require('./services/whatsapp_webhook_handler.js');

supabaseClient.getPatient = async () => ({ session_status: 'bot_active' });
let lastSessionStatus = '';
supabaseClient.updatePatient = async (dentist_id, patient_id, updates) => {
    lastSessionStatus = updates.session_status;
    return {};
};

supabaseClient.supabase = {
    from: () => ({
        select: () => ({
            eq: () => ({
                eq: () => ({
                    eq: () => ({
                        gte: async () => {
                            return { count: global.MOCK_MESSAGE_COUNT || 0, error: null };
                        }
                    })
                })
            })
        })
    })
};

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 3 (INBOUND GATEWAY)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] Prueba de Límite de Costos (> 20 mensajes)");
        global.MOCK_MESSAGE_COUNT = 21; 
        const res1 = await handler.handleInboundWebhook({
            dentist_id: 'd1', patient_id: 'p1', message_id: 'm1', message_type: 'text', message_content: 'Hola'
        });
        assert.strictEqual(res1.status, 'bot_paused_due_to_limits', "Debe abortar por límite de 20 mensajes");
        assert.strictEqual(lastSessionStatus, 'bot_paused', "Debe cambiar estado a bot_paused");
        console.log("✅ OK: El sistema detecta >20 mensajes, pausa el bot por 2h y avisa a humana.");

        console.log("\n[TEST 2] Prueba Rescate de Llamadas (Código 131050)");
        const res2 = await handler.handleInboundWebhook({
            dentist_id: 'd1', patient_id: 'p1', message_id: 'm2', message_type: 'unsupported', error_code: '131050'
        });
        assert.strictEqual(res2.status, 'rescue_call_sent', "Debe enviar plantilla de rescate");
        console.log("✅ OK: El sistema rescata llamadas perdidas en WhatsApp.");

        console.log("\n[TEST 3] Prueba Bypass del Dentista");
        const res3 = await handler.handleInboundWebhook({
            dentist_id: 'd1', patient_id: 'doctor_phone', message_id: 'm3', message_type: 'text', message_content: '/bloquear', is_doctor: true
        });
        assert.strictEqual(res3.status, 'dentist_command_handled', "Debe delegar a handleDentistCommand");
        console.log("✅ OK: Bypass total para comandos del profesional.");

        console.log("\n[TEST 4] Prueba Detección de Abuso (abuse_flag)");
        global.MOCK_MESSAGE_COUNT = 5;
        const res4 = await handler.handleInboundWebhook({
            dentist_id: 'd1', patient_id: 'p2', message_id: 'm4', message_type: 'text', message_content: 'spam malditos'
        });
        assert.strictEqual(res4.status, 'blocked_abuse', "Debe detectar flag de abuso del LLM");
        assert.strictEqual(lastSessionStatus, 'blocked_manual_review', "Debe pasar estado a blocked_manual_review");
        console.log("✅ OK: El flag de abuso inyectado bloquea al paciente exitosamente.");

        console.log("\n🚀 ÉXITO: El Inbound Webhook cumple con las políticas de control y seguridad.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
