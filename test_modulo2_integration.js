const assert = require('assert');
const Module = require('module');

// 1. Mocking Dependencies
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'ioredis') {
        return class RedisMock {
            constructor() { this.store = new Map(); }
            async set(key, value, ex, ttl, nx) {
                if (nx === 'NX' && this.store.has(key)) return null;
                this.store.set(key, value);
                return 'OK';
            }
            async del(key) { this.store.delete(key); }
            async rpush() { return 1; }
            async expire() { return 1; }
        };
    }
    if (path === 'form-data') {
        return class FormDataMock {
            constructor() { this.data = {}; }
            append(key, val) { this.data[key] = val; }
            getHeaders() { return {}; }
        };
    }
    if (path === 'axios') {
        return {
            create: () => ({
                post: async (url, data, config) => {
                    // Simular LiteLLM
                    if (url === '/v1/chat/completions') {
                        if (data.model === 'claude-sonnet-4.6') {
                            throw new Error('Internal Server Error (Simulado Claude)');
                        }
                        if (data.model === 'chatgpt-5.4-mini') {
                            return { data: { choices: [{ message: { content: 'Respuesta de fallback exitosa' } }] } };
                        }
                    }
                    // Simular Whisper
                    if (url === '/v1/audio/transcriptions') {
                        return { data: { text: "hola muy buenas" } };
                    }
                    throw new Error('Not found');
                }
            })
        };
    }
    return originalRequire.apply(this, arguments);
};

// 2. Import Wrappers
const litellm = require('./services/litellm_client.js');
const redis = require('./services/redis_client.js');

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO AUDITORÍA TDD - MÓDULO 2 (INTEGRACIÓN)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] Prueba de Idempotencia (Redis Lock)");
        const lock1 = await redis.acquireLock('dentist-123', 'patient-456', 'msg-001');
        assert.strictEqual(lock1, true, "El primer intento debería adquirir el lock");
        const lock2 = await redis.acquireLock('dentist-123', 'patient-456', 'msg-001');
        assert.strictEqual(lock2, false, "El segundo intento debería ser bloqueado");
        console.log("✅ OK: El sistema bloquea múltiples webhooks con el mismo ID de mensaje.");

        console.log("\n[TEST 2] Prueba de Fallback LLM (Claude -> GPT mini)");
        const result = await litellm.completeChat('reasoning', [{ role: 'user', content: 'test' }]);
        assert.strictEqual(result.success, true, "El fallback debería tener éxito");
        assert.strictEqual(result.text, 'Respuesta de fallback exitosa', "La respuesta debe venir del fallback");
        console.log("✅ OK: Si Claude falla, el Gateway enruta automáticamente a ChatGPT 5.4 mini.");

        console.log("\n[TEST 3] Prueba de Audio Whisper (< 5 palabras)");
        const whisperResult = await litellm.transcribeAudio(Buffer.from('dummy'), 'dummy.ogg');
        assert.strictEqual(whisperResult.success, false, "El audio debería ser rechazado");
        assert.strictEqual(whisperResult.error, 'audio inaudible', "El error debe indicar 'audio inaudible'");
        console.log("✅ OK: Audios con menos de 5 palabras son rechazados estructuralmente.");

        console.log("\n🚀 ÉXITO: El Módulo 2 cumple al 100% con las políticas de Integración, Fallbacks y Ruteo.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}

runTests();
