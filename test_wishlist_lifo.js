const assert = require('assert');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'axios') {
        return {
            create: () => ({
                post: async (url, data) => {
                    return { data: { success: true } };
                }
            })
        };
    }
    if (path === '@supabase/supabase-js') {
        return { createClient: () => ({}) };
    }
    return originalRequire.apply(this, arguments);
};

const trigger = require('./services/wishlist_trigger_handler.js');
const supabaseClient = require('./services/supabase_client.js');

let dbUpdates = [];

const mockCandidates = [
    { id: 1, patient_id: 'p1', dentist_id: 'd1', status: 'active', signup_timestamp: '2026-06-10T10:00:00Z', offered_gaps_count: 0, last_offered_at: null }, 
    { id: 2, patient_id: 'p2', dentist_id: 'd1', status: 'active', signup_timestamp: '2026-06-10T11:00:00Z', offered_gaps_count: 2, last_offered_at: null }, 
    { id: 3, patient_id: 'p3', dentist_id: 'd1', status: 'active', signup_timestamp: '2026-06-10T12:00:00Z', offered_gaps_count: 0, last_offered_at: new Date(Date.now() - 1000 * 60 * 60).toISOString() }, // Hace 1 hora
    { id: 4, patient_id: 'p4', dentist_id: 'd1', status: 'active', signup_timestamp: '2026-06-10T13:00:00Z', offered_gaps_count: 0, last_offered_at: null }  // Más reciente (LIFO Top)
];

// Mock Supabase
supabaseClient.supabase = {
    from: (table) => {
        if (table === 'wishlist') {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            order: async () => {
                                // LIFO orden: DESC by timestamp
                                const sorted = [...mockCandidates].sort((a, b) => new Date(b.signup_timestamp) - new Date(a.signup_timestamp));
                                return { data: sorted, error: null };
                            }
                        })
                    })
                }),
                update: (updates) => ({
                    eq: async (field, val) => {
                        dbUpdates.push({ id: val, updates });
                        return { data: {}, error: null };
                    }
                })
            };
        }
        return {};
    }
};

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 5 (WISHLIST 2.0 LIFO)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] Trigger Filtra Eventos Correctamente");
        const resIgnore = await trigger.handleEasyAppointmentsWebhook({ event: 'appointment_created', dentist_id: 'd1', slot_datetime: new Date().toISOString() });
        assert.strictEqual(resIgnore.status, 'ignored_event', "Debe ignorar creaciones");
        console.log("✅ OK: El Trigger duerme ante eventos irrelevantes.");

        console.log("\n[TEST 2] Ráfaga >4 horas (Batch 3 LIFO)");
        dbUpdates = [];
        const futureDate = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
        const resBatch = await trigger.handleEasyAppointmentsWebhook({ event: 'appointment_cancelled', dentist_id: 'd1', slot_datetime: futureDate });
        assert.strictEqual(resBatch.strategy, 'batch_3');
        assert.strictEqual(dbUpdates.length, 3, "Debe notificar exactamente a 3 candidatos");
        assert.strictEqual(dbUpdates[0].id, 4);
        assert.strictEqual(dbUpdates[1].id, 3);
        assert.strictEqual(dbUpdates[2].id, 2);
        console.log("✅ OK: LIFO estricto funciona y notifica a los 3 más recientes.");

        console.log("\n[TEST 3] Regla de Penalización (Expulsión tras 3 fallos)");
        const p2Update = dbUpdates.find(u => u.id === 2);
        assert.strictEqual(p2Update.updates.status, 'expired', "Debe mutar status a expired");
        console.log("✅ OK: El candidato que ignoró 3 ofertas es retirado de la wishlist automáticamente.");

        console.log("\n[TEST 4] Ráfaga <=3 horas (Asignación Directa y Saltos)");
        dbUpdates = [];
        const criticalDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const resDirect = await trigger.handleEasyAppointmentsWebhook({ event: 'slot_freed', dentist_id: 'd1', slot_datetime: criticalDate });
        assert.strictEqual(resDirect.strategy, 'direct_assign');
        assert.strictEqual(dbUpdates.length, 1, "Debe notificar a 1 solo candidato");
        assert.strictEqual(dbUpdates[0].id, 4, "Debe asignar al top 1");
        console.log("✅ OK: Bache crítico asigna directamente a 1 candidato LIFO.");

        console.log("\n[TEST 5] Regla de Salto (Notificado en las últimas 2 hs)");
        dbUpdates = [];
        mockCandidates[3].last_offered_at = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // ID 4 notificado hace 30m
        const resSkip = await trigger.handleEasyAppointmentsWebhook({ event: 'slot_freed', dentist_id: 'd1', slot_datetime: criticalDate });
        assert.strictEqual(dbUpdates.length, 1);
        assert.strictEqual(dbUpdates[0].id, 2, "Debe saltar al id 4 y al id 3 y elegir el id 2");
        console.log("✅ OK: El motor salta correctamente a candidatos saturados (notificados hace <2hs).");

        console.log("\n🚀 ÉXITO: El Módulo 5 supera todas las reglas de Prioridad y Caducidad.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
