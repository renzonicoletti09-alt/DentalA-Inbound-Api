const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'create_scheduling_schema.sql');

if (!fs.existsSync(schemaPath)) {
    console.error("❌ ERROR: No se encontró el archivo create_scheduling_schema.sql");
    process.exit(1);
}

const sql = fs.readFileSync(schemaPath, 'utf8');
let errors = [];

function assertTest(condition, message) {
    if (!condition) {
        errors.push(message);
        console.error(`❌ FALLO: ${message}`);
    } else {
        console.log(`✅ OK: ${message}`);
    }
}

console.log("=================================================");
console.log("🛠️ INICIANDO AUDITORÍA TDD - MÓDULO 1 HARDENING");
console.log("=================================================");

// 1. Esquema Relacional
assertTest(/CREATE TABLE IF NOT EXISTS public\.patients/.test(sql), "La tabla 'patients' debe existir.");
assertTest(/CREATE TABLE IF NOT EXISTS public\.appointments/.test(sql), "La tabla 'appointments' debe existir.");
assertTest(/CREATE TABLE IF NOT EXISTS public\.wishlist/.test(sql), "La tabla 'wishlist' debe existir.");

// 2. Mapeos de Estado y Errores Previos (Auditoría V2)
assertTest(/status.*no_show/.test(sql), "La columna 'status' en APPOINTMENTS debe incluir el estado 'no_show'.");
assertTest(/session_status.*blocked_manual_review/.test(sql), "La columna 'session_status' en PATIENTS debe incluir 'blocked_manual_review'.");
assertTest(/category\s+VARCHAR.*general.*postop/.test(sql), "La tabla FAQ_TEXTUAL debe incluir la columna 'category'.");

// 3. Tipos de Cifrado AES (Texto en Base64)
assertTest(/clinical_notes\s+TEXT/.test(sql), "La columna 'clinical_notes' debe ser tipo TEXT para soportar AES Base64/Hex.");
assertTest(/psychological_profile\s+TEXT/.test(sql), "La columna 'psychological_profile' debe ser tipo TEXT para soportar AES Base64/Hex.");

// 4. Optimizaciones y Extensión GIN
assertTest(/CREATE EXTENSION IF NOT EXISTS "pg_trgm"/.test(sql), "Debe declararse la extensión pg_trgm.");
assertTest(/USING GIN/.test(sql), "Debe existir al menos un índice usando GIN.");

// 5. Seguridad y Roles
assertTest(/CREATE ROLE n8n_app_user WITH.*BYPASSRLS/.test(sql), "Debe crearse el rol 'n8n_app_user' con la bandera BYPASSRLS.");
assertTest(/ENABLE ROW LEVEL SECURITY/.test(sql), "Debe habilitarse RLS en las tablas.");
assertTest(/INSERT INTO storage\.buckets.*'treatment-documents'.*false/s.test(sql), "El bucket 'treatment-documents' debe crearse como privado (public = false).");

console.log("=================================================");
if (errors.length > 0) {
    console.error(`\n🚨 AUDITORÍA FALLIDA: Se encontraron ${errors.length} violaciones a la arquitectura.`);
    process.exit(1);
} else {
    console.log("\n🚀 ÉXITO: El Módulo 1 cumple al 100% con los estándares de Hardening, Arquitectura y Cifrado.");
    process.exit(0);
}
