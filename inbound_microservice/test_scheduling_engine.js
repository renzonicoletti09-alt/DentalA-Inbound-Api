require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;

const { processScheduling } = require('../services/scheduling_engine_service');
const ea = require('../services/easyappointments_client');

async function runTest() {
    console.log("Iniciando Prueba Cero Modo Offline (Módulo 4 Fase 2)...");
    
    const dentist_id = "123e4567-e89b-12d3-a456-426614174000";
    const patient_id = "+59891111111"; 
    
    const userMessage = "Quiero agendar un turno para mañana a la mañana";
    console.log(`\nMensaje del Paciente: "${userMessage}"`);

    // Monkey-patch a la API de EA para simular que el servidor está CAÍDO (HTTP 500)
    const originalGetFreeSlots = ea.getFreeSlots;
    ea.getFreeSlots = async () => {
        console.log("[Test Mock] Simulando caída catastrófica de Easy!Appointments (HTTP 500)...");
        throw new Error("HTTP 500 Internal Server Error");
    };

    try {
        const result = await processScheduling(dentist_id, patient_id, userMessage);
        console.log("\nResultado del Engine de Agenda:", result);
        
        // Assertion
        if (result.status === 'error_offline' && result.reply.includes('dificultades técnicas')) {
            console.log("\n✅ ASSERT PASSED: El sistema bloqueó el guardado local y emitió el mensaje de dificultades técnicas correcto.");
        } else {
            console.error("\n❌ ASSERT FAILED: El sistema ignoró la caída de la API o no devolvió el mensaje requerido.");
            process.exit(1);
        }
        
    } catch (e) {
        console.error("❌ CRASH DETECTADO:", e);
        process.exit(1);
    } finally {
        ea.getFreeSlots = originalGetFreeSlots; // Restore
    }
}

runTest();
