// ==========================================
// 📚 SISTEMA DE TUTORIAL INTERACTIVO (FINAL)
// ==========================================

const Tutorial = {
    currentStep: 0,
    overlay: null,
    isActive: false,
    
    steps: [
        {
            title: "¡Bienvenido! 🎨",
            text: "Colorea tus recuerdos favoritos píxel a píxel.",
            icon: "🎨",
            highlight: null,
            position: "center"
        },
        {
            title: "Selecciona un Color",
            text: "Toca un número en la paleta de abajo para elegir el color con el que pintar.",
            icon: "🎯",
            highlight: ".paleta",
            position: "top",
            action: () => {
                document.querySelector('.paleta-container')?.scrollIntoView({ 
                    behavior: 'smooth', block: 'end' 
                });
            }
        },
        {
            title: "Toca para Pintar",
            text: "Toca cualquier área del color seleccionado y se rellenará automáticamente.",
            icon: "✨",
            highlight: "#viewport",
            position: "bottom"
        },
        {
            title: "Zoom y Navegación",
            text: "Pellizca con 2 dedos para hacer zoom, o arrastra con 1 dedo para moverte.",
            icon: "🔍",
            highlight: "#viewport",
            position: "bottom",
            gesture: "pinch"
        },
        // --- PASO ACTUALIZADO: HERRAMIENTAS ---
        {
            title: "Barra de Herramientas",
            text: "Arriba tienes opciones útiles:\n🔈 Sonido  💾 Guardar Imagen  🗑️ Reiniciar Nivel\n\n✨ Las ayudas especiales (💡 Pista y ✨ Varita) aparecerán mágicamente cuando hayas avanzado un poco en el dibujo.",
            icon: "🛠️",
            highlight: ".header-btns",
            position: "bottom"
        },
        {
            title: "Ver la Solución",
            text: "Mantén presionado el ojo 👁️ para ver cómo quedará la imagen final.",
            icon: "👁️",
            highlight: "#btn-solucion",
            position: "bottom"
        },
        {
            title: "¡Listo para Empezar!",
            text: "Disfruta coloreando. Tu progreso se guarda automáticamente 💾",
            icon: "🎉",
            highlight: null,
            position: "center"
        }
    ],

    init: function() {
        if (localStorage.getItem('tutorial_completed') === 'true') {
            return false;
        }
        return true;
    },

    show: function() {
        if (this.isActive) return;
        this.isActive = true;
        this.currentStep = 0;
        this.createOverlay();
        this.showStep(0);
        
        if (typeof bgMusic !== 'undefined') bgMusic.pause();

        // Recalcular posición si la ventana cambia de tamaño
        window.addEventListener('resize', this.handleResize);
    },

    handleResize: function() {
        if(Tutorial.isActive) Tutorial.positionElements(Tutorial.steps[Tutorial.currentStep]);
    },

    createOverlay: function() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'tutorial-overlay';
        this.overlay.innerHTML = `
            <div class="tutorial-spotlight"></div>
            <div class="tutorial-card">
                <div class="tutorial-progress">
                    <div class="tutorial-progress-bar"></div>
                </div>
                <div class="tutorial-icon">🎨</div>
                <h2 class="tutorial-title">Título</h2>
                <p class="tutorial-text">Texto explicativo</p>
                <div class="tutorial-gesture"></div>
                
                <div class="tutorial-nav">
                    <button class="tutorial-btn tutorial-prev" style="display:none">Anterior</button>
                    
                    <div class="tutorial-dots"></div>
                    
                    <button class="tutorial-btn tutorial-next">Siguiente</button>
                </div>
                
                <button class="tutorial-skip-link">Saltar Tutorial</button>
            </div>
        `;
        
        document.body.appendChild(this.overlay);
        
        // Event Listeners
        this.overlay.querySelector('.tutorial-skip-link').onclick = () => this.skip();
        this.overlay.querySelector('.tutorial-next').onclick = () => this.nextStep();
        this.overlay.querySelector('.tutorial-prev').onclick = () => this.prevStep(); 
        
        // Prevenir clics fuera de la tarjeta
        this.overlay.onclick = (e) => {
            if(e.target.id === 'tutorial-overlay' || e.target.classList.contains('tutorial-spotlight')) {
                e.stopPropagation();
                // Efecto visual si tocan fuera
                const card = this.overlay.querySelector('.tutorial-card');
                card.style.transform = 'translateX(-50%) scale(1.02)';
                setTimeout(() => card.style.transform = 'translateX(-50%) scale(1)', 150);
            }
        };
        
        requestAnimationFrame(() => this.overlay.classList.add('active'));
    },

    showStep: function(stepIndex) {
        if (stepIndex >= this.steps.length) {
            this.complete();
            return;
        }
        if (stepIndex < 0) return;

        const step = this.steps[stepIndex];
        this.currentStep = stepIndex;

        const card = this.overlay.querySelector('.tutorial-card');
        const icon = this.overlay.querySelector('.tutorial-icon');
        const title = this.overlay.querySelector('.tutorial-title');
        const text = this.overlay.querySelector('.tutorial-text');
        const nextBtn = this.overlay.querySelector('.tutorial-next');
        const prevBtn = this.overlay.querySelector('.tutorial-prev');
        const gestureDiv = this.overlay.querySelector('.tutorial-gesture');

        // Actualizar textos
        icon.textContent = step.icon;
        title.textContent = step.title;
        text.textContent = step.text;
        
        // Gestión de botones
        nextBtn.textContent = stepIndex === this.steps.length - 1 ? '¡Empezar!' : 'Siguiente';
        
        // Mostrar/Ocultar botón "Anterior"
        if (stepIndex === 0) {
            prevBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'block';
        }

        // Barra de progreso
        const progressBar = this.overlay.querySelector('.tutorial-progress-bar');
        const progress = ((stepIndex + 1) / this.steps.length) * 100;
        progressBar.style.width = progress + '%';

        this.updateDots();

        // Gestos
        gestureDiv.innerHTML = '';
        gestureDiv.className = 'tutorial-gesture';
        if (step.gesture) this.showGesture(step.gesture, gestureDiv);

        // Posicionamiento y Foco
        this.positionElements(step);

        // Acción específica del paso
        if (step.action) setTimeout(() => step.action(), 300);

        // Animación suave de la tarjeta
        card.classList.remove('slide-in');
        void card.offsetWidth; // Trigger reflow
        card.classList.add('slide-in');
    },

    positionElements: function(step) {
        const card = this.overlay.querySelector('.tutorial-card');
        const spotlight = this.overlay.querySelector('.tutorial-spotlight');
        
        let target = null;
        if (step.highlight) target = document.querySelector(step.highlight);
        
        // Verificamos si el elemento existe y es visible
        const isVisible = target && target.offsetParent !== null;

        if (isVisible) {
            const rect = target.getBoundingClientRect();
            
            // ACTIVAR EL SPOTLIGHT (El hueco nítido)
            spotlight.style.opacity = '1';
            spotlight.style.top = (rect.top - 5) + 'px';
            spotlight.style.left = (rect.left - 5) + 'px';
            spotlight.style.width = (rect.width + 10) + 'px';
            spotlight.style.height = (rect.height + 10) + 'px';
            
            // Posicionar tarjeta
            card.classList.remove('center', 'top', 'bottom');
            card.classList.add(step.position);

            if (step.position === 'top') {
                if (rect.top < 220) { // Si está muy arriba, forzar abajo
                    card.classList.remove('top'); card.classList.add('bottom');
                    card.style.top = 'auto'; card.style.bottom = '20px';
                } else {
                    card.style.top = '100px'; card.style.bottom = 'auto';
                }
            } else if (step.position === 'bottom') {
                card.style.bottom = '100px'; card.style.top = 'auto';
            }
        } else {
            // Si no hay objetivo, spotlight minúsculo en el centro
            spotlight.style.top = '50%';
            spotlight.style.left = '50%';
            spotlight.style.width = '0px';
            spotlight.style.height = '0px';
            
            card.classList.remove('top', 'bottom');
            card.classList.add('center');
        }
    },

    showGesture: function(gesture, container) {
        if (gesture === 'pinch') {
            container.innerHTML = `<div class="gesture-hand hand-left">👆</div><div class="gesture-hand hand-right">👆</div>`;
            container.classList.add('gesture-pinch');
        }
    },

    updateDots: function() {
        const dotsContainer = this.overlay.querySelector('.tutorial-dots');
        dotsContainer.innerHTML = '';
        this.steps.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = 'tutorial-dot';
            if (index === this.currentStep) dot.classList.add('active');
            else if (index < this.currentStep) dot.classList.add('completed');
            dotsContainer.appendChild(dot);
        });
    },

    nextStep: function() {
        this.showStep(this.currentStep + 1);
    },

    prevStep: function() {
        this.showStep(this.currentStep - 1);
    },

    skip: function() {
        if (confirm('¿Saltar tutorial?')) this.complete();
    },

    complete: function() {
        localStorage.setItem('tutorial_completed', 'true');
        this.overlay.classList.remove('active');
        this.overlay.classList.add('exit');
        window.removeEventListener('resize', this.handleResize);
        
        setTimeout(() => {
            if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
            this.overlay = null;
            this.isActive = false;
            if (typeof updateSoundState === 'function' && typeof soundEnabled !== 'undefined' && soundEnabled) {
                updateSoundState(true);
            }
        }, 400);
    },

    reset: function() {
        localStorage.removeItem('tutorial_completed');
        return true;
    }
};

