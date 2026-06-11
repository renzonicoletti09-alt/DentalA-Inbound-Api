const chatwoot = require('./chatwoot_client');

async function dispatchTemplate(dentist_id, patient_id, templateName, variables = []) {
    // Este sub-workflow simula el encapsulamiento de SaaS Gating.
    // Todas las comunicaciones Outbound (fuera de 24h) deben pasar por aquí.
    
    console.log(`[Template Dispatcher] Despachando plantilla de Meta '${templateName}' al paciente ${patient_id}.`);
    
    // Simulate Meta Template resolution payload
    let content = `[Plantilla Oficial WhatsApp: ${templateName}]\n`;
    if (variables && variables.length > 0) {
        content += `Variables insertadas: ${variables.join(' | ')}`;
    }

    // Usar la vía oficial hacia Chatwoot
    await chatwoot.sendWhatsAppMessage(dentist_id, 1, 1, patient_id, content);
    
    return { status: 'dispatched', template: templateName };
}

module.exports = { dispatchTemplate };
