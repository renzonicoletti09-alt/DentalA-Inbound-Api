const dispatcher = require('./template_dispatcher_workflow');
const csat = require('./csat_service');

async function processRetention(dentist_id, patientsList) {
    // Quality Gating Check
    const rating = await csat.getMetaQualityRating(dentist_id);
    if (rating === 'Yellow' || rating === 'Red') {
        console.warn(`[Quality Gating] 🚧 Rating de Meta en '${rating}'. Abortando envíos Anti-Dormidos masivos.`);
        return { status: 'aborted', reason: 'meta_quality_low' };
    }

    const now = Date.now();
    let notified = 0;

    for (let patient of patientsList) {
        // Excluir si ya están en Lista de Espera (Wishlist)
        if (patient.in_wishlist) {
            console.log(`[Retention] Paciente ${patient.patient_id} ignorado (en Wishlist).`);
            continue;
        }

        // Calcular la inactividad en semanas
        const lastActivity = new Date(patient.last_message_at || patient.last_appointment_at).getTime();
        const weeksInactive = (now - lastActivity) / (1000 * 60 * 60 * 24 * 7);

        let templateName = null;
        
        // Ciclo 1 (4 semanas)
        if (weeksInactive > 3.9 && weeksInactive <= 4.1) {
             templateName = 'retention_cycle1_4w';
        } 
        // Ciclo 2 (3 meses ~ 13 semanas)
        else if (weeksInactive > 12.9 && weeksInactive <= 13.1) {
             templateName = 'retention_cycle2_3m';
        } 
        // Ciclo 3 (6 meses ~ 26 semanas)
        else if (weeksInactive > 25.9 && weeksInactive <= 26.1) {
             templateName = 'retention_cycle3_6m';
        }

        if (templateName) {
            console.log(`[Retention] Paciente ${patient.patient_id} califica para ciclo de ${Math.round(weeksInactive)} semanas. Enviando.`);
            await dispatcher.dispatchTemplate(dentist_id, patient.patient_id, templateName, ['[Agendar]', '[No avisar más]', '[Paso por hoy]']);
            notified++;
        }
    }
    
    return { status: 'processed', count: notified };
}

module.exports = { processRetention };
