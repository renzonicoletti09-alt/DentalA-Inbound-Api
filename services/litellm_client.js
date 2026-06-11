const axios = require('axios');

const LITELLM_URL = process.env.DENTALA_LITELLM_URL || 'https://litellm.dental-a.com';
const LITELLM_KEY = process.env.DENTALA_LITELLM_KEY;

const client = axios.create({
    baseURL: LITELLM_URL,
    headers: {
        'Authorization': `Bearer ${LITELLM_KEY}`,
        'Content-Type': 'application/json'
    }
});

function translateModel(modelName) {
    // Traducir nombres internos a los aliases registrados en LiteLLM producción
    if (LITELLM_KEY && LITELLM_URL && LITELLM_URL.includes('dental-a.com')) {
        if (modelName.includes('claude-sonnet-4.6') || modelName.includes('claude-sonnet-4-6') ||
            modelName.includes('claude-sonnet') || modelName.includes('claude-3-5-sonnet') ||
            modelName.includes('claude-3.5-sonnet') || modelName.includes('claude')) {
            return 'claude-sonnet-4.6'; // → anthropic/claude-sonnet-4-6
        }
        if (modelName.includes('chatgpt-5.4-mini') || modelName.includes('gpt-5.4-mini') ||
            modelName.includes('chatgpt-5.4') || modelName.includes('gpt-4o-mini') ||
            modelName.includes('mini')) {
            return 'chatgpt-5.4-mini'; // → openai/gpt-5.4-mini
        }
    }
    return modelName;
}

async function routePrompt(taskType, prompt, messages) {
    let model;
    if (['rag', 'clinical', 'reasoning'].includes(taskType)) {
        // Tareas complejas → Claude Sonnet 4.6 (Prompt Caching activo)
        model = 'claude-sonnet-4.6';
    } else {
        // Tareas rápidas/baratas → ChatGPT-5.4-mini
        model = 'chatgpt-5.4-mini';
    }
    return {
        model_used: model,
        primary: model,
        fallback: 'chatgpt-5.4-mini' // fallback siempre al modelo económico
    };
}

async function completeChat(taskType, messages, temperature = 0.7) {
    const { primary, fallback } = await routePrompt(taskType);

    try {
        console.log(`[LiteLLM Client] Intentando modelo primario: ${primary}`);
        const response = await client.post('/v1/chat/completions', {
            model: translateModel(primary),
            messages: messages,
            temperature: temperature
        });
        const text = response.data?.choices?.[0]?.message?.content;
        return { success: true, model_used: primary, text: text };
    } catch (e) {
        console.warn(`[LiteLLM Client] Fallo en modelo primario (${primary}): ${e.message}. Intentando fallback: ${fallback}`);
        try {
            const response = await client.post('/v1/chat/completions', {
                model: translateModel(fallback),
                messages: messages,
                temperature: temperature
            });
            const text = response.data?.choices?.[0]?.message?.content;
            return { success: true, model_used: fallback, text: text };
        } catch (err) {
            console.error(`[LiteLLM Client] Fallo crítico: modelo fallback (${fallback}) también falló: ${err.message}`);
            return { success: false, error: err.message };
        }
    }
}

async function transcribeAudio(audioBuffer, filename) {
    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', audioBuffer, { filename: filename || 'audio.ogg' });
        form.append('model', 'whisper-1');

        const response = await client.post('/v1/audio/transcriptions', form, {
            headers: {
                ...form.getHeaders()
            }
        });

        const text = response.data?.text || '';
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        
        if (wordCount < 5) {
            return { success: false, error: 'audio inaudible', text };
        }

        return { success: true, text };
    } catch (e) {
        console.error(`[LiteLLM Transcribe] Error de transcripción: ${e.message}`);
        return { success: false, error: e.message };
    }
}

module.exports = {
    routePrompt,
    completeChat,
    transcribeAudio
};
