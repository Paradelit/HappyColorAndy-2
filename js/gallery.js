// ==========================================
// 🖼️ GALERÍA CON SISTEMA DE DESBLOQUEO (CORREGIDO)
// ==========================================

// Cache global de imágenes
window.imageCache = {};

// OPTIMIZADO: Observador con configuración más agresiva para móvil
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const imgObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.getAttribute('data-src');
            if (src && !img.src.includes(src)) {
                requestIdleCallback(() => {
                    img.src = src;
                    window.imageCache[src] = img;
                    img.removeAttribute('data-src');
                    img.classList.remove('lazy-loading');
                    observer.unobserve(img);
                }, { timeout: 500 });
            }
        }
    });
}, {
    root: null,
    rootMargin: isMobile ? '50px' : '100px',
    threshold: 0.01
});

// ==========================================
// 🔒 SISTEMA DE DESBLOQUEO PROGRESIVO
// ==========================================
function isLevelUnlocked(levelIndex) {
    if (levelIndex === 0) return true;
    const previousLevelId = niveles[levelIndex - 1].id;
    return localStorage.getItem('completed_' + previousLevelId) === 'true';
}

function getFirstUncompletedLevel() {
    for (let i = 0; i < niveles.length; i++) {
        const isDone = localStorage.getItem('completed_' + niveles[i].id) === 'true';
        if (!isDone) return i;
    }
    return 0;
}

function renderGallery() {
    // CORRECCIÓN CRÍTICA: El ID correcto es 'gallery-grid', no 'levels-grid'
    const grid = document.getElementById('gallery-grid');
    
    if (!grid) {
        console.error("❌ Error: No se encontró el elemento #gallery-grid");
        return;
    }
    
    grid.innerHTML = ''; // Limpiar grid

    // Asegurarse de que existen niveles cargados
    if (!window.niveles) {
        console.warn("⚠️ No se encontraron niveles en window.niveles");
        return;
    }

    // Ordenar niveles por el campo 'orden' si existe, o usar el orden del array
    const nivelesOrdenados = [...window.niveles]; // Asumiendo que ya vienen en orden en data.js

    nivelesOrdenados.forEach((nivel, index) => {
        // Usar Sync si existe, sino fallback a localStorage
        const isCompleted = (typeof Sync !== 'undefined' && Sync.isLevelCompleted) 
                            ? Sync.isLevelCompleted(nivel.id) 
                            : localStorage.getItem('completed_' + nivel.id) === 'true';
                            
        // Comprobar si está desbloqueado (el anterior completado)
        let isUnlocked = true;
        if (index > 0) {
            const prevId = nivelesOrdenados[index - 1].id;
            const prevCompleted = localStorage.getItem('completed_' + prevId) === 'true';
            if (!prevCompleted) isUnlocked = false;
        }

        const item = document.createElement('div');
        // APLICAMOS LAS DOS CLASES: gallery-item (estilo base) y level-card (lógica)
        item.className = 'gallery-item level-card'; 
        
        const imgContainer = document.createElement('div');
        imgContainer.className = 'level-img-container';

        const img = document.createElement('img');
        img.alt = nivel.nombre;

        if (isCompleted) {
            // CASO 1: Completado
            item.classList.add('completed', 'unlocked');
            img.src = nivel.solucion;
            img.className = 'level-img-solved';
            imgContainer.appendChild(img);
            item.onclick = () => showSolucion(nivel);
        } else if (isUnlocked) {
            // CASO 2: Desbloqueado pero no completado (JUGABLE)
            item.classList.add('unlocked');
            img.src = nivel.lineas; // Muestra líneas limpias
            img.className = 'level-img-solved'; // Usamos clase normal para que se vea bien
            imgContainer.appendChild(img);
            item.onclick = () => startGame(nivel.id);
        } else {
            // CASO 3: Bloqueado (CANDADO)
            item.classList.add('locked');
            img.src = nivel.lineas;
            img.className = 'level-img-locked'; // Clase con blur

            const padlockOverlay = document.createElement('div');
            padlockOverlay.className = 'padlock-overlay';
            padlockOverlay.innerHTML = '<span class="lock-icon">🔒</span>'; // Añadido span para animación

            imgContainer.appendChild(img);
            imgContainer.appendChild(padlockOverlay);
            
            item.onclick = () => showLockedMessage(index);
        }

        const title = document.createElement('div');
        title.className = 'level-title thumb-title'; // Añadida thumb-title para asegurar estilo
        title.textContent = isCompleted ? nivel.nombre : `Nivel ${index + 1}`;
        
        item.appendChild(imgContainer); 
        item.appendChild(title);
        
        // Añadir badge de completado si corresponde
        if (isCompleted) {
            const badge = document.createElement('div');
            badge.className = 'check-badge';
            badge.innerHTML = '✓';
            item.appendChild(badge);
        }

        grid.appendChild(item);
    });
}

