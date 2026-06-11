const supabaseClient = require('./supabase_client');
const litellm = require('./litellm_client');

async function processPatientDoubt(dentist_id, patient_id, patientQuery) {
    // 1. Extraer Notas Clínicas del paciente (cifrado se resuelve dentro de getPatient)
    const patientData = await supabaseClient.getPatient(dentist_id, patient_id);
    const clinicalNotes = patientData ? patientData.clinical_notes : 'No hay notas clínicas disponibles.';

    // 2. RAG Textual Simplificado (ILIKE approach)
    // Extraemos palabras clave básicas de la query
    const keywords = patientQuery.split(/\s+/).filter(w => w.length > 4);
    let faqContext = '';

    if (keywords.length > 0) {
        // Seleccionamos las columnas oficiales pregunta y respuesta
        let query = supabaseClient.supabase.from('faq_textual').select('pregunta, respuesta').eq('dentist_id', dentist_id);
        
        // Mapeamos los filtros ILIKE sobre las columnas oficiales de la BD
        const orConditions = keywords.map(kw => `pregunta.ilike.%${kw}%,respuesta.ilike.%${kw}%`).join(',');
        query = query.or(orConditions).limit(3);

        const { data, error } = await query;
        
        if (!error && data && data.length > 0) {
            faqContext = data.map(d => `P: ${d.pregunta}\nR: ${d.respuesta}`).join('\n\n');
        }
    }

    // 3. Prompting con "Marta" y Zero-Hallucination
    const systemPrompt = `
Eres Marta, la asistente virtual de la clínica odontológica (50-55 años, respetuosa, cálida y profesional).
Tu objetivo es responder la duda del paciente usando EXCLUSIVAMENTE el contexto proporcionado.

<context>
Contexto FAQ Clínico:
${faqContext || 'Ninguna información en la base de conocimientos.'}

Notas Clínicas del Paciente (Historial / Post-operatorio):
${clinicalNotes}
</context>

<rules>
<zero_hallucination>
Si la respuesta exacta a la duda clínica del paciente NO está en el <context> (Contexto FAQ ni en las Notas Clínicas), TIENES ESTRICTAMENTE PROHIBIDO inventar información, suponer tratamientos o dar consejos médicos generales.
En ese caso, tu respuesta debe ser exactamente este JSON (sin formato markdown adicional):
{"action": "bot_paused", "message": "Derivando a humana..."}
</zero_hallucination>

Si logras responder con el contexto, responde de forma empática y cálida (en texto normal, sin JSON).
</rules>
    `.trim();

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: patientQuery }
    ];

    // RAG y clínico van al modelo profundo (Claude)
    const llmRes = await litellm.completeChat('rag', messages);
    
    if (!llmRes.success) {
        return { status: 'error', action: 'bot_paused', message: 'Falla en el servicio de IA.' };
    }

    const reply = llmRes.text.trim();

    // Parse JSON fallback rule
    if (reply.includes('"action": "bot_paused"') || reply.includes('"action":"bot_paused"')) {
        // Ejecutar Auto-Pausa
        await supabaseClient.updatePatient(dentist_id, patient_id, { session_status: 'bot_paused' });
        return { 
            status: 'success', 
            action: 'bot_paused', 
            reply: 'Lo siento, como asistente virtual no tengo esa información clínica específica. Un profesional humano te contactará en breve para resolver tu duda.' 
        };
    }

    return { status: 'success', action: 'replied', reply: reply };
}

module.exports = {
    processPatientDoubt
};
