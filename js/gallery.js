// ==========================================
// 🖼️ GALERÍA CON SISTEMA DE DESBLOQUEO (CORREGIDO)
// ==========================================

const galleryScreen = document.getElementById('gallery-screen');
const ptrIndicator = document.getElementById('ptr-indicator');

// Cache global de imágenes
window.imageCache = {};

// Detección de móvil
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Observador de carga diferida (Lazy Loading)
const imgObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.getAttribute('data-src');
            if (src && !img.src.includes(src)) {
                const loadImg = () => {
                    img.src = src;
                    window.imageCache[src] = img;
                    img.removeAttribute('data-src');
                    img.classList.remove('lazy-loading');
                    observer.unobserve(img);
                };
                if (window.requestIdleCallback) requestIdleCallback(loadImg);
                else setTimeout(loadImg, 100);
            }
        }
    });
}, {
    root: null,
    rootMargin: isMobile ? '50px' : '100px',
    threshold: 0.01
});

// ==========================================
// 🔒 SISTEMA DE DESBLOQUEO
// ==========================================

function getSafeNiveles() {
    // Intentamos encontrar la variable niveles de forma segura
    if (typeof niveles !== 'undefined') return niveles;
    if (typeof window.niveles !== 'undefined') return window.niveles;
    return [];
}

function renderGallery() {
    const grid = document.getElementById('gallery-grid');
    
    if (!grid) {
        console.error("❌ ERROR: No existe el elemento #gallery-grid en el HTML");
        return;
    }
    
    // Limpiamos la galería antes de pintar
    grid.innerHTML = ''; 

    // OBTENER NIVELES (Corrección aquí: usamos la variable directa)
    const listaNiveles = getSafeNiveles();

    if (listaNiveles.length === 0) {
        // Fallback visual si realmente no cargan
        grid.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Cargando recuerdos...<br><small>(Si no aparecen, recarga la página)</small></div>';
        return;
    }

    // Ordenar niveles (hacemos una copia para no alterar el original)
    const nivelesOrdenados = [...listaNiveles].sort((a, b) => (a.orden || 0) - (b.orden || 0));

    nivelesOrdenados.forEach((nivel, index) => {
        // Lógica de estado (Completado / Desbloqueado)
        let isCompleted = false;
        
        if (typeof Sync !== 'undefined' && Sync.isLevelCompleted) {
            isCompleted = Sync.isLevelCompleted(nivel.id);
        } else {
            isCompleted = localStorage.getItem('completed_' + nivel.id) === 'true';
        }

        // Lógica de desbloqueo
        let isUnlocked = true;
        if (index > 0) {
            const prevId = nivelesOrdenados[index - 1].id;
            const prevCompleted = localStorage.getItem('completed_' + prevId) === 'true';
            if (!prevCompleted) isUnlocked = false;
        }

        // Crear tarjeta
        const item = document.createElement('div');
        item.className = 'gallery-item level-card'; 
        
        const imgContainer = document.createElement('div');
        imgContainer.className = 'level-img-container';

        const img = document.createElement('img');
        img.alt = nivel.nombre;

        // --- LÓGICA VISUAL ---
        if (isCompleted) {
            // -- COMPLETADO --
            item.classList.add('completed', 'unlocked');
            img.src = nivel.solucion; 
            img.className = 'level-img-solved';
            
            const badge = document.createElement('div');
            badge.className = 'check-badge';
            badge.innerHTML = '✓';
            item.appendChild(badge);

            imgContainer.appendChild(img);
            item.onclick = () => {
                if(window.showSolucion) window.showSolucion(nivel);
                else startGame(nivel.id); 
            };

        } else if (isUnlocked) {
            // -- JUGABLE (DESBLOQUEADO) --
            item.classList.add('unlocked');
            img.src = nivel.lineas; 
            img.className = 'level-img-solved'; 
            
            imgContainer.appendChild(img);
            item.onclick = () => startGame(nivel.id);

        } else {
            // -- BLOQUEADO --
            item.classList.add('locked');
            img.src = nivel.lineas;
            img.className = 'level-img-locked'; 

            const padlockOverlay = document.createElement('div');
            padlockOverlay.className = 'padlock-overlay';
            padlockOverlay.innerHTML = '<span class="lock-icon">🔒</span>';

            imgContainer.appendChild(img);
            imgContainer.appendChild(padlockOverlay);
            
            item.onclick = () => showLockedMessage(index);
        }

        const title = document.createElement('div');
        title.className = 'level-title thumb-title'; 
        title.textContent = isCompleted ? nivel.nombre : `Nivel ${index + 1}`;
        
        item.appendChild(imgContainer); 
        item.appendChild(title);
        grid.appendChild(item);
    });
    
    updateCounter();
}

