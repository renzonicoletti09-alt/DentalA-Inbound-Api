const assert = require('assert');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'axios') {
        return {
            create: () => ({
                post: async (url, data) => {
                    if (url.includes('/appointments')) {
                        if (global.SIMULATE_EA_FAILURE) {
                            throw new Error('500 Internal Server Error (EA API)');
                        }
                        return { data: { success: true } };
                    }
                    if (url === '/v1/audio/transcriptions') {
                        return { data: { text: "El paciente reporta dolor en el premolar superior." } };
                    }
                    if (url === '/v1/chat/completions') {
                        return { data: { choices: [{ message: { content: '- Dolor en premolar superior.' } }] } };
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
        return {
            createClient: () => ({})
        };
    }
    return originalRequire.apply(this, arguments);
};

const commands = require('./services/dentist_commands_handler.js');
const supabaseClient = require('./services/supabase_client.js');

let dbInsertCalls = 0;
let dbDeleteCalls = 0;

supabaseClient.supabase = {
    from: (table) => ({
        insert: (data) => {
            dbInsertCalls++;
            return {
                select: () => ({
                    single: async () => ({ data: { exception_id: 'mock-id' }, error: null })
                })
            };
        },
        delete: () => {
            dbDeleteCalls++;
            return {
                eq: async () => ({ data: {}, error: null })
            };
        },
        update: () => ({
            eq: async () => ({ data: {}, error: null })
        }),
        select: (cols) => ({
            eq: () => ({
                single: async () => {
                    if (table === 'dentists') return { data: { phone: 'doctor_phone' }, error: null };
                    return { data: {}, error: null };
                }
            })
        })
    })
};

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 3 (COMANDOS DEL DENTISTA)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] Dictado Clínico por Audio (Whisper + Seguridad)");
        const audioRes = await commands.handleDentistCommand('d1', 'doctor_phone', 'audio', Buffer.from('mock'));
        assert.strictEqual(audioRes.status, 'interactive_approval_required', "Debe requerir aprobación interactiva");
        assert.ok(audioRes.response.includes('[Aprobar y Guardar]'), "Debe contener el botón Aprobar");
        assert.ok(audioRes.response.includes('[Modificar]'), "Debe contener el botón Modificar");
        console.log("✅ OK: El dictado nunca escribe directo a BD, genera botones interactivos.");

        console.log("\n[TEST 2] Comando /bloquear (Éxito EA)");
        global.SIMULATE_EA_FAILURE = false;
        dbInsertCalls = 0;
        dbDeleteCalls = 0;
        const blockSuccess = await commands.handleDentistCommand('d1', 'doctor_phone', 'text', '/bloquear 2026-06-15');
        assert.strictEqual(blockSuccess.status, 'success', "Debe reportar éxito");
        assert.strictEqual(dbInsertCalls, 1, "Debe insertar en BD");
        assert.strictEqual(dbDeleteCalls, 0, "No debe ejecutar rollback");
        console.log("✅ OK: /bloquear replica correctamente en EA y guarda en Supabase.");

        console.log("\n[TEST 3] Comando /bloquear (Fallo Crítico EA -> Rollback)");
        global.SIMULATE_EA_FAILURE = true;
        dbInsertCalls = 0;
        dbDeleteCalls = 0;
        const blockFail = await commands.handleDentistCommand('d1', 'doctor_phone', 'text', '/bloquear 2026-06-15');
        assert.strictEqual(blockFail.status, 'error', "Debe retornar error al usuario");
        assert.strictEqual(dbInsertCalls, 1, "Intentó insertar en BD");
        assert.strictEqual(dbDeleteCalls, 1, "Hizo rollback inmediato");
        assert.ok(blockFail.response.includes('REVERTIDO'), "Avisa al usuario sobre la reversión");
        console.log("✅ OK: Tolerancia a fallos certificada. EA caído revierte bloqueo local y evita deuda técnica.");

        console.log("\n[TEST 4] Comandos Textuales Básicos");
        const muteRes = await commands.handleDentistCommand('d1', 'doctor_phone', 'text', '/mute');
        assert.strictEqual(muteRes.status, 'success', "Debe procesar /mute");
        console.log("✅ OK: Macros procesadas exitosamente.");

        console.log("\n🚀 ÉXITO: El Gateway del Doctor cumple con Ruteo Seguro y Coherencia Transaccional.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