// ==========================================
// ESTILOS CORREGIDOS (Spotlight con Sombra)
// ==========================================
const tutorialStyles = `
<style id="tutorial-styles">
    #tutorial-overlay {
        position: fixed; inset: 0; z-index: 10000;
        opacity: 0; transition: opacity 0.4s ease;
        overflow: hidden; 
    }
    #tutorial-overlay.active { opacity: 1; }
    #tutorial-overlay.exit { opacity: 0; }

    /* EL FOCO MÁGICO */
    .tutorial-spotlight {
        position: absolute;
        border-radius: 8px;
        /* Sombra GIGANTE para oscurecer el resto */
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.75); 
        /* Borde rosa brillante */
        outline: 3px solid #d63384; 
        transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        pointer-events: none; 
        z-index: 1;
    }

    /* TARJETA */
    .tutorial-card {
        position: absolute; left: 50%; transform: translateX(-50%);
        background: white; border-radius: 20px; padding: 25px;
        width: 320px; max-width: 90%;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        z-index: 10001;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        display: flex; flex-direction: column; align-items: center;
    }

    .tutorial-card.slide-in { opacity: 1; transform: translateX(-50%) translateY(0); }
    .tutorial-card.center { top: 50%; transform: translateX(-50%) translateY(-50%); }
    .tutorial-card.center.slide-in { transform: translateX(-50%) translateY(-50%); }
    .tutorial-card.top { top: 100px; }
    .tutorial-card.bottom { bottom: 100px; }

    .tutorial-progress { position: absolute; top: 0; left: 0; right: 0; height: 5px; background: #eee; border-radius: 20px 20px 0 0; overflow: hidden; }
    .tutorial-progress-bar { height: 100%; background: #d63384; width: 0%; transition: width 0.3s ease; }
    
    .tutorial-icon { font-size: 40px; margin: 10px 0; animation: bounce 0.6s; }
    @keyframes bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
    
    .tutorial-title { color: #d63384; margin: 0 0 10px 0; font-size: 1.3rem; font-weight: 800; }
    .tutorial-text { color: #555; text-align: center; font-size: 0.95rem; line-height: 1.5; margin-bottom: 20px; white-space: pre-wrap; }

    /* BOTONES */
    .tutorial-nav { display: flex; align-items: center; width: 100%; gap: 10px; margin-top: 10px; }
    
    .tutorial-btn {
        border: none; padding: 10px 20px; border-radius: 25px;
        font-weight: 600; cursor: pointer; transition: transform 0.1s;
        font-size: 0.9rem;
    }
    .tutorial-btn:active { transform: scale(0.95); }
    
    .tutorial-next { background: #d63384; color: white; flex: 1; box-shadow: 0 4px 10px rgba(214, 51, 132, 0.3); }
    .tutorial-prev { background: #f0f0f0; color: #555; }
    
    .tutorial-skip-link {
        background: none; border: none; color: #999; font-size: 0.8rem;
        margin-top: 15px; cursor: pointer; text-decoration: underline;
    }

    .tutorial-dots { display: flex; gap: 6px; }
    .tutorial-dot { width: 8px; height: 8px; background: #ddd; border-radius: 50%; }
    .tutorial-dot.active { background: #d63384; width: 20px; border-radius: 4px; }
    .tutorial-dot.completed { background: #ff9cc2; }

    /* Gestos */
    .tutorial-gesture { height: 50px; position: relative; width: 100%; margin-bottom: 10px; display: flex; justify-content: center; }
    .gesture-hand { font-size: 30px; position: absolute; }
    .gesture-pinch .hand-left { animation: pL 2s infinite; left: 40%; }
    .gesture-pinch .hand-right { animation: pR 2s infinite; right: 40%; }
    @keyframes pL { 0%,100%{transform:translateX(0)} 50%{transform:translateX(15px)} }
    @keyframes pR { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-15px)} }

    @media (max-width: 400px) {
        .tutorial-card { width: 85%; padding: 20px; }
        .tutorial-title { font-size: 1.1rem; }
    }
</style>
`;

if (!document.getElementById('tutorial-styles')) {
    document.head.insertAdjacentHTML('beforeend', tutorialStyles);
}

window.Tutorial = Tutorial;