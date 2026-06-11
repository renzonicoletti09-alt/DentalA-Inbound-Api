const assert = require('assert');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'axios') {
        return {
            create: () => ({ post: async () => ({ data: { success: true } }) })
        };
    }
    // MOCK PDF-PARSE
    if (path === 'pdf-parse') {
        return async function mockPdfParse(buffer) {
            return { text: "CUIDADOS POST-OPERATORIOS VITALES: No morder alimentos muy duros. Evitar el sol directo. Tomar el analgésico recetado cada 8hs. En caso de hemorragia, contactar a la clínica." };
        };
    }
    if (path === 'form-data') {
        return class FormDataMock {
            constructor() { this.data = {}; }
            append(key, val) { this.data[key] = val; }
            getHeaders() { return {}; }
        };
    }
    if (path === '@supabase/supabase-js') {
        return { createClient: () => ({}) };
    }
    return originalRequire.apply(this, arguments);
};

const csat = require('./services/csat_service.js');
const postOp = require('./services/post_consultation_service.js');
const retention = require('./services/retention_funnel_service.js');
const chatwoot = require('./services/chatwoot_client.js');
const supabaseClient = require('./services/supabase_client.js');

let privateNotes = [];
let outboundMessages = [];
let dbUpserts = [];

chatwoot.createPrivateNote = async (dentist_id, account_id, convId, content) => {
    privateNotes.push(content);
    return { success: true };
};
chatwoot.sendWhatsAppMessage = async (dentist_id, acc, inbox, phone, content) => {
    outboundMessages.push(content);
    return { success: true };
};

// Mock para atrapar los upserts hacia faq_textual
supabaseClient.supabase = {
    from: (table) => ({
        upsert: async (data, config) => {
            dbUpserts.push({ table, data });
            return { data: {}, error: null };
        }
    })
};

async function runTests() {
    console.log("=================================================");
    console.log("🛠️  INICIANDO TDD - MÓDULO 6 (FASE 2: RETENCIÓN & CSAT)");
    console.log("=================================================");
    let exitCode = 0;
    try {
        console.log("\n[TEST 1] CSAT Puntuación Crítica (2 Estrellas)");
        privateNotes = [];
        outboundMessages = [];
        const csatRes = await csat.handleCSATResponse('d1', 'p1', 2);
        
        assert.strictEqual(csatRes.status, 'negative');
        // Validar nota prioritaria en Chatwoot
        assert.ok(privateNotes.length > 0 && privateNotes[0].includes('[CSAT ALERTA]'), "Falta ticket de alerta interna CSAT.");
        // Validar que NO se envió link de Google Maps
        const hasMapsLink = outboundMessages.some(m => m.includes('maps.google.com'));
        assert.ok(!hasMapsLink, "CRÍTICO: El flujo derivó a un paciente furioso a Google Maps.");
        console.log("✅ OK: El sistema maneja crisis bloqueando reseñas públicas y notificando internamente.");

        console.log("\n[TEST 2] Quality Gating (Contingencia en Línea Meta)");
        global.MOCK_META_RATING = 'Yellow'; // Línea advertida
        const gatingRes = await csat.sendCSAT('d1', 'p2');
        assert.strictEqual(gatingRes.status, 'aborted');
        assert.strictEqual(gatingRes.reason, 'meta_quality_low');
        console.log("✅ OK: Los envíos masivos/no esenciales abortan preventivamente si Meta marca la línea en riesgo.");

        console.log("\n[TEST 3] Extracción Automática RAG desde Materiales PDF");
        dbUpserts = [];
        const apt = { id: 101, patient_id: 'p3', status: 'completed', treatment_name: 'Cirugía Maxilofacial', pdf_buffer: Buffer.from('mock pdf stream') };
        await postOp.sendPostOpMaterials('d1', apt);
        
        assert.strictEqual(dbUpserts.length, 1, "Debe ejecutar 1 upsert a la BD.");
        assert.strictEqual(dbUpserts[0].table, 'faq_textual');
        assert.strictEqual(dbUpserts[0].data.category, 'postop');
        assert.ok(dbUpserts[0].data.answer.includes('hemorragia'), "El texto vital no fue extraído del PDF.");
        console.log("✅ OK: El parser consumió el PDF y lo inyectó dinámicamente en el cerebro de soporte (faq_textual).");

        console.log("\n[TEST 4] Embudo Anti-Dormidos (Filtro Inteligente de Wishlist)");
        global.MOCK_META_RATING = 'Green'; // Restaurar score para testear embudo
        outboundMessages = [];
        const now = Date.now();
        const patients = [
            { patient_id: 'p_wishlist', in_wishlist: true, last_appointment_at: new Date(now - 4 * 7 * 24 * 60 * 60 * 1000).toISOString() }, // Debe ser excluido
            { patient_id: 'p_dormido', in_wishlist: false, last_appointment_at: new Date(now - 4 * 7 * 24 * 60 * 60 * 1000).toISOString() } // 4 semanas
        ];
        
        const retRes = await retention.processRetention('d1', patients);
        assert.strictEqual(retRes.count, 1, "El algoritmo falló al filtrar prospectos.");
        console.log("✅ OK: Las campañas detectan la inactividad pero respetan las colisiones lógicas (ignora Wishlist).");

        console.log("\n🚀 ÉXITO: Flujos de Post-Cita, Calidad y Anti-Dormidos 100% Integrados.\n");
    } catch (e) {
        console.error("❌ ERROR EN TEST:", e.message);
        exitCode = 1;
    } finally {
        process.exit(exitCode);
    }
}
runTests();
