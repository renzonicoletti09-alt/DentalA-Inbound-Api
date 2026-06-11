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
    // Solo traducir si tenemos una clave de API configurada y apuntamos a producción
    if (LITELLM_KEY && LITELLM_URL && LITELLM_URL.includes('dental-a.com')) {
        if (modelName.includes('claude-sonnet-4.6') || modelName.includes('claude-sonnet') || modelName.includes('claude-3-5-sonnet')) {
            return 'claude-3.5-sonnet';
        }
        if (modelName.includes('chatgpt-5.4-mini') || modelName.includes('chatgpt-5.4') || modelName.includes('gpt-4o-mini')) {
            return 'gpt-4o-mini';
        }
    }
    return modelName;
}

async function routePrompt(taskType, prompt, messages) {
    let model;
    if (['rag', 'clinical', 'reasoning'].includes(taskType)) {
        model = 'claude-3-5-sonnet-20241022';
    } else {
        model = 'gpt-4o-mini';
    }
    return {
        model_used: model,
        primary: model,
        fallback: 'gpt-4o-mini'
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
