const litellm = require('./litellm_client');
const supabaseClient = require('./supabase_client');
const chatwoot = require('./chatwoot_client');

async function runCopilot(dentist_id, incomingAppointments) {
    let processed = 0;
    const now = Date.now();

    for (let apt of incomingAppointments) {
        const aptTime = new Date(apt.datetime).getTime();
        const minutesAhead = (aptTime - now) / (1000 * 60);

        // Cronjob: buscar citas inminentes (dentro de los próximos 10 a 15 minutos)
        if (minutesAhead >= 0 && minutesAhead <= 15 && !apt.copilot_done) {
            console.log(`[Copilot] Preparando Briefing Médico para cita inminente de ${apt.patient_id}`);
            
            // 1. Extraer perfiles (descifrados por el Módulo 2)
            const patientData = await supabaseClient.getPatient(dentist_id, apt.patient_id);
            if (!patientData) continue;

            const clinical = patientData.clinical_notes || 'Sin historial clínico en sistema.';
            const psych = patientData.psychological_profile || 'Sin perfil psicológico registrado.';

            // 2. IA ChatGPT 5.4 mini para resumir en estrictamente 3 viñetas
            const prompt = `
            Actúa como Copiloto Médico del Doctor. Genera un briefing estrictamente de 3 viñetas breves sobre el paciente que está a punto de ingresar.
            Historial Clínico: ${clinical}
            Perfil Psicológico: ${psych}
            Motivo de Cita: ${apt.notes || 'Revisión general'}
            `;

            const messages = [
                { role: 'system', content: 'Responde SOLO con 3 viñetas (bullet points) usando formato markdown. No agregues saludos ni despedidas.' },
                { role: 'user', content: prompt }
            ];

            const llmRes = await litellm.completeChat('triage', messages);
            const briefing = llmRes.success ? llmRes.text : '- Error al generar briefing de Copilot.';

            // 3. Enviar a Chatwoot como Nota Privada (Solo la lee el Doctor)
            const convId = patientData.chatwoot_conversation_id || 999;
            await chatwoot.createPrivateNote(dentist_id, 1, convId, `🧠 [COPILOT BRIEFING]\n\n${briefing.trim()}`);
            
            processed++;
        }
    }
    
    return { status: 'success', briefings_generated: processed };
}

module.exports = { runCopilot };