// Funciones auxiliares necesarias para que los onclick funcionen
window.startGame = function(id) {
    if (typeof Game !== 'undefined') Game.loadLevel(niveles.findIndex(n => n.id === id));
};

window.showSolucion = function(nivel) {
    // Si quieres que al hacer clic en uno completado solo se vea la imagen grande,
    // o volver a jugar. Por defecto reabrimos el juego en modo victoria.
    startGame(nivel.id);
};

// ==========================================
// 💬 MENSAJE DE NIVEL BLOQUEADO
// ==========================================
function showLockedMessage(levelIndex) {
    const previousLevel = niveles[levelIndex - 1];
    const currentLevel = niveles[levelIndex];
    
    if (navigator.vibrate) navigator.vibrate(200);
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); z-index: 9999;
        display: flex; justify-content: center; align-items: center;
        animation: fadeIn 0.2s;
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 20px; padding: 30px; max-width: 300px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.3); animation: popIn 0.3s;">
            <div style="font-size: 50px; margin-bottom: 15px;">🔒</div>
            <h3 style="color: #d63384; margin: 0 0 10px 0;">Nivel Bloqueado</h3>
            <p style="color: #666; margin-bottom: 20px; font-size: 0.9rem;">
                Completa el <strong>Nivel ${levelIndex}</strong> para desbloquear este dibujo.
            </p>
            <button class="confirm-btn ok" style="padding: 10px 30px;">Entendido</button>
        </div>
    `;
    
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
}

// ==========================================
// 🔄 PULL TO REFRESH & UTILS
// ==========================================
const galleryScreenEl = document.getElementById('gallery-screen');
const ptrIndicatorEl = document.getElementById('ptr-indicator');
let ptrStartY = 0, ptrDist = 0;

if (galleryScreenEl) {
    galleryScreenEl.addEventListener('touchstart', e => { 
        if (galleryScreenEl.scrollTop === 0) ptrStartY = e.touches[0].clientY; 
    }, { passive: true });

    galleryScreenEl.addEventListener('touchmove', e => {
        if (!ptrStartY) return;
        const y = e.touches[0].clientY;
        if (y > ptrStartY && galleryScreenEl.scrollTop === 0) {
            ptrDist = y - ptrStartY;
            if (ptrDist > 60 && ptrIndicatorEl) ptrIndicatorEl.style.height = '50px';
        }
    }, { passive: true });

    galleryScreenEl.addEventListener('touchend', () => {
        if (ptrDist > 60 && galleryScreenEl.scrollTop === 0) {
            if(ptrIndicatorEl) ptrIndicatorEl.innerText = "🔄 Cargando...";
            setTimeout(() => location.reload(), 300);
        } else if (ptrIndicatorEl) { 
            ptrIndicatorEl.style.height = '0px'; 
        }
        ptrStartY = 0; ptrDist = 0;
    });
}

// Inicialización
if (typeof initDB === 'function') {
    initDB().then(() => renderGallery());
} else {
    // Fallback si db.js no cargó
    document.addEventListener('DOMContentLoaded', renderGallery);
}