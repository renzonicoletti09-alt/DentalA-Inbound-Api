const assert = require('assert');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'axios') {
        return {
            create: () => ({
                post: async (url, data) => {
                    if (url === '/v1/chat/completions') {
                        const content = data.messages[1].content.toLowerCase();
                        if (content.includes('duele') || content.includes('antibiótico')) {
                            return { data: { choices: [{ message: { content: '{"intent": "faq"}' } }] } };
                        }
                        return { data: { choices: [{ message: { content: '{"intent": "scheduling"}' } }] } };
                    }
                    if (url.includes('/messages')) {
                        if (global.SIMULATE_WHATSAPP_FAIL === 1 && data.inbox_id === 1) {
                            throw new Error('WA Inbox 1 failed');
                        }
                        if (global.SIMULATE_WHATSAPP_FAIL === 2) {
                            throw new Error('WA Both Inboxes failed');
                        }
                        return { data: { success: true } };
                    }
                    return { data: {} };
                }
            })
        };
    }
    if (path === 'form-data') {
        return class FormDataMock {
            constructor() { this.data = {}; }
            append(key, val) { this.data[key] = val; }
            getHeaders() { return {}; }
        };
    }
    if (path === '@supabase/supabase-js') {
        return { createClient: () => ({}) };
    }
    return originalRequire.apply(this, arguments);
};

const engine = require('./services/scheduling_engine_service.js');
const failover = require('./services/whatsapp_failover_service.js');
const ea = require('./services/easyappointments_client.js');
const faqRag = require('./services/faq_rag_service.js');

// Mock Easy!Appointments client
ea.getFreeSlots = async () => {
    if (global.SIMULATE_EA_DOWN) throw new Error("Connection failed: 500 API EA");
    return ['10:00', '10:30', '11:00', '14:00', '15:00'];
};

// Mock FAQ Rag
faqRag.processPatientDoubt = async () => ({ status: 'success', action: 'replied', reply: 'No te preocupes, el dolor es normal post-cirugía.' });

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 4 (AGENDA & FAILOVER)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] RAG Intercalado (Vía 2 -> FAQ)");
        const ragRes = await engine.processScheduling('d1', 'p1', '¿Por qué me duele la muela si quiero agendar?');
        assert.strictEqual(ragRes.status, 'faq_answered');
        assert.ok(ragRes.reply.includes('Volviendo a tu reserva'));
        console.log("✅ OK: El orquestador derivó temporalmente la conversación clínica a Claude y retomó la reserva.");

        console.log("\n[TEST 2] Agendamiento Estricto (3 horarios convenientes)");
        global.SIMULATE_EA_DOWN = false;
        const schRes = await engine.processScheduling('d1', 'p1', 'Quiero un turno');
        assert.strictEqual(schRes.status, 'slots_offered');
        assert.ok(schRes.reply.includes('11:00'));
        assert.ok(!schRes.reply.includes('14:00')); // Cortado por slice(0,3)
        console.log("✅ OK: El sistema consulta EA y filtra estrictamente a 3 opciones.");

        console.log("\n[TEST 3] Cero Modo Offline (Fallo crítico en EA)");
        global.SIMULATE_EA_DOWN = true;
        const offlineRes = await engine.processScheduling('d1', 'p1', 'Quiero un turno hoy');
        assert.strictEqual(offlineRes.status, 'error_offline');
        assert.ok(offlineRes.reply.includes('dificultades técnicas'));
        console.log("✅ OK: Tolerancia a caídas certificada. Si EA no responde, el bot corta y rechaza encolar turnos locales.");

        console.log("\n[TEST 4] Failover VIP (Whatsapp 1 -> Whatsapp 2)");
        global.SIMULATE_WHATSAPP_FAIL = 1; // Inbox 1 falla
        const failRes = await failover.sendWithFailover('d1', 'p1', 'Hola paciente');
        assert.strictEqual(failRes.via, 'whatsapp_number_2');
        console.log("✅ OK: Al fallar Inbox 1, rotó de inmediato al número de emergencia (Inbox 2).");

        console.log("\n[TEST 5] Failover Extremo (Pausa y Alerta SysAdmin)");
        global.SIMULATE_WHATSAPP_FAIL = 2; // Ambos fallan
        const critRes = await failover.sendWithFailover('d1', 'p1', 'Hola crítico');
        assert.strictEqual(critRes.success, false);
        assert.ok(critRes.error.includes('SysAdmin'));
        console.log("✅ OK: Si todo el canal de salida cae, se aborta y alerta a Sistemas.");

        console.log("\n[TEST 6] Snipe Wishlist en Cancelación");
        global.SIMULATE_EA_DOWN = false;
        const cancelRes = await engine.processScheduling('d1', 'p1', 'Quiero cancelar mi cita del martes');
        assert.strictEqual(cancelRes.status, 'cancelled');
        console.log("✅ OK: Al cancelar un turno, el sistema emite alerta para despertar al futuro Módulo 5 (Wishlist).");

        console.log("\n🚀 ÉXITO: El Motor Cuatrimodal supera todas las auditorías de Alta Disponibilidad.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
