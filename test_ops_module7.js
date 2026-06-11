const assert = require('assert');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'axios') {
        return {
            get: async (url, config) => {
                if (global.SIMULATE_HTTP_500) {
                    throw new Error("HTTP 500");
                }
                return { status: 200 };
            },
            create: () => ({
                post: async () => ({ data: { success: true } }),
                get: async () => ({ data: { success: true } })
            })
        };
    }
    if (path === '@supabase/supabase-js') {
        return { createClient: () => ({}) };
    }
    return originalRequire.apply(this, arguments);
};

const health = require('./services/health_monitor_service.js');
const analytics = require('./services/kpi_analytics_service.js');
const supabaseClient = require('./services/supabase_client.js');
const chatwoot = require('./services/chatwoot_client.js');

let privateNotes = [];
chatwoot.createPrivateNote = async (dentist_id, account_id, convId, content) => {
    privateNotes.push(content);
    return { success: true };
};

// Mock de DB para Extracción de KPIs
supabaseClient.getWeeklyMetrics = async (dentist_id) => {
    return {
        scheduled_count: 50,
        cancelled_count: 5,
        recovered_count: 3,
        faqs_answered: 12,
        meta_messages_sent: 100
    };
};

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 7 (OPS, ROI & FAIL-SAFES)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] Monitor de Salud - Operatividad Normal (UP)");
        global.SIMULATE_HTTP_500 = false;
        privateNotes = [];
        const h1 = await health.runHealthCheck('d1');
        
        assert.strictEqual(h1.status, 'healthy', "El sistema debe detectar la salud correcta.");
        assert.strictEqual(h1.promotional_active, true, "Las promociones deben estar habilitadas.");
        assert.ok(h1.latencies.ea < 3000, "El presupuesto de latencia (< 3s) debe respetarse.");
        console.log("✅ OK: El sistema reporta latencia en presupuesto y servicios activos.");

        console.log("\n[TEST 2] Protocolo de Caída de Infraestructura (Fail-Safe)");
        global.SIMULATE_HTTP_500 = true;
        const h2 = await health.runHealthCheck('d1');
        
        assert.strictEqual(h2.status, 'alert_triggered');
        assert.strictEqual(h2.promotional_active, false, "CRÍTICO: El Outbound promocional no fue pausado ante la caída.");
        assert.ok(privateNotes.length > 0 && privateNotes[0].includes('[SYSADMIN ALERT]'), "Falta enviar ticket al SysAdmin en Chatwoot.");
        console.log("✅ OK: Supervivencia activada. Outbound no logístico en PAUSA. Sistema notificado.");

        console.log("\n[TEST 3] Comando /resumen y Análisis de Facturación");
        const res = await analytics.generateSummary('d1');
        
        assert.strictEqual(res.status, 'success');
        assert.strictEqual(res.metrics.agendados, 50);
        assert.strictEqual(res.metrics.cancelados, 5);
        assert.strictEqual(res.metrics.asistencia, '90.0', "Error en el cálculo algorítmico de tasa de asistencia.");
        
        // Validación Financiera:
        // Recuperados (3) * $50 = $150 rescatados
        // Meta Msg (100) * $0.05 = $5 costo
        // ROI = $145
        assert.strictEqual(res.metrics.roiNeto, 145, "Las matemáticas del ROI Neto están calculadas incorrectamente.");
        assert.ok(res.summary.includes('+$145.00 USD'), "El reporte no imprime la moneda y símbolo correcto.");
        console.log("✅ OK: Matemáticas de monetización calculadas y formateadas correctamente.");

        console.log("\n🚀 ÉXITO: Módulo 7 (Fail-Safes y Monitoreo ROI) 100% certificado.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
