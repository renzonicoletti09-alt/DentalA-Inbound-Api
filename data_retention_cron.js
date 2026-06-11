const supabaseClient = require('./services/supabase_client');

async function runRetentionSweep(dentist_id) {
    console.log(`[DataRetention] 🧹 Iniciando barredor mensual de privacidad para dentista ${dentist_id}`);
    
    // REGLA DE ORO: Todo cálculo en UTC absoluto
    const nowUtc = new Date();
    let deletedRecords = {
        clinical_logs: 0,
        access_logs: 0,
        wishlist_batches: 0
    };

    // 1. Purga de Notas Clínicas Antiguas (>90 días)
    const ninetyDaysAgo = new Date(nowUtc.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString();
    console.log(`[DataRetention] Destruyendo \`access_logs_clinical\` anteriores a ${ninetyDaysAgo} (UTC)`);
    deletedRecords.clinical_logs = await supabaseClient.deleteOldRecords('access_logs_clinical', dentist_id, ninetyDaysAgo);

    // 2. Purga de Logs de Acceso Generales (>180 días)
    const oneEightyDaysAgo = new Date(nowUtc.getTime() - (180 * 24 * 60 * 60 * 1000)).toISOString();
    console.log(`[DataRetention] Destruyendo \`access_logs\` genéricos anteriores a ${oneEightyDaysAgo} (UTC)`);
    deletedRecords.access_logs = await supabaseClient.deleteOldRecords('access_logs', dentist_id, oneEightyDaysAgo);

    // 3. Purga de Transacciones Wishlist Muertas (>90 días y status=completed)
    console.log(`[DataRetention] Destruyendo \`wishlist_batch_tracking\` completados anteriores a ${ninetyDaysAgo} (UTC)`);
    deletedRecords.wishlist_batches = await supabaseClient.deleteOldWishlistBatches(dentist_id, ninetyDaysAgo);

    console.log(`[DataRetention] ✨ Barrido de privacidad finalizado. Registros destruidos de forma segura:`, deletedRecords);
    return deletedRecords;
}

module.exports = { runRetentionSweep };
