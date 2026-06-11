require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;

const { runCopilot } = require('../services/doctor_copilot_service');
const supabaseClient = require('../services/supabase_client');
const chatwoot = require('../services/chatwoot_client');
const litellm = require('../services/litellm_client');

async function runTest() {
    console.log("Iniciando Prueba de Doctor Copilot (Módulo 6 Fase 1)...");

    const dentist_id = "123e4567-e89b-12d3-a456-426614174000";
    
    // Cita en exactamente 10 minutos
    const in10Minutes = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const mockAppointments = [
        { patient_id: "+59891111111", datetime: in10Minutes, copilot_done: false, notes: "Consulta por dolor en molar" }
    ];

    // Mock de Supabase Client
    supabaseClient.getPatient = async (d_id, p_id) => {
        return {
            patient_id: p_id,
            clinical_notes: "Paciente hipertenso controlado. Última visita hace 6 meses para limpieza.",
            psychological_profile: "Ansioso al ruido del torno. Prefiere explicaciones detalladas antes de cada paso.",
            chatwoot_conversation_id: 405
        };
    };

    // Mock de LiteLLM (Simulando respuesta de ChatGPT 5.4 mini)
    const originalCompleteChat = litellm.completeChat;
    litellm.completeChat = async (taskType, messages) => {
        console.log(`[Test Mock] IA invocada para tarea: ${taskType}`);
        return { 
            success: true, 
            text: "- Hipertenso controlado; requiere cuidado con anestésicos.\n- Ansiedad dental: explicar cada paso antes de actuar.\n- Motivo hoy: Dolor en molar (evaluar posible endodoncia)." 
        };
    };

    // Mock de Chatwoot (Verificar que se genere la nota privada)
    let noteCreated = false;
    let createdNoteContent = "";
    chatwoot.createPrivateNote = async (d_id, account_id, conv_id, content) => {
        console.log(`[Test Mock] Nota privada creada en conversación ${conv_id}:\n${content}`);
        noteCreated = true;
        createdNoteContent = content;
        return true;
    };

    try {
        const result = await runCopilot(dentist_id, mockAppointments);
        
        console.log("\nResultado del Copilot:", result);
        
        // Assertion
        if (result.status === 'success' && result.briefings_generated === 1 && noteCreated) {
            console.log("\n✅ ASSERT PASSED: El Copiloto detectó la cita, extrajo perfiles, generó viñetas y despachó la Nota Privada.");
        } else {
            console.error("\n❌ ASSERT FAILED: Falla en la cadena del Copilot.");
            process.exit(1);
        }
        
    } catch (e) {
        console.error("❌ CRASH DETECTADO:", e);
        process.exit(1);
    } finally {
        litellm.completeChat = originalCompleteChat;
    }
}

runTest();
