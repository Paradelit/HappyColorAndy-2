// ==========================================
// ☁️ SISTEMA DE SINCRONIZACIÓN (sync.js)
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyCUc7iX73rzjz0-6s_3hnxAHaqHs5hzi4U",
  authDomain: "andy-happy-color.firebaseapp.com",
  projectId: "andy-happy-color",
  storageBucket: "andy-happy-color.firebasestorage.app",
  messagingSenderId: "811233381686",
  appId: "1:811233381686:web:4a9bd28a64c7b11627f797",
  measurementId: "G-1MGHS9YLSM"
};

// Inicializar Firebase con un nombre único para evitar conflictos con db.js
let firebaseDb = null; 
let syncEnabled = false;

async function initFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase no cargado, sincronización deshabilitada');
            return false;
        }
        
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        // Usamos firebaseDb en lugar de db
        firebaseDb = firebase.firestore();
        syncEnabled = true;
        console.log('✅ Firebase inicializado correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error);
        syncEnabled = false;
        return false;
    }
}

// ==========================================
// 🔢 GESTIÓN DE CÓDIGO
// ==========================================

function generateSyncCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSyncCode() {
    let code = localStorage.getItem('happy_color_sync_code');
    if (!code) {
        code = generateSyncCode();
        localStorage.setItem('happy_color_sync_code', code);
    }
    return code;
}

function setSyncCode(code) {
    localStorage.setItem('happy_color_sync_code', code);
}

// ==========================================
// ☁️ SINCRONIZACIÓN DE DATOS
// ==========================================

