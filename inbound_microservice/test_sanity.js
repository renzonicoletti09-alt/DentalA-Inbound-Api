require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;
process.env.CHATWOOT_URL = process.env.DENTALA_CHATWOOT_URL;
process.env.CHATWOOT_API_KEY = process.env.DENTALA_CHATWOOT_TOKEN;

const { handleInboundWebhook } = require('../services/whatsapp_webhook_handler');

async function runTest() {
    console.log("Iniciando Sanity Check...");
    
    const mockWebhookData = {
        dentist_id: "123e4567-e89b-12d3-a456-426614174000",
        patient_id: "+59891111111", // Fake phone
        conversation_id: 12345, // Fake conversation ID
        message_id: `msg-${Date.now()}`,
        message_type: "incoming",
        message_content: "Este es un mensaje normal de prueba.",
        error_code: null,
        is_doctor: false
    };

    try {
        console.log("Probando flujo normal...");
        const resultNormal = await handleInboundWebhook(mockWebhookData);
        console.log("Resultado Normal:", resultNormal);
        
        console.log("\nProbando flujo de abuso...");
        mockWebhookData.message_id = `msg-${Date.now()}`;
        mockWebhookData.message_content = "Eres un insulto muy feo";
        const resultAbuse = await handleInboundWebhook(mockWebhookData);
        console.log("Resultado Abuso:", resultAbuse);
        
        console.log("\nSanity Check completado sin TypeErrors.");
    } catch (e) {
        console.error("❌ CRASH DETECTADO:", e);
        process.exit(1);
    }
}

runTest();
