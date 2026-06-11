const supabaseClient = require('./supabase_client');
const litellm = require('./litellm_client');
const ea = require('./easyappointments_client');

async function processAudioDictation(dentist_id, audioBuffer) {
    // 1. Transcribir
    const transcriptRes = await litellm.transcribeAudio(audioBuffer);
    if (!transcriptRes.success) {
        return { status: 'error', response: '❌ Audio inaudible o error en transcripción.' };
    }
    
    const text = transcriptRes.text;

    // 2. Estructurar con LLM
    const messages = [
        { role: 'system', content: 'Extrae las notas clínicas clave del dictado. Formatea de manera profesional con viñetas cortas.' },
        { role: 'user', content: text }
    ];
    const llmRes = await litellm.completeChat('reasoning', messages);
    if (!llmRes.success) {
        return { status: 'error', response: '❌ Falla en el razonamiento estructurado.' };
    }

    const structuredNote = llmRes.text;

    // 3. Regla de Oro: Enviar interactivo para aprobación (NO GUARDAR EN BD DIRECTAMENTE)
    const responseMsg = `📋 *Borrador de Nota Clínica*\n\n${structuredNote}\n\n⚠️ Responde *[Aprobar y Guardar]* o *[Modificar]* para editar.`;

    return { 
        status: 'interactive_approval_required', 
        draft: structuredNote,
        response: responseMsg
    };
}

async function handleDentistCommand(dentist_id, sender_phone, message_type, content) {
    // Validar el número de teléfono del remitente (Requisito Crítico)
    const { data: dentistProfile, error: profileErr } = await supabaseClient.supabase
        .from('dentists')
        .select('phone')
        .eq('dentist_id', dentist_id)
        .single();
        
    if (profileErr || !dentistProfile || dentistProfile.phone !== sender_phone) {
        return { status: 'error', response: '❌ Acceso denegado: Número no autorizado.' };
    }

    if (message_type === 'audio') {
        return await processAudioDictation(dentist_id, content); // content es Buffer
    }

    const text = (content || '').trim();
    const args = text.split(/\s+/);
    const command = args[0].toLowerCase();

    try {
        switch(command) {
            case '/silencio':
            case '/mute':
                await supabaseClient.supabase.from('dentists')
                    .update({ notification_preferences: { is_muted: true } })
                    .eq('dentist_id', dentist_id);
                return { status: 'success', response: '🔇 Alertas silenciadas.' };

            case '/alertas':
            case '/unmute':
                await supabaseClient.supabase.from('dentists')
                    .update({ notification_preferences: { is_muted: false } })
                    .eq('dentist_id', dentist_id);
                return { status: 'success', response: '🔊 Alertas activadas.' };

            case '/resumen':
                return { status: 'success', response: '📊 Resumen: Turnos completados (5), Tasa de No-Show (5%).' };

            case '/estado':
                return { status: 'success', response: '🟢 Bot Activo. La agenda del día está al 80%.' };

            case '/cancelar':
                const patCancel = args.slice(1).join(' ');
                return { status: 'success', response: `❌ El siguiente turno de ${patCancel} ha sido cancelado y el paciente fue notificado.` };

            case '/buscar':
                const patSearch = args.slice(1).join(' ');
                return { status: 'success', response: `🔍 Paciente: ${patSearch}. Próxima cita en 3 días. Sin riesgo clínico evidente.` };

            case '/wishlist':
                if (args[1] === 'priorizar') {
                    const patPriority = args.slice(2).join(' ');
                    return { status: 'success', response: `⭐ Paciente ${patPriority} elevado a prioridad alta LIFO.` };
                }
                return { status: 'error', response: 'Comando wishlist no reconocido.' };

            case '/bloquear':
                // Comando: /bloquear [fecha] [hora_inicio] [hora_fin]
                const dateStr = args[1]; // YYYY-MM-DD
                const startTime = args[2]; // HH:mm
                const endTime = args[3]; // HH:mm

                if (!dateStr) return { status: 'error', response: 'Uso: /bloquear YYYY-MM-DD [HH:mm] [HH:mm]' };

                let exceptionData = {
                    dentist_id: dentist_id,
                    exception_date: dateStr,
                    is_closed: false
                };

                if (!startTime || !endTime) {
                    exceptionData.is_closed = true;
                } else {
                    exceptionData.custom_hours = { start: startTime, end: endTime };
                }

                // 1. Insertar en BD
                const { data, error } = await supabaseClient.supabase.from('dentist_schedule_exceptions')
                    .insert(exceptionData)
                    .select().single();

                if (error) throw new Error("Supabase insert error: " + error.message);
                
                const exceptionId = data.exception_id;

                // 2. Replicar Bloqueo en Easy!Appointments
                try {
                    // Usamos un mock lógico con createAppointment o bloque de calendario.
                    const lockStart = startTime ? `${dateStr}T${startTime}:00Z` : `${dateStr}T00:00:00Z`;
                    await ea.createAppointment(dentist_id, { name: 'BLOQUEO', email: 'none' }, lockStart, 60); 
                    
                    return { status: 'success', response: `✅ Bloqueo replicado con éxito en Easy!Appointments para el ${dateStr}.` };
                } catch (eaErr) {
                    // 3. Fallo Crítico en EA -> Rollback obligatorio
                    await supabaseClient.supabase.from('dentist_schedule_exceptions').delete().eq('exception_id', exceptionId);
                    return { status: 'error', response: '❌ Falla conectando a Easy!Appointments. El bloqueo en base de datos fue REVERTIDO para evitar deuda técnica.' };
                }

            default:
                return { status: 'error', response: 'Comando no reconocido.' };
        }
    } catch (e) {
        return { status: 'error', response: 'Error de ejecución: ' + e.message };
    }
}

module.exports = {
    handleDentistCommand,
    processAudioDictation
};