async function syncToCloud() {
    if (!syncEnabled || !firebaseDb) return false;
    
    try {
        const code = getSyncCode();
        
        // Límite de seguridad (Firestore permite 1MB = 1,048,576 bytes)
        // Dejamos un margen de seguridad y usamos 950KB
        const MAX_PAYLOAD_SIZE = 950000; 
        
        const syncData = {
            completed: {},
            savedProgress: {},
            lastSync: Date.now()
        };
        
        // Calculamos el peso inicial del JSON base (estimado)
        let currentPayloadSize = JSON.stringify(syncData).length;
        let skippedImages = 0;

        // 1. PRIMERO: Guardar todos los "Completados" (ocupan muy poco espacio)
        niveles.forEach(nivel => {
            const isCompleted = localStorage.getItem('completed_' + nivel.id) === 'true';
            if (isCompleted) {
                syncData.completed[nivel.id] = true;
                // Sumamos un peso estimado de esta entrada
                currentPayloadSize += 50; 
            }
        });

        // 2. SEGUNDO: Intentar guardar las imágenes en progreso hasta llenar la caja
        for (let nivel of niveles) {
            const isCompleted = localStorage.getItem('completed_' + nivel.id) === 'true';
            
            // Solo procesamos si NO está completado
            if (!isCompleted) {
                const savedImg = await loadFromDB(nivel.id);
                
                if (savedImg) {
                    // Calculamos cuánto pesa esta imagen específica
                    const imgSize = savedImg.length;
                    
                    // ¿Cabe en la caja?
                    if ((currentPayloadSize + imgSize) < MAX_PAYLOAD_SIZE) {
                        syncData.savedProgress[nivel.id] = savedImg;
                        currentPayloadSize += imgSize;
                    } else {
                        // NO CABE: La saltamos para no romper la sincronización
                        console.warn(`⚠️ Imagen de ${nivel.id} omitida por exceder límite de tamaño (${(imgSize/1024).toFixed(2)} KB)`);
                        skippedImages++;
                    }
                }
            }
        }
        
        await firebaseDb.collection('sync').doc(code).set(syncData);
        
        // Guardar timestamp local
        localStorage.setItem('last_local_sync', syncData.lastSync.toString());
        
        if (skippedImages > 0) {
            console.log(`✅ Sincronización parcial completada (se omitieron ${skippedImages} imágenes muy grandes)`);
            // Opcional: Podrías mostrar un Toast aquí advirtiendo al usuario
        } else {
            console.log('✅ Datos sincronizados con la nube');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error al sincronizar:', error);
        return false;
    }
}

async function syncFromCloud(code) {
    if (!syncEnabled || !firebaseDb) return false;
    
    try {
        const doc = await firebaseDb.collection('sync').doc(code).get();
        
        if (!doc.exists) {
            console.warn('⚠️ No se encontraron datos para el código:', code);
            return false;
        }
        
        const syncData = doc.data();
        
        if (syncData.completed) {
            Object.keys(syncData.completed).forEach(nivelId => {
                localStorage.setItem('completed_' + nivelId, 'true');
            });
        }
        
        if (syncData.savedProgress) {
            for (let nivelId in syncData.savedProgress) {
                const imgData = syncData.savedProgress[nivelId];
                await saveToDB(nivelId, imgData);
            }
        }
        
        setSyncCode(code);
        
        // Actualizar timestamp local
        if (syncData.lastSync) {
            localStorage.setItem('last_local_sync', syncData.lastSync.toString());
        }
        
        console.log('✅ Datos restaurados desde la nube');
        return true;
    } catch (error) {
        console.error('❌ Error al restaurar datos:', error);
        return false;
    }
}

// Pull de datos desde la nube (sin cambiar código)
async function pullFromCloud() {
    if (!syncEnabled || !firebaseDb) return false;
    
    try {
        const code = getSyncCode();
        const doc = await firebaseDb.collection('sync').doc(code).get();
        
        if (!doc.exists) return false;
        
        const syncData = doc.data();
        const serverTime = syncData.lastSync || 0;
        const localTime = parseInt(localStorage.getItem('last_local_sync') || '0');
        
        // Solo actualizar si los datos del servidor son más recientes
        if (serverTime > localTime) {
            console.log('📥 Datos del servidor más recientes, actualizando...');
            
            if (syncData.completed) {
                Object.keys(syncData.completed).forEach(nivelId => {
                    localStorage.setItem('completed_' + nivelId, 'true');
                });
            }
            
            if (syncData.savedProgress) {
                for (let nivelId in syncData.savedProgress) {
                    const imgData = syncData.savedProgress[nivelId];
                    await saveToDB(nivelId, imgData);
                }
            }
            
            localStorage.setItem('last_local_sync', serverTime.toString());
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Error al hacer pull:', error);
        return false;
    }
}

// ==========================================
// 🔄 SINCRONIZACIÓN AUTOMÁTICA Y TRIGGERS
// ==========================================

let syncInterval = null;
let lastSyncTime = 0;
const MIN_SYNC_INTERVAL = 5000; // Mínimo 5 segundos entre syncs para no saturar

function startAutoSync() {
    if (!syncEnabled) return;
    
    // Sync cada 30 segundos como respaldo
    syncInterval = setInterval(() => {
        syncToCloud();
    }, 30000);
    
    // Sync inicial
    syncToCloud();
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

// Sincronización inteligente (con throttle para evitar spam)
async function syncNow() {
    const now = Date.now();
    if (now - lastSyncTime < MIN_SYNC_INTERVAL) {
        console.log('⏳ Sync muy reciente, esperando...');
        return;
    }
    
    lastSyncTime = now;
    await syncToCloud();
}

// ==========================================
// 🎨 UI DE SINCRONIZACIÓN
// ==========================================

function showSyncModal() {
    const code = getSyncCode();
    
    const modal = document.createElement('div');
    modal.id = 'sync-modal';
    modal.className = 'sync-modal';
    modal.innerHTML = `
        <div class="sync-content">
            <div class="sync-header">
                <h2>☁️ Sincronización</h2>
                <button class="sync-close" onclick="document.getElementById('sync-modal').remove()">✕</button>
            </div>
            
            <div class="sync-body">
                <div class="sync-section">
                    <h3>Tu Código</h3>
                    <div class="sync-code-display">${code}</div>
                    <p class="sync-help">Usa este código en otro dispositivo para sincronizar tu progreso</p>
                    <button class="sync-btn sync-btn-copy" onclick="Sync.copyCode()">
                        📋 Copiar Código
                    </button>
                </div>
                
                <div class="sync-divider">o</div>
                
                <div class="sync-section">
                    <h3>Introducir Código</h3>
                    <p class="sync-help">¿Vienes desde otro dispositivo? Introduce tu código aquí:</p>
                    <input type="text" id="sync-code-input" class="sync-input" placeholder="000000" maxlength="6" pattern="[0-9]*" inputmode="numeric">
                    <button class="sync-btn sync-btn-primary" onclick="Sync.restoreFromCode()">
                        🔄 Restaurar Progreso
                    </button>
                </div>
            </div>
            
            <div class="sync-footer">
                <p>💡 Tu progreso se guarda automáticamente en la nube</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

function copyCode() {
    const code = getSyncCode();
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            showToast('✅ Código copiado al portapapeles');
        });
    } else {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('✅ Código copiado');
    }
}

async function restoreFromCode() {
    const input = document.getElementById('sync-code-input');
    const code = input.value.trim();
    
    if (code.length !== 6 || !/^\d+$/.test(code)) {
        showToast('⚠️ El código debe tener 6 dígitos');
        return;
    }
    
    showToast('🔄 Restaurando progreso...');
    const success = await syncFromCloud(code);
    
    if (success) {
        showToast('✅ Progreso restaurado correctamente');
        document.getElementById('sync-modal').remove();
        if (typeof renderGallery === 'function') {
            renderGallery();
        }
    } else {
        showToast('❌ No se encontró progreso con ese código');
    }
}

function showToast(message) {
    const oldToast = document.getElementById('sync-toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'sync-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// 🚀 INICIALIZACIÓN
// ==========================================

const Sync = {
    init: initFirebase,
    syncToCloud,
    syncFromCloud,
    showSyncModal,
    copyCode,
    restoreFromCode,
    getSyncCode,
    startAutoSync,
    stopAutoSync,
    syncNow,        // Nueva: sincronización inmediata con throttle
    pullFromCloud   // Nueva: pull automático
};

// Inicializar y hacer pull al cargar la app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        const success = await Sync.init();
        if (success) {
            // Primero hacer pull para obtener datos actualizados
            const pulled = await Sync.pullFromCloud();
            if (pulled && typeof renderGallery === 'function') {
                renderGallery(); // Refrescar galería si hubo cambios
            }
            // Luego iniciar auto-sync
            Sync.startAutoSync();
        }
    });
} else {
    Sync.init().then(async success => {
        if (success) {
            const pulled = await Sync.pullFromCloud();
            if (pulled && typeof renderGallery === 'function') {
                renderGallery();
            }
            Sync.startAutoSync();
        }
    });
}

// ==========================================
// 🎯 LISTENERS PARA SINCRONIZACIÓN AUTOMÁTICA
// ==========================================

// 1. Sincronizar antes de cerrar/recargar la app
window.addEventListener('beforeunload', () => {
    if (syncEnabled) {
        // Intentar sync sincrónico para que alcance antes del cierre
        Sync.syncNow();
    }
});

// 2. Sincronizar cuando la app pasa a background
document.addEventListener('visibilitychange', () => {
    if (document.hidden && syncEnabled) {
        // App oculta: sincronizar cambios locales
        Sync.syncNow();
    } else if (!document.hidden && syncEnabled) {
        // App visible: hacer pull por si hay cambios de otro dispositivo
        Sync.pullFromCloud().then(pulled => {
            if (pulled && typeof renderGallery === 'function') {
                renderGallery();
            }
        });
    }
});

// 3. Sincronizar en pausa/resume (móviles, especialmente iOS)
window.addEventListener('pagehide', () => {
    if (syncEnabled) Sync.syncNow();
});

window.addEventListener('pageshow', (event) => {
    if (syncEnabled) {
        // Si la página viene de bfcache (back-forward cache), hacer pull
        Sync.pullFromCloud().then(pulled => {
            if (pulled && typeof renderGallery === 'function') {
                renderGallery();
            }
        });
    }
});

// 4. Detectar cuando vuelve la conexión a internet
window.addEventListener('online', () => {
    if (syncEnabled) {
        console.log('🌐 Conexión restaurada, sincronizando...');
        Sync.syncNow();
    }
});

window.Sync = Sync;