const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
// Uso del rol n8n_app_user configurado con BYPASSRLS
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; 
const ENCRYPTION_KEY = process.env.DENTALA_ENCRYPTION_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getEncryptionKey() {
    if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY, 'hex').length !== 32) {
        throw new Error('DENTALA_ENCRYPTION_KEY inválida. Debe ser 32 bytes en formato hex.');
    }
    return Buffer.from(ENCRYPTION_KEY, 'hex');
}

function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;
    const [ivHex, authTagHex, content] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function getPatient(dentist_id, patient_id) {
    if (!dentist_id || !patient_id) throw new Error("dentist_id y patient_id son obligatorios para aislamiento multi-tenant.");

    // Regla obligatoria: Siempre incluir dentist_id en WHERE
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('dentist_id', dentist_id)
        .eq('patient_id', patient_id)
        .maybeSingle();

    if (error) throw error;
    
    // Descifrado nativo
    if (data) {
        if (data.clinical_notes) data.clinical_notes = decrypt(data.clinical_notes);
        if (data.psychological_profile) data.psychological_profile = decrypt(data.psychological_profile);
    }
    return data;
}

async function updatePatient(dentist_id, patient_id, updates) {
    if (!dentist_id || !patient_id) throw new Error("dentist_id y patient_id son obligatorios para aislamiento multi-tenant.");

    const payload = { ...updates };
    
    // Cifrado nativo
    if (payload.clinical_notes) {
        payload.clinical_notes = encrypt(payload.clinical_notes);
    }
    if (payload.psychological_profile) {
        payload.psychological_profile = encrypt(payload.psychological_profile);
    }

    // Regla obligatoria: Siempre incluir dentist_id en WHERE
    const { data, error } = await supabase
        .from('patients')
        .update(payload)
        .eq('dentist_id', dentist_id)
        .eq('patient_id', patient_id)
        .select();

    if (error) throw error;
    return data;
}

async function deleteOldRecords(table, dentist_id, dateThreshold) {
    if (!dentist_id) throw new Error("dentist_id es obligatorio para aislamiento multi-tenant.");
    const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('dentist_id', dentist_id)
        .lt('created_at', dateThreshold);

    if (error) throw error;
    return count || 0;
}

async function deleteOldWishlistBatches(dentist_id, dateThreshold) {
    if (!dentist_id) throw new Error("dentist_id es obligatorio para aislamiento multi-tenant.");
    const { error, count } = await supabase
        .from('wishlist_batch_tracking')
        .delete({ count: 'exact' })
        .eq('dentist_id', dentist_id)
        .eq('status', 'completed')
        .lt('created_at', dateThreshold);

    if (error) throw error;
    return count || 0;
}

module.exports = {
    getPatient,
    updatePatient,
    deleteOldRecords,
    deleteOldWishlistBatches,
    supabase
};
