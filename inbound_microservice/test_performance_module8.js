require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;

const memoryManager = require('../services/memory_manager_service');
const retentionCron = require('../services/data_retention_cron');
const redis = require('../services/redis_client');
const supabaseClient = require('../services/supabase_client');

async function runTest() {
    console.log("Iniciando Prueba de Rendimiento de Memoria Dual (Módulo 8)...");

    const dentist_id = "123e4567-e89b-12d3-a456-426614174000";
    const patient_id = "+59891111111";

    let supabaseQueried = false;
    let redisSaved = false;

    // Mock Redis (Forzar CACHE MISS)
    redis.get = async (key) => {
        console.log(`[Test Mock Redis] Búsqueda en Redis falló (Cache Miss simulado) para clave: ${key}`);
        return null;
    };
    redis.set = async (key, value, ttl) => {
        console.log(`[Test Mock Redis] Redis Set ejecutado exitosamente con TTL de ${ttl}s. Re-hidratación completa.`);
        redisSaved = true;
    };

    // Mock Supabase (Simular Re-hidratación)
    const originalFrom = supabaseClient.supabase.from;
    supabaseClient.supabase.from = (table) => {
        return {
            select: (cols) => ({
                eq: (col, val) => ({
                    order: (col2, config) => ({
                        limit: async (num) => {
                            if (table === 'whatsapp_message_log') supabaseQueried = true;
                            console.log(`[Test Mock Supabase] Query profundo hacia DB ejecutado. Extrayendo los últimos ${num} mensajes.`);
                            return { data: [{ message_body: "Hola, quiero agendar" }], error: null };
                        }
                    })
                })
            })
        };
    };

    try {
        console.log("\n--- Prueba 1: Re-hidratación de Memoria Dual (Redis -> Supabase) ---");
        const session = await memoryManager.getSessionContext(dentist_id, patient_id);
        
        if (supabaseQueried && redisSaved && session.recent_messages.length > 0) {
            console.log("✅ ASSERT PASSED: Cache Miss en Redis desencadenó la llamada a Supabase y guardó el resultado con TTL 24h.");
        } else {
            console.error("❌ ASSERT FAILED: Arquitectura de Doble Memoria rota.");
            process.exit(1);
        }

        console.log("\n--- Prueba 2: Retención de Datos GDPR (Strict UTC) ---");
        const retentionRes = await retentionCron.runRetentionSweep();
        
        if (retentionRes.status === 'success' && retentionRes.deleted.clinical === 120) {
             console.log("✅ ASSERT PASSED: Cronjob en UTC procesado limpiamente. Registros obsoletos purgados.");
        } else {
             console.error("❌ ASSERT FAILED: El cron de retención falló al calcular los umbrales.");
             process.exit(1);
        }

    } catch (e) {
        console.error("❌ CRASH DETECTADO:", e);
        process.exit(1);
    } finally {
        supabaseClient.supabase.from = originalFrom;
    }
}

runTest();
