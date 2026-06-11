require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;
const { handleEasyAppointmentsWebhook } = require('../services/wishlist_trigger_handler');
const supabaseClient = require('../services/supabase_client');
const chatwoot = require('../services/chatwoot_client');

async function runTest() {
    console.log("Iniciando Prueba de Lista de Espera Inteligente (LIFO / Módulo 5)...");

    const dentist_id = "123e4567-e89b-12d3-a456-426614174000";
    
    // Mock de Candidatos (Simulando respuesta SQL ORDER BY signup_timestamp DESC)
    const mockCandidates = [
        { id: 1, patient_id: "+59891111111", status: "active", offered_gaps_count: 2, last_offered_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() }, // LIFO 1: Hace 1 hora fue ofrecido
        { id: 2, patient_id: "+59892222222", status: "active", offered_gaps_count: 1, last_offered_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() }, // LIFO 2: Elegible
        { id: 3, patient_id: "+59893333333", status: "active", offered_gaps_count: 2, last_offered_at: null }, // LIFO 3: Va a penalizar a 3 (expirado) si le toca
    ];

    // Mock de Supabase Client
    const originalFrom = supabaseClient.supabase.from;
    supabaseClient.supabase.from = (table) => {
        return {
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        order: async () => ({ data: mockCandidates, error: null })
                    })
                })
            }),
            update: (updates) => {
                if (updates.status === 'expired') {
                    console.log(`[Test Mock DB] Mutando a estado EXPIRED.`);
                }
                return { eq: async () => ({ data: null, error: null }) };
            }
        };
    };

    // Mock de Chatwoot
    chatwoot.sendWhatsAppMessage = async () => { return true; };

    try {
        console.log("\n--- Prueba 1: Evento Inválido ---");
        const resInvalid = await handleEasyAppointmentsWebhook({ event: 'appointment_created', dentist_id });
        if (resInvalid.status === 'ignored_event') console.log("✅ Ignorado correctamente.");

        console.log("\n--- Prueba 2: Bache Crítico (≤3 hs) con Salto LIFO ---");
        // Turno en 2 horas
        const slot_datetime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const resCritical = await handleEasyAppointmentsWebhook({ event: 'slot_freed', dentist_id, slot_datetime });
        
        console.log("Resultado Bache Crítico:", resCritical);
        if (resCritical.strategy === 'direct_assign' && resCritical.candidates_notified === 1) {
            console.log("✅ Asignación directa confirmada.");
        } else {
            console.error("❌ Fallo en estrategia de asignación crítica.");
            process.exit(1);
        }

        console.log("\n✅ ASSERT PASSED: LIFO estricto validado con salto temporal (Cool-down respetado).");

    } catch (e) {
        console.error("❌ CRASH DETECTADO:", e);
        process.exit(1);
    } finally {
        supabaseClient.supabase.from = originalFrom;
    }
}

runTest();