function updateCounter() {
    const counter = document.getElementById('gallery-counter');
    const lista = getSafeNiveles();
    if (!counter || lista.length === 0) return;
    
    let completed = 0;
    lista.forEach(n => {
        if (localStorage.getItem('completed_' + n.id) === 'true') completed++;
    });
    counter.textContent = `Completados: ${completed}/${lista.length}`;
}

// ==========================================
// 🚀 FUNCIONES GLOBALES
// ==========================================

window.startGame = function(id) {
    if (typeof Game !== 'undefined') {
        const lista = getSafeNiveles();
        const index = lista.findIndex(n => n.id === id);
        if (index !== -1) Game.loadLevel(index);
    } else {
        console.error("Game object no encontrado");
    }
};

window.showSolucion = function(nivel) {
    window.startGame(nivel.id);
};

// ==========================================
// 💬 MENSAJE BLOQUEADO
// ==========================================
function showLockedMessage(levelIndex) {
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
            <h3 style="color: #d63384; margin: 0 0 10px 0; font-size: 1.3rem;">Bloqueado</h3>
            <p style="color: #666; margin-bottom: 20px; font-size: 0.95rem; line-height: 1.4;">
                Debes completar el <strong>Nivel ${levelIndex}</strong> para desbloquear este dibujo.
            </p>
            <button class="confirm-btn ok" style="background:#d63384; color:white; border:none; padding:10px 25px; border-radius:20px; font-weight:bold; cursor:pointer;">Entendido</button>
        </div>
    `;
    
    const close = () => { if(modal.parentNode) modal.parentNode.removeChild(modal); };
    modal.onclick = (e) => { if(e.target === modal) close(); };
    modal.querySelector('button').onclick = close;
    
    document.body.appendChild(modal);
}

// ==========================================
// 🔄 PULL TO REFRESH & EVENTS
// ==========================================
let ptrStartY = 0, ptrDist = 0;

if (galleryScreen) {
    galleryScreen.addEventListener('touchstart', e => { 
        if (galleryScreen.scrollTop === 0) ptrStartY = e.touches[0].clientY; 
    }, { passive: true });

    galleryScreen.addEventListener('touchmove', e => {
        if (!ptrStartY) return;
        const y = e.touches[0].clientY;
        if (y > ptrStartY && galleryScreen.scrollTop === 0) {
            ptrDist = y - ptrStartY;
            if (ptrDist > 60 && ptrIndicator) ptrIndicator.style.height = '50px';
        }
    }, { passive: true });

    galleryScreen.addEventListener('touchend', () => {
        if (ptrDist > 60 && galleryScreen.scrollTop === 0) {
            if(ptrIndicator) ptrIndicator.innerText = "🔄 Recargando...";
            setTimeout(() => location.reload(), 300);
        } else if (ptrIndicator) { 
            ptrIndicator.style.height = '0px'; 
        }
        ptrStartY = 0; ptrDist = 0;
    });
    
    let scrollTimeout;
    galleryScreen.addEventListener('scroll', () => {
        document.body.classList.add('scrolling');
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => document.body.classList.remove('scrolling'), 150);
    }, { passive: true });
}

// INICIO SEGURO
const startApp = () => {
    // Intentar renderizar
    renderGallery();
    
    // Configurar botón de sonido
    const btnSoundGal = document.getElementById('btn-sound-gallery');
    if(btnSoundGal) {
        btnSoundGal.onclick = () => {
            if(typeof toggleSound === 'function') toggleSound();
        };
    }
};

// Cargar DB o iniciar directamente
if (typeof initDB === 'function') {
    initDB().then(startApp).catch(startApp);
} else {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp);
    else startApp();
}
