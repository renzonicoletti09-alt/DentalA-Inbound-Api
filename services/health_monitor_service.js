const axios = require('axios');
const chatwoot = require('./chatwoot_client');

// Variables globales de estado para el Fail-Safe
let systemHealth = {
    easyappointments: true,
    supabase: true,
    isPromotionalOutboundPaused: false
};

async function runHealthCheck(dentist_id) {
    const startTime = Date.now();
    let ea_ok = true;
    let sb_ok = true;
    let ea_latency = 0;
    let sb_latency = 0;

    try {
        const eaStart = Date.now();
        const resEA = await axios.get(process.env.EASYAPPOINTMENTS_URL || 'https://agenda.dental-a.com', { timeout: 1500 });
        ea_latency = Date.now() - eaStart;
        if (resEA.status >= 500) ea_ok = false;
    } catch (e) {
        ea_ok = false;
    }

    try {
        const sbStart = Date.now();
        const resSB = await axios.get(`${process.env.SUPABASE_URL}/health` || 'https://supabase.dental-a.com/health', { timeout: 1500 });
        sb_latency = Date.now() - sbStart;
        if (resSB.status >= 500) sb_ok = false;
    } catch (e) {
        sb_ok = false;
    }

    const totalLatency = Date.now() - startTime;
    
    if (!ea_ok || !sb_ok) {
        systemHealth.isPromotionalOutboundPaused = true;
        systemHealth.easyappointments = ea_ok;
        systemHealth.supabase = sb_ok;

        // Trigger private note alert in Chatwoot
        await chatwoot.createPrivateNote(dentist_id, 1, 999, `🚨 [SYSADMIN ALERT] [FAIL-SAFE ACTIVADO] 🔴 CRÍTICO: Caída detectada en backend. Funciones CSAT y Anti-Dormidos deshabilitadas.`);
        
        return {
            status: 'alert_triggered',
            promotional_active: false,
            latencies: { ea: ea_latency, supabase: sb_latency }
        };
    } else {
        systemHealth.isPromotionalOutboundPaused = false;
        systemHealth.easyappointments = true;
        systemHealth.supabase = true;

        return {
            status: 'healthy',
            promotional_active: true,
            latencies: { ea: ea_latency, supabase: sb_latency }
        };
    }
}

async function pingEndpoints(dentist_id) {
    return runHealthCheck(dentist_id);
}

function isPromotionalAllowed() {
    return !systemHealth.isPromotionalOutboundPaused;
}

module.exports = {
    runHealthCheck,
    pingEndpoints,
    isPromotionalAllowed,
    systemHealth
};
