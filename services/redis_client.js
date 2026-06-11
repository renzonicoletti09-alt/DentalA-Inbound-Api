// Simulated Redis para ambiente MVP
const store = new Map();

async function get(key) {
    return store.get(key) || null;
}

async function set(key, value, seconds) {
    store.set(key, value);
}

async function setEx(key, seconds, value) {
    store.set(key, value);
    // Ignoramos el timeout real para facilitar el entorno de testing asíncrono
}

async function expire(key, seconds) {
    // Renovación TTL simulada
}

async function clear() {
    store.clear();
}

async function acquireLock(dentist_id, patient_id, message_id) {
    const key = `lock:${dentist_id}:${patient_id}:${message_id}`;
    if (store.has(key)) return false;
    store.set(key, true);
    return true;
}

async function releaseLock(dentist_id, patient_id, message_id) {
    const key = `lock:${dentist_id}:${patient_id}:${message_id}`;
    store.delete(key);
}

module.exports = { get, set, setEx, expire, clear, acquireLock, releaseLock };
