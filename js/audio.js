// ==========================================
// 🎵 AUDIO (audio.js CON PLAYLIST)
// ==========================================

// PLAYLIST DE MÚSICA DE FONDO (3 canciones)
const bgMusicPlaylist = [
    'bg-music.mp3',
    'bg-music-2.mp3', 
    'bg-music-3.mp3'
];

let currentTrackIndex = 0; // Índice de la canción actual
let bgMusic = null; // Se inicializará dinámicamente

// Efectos de sonido (se mantienen igual)
const sPaint = new Audio('paint-ok.mp3'); 
sPaint.volume = 0.4;

const sVictory = new Audio('victory.mp3'); 
sVictory.volume = 0.5;

// Estado de sonido
let soundEnabled = localStorage.getItem('happy_color_sound') !== 'off';

// ==========================================
// 🎼 FUNCIONES DE GESTIÓN DE PLAYLIST
// ==========================================

// Inicializar el reproductor de música
function initMusicPlayer() {
    // Recuperar el índice guardado (opcional)
    const savedIndex = parseInt(localStorage.getItem('happy_color_track_index') || '0');
    currentTrackIndex = savedIndex % bgMusicPlaylist.length;
    
    loadTrack(currentTrackIndex);
}

// Cargar una canción específica
function loadTrack(index) {
    // Si hay música sonando, detenerla y limpiar
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
        bgMusic.onended = null; // Limpiar evento
    }
    
    // Crear nuevo objeto Audio con la canción seleccionada
    bgMusic = new Audio(bgMusicPlaylist[index]);
    bgMusic.loop = false; // NO loop, para controlar el cambio manual
    bgMusic.volume = 0.2;
    
    // Cuando termine la canción, pasar a la siguiente automáticamente
    bgMusic.onended = () => {
        nextTrack();
        if (soundEnabled && !isVictoryScreenActive()) {
            bgMusic.play().catch(err => console.log('Error auto-play:', err));
        }
    };
    
    // Guardar el índice actual
    localStorage.setItem('happy_color_track_index', index.toString());
}

// Pasar a la siguiente canción
function nextTrack() {
    currentTrackIndex = (currentTrackIndex + 1) % bgMusicPlaylist.length;
    loadTrack(currentTrackIndex);
}

// Verificar si estamos en pantalla de victoria (para no reproducir música)
function isVictoryScreenActive() {
    // Puedes adaptar esto según tu estructura
    if (typeof Game !== 'undefined' && Game.state) {
        return Game.state.isVictoryShown;
    }
    return false;
}

// ==========================================
// 🔊 FUNCIONES PÚBLICAS (MANTIENEN COMPATIBILIDAD)
// ==========================================

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
    
    // Forzamos actualización visual
    const isGameActive = !document.getElementById('game-screen').classList.contains('hidden');
    updateSoundState(isGameActive); 
}

function playEffect(audio) {
    if(!soundEnabled) return;
    audio.currentTime = 0;
    audio.play().catch(()=>{});
}

// ==========================================
// 🎮 FUNCIÓN ESPECIAL: CAMBIAR CANCIÓN AL ENTRAR AL JUEGO
// ==========================================

// Llamar esta función cuando se entra a un recuerdo desde la galería
function onEnterGame() {
    nextTrack(); // Cambiar a la siguiente canción
    if (soundEnabled) {
        bgMusic.play().catch(err => console.log('Error al reproducir:', err));
    }
}

// Llamar esta función cuando se sale del juego a la galería
function onExitGame() {
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
}

// ==========================================
// 🚀 INICIALIZACIÓN
// ==========================================

// Inicializar el reproductor cuando cargue la página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicPlayer);
} else {
    initMusicPlayer();
}

// ==========================================
// 🌐 EXPONER FUNCIONES GLOBALMENTE
// ==========================================

window.audioPlayer = {
    nextTrack,
    onEnterGame,
    onExitGame,
    getCurrentTrack: () => currentTrackIndex,
    getPlaylist: () => bgMusicPlaylist
};
