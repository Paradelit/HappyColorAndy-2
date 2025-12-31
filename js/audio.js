// ==========================================
// 🎵 AUDIO (audio.js CORREGIDO)
// ==========================================
const bgMusic = new Audio('bg-music.mp3'); 
bgMusic.loop = true; 
bgMusic.volume = 0.2;

const sPaint = new Audio('paint-ok.mp3'); 
sPaint.volume = 0.4;

const sVictory = new Audio('victory.mp3'); 
sVictory.volume = 0.5;

// Estado de sonido
let soundEnabled = localStorage.getItem('happy_color_sound') !== 'off';

// Esta función ahora acepta parámetros para saber si debe reproducir música
function updateSoundState(shouldPlayMusic) {
    const icon = soundEnabled ? '🔈' : '🔇';
    
    // Actualizamos los iconos si los elementos existen en el DOM
    const btnGallery = document.getElementById('btn-sound-gallery');
    const btnGame = document.getElementById('btn-sound-game');
    
    if(btnGallery) btnGallery.innerText = icon;
    if(btnGame) btnGame.innerText = icon;

    if(soundEnabled && shouldPlayMusic) {
        bgMusic.play().catch(()=>{});
    } else {
        bgMusic.pause();
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('happy_color_sound', soundEnabled ? 'on' : 'off');
    
    // Forzamos actualización visual. 
    // La lógica de reproducción se manejará desde el Game o Gallery loop
    const isGameActive = !document.getElementById('game-screen').classList.contains('hidden');
    // Si estamos en el juego y no hay victoria, o en galería (opcional)
    updateSoundState(isGameActive); 
}

function playEffect(audio) {
    if(!soundEnabled) return;
    audio.currentTime = 0;
    audio.play().catch(()=>{});
}