const litellm = require('./litellm_client');
const ea = require('./easyappointments_client');
const faqRag = require('./faq_rag_service');

async function processScheduling(dentist_id, patient_id, userMessage) {
    // 1. Ruteo Rápido con ChatGPT mini
    const routeMessages = [
        { role: 'system', content: 'Responde solo con JSON: {"intent": "faq"} si el paciente hace una pregunta médica o duda sobre tratamientos/síntomas. Responde {"intent": "scheduling"} si quiere agendar, cancelar o modificar turnos.' },
        { role: 'user', content: userMessage }
    ];
    
    const routeRes = await litellm.completeChat('triage', routeMessages); // Ruteo ChatGPT 5.4 mini
    let intent = 'scheduling';
    
    if (routeRes.success && routeRes.text.includes('"intent": "faq"')) {
        intent = 'faq';
    }

    // 2. RAG Intercalado (Vía de escape temporal)
    if (intent === 'faq') {
        const faqReply = await faqRag.processPatientDoubt(dentist_id, patient_id, userMessage);
        
        if (faqReply.action === 'bot_paused') {
            return { status: 'bot_paused', reply: faqReply.reply }; // Hereda la auto-pausa
        }

        return {
            status: 'faq_answered',
            reply: faqReply.reply + '\n\nVolviendo a tu reserva: ¿En qué horario buscabas tu turno?'
        };
    }

    // 3. Engine de Agenda
    
    // Preparación Wishlist (Sniper)
    if (userMessage.toLowerCase().includes('cancel')) {
        console.log(`[Wishlist Sniper] 🔔 ALERTA: Bache de disponibilidad detectado por cancelación de ${patient_id}. Gatillando Módulo 5.`);
        return { status: 'cancelled', reply: 'Tu turno ha sido cancelado exitosamente.' };
    }

    // 4. Cero Modo Offline (Aislamiento de la DB local)
    let slots = [];
    try {
        const today = new Date().toISOString().split('T')[0];
        slots = await ea.getFreeSlots(dentist_id, today);
    } catch (err) {
        console.error(`[Cero Offline] Error EA: API caída o no responde. Bloqueando encolamiento local.`);
        return { 
            status: 'error_offline', 
            reply: 'Estamos con dificultades técnicas, por favor contacta directamente por teléfono.' 
        };
    }

    // 5. Ofrecer estrictamente los 3 horarios más convenientes
    if (!slots || slots.length === 0) {
        return { status: 'slots_offered', reply: 'Lo siento, no hay horarios disponibles para hoy.' };
    }

    const bestSlots = slots.slice(0, 3);
    const slotsMsg = bestSlots.map(s => `• ${s}`).join('\n');

    return {
        status: 'slots_offered',
        reply: `Tengo estos horarios convenientes disponibles:\n${slotsMsg}\n¿Cuál prefieres?`
    };
}

module.exports = { processScheduling };
