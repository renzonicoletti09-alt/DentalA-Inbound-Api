const supabaseClient = require('./supabase_client');
const chatwoot = require('./chatwoot_client');
const { supabase } = supabaseClient;

async function processWishlistCandidates(dentist_id, freedSlotDatetime) {
    const slotTime = new Date(freedSlotDatetime).getTime();
    const now = Date.now();
    const hoursAhead = (slotTime - now) / (1000 * 60 * 60);

    // Filter compatible candidates: active status, sorting LIFO
    const { data: candidates, error } = await supabaseClient.supabase
        .from('wishlist')
        .select('*')
        .eq('dentist_id', dentist_id)
        .eq('status', 'active')
        .order('signup_timestamp', { ascending: false }); // LIFO estricto (últimos anotados primero)

    if (error || !candidates || candidates.length === 0) {
        console.log(`[Wishlist] No hay candidatos activos en espera para el doctor ${dentist_id}.`);
        return { status: 'no_candidates' };
    }

    let selectedCandidates = [];
    let strategy = '';

    if (hoursAhead > 4) {
        // Enviar a los 3 mejores LIFO
        selectedCandidates = candidates.slice(0, 3);
        strategy = 'batch_3';
        console.log(`[Wishlist] >4 hs: Enviando oferta a los 3 candidatos más recientes (LIFO).`);
    } else if (hoursAhead > 3 && hoursAhead <= 4) {
        // Enviar a los 15 más recientes (Broadcast)
        selectedCandidates = candidates.slice(0, 15);
        strategy = 'broadcast_15';
        console.log(`[Wishlist] 3-4 hs: Broadcast a ${selectedCandidates.length} candidatos (Resolución FCFS delegada a EA).`);
    } else if (hoursAhead <= 3 && hoursAhead > 0) {
        // Bache crítico: Asignar directo al último LIFO con saltos
        let skips = 0;
        strategy = 'direct_assign';
        for (let candidate of candidates) {
            if (skips >= 3) break;
            
            // Check si fue notificado en las últimas 2 hs
            const lastOffered = candidate.last_offered_at ? new Date(candidate.last_offered_at).getTime() : 0;
            const hoursSinceLastOffer = (now - lastOffered) / (1000 * 60 * 60);
            
            if (hoursSinceLastOffer <= 2) {
                console.log(`[Wishlist] Salto aplicado a paciente ${candidate.patient_id} (notificado hace < 2hs)`);
                skips++;
                continue;
            }
            
            selectedCandidates.push(candidate);
            break; // solo 1 candidato
        }
        console.log(`[Wishlist] <=3 hs (CRÍTICO): Asignación directa al candidato LIFO tras ${skips} saltos.`);
    } else {
        return { status: 'too_late' };
    }

    // Penalización y Limpieza
    for (let c of selectedCandidates) {
        let newCount = (c.offered_gaps_count || 0) + 1;
        let updates = {
            offered_gaps_count: newCount,
            last_offered_at: new Date(now).toISOString()
        };

        if (newCount >= 3) {
            updates.status = 'expired';
            console.log(`[Wishlist] Candidato ${c.patient_id} expirado tras 3 ofertas ignoradas.`);
            await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, c.patient_id, "Hola, hemos intentado ofrecerte varios turnos adelantados sin respuesta. Te hemos retirado de la lista de espera automática. Si aún buscas turno, envíanos un mensaje.");
        } else {
            await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, c.patient_id, `¡Hola! Se ha liberado un turno antes de lo previsto para el ${freedSlotDatetime}. Si lo quieres, responde RÁPIDO a este mensaje.`);
        }

        await supabaseClient.supabase.from('wishlist').update(updates).eq('id', c.id);
    }

    return { status: 'processed', candidates_notified: selectedCandidates.length, strategy: strategy };
}

module.exports = { processWishlistCandidates };
