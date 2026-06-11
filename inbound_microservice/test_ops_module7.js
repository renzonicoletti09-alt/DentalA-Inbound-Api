require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;

const axios = require('axios');
const healthMonitor = require('../services/health_monitor_service');
const kpiService = require('../services/kpi_analytics_service');
const chatwoot = require('../services/chatwoot_client');

async function runTest() {
    console.log("Iniciando Prueba Ops & Fail-Safes (Módulo 7)...");

    const dentist_id = "123e4567-e89b-12d3-a456-426614174000";
    let alertDispatched = false;

    // Mock Chatwoot Alert
    chatwoot.createPrivateNote = async (d_id, a_id, c_id, content) => {
        if (content.includes('[FAIL-SAFE ACTIVADO]') || content.includes('🔴 CRÍTICO')) {
            alertDispatched = true;
            console.log(`[Test Mock Chatwoot] 🔔 ALERTA SYSADMIN: ${content}`);
        }
        return true;
    };

    // Mock Axios (Simular caída HTTP 500 en EasyAppointments)
    const originalAxiosGet = axios.get;
    axios.get = async (url, config) => {
        if (url.includes('agenda.dental-a.com')) {
            console.log(`[Test Mock HTTP] Disparando Error 500 en la API de Agenda...`);
            return Promise.reject(new Error("Timeout / 500 Internal Server Error"));
        }
        return { status: 200, data: { status: 'ok' } };
    };

    try {
        console.log("\n--- Prueba 1: Fail-Safes (Caída de API) ---");
        await healthMonitor.pingEndpoints(dentist_id);
        
        if (!healthMonitor.isPromotionalAllowed() && alertDispatched) {
            console.log("✅ ASSERT PASSED: La caída bloqueó el outbound promocional y despachó la alerta al SysAdmin.");
        } else {
            console.error("❌ ASSERT FAILED: El sistema no entró en Fail-Safe.");
            process.exit(1);
        }

        console.log("\n--- Prueba 2: Cálculo de ROI Financiero ---");
        const reportText = await kpiService.generateResumenCommand(dentist_id);
        console.log("\n[Salida del Comando /resumen]:\n" + reportText + "\n");
        
        if (reportText.includes('Beneficio Neto IA: $225.00') && reportText.includes('Tasa de Asistencia: 97.6%')) {
             console.log("✅ ASSERT PASSED: Fórmulas de ROI ejecutadas correctamente.");
        } else {
             console.error("❌ ASSERT FAILED: Matemática del ROI errónea.");
             process.exit(1);
        }

    } catch (e) {
        console.error("❌ CRASH DETECTADO:", e);
        process.exit(1);
    } finally {
        axios.get = originalAxiosGet; // Restaurar
    }
}

runTest();
