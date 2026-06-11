require('dotenv').config({ path: '../.env' });
process.env.SUPABASE_URL = process.env.DENTALA_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = process.env.DENTALA_SUPABASE_KEY;

// Interceptar pdf-parse antes de cargar los servicios
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'pdf-parse') return async () => ({ text: "CUIDADOS POST-OPERATORIOS. 1. Tomar analgésico. 2. Evitar masticar de ese lado." });
    return originalRequire.apply(this, arguments);
};

const { handleCSATResponse } = require('../services/csat_service');
const { sendPostOpMaterials } = require('../services/post_consultation_service');
const chatwoot = require('../services/chatwoot_client');
const supabaseClient = require('../services/supabase_client');

async function runTest() {
    console.log("Iniciando Prueba de Outbound Fase 2 (Módulo 6)...");

    const dentist_id = "123e4567-e89b-12d3-a456-426614174000";
    const patient_id = "+59891111111";

    let noteCreated = false;
    let fallbackMessageSent = false;
    let faqUpserted = false;

    // Mock Chatwoot
    chatwoot.createPrivateNote = async (d_id, acc_id, conv_id, content) => {
        if (content.includes('[CSAT ALERTA]')) noteCreated = true;
        console.log(`[Test Mock Chatwoot] Nota Privada: ${content}`);
        return true;
    };
    chatwoot.sendWhatsAppMessage = async (d_id, a_id, i_id, p_id, content) => {
        if (content.includes('supervisor leerá esto')) fallbackMessageSent = true;
        console.log(`[Test Mock Chatwoot] WA Message a ${p_id}: ${content}`);
        return true;
    };

    // Mock Supabase para RAG
    const originalFrom = supabaseClient.supabase.from;
    supabaseClient.supabase.from = (table) => {
        return {
            upsert: async (data) => {
                if (table === 'faq_textual' && data.answer.includes('Evitar masticar de ese lado')) {
                    faqUpserted = true;
                    console.log(`[Test Mock Supabase] Texto de PDF inyectado en RAG (faq_textual) exitosamente.`);
                }
                return { data: null, error: null };
            }
        };
    };

    // Mock PDF Parse 
    const mockPdfParse = async (buffer) => {
        return { text: "CUIDADOS POST-OPERATORIOS. 1. Tomar analgésico. 2. Evitar masticar de ese lado." };
    };
    // Interceptar la dependencia en tiempo real
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function(id) {
        if (id === 'pdf-parse') return mockPdfParse;
        return originalRequire.apply(this, arguments);
    };

    try {
        console.log("\n--- Prueba 1: CSAT 2 Estrellas (Queja) ---");
        const csatRes = await handleCSATResponse(dentist_id, patient_id, 2);
        
        if (csatRes.status === 'negative' && noteCreated && fallbackMessageSent) {
            console.log("✅ ASSERT PASSED: CSAT de 2 estrellas mitigado. Nota prioritaria creada y paciente contenido.");
        } else {
            console.error("❌ ASSERT FAILED: El sistema no contuvo al paciente ni alertó al equipo.");
            process.exit(1);
        }

        console.log("\n--- Prueba 2: Extracción PDF a RAG ---");
        const aptMock = {
            id: 99,
            patient_id,
            treatment_name: "Extracción",
            pdf_buffer: Buffer.from("falso_pdf_binario")
        };
        await sendPostOpMaterials(dentist_id, aptMock);

        if (faqUpserted) {
            console.log("✅ ASSERT PASSED: El PDF fue parseado (OCR/Text) y volcado a la memoria del bot (RAG).");
        } else {
            console.error("❌ ASSERT FAILED: No se insertó el texto del PDF en faq_textual.");
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ CRASH DETECTADO:", e);
        process.exit(1);
    } finally {
        supabaseClient.supabase.from = originalFrom;
        Module.prototype.require = originalRequire;
    }
}

runTest();
