const axios = require('axios');

const EA_URL = process.env.EA_URL;

const api = axios.create({
    baseURL: `${EA_URL}/index.php/api/v1`,
});

async function getFreeSlots(dentist_id, dateStr, durationMin) {
    if (!dentist_id) throw new Error("dentist_id obligatorio para consultar agenda del tenant.");
    
    const response = await api.get(`/availabilities`, {
        params: {
            provider_id: dentist_id, // dentist_id hace match con provider en EA
            date: dateStr,
            duration: durationMin
        }
    });
    return response.data;
}

async function createAppointment(dentist_id, patient_data, start_time_utc, durationMin) {
    if (!dentist_id) throw new Error("dentist_id obligatorio.");
    
    const end_time_utc = new Date(new Date(start_time_utc).getTime() + durationMin * 60000).toISOString();
    
    const response = await api.post(`/appointments`, {
        provider_id: dentist_id,
        customer: patient_data,
        start_datetime: start_time_utc,
        end_datetime: end_time_utc
    });
    return response.data;
}

async function cancelAppointment(dentist_id, appointment_id) {
    if (!dentist_id) throw new Error("dentist_id obligatorio.");
    
    const response = await api.delete(`/appointments/${appointment_id}`, {
        data: { provider_id: dentist_id }
    });
    return response.data;
}

module.exports = {
    getFreeSlots,
    createAppointment,
    cancelAppointment
};
