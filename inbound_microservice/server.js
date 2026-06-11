require('dotenv').config();
const express = require('express');
const { handleInboundWebhook } = require('../services/whatsapp_webhook_handler');

const app = express();
app.use(express.json());

// Endpoint que recibirá el Webhook directamente desde Chatwoot
app.post('/webhook/whatsapp', async (req, res) => {
    try {
        const body = req.body;
        
        // Extraer variables desde el payload de Chatwoot
        const patient_phone = body.conversation?.meta?.sender?.phone_number || body.sender?.phone_number;
        const message_content = body.messages?.[0]?.content || '';
        const message_id = body.messages?.[0]?.id || `msg-${Date.now()}`;
        const message_type = body.message_type || 'incoming';
        
        // Validación básica
        if (!patient_phone) {
            return res.status(400).json({ error: "No patient phone number provided" });
        }

        const conversation_id = body.conversation?.id || body.id || null;

        const webhookData = {
            dentist_id: "123e4567-e89b-12d3-a456-426614174000", // UUID válido por defecto en MVP
            patient_id: patient_phone,
            conversation_id: conversation_id,
            message_id: message_id,
            message_type: message_type,
            message_content: message_content,
            error_code: null,
            is_doctor: false // Configurar según lógica (ej. comparando con número del doctor)
        };

        console.log(`[Webhook Inbound] Recibido mensaje de ${patient_phone}: "${message_content}"`);

        // Derivar al handler robusto original (Idempotencia, Límites, Triaje, etc.)
        const result = await handleInboundWebhook(webhookData);
        
        res.status(200).json(result);
    } catch (err) {
        console.error('[Servidor] Error crítico procesando webhook:', err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Cerebro Inbound Microservicio corriendo en el puerto ${PORT}`);
    console.log(`Ruta de webhook: POST /webhook/whatsapp`);
});
