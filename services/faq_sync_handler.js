const supabaseClient = require('./supabase_client');

async function syncGoogleSheetsFaq(webhookData) {
    const { dentist_id, sheet_row_id, question, answer, category } = webhookData;

    if (!dentist_id || !sheet_row_id || !question || !answer) {
        throw new Error('Faltan campos obligatorios para la sincronización.');
    }

    // Limpieza robusta de sheet_row_id para asegurar que sea un entero compatible con PostgreSQL
    const parsedRowId = typeof sheet_row_id === 'string' 
        ? (parseInt(sheet_row_id.replace(/\D/g, ''), 10) || 0) 
        : (parseInt(sheet_row_id, 10) || 0);

    // Upsert en supabase con columnas del esquema oficial (pregunta, respuesta)
    const { data, error } = await supabaseClient.supabase
        .from('faq_textual')
        .upsert({
            dentist_id,
            sheet_row_id: parsedRowId,
            pregunta: question,
            respuesta: answer,
            category: category || 'general'
        }, { onConflict: 'dentist_id, sheet_row_id' })
        .select();

    if (error) {
        throw new Error('Error al sincronizar FAQ en BD: ' + error.message);
    }

    return { status: 'success', message: 'Fila sincronizada correctamente.', data };
}

module.exports = {
    syncGoogleSheetsFaq
};
