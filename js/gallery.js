// ==========================================
// 🖼️ GALERÍA CON SISTEMA DE DESBLOQUEO
// ==========================================

const galleryGrid = document.getElementById('gallery-grid');
const galleryCounter = document.getElementById('gallery-counter');
const galleryScreen = document.getElementById('gallery-screen');
const ptrIndicator = document.getElementById('ptr-indicator');

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
    // El primer nivel siempre está desbloqueado
    if (levelIndex === 0) return true;
    
    // Para desbloquear un nivel, el anterior debe estar completado
    const previousLevelId = niveles[levelIndex - 1].id;
    return localStorage.getItem('completed_' + previousLevelId) === 'true';
}

function getFirstUncompletedLevel() {
    // Buscar el primer nivel que no esté completado
    for (let i = 0; i < niveles.length; i++) {
        const isDone = localStorage.getItem('completed_' + niveles[i].id) === 'true';
        if (!isDone) {
            return i;
        }
    }
    // Si todos están completados, devolver el primero
    return 0;
}

async function renderGallery() {
    const fragment = document.createDocumentFragment();
    let completedCount = 0;
    let unlockedCount = 0;

    for (let i = 0; i < niveles.length; i++) {
        const nivel = niveles[i];
        const el = document.createElement('div');
        
        const isUnlocked = isLevelUnlocked(i);
        const isDone = localStorage.getItem('completed_' + nivel.id) === 'true';
        
        if (isDone) completedCount++;
        if (isUnlocked) unlockedCount++;

        // Diferentes estilos según el estado
        if (!isUnlocked) {
            // NIVEL BLOQUEADO
            el.className = 'gallery-item locked';
            el.innerHTML = `
                <div class="thumb-wrapper locked-wrapper" style="background: #e0e0e0; height: 160px; display:flex; flex-direction: column; align-items:center; justify-content:center; position: relative;">
                    <div class="lock-overlay">
                        <div class="lock-icon">🔒</div>
                        <div class="lock-text">Bloqueado</div>
                        <div class="unlock-hint">Completa "${niveles[i-1].nombre}"</div>
                    </div>
                </div>
                <div class="thumb-title" style="color: #999;">${nivel.nombre}</div>
            `;
            
            // Click en nivel bloqueado muestra mensaje
            el.onclick = () => {
                showLockedMessage(i);
            };
            
        } else {
            // NIVEL DESBLOQUEADO
            el.className = 'gallery-item unlocked';
            
            const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            
            el.innerHTML = `
                <div class="thumb-wrapper" style="background: #f5f5f5; height: 160px; display:flex; align-items:center; justify-content:center; position: relative;">
                    <img data-src="" class="thumb-preview lazy-loading" 
                         src="${placeholder}" 
                         alt="${nivel.nombre}"
                         style="width:100%; height:100%; object-fit:contain; transition: opacity 0.3s; opacity: 0;"
                         onload="this.style.opacity=1">
                </div>
                ${isDone ? '<div class="check-badge">✓</div>' : '<div class="progress-badge">🎨</div>'}
                <div class="thumb-title">${nivel.nombre}</div>
            `;
            
            const imgEl = el.querySelector('.lazy-loading');
            
            // Cargar imagen guardada o imagen de líneas
            loadFromDB(nivel.id).then(savedImg => {
                const imgSrc = savedImg || nivel.lineas;
                imgEl.setAttribute('data-src', imgSrc);
                imgObserver.observe(imgEl);
            });
            
            // Click handler para nivel desbloqueado
            el.onclick = () => Game.loadLevel(i);
        }
        
        fragment.appendChild(el);
    }
    
    // Actualizar DOM
    galleryGrid.innerHTML = '';
    galleryGrid.appendChild(fragment);
    
    // Actualizar contador con información de desbloqueados
    galleryCounter.innerHTML = `
        <div style="display: flex; gap: 15px; justify-content: center; align-items: center; flex-wrap: wrap;">
            <span>✅ Completados: ${completedCount}/${niveles.length}</span>
            <span>🔓 Desbloqueados: ${unlockedCount}/${niveles.length}</span>
        </div>
    `;
    
    // Observar imágenes lazy
    requestAnimationFrame(() => {
        document.querySelectorAll('.lazy-loading').forEach(img => {
            if (img.getAttribute('data-src')) {
                imgObserver.observe(img);
            }
        });
    });
}

// ==========================================
// 💬 MENSAJE DE NIVEL BLOQUEADO
// ==========================================
function showLockedMessage(levelIndex) {
    const previousLevel = niveles[levelIndex - 1];
    const currentLevel = niveles[levelIndex];
    
    // Vibración de feedback
    if (navigator.vibrate) navigator.vibrate(200);
    
    // Crear modal temporal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.2s;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 20px;
            padding: 30px;
            max-width: 320px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            animation: popIn 0.3s;
        ">
            <div style="font-size: 60px; margin-bottom: 15px;">🔒</div>
            <h3 style="color: #d63384; margin: 0 0 10px 0; font-size: 1.3rem;">Recuerdo Bloqueado</h3>
            <p style="color: #666; margin: 0 0 20px 0; line-height: 1.5;">
                Para desbloquear <strong>"${currentLevel.nombre}"</strong>, 
                primero debes completar <strong>"${previousLevel.nombre}"</strong>.
            </p>
            <button onclick="this.parentElement.parentElement.remove()" style="
                background: #d63384;
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 25px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 10px rgba(214, 51, 132, 0.3);
            ">
                Entendido
            </button>
        </div>
    `;
    
    // Cerrar al hacer click fuera
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    document.body.appendChild(modal);
    
    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
        if (modal.parentElement) modal.remove();
    }, 5000);
}

// ==========================================
// 🔄 PULL TO REFRESH (PTR)
// ==========================================
let ptrStartY = 0, ptrDist = 0;

galleryScreen.addEventListener('touchstart', e => { 
    if (galleryScreen.scrollTop === 0) ptrStartY = e.touches[0].clientY; 
}, { passive: true });

galleryScreen.addEventListener('touchmove', e => {
    if (!ptrStartY) return;
    
    const y = e.touches[0].clientY;
    if (y > ptrStartY && galleryScreen.scrollTop === 0) {
        ptrDist = y - ptrStartY;
        if (ptrDist > 60) {
            ptrIndicator.style.height = '50px';
        }
    }
}, { passive: true });

galleryScreen.addEventListener('touchend', () => {
    if (ptrDist > 60 && galleryScreen.scrollTop === 0) {
        ptrIndicator.innerText = "🔄 Cargando...";
        setTimeout(() => location.reload(), 300);
    } else { 
        ptrIndicator.style.height = '0px'; 
    }
    ptrStartY = 0; 
    ptrDist = 0;
});

// ==========================================
// 🔊 SONIDO
// ==========================================
const btnSoundGal = document.getElementById('btn-sound-gallery');
if(btnSoundGal) {
    btnSoundGal.onclick = () => {
        if(typeof toggleSound === 'function') toggleSound();
        if(typeof updateSoundState === 'function') updateSoundState(false);
    };
    if(typeof updateSoundState === 'function') updateSoundState(false);
}

// ==========================================
// 🚀 INICIALIZACIÓN
// ==========================================
initDB().then(() => { 
    renderGallery(); 
});

// NUEVO: Optimización de scroll en la galería
let scrollTimeout;
galleryScreen.addEventListener('scroll', () => {
    document.body.classList.add('scrolling');
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        document.body.classList.remove('scrolling');
    }, 150);
}, { passive: true });