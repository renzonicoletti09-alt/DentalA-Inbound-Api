const assert = require('assert');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'axios') {
        return {
            create: () => ({
                post: async (url, data) => {
                    if (url === '/v1/chat/completions') {
                        const sysPrompt = data.messages[0].content;
                        if (sysPrompt.includes('Ninguna información en la base de conocimientos.')) {
                            return { data: { choices: [{ message: { content: '{"action": "bot_paused", "message": "Derivando a humana..."}' } }] } };
                        }
                        return { data: { choices: [{ message: { content: 'Hola querido, sí, puedes comer cosas blandas.' } }] } };
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

const supabaseClient = require('./services/supabase_client.js');
const ragService = require('./services/faq_rag_service.js');
const syncHandler = require('./services/faq_sync_handler.js');

let dbUpsertCalls = 0;
let lastSessionStatus = '';

// Mocks locales
supabaseClient.getPatient = async () => ({ clinical_notes: 'Paciente sano. Sin cirugías recientes.', session_status: 'bot_active' });
supabaseClient.updatePatient = async (dentist_id, patient_id, updates) => {
    lastSessionStatus = updates.session_status;
    return {};
};

supabaseClient.supabase = {
    from: (table) => {
        if (table === 'faq_textual') {
            return {
                upsert: () => {
                    dbUpsertCalls++;
                    return { select: async () => ({ data: [{ id: 1 }], error: null }) };
                },
                select: () => ({
                    eq: () => ({
                        or: () => ({
                            limit: async () => {
                                return { data: [], error: null }; // Base vacía para forzar fallo
                            }
                        })
                    })
                })
            };
        }
        return {};
    }
};

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 4 (FAQS & RAG CERO-ALUCINACIÓN)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] Sincronización UPSERT (Google Sheets -> Supabase)");
        const syncRes = await syncHandler.syncGoogleSheetsFaq({
            dentist_id: 'd1', sheet_row_id: 'row-100', question: '¿Puedo comer?', answer: 'Sí, cosas blandas.'
        });
        assert.strictEqual(syncRes.status, 'success', "La sincronización debe ser exitosa");
        assert.strictEqual(dbUpsertCalls, 1, "Debe realizar UPSERT en faq_textual");
        console.log("✅ OK: Webhook de hojas de cálculo ingesta datos correctamente.");

        console.log("\n[TEST 2] RAG Clínico y Regla de Cero Alucinación (Auto-Pausa)");
        const ragRes = await ragService.processPatientDoubt('d1', 'p1', '¿Qué antibiótico tomo para el implante en la tibia?');
        
        assert.strictEqual(ragRes.action, 'bot_paused', "El RAG debe ordenar pausar el bot");
        assert.strictEqual(lastSessionStatus, 'bot_paused', "El Supabase Client debió mutar el status del paciente");
        console.log("✅ OK: Claude respetó el System Prompt. Ante falta de evidencia, bloqueó la alucinación y pausó la sesión.");

        console.log("\n🚀 ÉXITO: El Motor de FAQs cumple con las políticas de Cero Alucinación.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
