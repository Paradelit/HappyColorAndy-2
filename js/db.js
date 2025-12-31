// ==========================================
// 💾 BASE DE DATOS
// ==========================================
const DB_NAME = 'HappyAndyDB', DB_VERSION = 1;
let db;

function initDB() {
    return new Promise(resolve => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('saves')) {
                db.createObjectStore('saves', { keyPath: 'id' });
            }
        };
        req.onsuccess = e => { db = e.target.result; resolve(); };
        req.onerror = () => resolve();
    });
}

function saveToDB(id, data) {
    if(!db) return;
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put({ id, data });
}

function loadFromDB(id) {
    return new Promise(resolve => {
        if(!db) return resolve(null);
        const tx = db.transaction('saves', 'readonly');
        const req = tx.objectStore('saves').get(id);
        req.onsuccess = () => resolve(req.result?.data || null);
        req.onerror = () => resolve(null);
    });
}

function deleteFromDB(id) {
    if(!db) return;
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').delete(id);
}
