// ==========================================
// 🖼️ GALERÍA CON SISTEMA DE LLAVES
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
// 🔑 RENDERIZADO CON SISTEMA DE LLAVES
// ==========================================

function getSafeNiveles() {
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
    
    grid.innerHTML = ''; 

    const listaNiveles = getSafeNiveles();

    if (listaNiveles.length === 0) {
        grid.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Cargando recuerdos...<br><small>(Si no aparecen, recarga la página)</small></div>';
        return;
    }

    // Ordenar niveles
    const nivelesOrdenados = [...listaNiveles].sort((a, b) => (a.orden || 0) - (b.orden || 0));

    nivelesOrdenados.forEach((nivel, index) => {
        // 🔑 NUEVA LÓGICA: Usar KeySystem
        const isCompleted = typeof KeySystem !== 'undefined' 
            ? KeySystem.isLevelCompleted(nivel.id)
            : localStorage.getItem('completed_' + nivel.id) === 'true';
        
        const isUnlocked = typeof KeySystem !== 'undefined'
            ? KeySystem.isLevelUnlocked(nivel.id)
            : (index === 0); // Solo el primero desbloqueado por defecto

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
            badge.innerHTML = '✔';
            item.appendChild(badge);

            imgContainer.appendChild(img);
            item.onclick = () => {
                if(window.showSolucion) window.showSolucion(nivel);
                else startGame(nivel.id); 
            };

        } else if (isUnlocked) {
            // -- JUGABLE (DESBLOQUEADO / NIVEL ACTUAL) --
            item.classList.add('unlocked', 'current-level');
            img.src = nivel.lineas; 
            img.className = 'level-img-solved'; 
            
            const badge = document.createElement('div');
            badge.className = 'palette-badge';
            badge.innerHTML = '🎨';
            item.appendChild(badge);
            
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

            // 🔑 NUEVO: Badge de costo
            const costBadge = document.createElement('div');
            costBadge.className = 'lock-cost-badge';
            costBadge.innerHTML = '🔑 1';
            
            imgContainer.appendChild(img);
            imgContainer.appendChild(padlockOverlay);
            imgContainer.appendChild(costBadge);
            
            // 🔑 NUEVO: Click para desbloquear
            item.onclick = () => showUnlockModal(nivel);
        }

        const title = document.createElement('div');
        title.className = 'level-title thumb-title'; 
        title.textContent = isCompleted ? nivel.nombreCompleto : `Nivel ${index + 1}`;
        
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
    let unlocked = 0;
    
    lista.forEach(n => {
        if (typeof KeySystem !== 'undefined') {
            if (KeySystem.isLevelCompleted(n.id)) completed++;
            if (KeySystem.isLevelUnlocked(n.id)) unlocked++;
        } else {
            if (localStorage.getItem('completed_' + n.id) === 'true') completed++;
        }
    });
    
    counter.innerHTML = `
        Completados: ${completed}/${lista.length} 
        <span style="color: #999; margin-left: 10px;">• Desbloqueados: ${unlocked}/${lista.length}</span>
    `;
}

// ==========================================
// 🔑 MODAL DE DESBLOQUEO
// ==========================================
function showUnlockModal(nivel) {
    if (typeof KeySystem === 'undefined') {
        console.error('KeySystem no está disponible');
        return;
    }
    
    // Vibración
    if (navigator.vibrate) navigator.vibrate(200);
    
    // Mostrar modal de confirmación
    KeySystem.showUnlockConfirmation(nivel, () => {
        // Callback: Se ejecuta después de desbloquear
        renderGallery(); // Re-renderizar para mostrar el nivel desbloqueado
        
        // Opcional: Mostrar toast de éxito
        showUnlockSuccessToast(nivel);
    });
}

function showUnlockSuccessToast(nivel) {
    const toast = document.createElement('div');
    toast.className = 'unlock-success-toast';
    toast.innerHTML = `
        <div class="toast-content">
            🔓 <strong>${nivel.nombre}</strong> desbloqueado
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
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

// ==========================================
// 🎨 ESTILOS ADICIONALES
// ==========================================
const toastStyles = `
<style id="unlock-toast-styles">
    .unlock-success-toast {
        position: fixed;
        bottom: -100px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        color: white;
        padding: 15px 25px;
        border-radius: 50px;
        font-size: 0.95rem;
        box-shadow: 0 8px 25px rgba(76, 175, 80, 0.4);
        z-index: 4000;
        transition: bottom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        white-space: nowrap;
        max-width: 90%;
    }
    
    .unlock-success-toast.show {
        bottom: 30px;
    }
    
    .toast-content {
        display: flex;
        align-items: center;
        gap: 10px;
    }
</style>
`;

if (!document.getElementById('unlock-toast-styles')) {
    document.head.insertAdjacentHTML('beforeend', toastStyles);
}