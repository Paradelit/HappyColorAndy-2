// ==========================================
// 🔑 SISTEMA DE LLAVES (keys.js)
// ==========================================

const KeySystem = {
    // Obtener el número de llaves disponibles
    getKeys() {
        return parseInt(localStorage.getItem('happy_color_keys') || '0');
    },

    // Establecer el número de llaves
    setKeys(amount) {
        localStorage.setItem('happy_color_keys', amount.toString());
        this.updateKeysDisplay();
        
        // Sincronizar con Firebase si está disponible
        if (typeof Sync !== 'undefined' && Sync.syncNow) {
            Sync.syncNow();
        }
    },

    // Añadir llaves
    addKeys(amount = 1, showAnimation = false) {
        const current = this.getKeys();
        this.setKeys(current + amount);
        
        // Solo mostrar animación si se pide explícitamente
        // (no se usará desde completeLevel, se integrará en modal de victoria)
        if (showAnimation) {
            this.showKeysGainedAnimation(amount);
        }
    },

    // Gastar llaves
    spendKeys(amount = 1) {
        const current = this.getKeys();
        if (current >= amount) {
            this.setKeys(current - amount);
            return true;
        }
        return false;
    },

    // Verificar si un nivel está desbloqueado
    isLevelUnlocked(levelId) {
        // Los 2 primeros niveles siempre están desbloqueados
        if (typeof niveles !== 'undefined' && niveles.length > 0) {
            if (levelId === niveles[0].id || levelId === niveles[1].id) return true;
        }
        
        return localStorage.getItem('unlocked_' + levelId) === 'true';
    },

    // Desbloquear un nivel
    unlockLevel(levelId) {
        localStorage.setItem('unlocked_' + levelId, 'true');
        
        // Sincronizar
        if (typeof Sync !== 'undefined' && Sync.syncNow) {
            Sync.syncNow();
        }
    },

    // Verificar si un nivel está completado
    isLevelCompleted(levelId) {
        return localStorage.getItem('completed_' + levelId) === 'true';
    },

    // Marcar nivel como completado y dar recompensa
    completeLevel(levelId) {
        const wasAlreadyCompleted = this.isLevelCompleted(levelId);
        
        localStorage.setItem('completed_' + levelId, 'true');
        
        // Solo dar llave si es la primera vez que lo completa
        if (!wasAlreadyCompleted) {
            this.addKeys(1);
            console.log('🎉 ¡Nivel completado por primera vez! +1 🔑');
            
            // NO mostrar modal separado, se integrará en el modal de victoria
            // return true indica que es primera vez (para que game.js lo sepa)
            return true;
        }
        
        // Sincronizar
        if (typeof Sync !== 'undefined' && Sync.syncNow) {
            Sync.syncNow();
        }
        
        return false; // No es primera vez
    },

    // Actualizar la visualización de llaves en la UI
    updateKeysDisplay() {
        const keysCounter = document.getElementById('keys-counter');
        if (keysCounter) {
            const keys = this.getKeys();
            keysCounter.innerHTML = `🔑 ${keys}`;
            
            // Animación cuando cambia
            keysCounter.classList.remove('keys-bounce');
            void keysCounter.offsetWidth; // Trigger reflow
            keysCounter.classList.add('keys-bounce');
        }
    },

    // Animación cuando ganas llaves
    showKeysGainedAnimation(amount) {
        const modal = document.createElement('div');
        modal.className = 'keys-gained-modal';
        modal.innerHTML = `
            <div class="keys-gained-content">
                <div class="keys-gained-icon">🔑</div>
                <h3 class="keys-gained-title">¡Llave Conseguida!</h3>
                <p class="keys-gained-text">Has ganado ${amount} llave${amount > 1 ? 's' : ''}</p>
                <p class="keys-gained-hint">Úsala para desbloquear el recuerdo que quieras</p>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-cerrar después de 2.5 segundos
        setTimeout(() => {
            modal.classList.add('fade-out');
            setTimeout(() => modal.remove(), 300);
        }, 2500);
    },

    // Generar HTML para insertar en el modal de victoria
    getKeyRewardHTML(amount = 1) {
        return `
            <div class="victory-key-reward">
                <div class="key-reward-icon">🔑</div>
                <div class="key-reward-text">
                    <strong>¡Llave Conseguida!</strong>
                    <span>+${amount} llave${amount > 1 ? 's' : ''}</span>
                </div>
            </div>
            <p class="victory-key-hint">Úsala para desbloquear el recuerdo que quieras</p>
        `;
    },

    // Mostrar modal de confirmación para desbloquear nivel
    showUnlockConfirmation(nivel, onConfirm) {
        const keys = this.getKeys();
        
        if (keys < 1) {
            this.showInsufficientKeysModal();
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'unlock-modal';
        modal.innerHTML = `
            <div class="unlock-content">
                <div class="unlock-header">
                    <div class="unlock-icon">🔓</div>
                    <h3>Desbloquear Recuerdo</h3>
                </div>
                
                <div class="unlock-preview">
                    <div class="unlock-preview-container">
                        <img src="${nivel.lineas}" alt="${nivel.nombre}" class="unlock-preview-img">
                        <div class="unlock-preview-lock">🔒</div>
                    </div>
                    <div class="unlock-name">${nivel.nombre}</div>
                </div>
                
                <div class="unlock-cost">
                    <div class="cost-label">Precio:</div>
                    <div class="cost-amount">🔑 1 llave</div>
                </div>
                
                <div class="unlock-balance">
                    <div class="balance-label">Tienes:</div>
                    <div class="balance-amount">🔑 ${keys} ${keys === 1 ? 'llave' : 'llaves'}</div>
                </div>
                
                <div class="unlock-actions">
                    <button class="unlock-btn cancel">Cancelar</button>
                    <button class="unlock-btn confirm">Desbloquear</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event listeners
        const closeModal = () => modal.remove();
        
        modal.querySelector('.unlock-btn.cancel').onclick = closeModal;
        modal.querySelector('.unlock-btn.confirm').onclick = () => {
            if (this.spendKeys(1)) {
                this.unlockLevel(nivel.id);
                closeModal();
                onConfirm();
            }
        };
        
        // Cerrar al hacer click fuera
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
    },

    // Modal cuando no tienes suficientes llaves
    showInsufficientKeysModal() {
        const modal = document.createElement('div');
        modal.className = 'unlock-modal';
        modal.innerHTML = `
            <div class="unlock-content insufficient">
                <div class="unlock-icon">😔</div>
                <h3>Sin Llaves</h3>
                <p>Necesitas completar más recuerdos para conseguir llaves.</p>
                <p class="unlock-hint">💡 Completa cualquier recuerdo desbloqueado para ganar 1 🔑</p>
                <button class="unlock-btn confirm">Entendido</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.unlock-btn').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    },

    // Inicializar el sistema
    init() {
        // Asegurar que los 2 primeros niveles estén desbloqueados
        if (typeof niveles !== 'undefined' && niveles.length > 0) {
            this.unlockLevel(niveles[0].id);
            if (niveles.length > 1) {
                this.unlockLevel(niveles[1].id);
            }
        }
        
        // Actualizar display inicial
        this.updateKeysDisplay();
        
        console.log('🔑 Sistema de llaves inicializado');
    }
};

// ==========================================
// 🎨 ESTILOS CSS PARA EL SISTEMA DE LLAVES
// ==========================================
const keysStyles = `
<style id="keys-system-styles">
    /* Contador de llaves en la galería */
    #keys-counter {
        position: absolute;
        top: 70px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
        color: white;
        padding: 10px 25px;
        border-radius: 25px;
        font-size: 1.2rem;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.3s ease;
    }
    
    #keys-counter.keys-bounce {
        animation: keysBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    @keyframes keysBounce {
        0%, 100% { transform: translateX(-50%) scale(1); }
        50% { transform: translateX(-50%) scale(1.2); }
    }

    /* Modal de llaves ganadas */
    .keys-gained-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 5000;
        animation: fadeIn 0.3s ease;
    }
    
    .keys-gained-modal.fade-out {
        animation: fadeOut 0.3s ease;
        opacity: 0;
    }
    
    .keys-gained-content {
        background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
        padding: 30px;
        border-radius: 20px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        max-width: 300px;
    }
    
    .keys-gained-icon {
        font-size: 60px;
        margin-bottom: 15px;
        animation: keyRotate 0.6s ease;
    }
    
    @keyframes keyRotate {
        0% { transform: rotate(0deg) scale(0); }
        50% { transform: rotate(180deg) scale(1.2); }
        100% { transform: rotate(360deg) scale(1); }
    }
    
    .keys-gained-title {
        color: white;
        margin: 0 0 10px 0;
        font-size: 1.5rem;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    .keys-gained-text {
        color: white;
        margin: 0 0 10px 0;
        font-size: 1.1rem;
        font-weight: 600;
    }
    
    .keys-gained-hint {
        color: rgba(255, 255, 255, 0.9);
        margin: 0;
        font-size: 0.85rem;
    }

    /* Modal de desbloqueo */
    .unlock-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 5000;
        animation: fadeIn 0.3s ease;
    }
    
    .unlock-content {
        background: white;
        border-radius: 20px;
        padding: 25px;
        max-width: 350px;
        width: 90%;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .unlock-content.insufficient {
        text-align: center;
    }
    
    .unlock-header {
        text-align: center;
        margin-bottom: 20px;
    }
    
    .unlock-icon {
        font-size: 50px;
        margin-bottom: 10px;
    }
    
    .unlock-header h3 {
        margin: 0;
        color: #d63384;
        font-size: 1.3rem;
    }
    
    .unlock-preview {
        text-align: center;
        margin-bottom: 20px;
    }
    
    .unlock-preview-container {
        position: relative;
        width: 180px;
        height: 180px;
        margin: 0 auto 10px;
        border-radius: 15px;
        overflow: hidden;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    }
    
    .unlock-preview-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: grayscale(100%) blur(3px);
        transform: scale(1.1);
        opacity: 0.7;
    }
    
    .unlock-preview-lock {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 50px;
        background: rgba(0, 0, 0, 0.6);
        width: 80px;
        height: 80px;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
    }
    
    .unlock-name {
        font-weight: bold;
        color: #333;
        font-size: 1.1rem;
    }
    
    .unlock-cost, .unlock-balance {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        margin: 10px 0;
        border-radius: 10px;
    }
    
    .unlock-cost {
        background: #fff3cd;
        border: 2px solid #FFD700;
    }
    
    .unlock-balance {
        background: #f0f0f0;
    }
    
    .cost-label, .balance-label {
        color: #666;
        font-size: 0.9rem;
    }
    
    .cost-amount, .balance-amount {
        font-weight: bold;
        font-size: 1.1rem;
        color: #333;
    }
    
    .unlock-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }
    
    .unlock-btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .unlock-btn.cancel {
        background: #f0f0f0;
        color: #666;
    }
    
    .unlock-btn.cancel:hover {
        background: #e0e0e0;
    }
    
    .unlock-btn.confirm {
        background: linear-gradient(135deg, #d63384 0%, #c62368 100%);
        color: white;
        box-shadow: 0 4px 10px rgba(214, 51, 132, 0.3);
    }
    
    .unlock-btn.confirm:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 15px rgba(214, 51, 132, 0.4);
    }
    
    .unlock-btn:active {
        transform: translateY(0);
    }
    
    .unlock-hint {
        color: #666;
        font-size: 0.9rem;
        line-height: 1.5;
        margin: 15px 0;
    }

    /* Badge de precio en nivel bloqueado */
    .lock-cost-badge {
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
        color: white;
        padding: 6px 15px;
        border-radius: 20px;
        font-size: 0.9rem;
        font-weight: bold;
        box-shadow: 0 4px 10px rgba(255, 215, 0, 0.4);
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    /* Recompensa de llave en modal de victoria */
    .victory-key-reward {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 15px;
        background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
        padding: 15px 25px;
        border-radius: 20px;
        margin: 20px 0 10px 0;
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
        animation: keyRewardPulse 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    @keyframes keyRewardPulse {
        0% { transform: scale(0.8); opacity: 0; }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); opacity: 1; }
    }
    
    .key-reward-icon {
        font-size: 40px;
        animation: keyRewardRotate 0.8s ease;
    }
    
    @keyframes keyRewardRotate {
        0% { transform: rotate(0deg); }
        50% { transform: rotate(180deg) scale(1.2); }
        100% { transform: rotate(360deg); }
    }
    
    .key-reward-text {
        display: flex;
        flex-direction: column;
        color: white;
        text-align: left;
    }
    
    .key-reward-text strong {
        font-size: 1.2rem;
        margin-bottom: 3px;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .key-reward-text span {
        font-size: 1rem;
        opacity: 0.95;
    }
    
    .victory-key-hint {
        color: #666;
        font-size: 0.85rem;
        margin: 0 0 15px 0;
        text-align: center;
        font-style: italic;
    }
</style>
`;

// Inyectar estilos
if (!document.getElementById('keys-system-styles')) {
    document.head.insertAdjacentHTML('beforeend', keysStyles);
}

// Exponer globalmente
window.KeySystem = KeySystem;

// Inicializar cuando cargue el DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => KeySystem.init());
} else {
    KeySystem.init();
}