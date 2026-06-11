const redis = require('./redis_client');
const supabaseClient = require('./supabase_client');

// Lógica de Doble Memoria (Redis Primario -> Supabase Fallback)
async function getSessionContext(dentist_id, patient_id) {
    const redisKey = `session:${dentist_id}:${patient_id}`;
    
    try {
        // 1. Intento Rápido en Redis (Latencia ~20ms)
        const cachedSession = await redis.get(redisKey);
        if (cachedSession) {
            console.log(`[Memory Manager] Cache Hit: Sesión recuperada desde Redis para ${patient_id}.`);
            return JSON.parse(cachedSession);
        }
    } catch (e) {
        console.warn(`[Memory Manager] Falla en Redis al leer sesión de ${patient_id}: ${e.message}. Cayendo a Supabase...`);
    }

    // 2. Cache Miss / Redis Caído -> Re-hidratación desde Supabase
    console.log(`[Memory Manager] Cache Miss: Re-hidratando sesión desde Supabase para ${patient_id}...`);
    try {
        let dbMessages;
        if (typeof supabaseClient.getRecentMessages === 'function') {
            dbMessages = await supabaseClient.getRecentMessages(dentist_id, patient_id, 10);
        } else {
            const { data, error } = await supabaseClient.supabase
                .from('whatsapp_message_log')
                .select('message_body, sender_type, created_at')
                .eq('patient_id', patient_id)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) throw error;
            dbMessages = data || [];
        }

        const messagesMapped = dbMessages.map(m => ({
            role: m.sender_type || m.role || 'user',
            content: m.message_body || m.content || '',
            created_at: m.created_at
        }));

        const sessionContext = {
            patient_id,
            last_rehydrated: new Date().toISOString(),
            hydrated_at_utc: new Date().toISOString(),
            recent_messages: dbMessages,
            messages: messagesMapped
        };

        // 3. Restaurar en Redis con TTL de 24 horas (86400 segundos)
        await saveSessionContext(dentist_id, patient_id, sessionContext);
        
        return sessionContext;
    } catch (e) {
        console.error(`[Memory Manager] Error fatal de re-hidratación: ${e.message}`);
        return { 
            patient_id, 
            recent_messages: [], 
            messages: [], 
            hydrated_at_utc: new Date().toISOString() 
        }; // Degradación elegante
    }
}

async function saveSessionContext(dentist_id, patient_id, contextData) {
    const redisKey = `session:${dentist_id}:${patient_id}`;
    try {
        // Guardar con TTL de 24h
        await redis.set(redisKey, JSON.stringify(contextData), 86400);
        console.log(`[Memory Manager] Sesión guardada en Redis (TTL: 24h) para ${patient_id}.`);
    } catch (e) {
        console.warn(`[Memory Manager] No se pudo guardar sesión en Redis para ${patient_id}: ${e.message}`);
    }
}

module.exports = { getSessionContext, saveSessionContext };
