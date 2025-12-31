// ==========================================
// ☁️ SISTEMA DE SINCRONIZACIÓN (sync.js)
// ==========================================

// CONFIGURACIÓN DE FIREBASE
// IMPORTANTE: Reemplaza estos valores con los de tu proyecto Firebase
// Ve a: https://console.firebase.google.com/
// 1. Crea un proyecto nuevo (gratis)
// 2. Ve a "Project Settings" > "Your apps" > "Web app"
// 3. Copia la configuración aquí:

const firebaseConfig = {
  apiKey: "AIzaSyCUc7iX73rzjz0-6s_3hnxAHaqHs5hzi4U",
  authDomain: "andy-happy-color.firebaseapp.com",
  projectId: "andy-happy-color",
  storageBucket: "andy-happy-color.firebasestorage.app",
  messagingSenderId: "811233381686",
  appId: "1:811233381686:web:4a9bd28a64c7b11627f797",
  measurementId: "G-1MGHS9YLSM"
};

// Inicializar Firebase
let db = null;
let syncEnabled = false;

async function initFirebase() {
    try {
        // Verificar si Firebase está cargado
        if (typeof firebase === 'undefined') {
            console.warn('Firebase no cargado, sincronización deshabilitada');
            return false;
        }
        
        // Inicializar Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        db = firebase.firestore();
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
    // Generar código de 6 dígitos
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
    if (!syncEnabled || !db) return false;
    
    try {
        const code = getSyncCode();
        
        // Recopilar todos los datos locales
        const syncData = {
            // Niveles completados
            completed: {},
            // Progreso guardado en IndexedDB
            savedProgress: {},
            // Timestamp de última actualización
            lastSync: Date.now()
        };
        
        // Obtener niveles completados
        niveles.forEach(nivel => {
            const isCompleted = localStorage.getItem('completed_' + nivel.id) === 'true';
            if (isCompleted) {
                syncData.completed[nivel.id] = true;
            }
        });
        
        // Obtener progreso guardado de IndexedDB
        for (let nivel of niveles) {
            const savedImg = await loadFromDB(nivel.id);
            if (savedImg) {
                syncData.savedProgress[nivel.id] = savedImg;
            }
        }
        
        // Guardar en Firebase
        await db.collection('sync').doc(code).set(syncData);
        
        console.log('✅ Datos sincronizados con la nube');
        return true;
    } catch (error) {
        console.error('❌ Error al sincronizar:', error);
        return false;
    }
}

async function syncFromCloud(code) {
    if (!syncEnabled || !db) return false;
    
    try {
        // Obtener datos de Firebase
        const doc = await db.collection('sync').doc(code).get();
        
        if (!doc.exists) {
            console.warn('⚠️ No se encontraron datos para el código:', code);
            return false;
        }
        
        const syncData = doc.data();
        
        // Restaurar niveles completados
        if (syncData.completed) {
            Object.keys(syncData.completed).forEach(nivelId => {
                localStorage.setItem('completed_' + nivelId, 'true');
            });
        }
        
        // Restaurar progreso guardado
        if (syncData.savedProgress) {
            for (let nivelId in syncData.savedProgress) {
                const imgData = syncData.savedProgress[nivelId];
                await saveToDB(nivelId, imgData);
            }
        }
        
        // Guardar el código
        setSyncCode(code);
        
        console.log('✅ Datos restaurados desde la nube');
        return true;
    } catch (error) {
        console.error('❌ Error al restaurar datos:', error);
        return false;
    }
}

// ==========================================
// 🔄 SINCRONIZACIÓN AUTOMÁTICA
// ==========================================

let syncInterval = null;

function startAutoSync() {
    if (!syncEnabled) return;
    
    // Sincronizar cada 30 segundos
    syncInterval = setInterval(() => {
        syncToCloud();
    }, 30000);
    
    // Sincronizar inmediatamente
    syncToCloud();
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
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
    
    // Cerrar al hacer clic fuera
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

function copyCode() {
    const code = getSyncCode();
    
    // Copiar al portapapeles
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            showToast('✅ Código copiado al portapapeles');
        });
    } else {
        // Fallback para navegadores antiguos
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
        
        // Recargar la galería
        if (typeof renderGallery === 'function') {
            renderGallery();
        }
    } else {
        showToast('❌ No se encontró progreso con ese código');
    }
}

function showToast(message) {
    // Remover toast anterior si existe
    const oldToast = document.getElementById('sync-toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'sync-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Mostrar
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Ocultar y remover
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
    stopAutoSync
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        Sync.init().then(success => {
            if (success) {
                Sync.startAutoSync();
            }
        });
    });
} else {
    Sync.init().then(success => {
        if (success) {
            Sync.startAutoSync();
        }
    });
}

// Exportar para uso global
window.Sync = Sync;
