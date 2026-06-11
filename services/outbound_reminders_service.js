const dispatcher = require('./template_dispatcher_workflow');
const supabaseClient = require('./supabase_client');

async function processReminders(dentist_id, appointments) {
    const now = Date.now();
    for (let apt of appointments) {
        if (!apt.patient_id) continue;
        
        // 1. Rescate de Inasistencias (No-Show)
        if (apt.status === 'no_show') {
            const noShowTime = new Date(apt.updated_at || apt.datetime).getTime();
            const hoursSinceNoShow = (now - noShowTime) / (1000 * 60 * 60);
            
            // Evaluamos la ventana de 2 horas de gracia
            if (hoursSinceNoShow >= 2) {
                const patientData = await supabaseClient.getPatient(dentist_id, apt.patient_id);
                if (patientData && patientData.allow_outbound_campaigns) {
                    console.log(`[Reminders] Ejecutando rescate No-Show para ${apt.patient_id}`);
                    await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'no_show_rescue_v1');
                }
            }
            continue;
        }

        // 2. Sistema 3-3-4 (Recordatorios en UTC Absoluto)
        const aptTime = new Date(apt.datetime).getTime();
        const hoursAhead = (aptTime - now) / (1000 * 60 * 60);
        
        // 3 Semanas (504 horas)
        if (hoursAhead > 503 && hoursAhead <= 504) {
             console.log(`[Reminders] Enviando aviso preventivo 3 Semanas a ${apt.patient_id}`);
             await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'reminder_3_weeks');
        }
        // 72 Horas (3 Días)
        else if (hoursAhead > 71 && hoursAhead <= 72) {
             console.log(`[Reminders] Enviando aviso 72 Horas (Interactivo) a ${apt.patient_id}`);
             const patientData = await supabaseClient.getPatient(dentist_id, apt.patient_id);
             let vars = [apt.datetime];
             if (patientData && patientData.pre_op_notes) vars.push('Nota Pre-Op Adjunta');
             await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'reminder_72h_interactive', vars);
        }
        // 48 Horas (2 Días)
        else if (hoursAhead > 47 && hoursAhead <= 48) {
             console.log(`[Reminders] Enviando doble confirmación cálida 48 Horas a ${apt.patient_id}`);
             await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'reminder_48h_warm');
        }
        // 4 Horas (Mapa)
        else if (hoursAhead > 3 && hoursAhead <= 4) {
             console.log(`[Reminders] Enviando mapa de ubicación 4 Horas a ${apt.patient_id}`);
             await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'reminder_4h_map');
        }
    }
}

module.exports = { processReminders };
