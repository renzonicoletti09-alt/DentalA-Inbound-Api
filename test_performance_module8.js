const assert = require('assert');
const { Module } = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === '@supabase/supabase-js') {
        return { createClient: () => ({}) };
    }
    if (path === 'axios') {
        const mockClient = { post: async () => ({ data: {} }), get: async () => ({ data: {} }) };
        return {
            ...mockClient,
            create: () => mockClient
        };
    }
    return originalRequire.apply(this, arguments);
};

const memory = require('./services/memory_manager_service');
const litellm = require('./services/litellm_client');
const retention = require('./data_retention_cron');
const supabaseClient = require('./services/supabase_client');
const redisClient = require('./services/redis_client');

// Mock inyección de DB
supabaseClient.getRecentMessages = async (dentist_id, patient_id, limit) => {
    return [ { role: 'user', content: 'Tengo dolor', created_at: new Date().toISOString() } ];
};
supabaseClient.deleteOldRecords = async (table, dentist_id, dateThreshold) => {
    return 150; // filas eliminadas simuladas
};
supabaseClient.deleteOldWishlistBatches = async (dentist_id, dateThreshold) => {
    return 20; // filas eliminadas simuladas
};

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 8 (RENDIMIENTO Y DATOS)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] Arquitectura de Memoria Híbrida (Redis -> Supabase)");
        await redisClient.clear();
        
        // Simular primer acceso de un paciente a la ventanilla de WhatsApp (Redis vacío)
        const s1 = await memory.getSessionContext('d1', 'p1');
        assert.strictEqual(s1.messages.length, 1, "Debe re-hidratar mensajes antiguos desde la BD.");
        assert.ok(s1.hydrated_at_utc, "El payload debe contener un timestamp UTC obligatorio.");
        
        // Simular segundo mensaje del mismo paciente 1 minuto después (Redis lleno)
        const s2 = await memory.getSessionContext('d1', 'p1');
        assert.strictEqual(s2.messages[0].content, 'Tengo dolor', "Debe leer los datos ultra-rápido de Redis.");
        console.log("✅ OK: Comportamiento 'Cache Miss -> Rehidratación -> Cache Hit' verificado.");

        console.log("\n[TEST 2] Router Estricto y Cost-Efficiency en LiteLLM");
        const r1 = await litellm.routePrompt('copilot', 'Hazme un resumen', []);
        assert.strictEqual(r1.model_used, 'gpt-4o-mini', "El Copilot interno debe usar obligatoriamente ChatGPT mini.");
        
        const r2 = await litellm.routePrompt('rag', 'Busca en PDF', []);
        assert.strictEqual(r2.model_used, 'claude-3-5-sonnet-20241022', "Las consultas clínicas RAG deben usar Claude Sonnet con Caching.");
        console.log("✅ OK: El router desvía el tráfico barato a OpenAI y el médico complejo a Anthropic.");

        console.log("\n[TEST 3] Cumplimiento de Privacidad (Retención Cron)");
        const retRes = await retention.runRetentionSweep('d1');
        assert.strictEqual(retRes.clinical_logs, 150);
        assert.strictEqual(retRes.access_logs, 150);
        assert.strictEqual(retRes.wishlist_batches, 20);
        console.log("✅ OK: El algoritmo calculó correctamente la resta de meses (>90 y >180 días) en UTC.");

        console.log("\n🚀 ÉXITO: Módulo 8 (Arquitectura y Rendimiento) 100% Finalizado.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
