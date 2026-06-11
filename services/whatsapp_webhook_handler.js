const redis = require('./redis_client');
const supabaseClient = require('./supabase_client');
const chatwoot = require('./chatwoot_client');
const litellm = require('./litellm_client');
const dentistCommands = require('./dentist_commands_handler');
const { supabase } = supabaseClient; 

async function handleDentistCommand(dentist_id, sender_phone, message_content, message_type) {
    const res = await dentistCommands.handleDentistCommand(dentist_id, sender_phone, message_type, message_content);
    console.log(`[Bypass] Comando procesado:`, res);
    return res;
}

async function handleInboundWebhook(webhookData) {
    const {
        dentist_id,
        patient_id, // Phone number for patient
        conversation_id,
        message_id,
        message_type,
        message_content,
        error_code,
        is_doctor // Flag if sender is doctor
    } = webhookData;

    // 1. Idempotencia
    const lockAcquired = await redis.acquireLock(dentist_id, patient_id, message_id);
    if (!lockAcquired) {
        console.log(`[Idempotencia] Mensaje ${message_id} ya procesado. Ignorando silenciosamente.`);
        return { status: 'ignored_duplicate' };
    }

    try {
        // 3. Bypass del Dentista
        if (is_doctor) {
            return await handleDentistCommand(dentist_id, patient_id, message_content, message_type);
        }

        // 2. Rescate de Llamadas (Audio/Video de WA no soportado)
        if (message_type === 'unsupported' && error_code === '131050') {
            console.log(`[Rescate Llamada] Llamada perdida detectada de ${patient_id}. Enviando plantilla de rescate.`);
            await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, patient_id, "Hola, vimos que intentaste llamarnos. Por este medio solo atendemos mensajes de texto. ¿En qué podemos ayudarte?");
            return { status: 'rescue_call_sent' };
        }

        // Recuperar paciente
        let patient = await supabaseClient.getPatient(dentist_id, patient_id);
        if (!patient) {
            // Mock MVP si no existe
            patient = { session_status: 'bot_active' };
        }

        if (patient.session_status === 'bot_paused' || patient.session_status === 'blocked_manual_review') {
            return { status: 'ignored_status_' + patient.session_status };
        }

        // 4. Límite de Costos (20 msgs en 24h)
        let messageCount = 0;
        if (supabase) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { count, error } = await supabase
                .from('whatsapp_message_log')
                .select('*', { count: 'exact', head: true })
                .eq('dentist_id', dentist_id)
                .eq('patient_id', patient_id)
                .eq('direction', 'inbound')
                .gte('created_at', yesterday);
            
            if (!error) messageCount = count || 0;
        }

        if (messageCount >= 20) {
            console.log(`[Límites] Paciente ${patient_id} superó 20 mensajes. Pausando bot por 2hs.`);
            await supabaseClient.updatePatient(dentist_id, patient_id, { session_status: 'bot_paused' });
            await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, patient_id, "Hemos recibido muchos mensajes tuyos. Para darte una mejor atención, una secretaria humana continuará con tu caso en breve.");
            return { status: 'bot_paused_due_to_limits' };
        }

        // 5. Triaje y Detección de Abuso (Inyección flag)
        const messagesToLLM = [
            { 
                role: 'system', 
                content: `Eres Marta. Analiza el siguiente mensaje. Si contiene insultos graves, agresiones o spam evidente, retorna un JSON estricto: {"abuse_flag": true}. Si es normal, responde al paciente normalmente en texto plano.` 
            },
            { role: 'user', content: message_content || "..." }
        ];

        const llmResponse = await litellm.completeChat('triage', messagesToLLM);
        
        if (llmResponse.success) {
            const replyText = llmResponse.text;
            
            // Evaluar flag de abuso
            if (replyText.includes('"abuse_flag": true') || replyText.includes('"abuse_flag":true')) {
                console.log(`[Seguridad] Abuso detectado del paciente ${patient_id}. Bloqueando.`);
                await supabaseClient.updatePatient(dentist_id, patient_id, { session_status: 'blocked_manual_review' });
                if (conversation_id) {
                    await chatwoot.createPrivateNote(dentist_id, 1, conversation_id, "⚠️ ALERTA: Paciente bloqueado por sistema anti-abuso. Revisión manual requerida.");
                }
                return { status: 'blocked_abuse' };
            }

            // Flujo normal
            await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, patient_id, replyText);
            return { status: 'replied_successfully' };
        } else {
            // LLM falló globalmente
            if (llmResponse.action === 'bot_paused') {
                await supabaseClient.updatePatient(dentist_id, patient_id, { session_status: 'bot_paused' });
            }
            return { status: 'llm_failed' };
        }

    } catch (err) {
        console.error(`[Webhook] Error crítico:`, err.message);
        return { status: 'error', error: err.message };
    }
}

module.exports = {
    handleInboundWebhook,
    handleDentistCommand
};
