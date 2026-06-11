const engine = require('./wishlist_engine');

async function handleEasyAppointmentsWebhook(webhookData) {
    const { event, dentist_id, slot_datetime } = webhookData;

    // Solo despertarse por cancelación o liberación
    if (event === 'appointment_cancelled' || event === 'slot_freed') {
        console.log(`[Wishlist Trigger] 🔔 Alerta de sistema: Slot liberado el ${slot_datetime} para doctor ${dentist_id}. Gatillando Módulo 5.`);
        return await engine.processWishlistCandidates(dentist_id, slot_datetime);
    } else {
        console.log(`[Wishlist Trigger] Evento '${event}' ignorado. Motor en reposo.`);
        return { status: 'ignored_event' };
    }
}

module.exports = { handleEasyAppointmentsWebhook };
