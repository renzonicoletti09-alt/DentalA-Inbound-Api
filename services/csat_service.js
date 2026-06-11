const dispatcher = require('./template_dispatcher_workflow');
const chatwoot = require('./chatwoot_client');

// Integración simulada para verificar el Quality Gating de Meta
async function getMetaQualityRating(dentist_id) {
    // Normal state is Green. Contingency triggers on Yellow or Red.
    return global.MOCK_META_RATING || 'Green';
}

async function sendCSAT(dentist_id, patient_id) {
    // Quality Gating
    const rating = await getMetaQualityRating(dentist_id);
    if (rating === 'Yellow' || rating === 'Red') {
        console.warn(`[Quality Gating] 🚧 Alerta Temprana: Rating de Meta en '${rating}'. Abortando envío CSAT no esencial.`);
        return { status: 'aborted', reason: 'meta_quality_low' };
    }

    console.log(`[CSAT] Enviando encuesta de satisfacción (1-5) a paciente ${patient_id}.`);
    await dispatcher.dispatchTemplate(dentist_id, patient_id, 'csat_survey_1_to_5');
    return { status: 'sent' };
}

async function handleCSATResponse(dentist_id, patient_id, score) {
    if (score >= 4) {
        console.log(`[CSAT] Score ${score}. Disparando embudo de reseñas públicas.`);
        await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, patient_id, "¡Nos alegra mucho! ¿Nos regalarías 1 minuto para dejarnos una reseña? https://maps.google.com/...");
        return { status: 'positive' };
    } else {
        console.log(`[CSAT] Score Crítico ${score}. Escalando a soporte prioritario.`);
        // Crear Nota Privada Urgente
        await chatwoot.createPrivateNote(dentist_id, 1, 123, `🚨 [CSAT ALERTA] El paciente ha calificado la cita con ${score} estrellas. Revisa su caso urgentemente.`);
        // Mensaje de contención al paciente
        await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, patient_id, "Lamentamos que tu experiencia no haya sido la mejor. ¿Podrías contarnos qué sucedió? Un supervisor leerá esto enseguida.");
        return { status: 'negative' };
    }
}

module.exports = { sendCSAT, handleCSATResponse, getMetaQualityRating };
