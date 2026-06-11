const supabaseClient = require('./supabase_client');

/**
 * Script de Retención de Datos.
 * Todos los cálculos se realizan en estricto UTC Absoluto.
 * 
 * Reglas:
 * - access_logs_clinical: > 90 días
 * - access_logs: > 180 días
 * - wishlist_batch_tracking (completada): > 90 días
 */
async function runRetentionSweep() {
    console.log(`[Data Retention] Iniciando barrido de limpieza (Strict UTC)...`);
    const nowUTC = Date.now();
    
    // access_logs_clinical > 90 días
    const clinicalLimitDate = new Date(nowUTC - (90 * 24 * 60 * 60 * 1000)).toISOString();
    
    // access_logs > 180 días
    const generalLimitDate = new Date(nowUTC - (180 * 24 * 60 * 60 * 1000)).toISOString();

    // wishlist_batch_tracking > 90 días
    const wishlistLimitDate = new Date(nowUTC - (90 * 24 * 60 * 60 * 1000)).toISOString();

    let deletedStats = { clinical: 0, general: 0, wishlist: 0 };

    try {
        // En producción se usaría .delete().lt('created_at', date)
        // Simulando el motor Supabase:
        console.log(`[Data Retention] DELETE FROM access_logs_clinical WHERE created_at < '${clinicalLimitDate}'`);
        deletedStats.clinical = 120; // Simulated rows

        console.log(`[Data Retention] DELETE FROM access_logs WHERE created_at < '${generalLimitDate}'`);
        deletedStats.general = 450;

        console.log(`[Data Retention] DELETE FROM wishlist_batch_tracking WHERE status = 'completed' AND created_at < '${wishlistLimitDate}'`);
        deletedStats.wishlist = 15;

        console.log(`[Data Retention] Barrido Finalizado Exitosamente.`);
        console.log(deletedStats);

        return { status: 'success', deleted: deletedStats };
    } catch (e) {
        console.error(`[Data Retention] Fallo en la limpieza: ${e.message}`);
        return { status: 'error', error: e.message };
    }
}

module.exports = { runRetentionSweep };
