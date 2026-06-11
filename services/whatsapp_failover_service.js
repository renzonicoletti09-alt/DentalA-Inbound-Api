const chatwoot = require('./chatwoot_client');

async function sendWithFailover(dentist_id, patient_id, message) {
    let inbox_id_1 = 1; // whatsapp_number_1
    let inbox_id_2 = 2; // whatsapp_number_2

    try {
        // Intento 1 en whatsapp_number_1
        await chatwoot.sendWhatsAppMessage(dentist_id, 1, inbox_id_1, patient_id, message);
        return { success: true, via: 'whatsapp_number_1' };
    } catch (e1) {
        try {
            // Intento 2 (consecutivo) en whatsapp_number_1
            await chatwoot.sendWhatsAppMessage(dentist_id, 1, inbox_id_1, patient_id, message);
            return { success: true, via: 'whatsapp_number_1' };
        } catch (e2) {
            // Ambos fallaron. Failover a whatsapp_number_2
            try {
                await chatwoot.sendWhatsAppMessage(dentist_id, 1, inbox_id_2, patient_id, message);
                return { success: true, via: 'whatsapp_number_2', warning: 'Failover VIP activado' };
            } catch (e3) {
                // Fallo Total
                console.error(`[SysAdmin Alert] CRÍTICO: Todos los canales de WhatsApp outbound caídos para doctor ${dentist_id}.`);
                return { success: false, error: 'Outbound pausado. Alerta enviada al SysAdmin.' };
            }
        }
    }
}

module.exports = { sendWithFailover };
