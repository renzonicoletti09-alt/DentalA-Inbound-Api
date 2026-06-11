require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;
const fs = require('fs');
const litellm = require('../services/litellm_client');
const { processPatientDoubt } = require('../services/faq_rag_service');
const { processScheduling } = require('../services/scheduling_engine_service');

async function runRegressionSuite() {
    console.log("🚀 Iniciando Pipeline de Evaluación de Prompts (Prompt Engineering as Code)...\n");
    
    const dataset = JSON.parse(fs.readFileSync('prompt_eval_dataset.json', 'utf8'));
    let passed = 0;
    let failed = 0;

    // Interceptar LiteLLM para extraer los prompts inyectados
    let lastSystemPrompt = "";
    const originalCompleteChat = litellm.completeChat;
    
    for (const testCase of dataset) {
        console.log(`[TEST: ${testCase.id}] - ${testCase.description}`);
        
        litellm.completeChat = async (taskType, messages) => {
            lastSystemPrompt = messages[0].content;
            
            // Simular respuesta basada en la directiva
            if (taskType.includes('triage') || taskType.includes('chatgpt')) {
                return { success: true, text: `{"intent": "${testCase.expected_intent}"}` };
            } else if (taskType.includes('rag') || taskType.includes('claude')) {
                // Validación Estricta de Prompts Modernos (2026 Best Practices para Claude)
                // Claude requiere directivas críticas envueltas en tags XML
                if (!lastSystemPrompt.includes('<rules>') || !lastSystemPrompt.includes('<zero_hallucination>')) {
                    console.log("  ⚠️ [Alerta de Deriva] El System Prompt no utiliza XML Tags estructurales (<rules>, <zero_hallucination>). Claude Sonnet podría ignorar las instrucciones en contextos largos.");
                    return { success: true, text: "Respuesta alucinada: Tómese 500mg de Amoxicilina." }; // Simular Alucinación
                }
                
                if (testCase.expected_action === 'bot_paused') {
                    return { success: true, text: '{"action": "bot_paused", "message": "Derivando a humana..."}' };
                }
                return { success: true, text: "Respuesta médica validada por RAG." };
            }
        };

        try {
            let result;
            if (testCase.task === 'triage') {
                result = await processScheduling('123e4567-e89b-12d3-a456-426614174000', 'test_patient', testCase.input);
                if ((result.status === 'faq_answered' && testCase.expected_intent === 'faq') || 
                    (result.status !== 'faq_answered' && testCase.expected_intent === 'scheduling')) {
                    console.log("  ✅ Ruteo de Intención Correcto.");
                    passed++;
                } else {
                    console.error(`  ❌ Falla de Intención. Output:`, result);
                    failed++;
                }
            } else if (testCase.task === 'rag') {
                result = await processPatientDoubt('123e4567-e89b-12d3-a456-426614174000', 'test_patient', testCase.input);
                if (result.action === testCase.expected_action) {
                    console.log(`  ✅ RAG Output Correcto: ${result.action}`);
                    passed++;
                } else {
                    console.error(`  ❌ Falla Crítica (Posible Alucinación). Se esperaba ${testCase.expected_action}, se obtuvo ${result.action}.`);
                    failed++;
                }
            }
        } catch (e) {
            console.error("  ❌ Exception:", e.message);
            failed++;
        }
        console.log("--------------------------------------------------");
    }

    litellm.completeChat = originalCompleteChat; // Restaurar

    console.log(`\nResultados: ${passed} Pasados | ${failed} Fallidos`);
    if (failed > 0) {
        console.error("🚨 LA SUITE DE REGRESIÓN HA FALLADO. Revisa la estructura de tus Prompts.");
        process.exit(1);
    } else {
        console.log("🛡️ REGRESIÓN SUPERADA. Prompts blindados exitosamente.");
    }
}

runRegressionSuite();
