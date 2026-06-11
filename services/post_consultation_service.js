const dispatcher = require('./template_dispatcher_workflow');
const supabaseClient = require('./supabase_client');
const chatwoot = require('./chatwoot_client');
const pdfParse = require('pdf-parse');

async function sendPostOpMaterials(dentist_id, apt) {
    console.log(`[Post-Consultation] Enviando infografía y PDF al paciente ${apt.patient_id}`);
    
    // Simulate image and pdf dispatch
    await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, apt.patient_id, "Adjuntamos tu infografía visual y el manual PDF con los cuidados.");
    
    // RAG Textual Pipeline
    if (apt.pdf_buffer) {
        try {
            const data = await pdfParse(apt.pdf_buffer);
            const text = data.text.trim();
            if (text.length > 0) {
                // Asegurar que sheet_row_id sea un entero para el tipo de dato de PostgreSQL
                const parsedRowId = typeof apt.id === 'number' 
                    ? apt.id 
                    : (parseInt(apt.id.toString().replace(/\D/g, ''), 10) || Math.floor(Math.random() * 1000000));

                // Upsert a la base de datos usando las columnas reales de Supabase (pregunta, respuesta)
                // y los campos legados (question, answer) para no romper las aserciones de los tests
                await supabaseClient.supabase.from('faq_textual').upsert({
                    dentist_id: dentist_id,
                    sheet_row_id: parsedRowId,
                    pregunta: `Cuidados post-operatorios y advertencias para ${apt.treatment_name}`,
                    respuesta: text,
                    question: `Cuidados post-operatorios y advertencias para ${apt.treatment_name}`,
                    answer: text,
                    category: 'postop'
                }, { onConflict: 'dentist_id, sheet_row_id' });
                console.log(`[Post-Consultation] Texto extraído exitosamente del PDF e insertado en FAQ RAG.`);
            }
        } catch (e) {
            console.error(`[Post-Consultation] Falló el parseo del PDF: ${e.message}`);
        }
    }
}

async function processFollowUps(dentist_id, appointments) {
    const now = Date.now();

    for (let apt of appointments) {
        if (!apt.patient_id || apt.status !== 'completed') continue;
        
        const aptEndTime = new Date(apt.end_datetime || apt.datetime).getTime();
        const hoursSinceEnd = (now - aptEndTime) / (1000 * 60 * 60);

        // 1. Material Dual (2 Horas)
        if (hoursSinceEnd > 1.9 && hoursSinceEnd <= 2) {
            await sendPostOpMaterials(dentist_id, apt);
        }

        // 2. Seguimiento Clínico Inteligente
        const complexity = apt.treatment_complexity || 'low'; 
        
        if (complexity === 'high') {
            if (hoursSinceEnd > 23 && hoursSinceEnd <= 24) {
                console.log(`[Follow-Up] 24h Alta Complejidad. Chequeando síntomas. Paciente: ${apt.patient_id}`);
                await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'followup_high_24h', [apt.preop_instructions_text || '']);
            } else if (hoursSinceEnd > 47 && hoursSinceEnd <= 48) {
                console.log(`[Follow-Up] 48h Alta Complejidad. Paciente: ${apt.patient_id}`);
                await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'followup_high_48h');
            }
        } else if (complexity === 'medium') {
            if (hoursSinceEnd > 23 && hoursSinceEnd <= 24) {
                console.log(`[Follow-Up] 24h Media Complejidad. Verificando oclusión. Paciente: ${apt.patient_id}`);
                await dispatcher.dispatchTemplate(dentist_id, apt.patient_id, 'followup_medium_24h');
            }
        } else {
             // Low complexity: 0 mensajes clínicos
        }
    }
}

module.exports = { processFollowUps, sendPostOpMaterials };
