// ==========================================
// 🎵 AUDIO (audio.js CON PLAYLIST - CORREGIDO)
// ==========================================

// PLAYLIST DE MÚSICA DE FONDO (3 canciones)
const bgMusicPlaylist = [
    'bg-music.mp3',
    'bg-music-2.mp3', 
    'bg-music-3.mp3'
];

let currentTrackIndex = 0;
let bgMusic = null;
let isLoadingTrack = false; // 🆕 Flag para evitar reproducción prematura

// Efectos de sonido
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
    const savedIndex = parseInt(localStorage.getItem('happy_color_track_index') || '0');
    currentTrackIndex = savedIndex % bgMusicPlaylist.length;
    loadTrack(currentTrackIndex);
}

// Cargar una canción específica
function loadTrack(index, autoplay = false) {
    isLoadingTrack = true; // 🆕 Marcar que estamos cargando
    
    // Si hay música sonando, detenerla y limpiar
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
        bgMusic.onended = null;
        bgMusic.oncanplaythrough = null; // 🆕 Limpiar este listener también
    }
    
    // Crear nuevo objeto Audio
    bgMusic = new Audio(bgMusicPlaylist[index]);
    bgMusic.loop = false;
    bgMusic.volume = 0.2;
    
    // 🆕 Esperar a que la canción esté lista para reproducir
    bgMusic.oncanplaythrough = () => {
        isLoadingTrack = false;
        
        // Si se pidió autoplay y el sonido está habilitado
        if (autoplay && soundEnabled && !isVictoryScreenActive()) {
            bgMusic.play().catch(err => console.log('Error auto-play:', err));
        }
    };
    
    // Cuando termine la canción, pasar a la siguiente
    bgMusic.onended = () => {
        nextTrack(true); // 🆕 Pasar autoplay=true para que la siguiente se reproduzca automáticamente
    };
    
    // Guardar el índice actual
    localStorage.setItem('happy_color_track_index', index.toString());
    currentTrackIndex = index; // 🆕 Actualizar también la variable global
}

// Pasar a la siguiente canción
function nextTrack(autoplay = false) {
    currentTrackIndex = (currentTrackIndex + 1) % bgMusicPlaylist.length;
    loadTrack(currentTrackIndex, autoplay);
}

// Verificar si estamos en pantalla de victoria
function isVictoryScreenActive() {
    if (typeof Game !== 'undefined' && Game.state) {
        return Game.state.isVictoryShown;
    }
    return false;
}

// ==========================================
// 🔊 FUNCIONES PÚBLICAS
// ==========================================

function updateSoundState(shouldPlayMusic) {
    const icon = soundEnabled ? '🔈' : '🔇';
    
    const btnGallery = document.getElementById('btn-sound-gallery');
    const btnGame = document.getElementById('btn-sound-game');
    
    if(btnGallery) btnGallery.innerText = icon;
    if(btnGame) btnGame.innerText = icon;

    if(!bgMusic) return; // 🆕 Protección si bgMusic aún no existe

    if(soundEnabled && shouldPlayMusic && !isLoadingTrack) {
        // 🆕 Solo intentar reproducir si NO estamos cargando una canción
        bgMusic.play().catch(err => console.log('Error play:', err));
    } else {
        bgMusic.pause();
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('happy_color_sound', soundEnabled ? 'on' : 'off');
    
    const isGameActive = !document.getElementById('game-screen').classList.contains('hidden');
    updateSoundState(isGameActive);
}

function playEffect(audio) {
    if(!soundEnabled) return;
    audio.currentTime = 0;
    audio.play().catch(()=>{});
}

// ==========================================
// 🎮 FUNCIÓN ESPECIAL: ENTRAR/SALIR DEL JUEGO
// ==========================================

function onEnterGame() {
    // Cambiar a la siguiente canción
    nextTrack(true); // 🆕 Pasar autoplay=true para que se reproduzca automáticamente cuando esté lista
}

function onExitGame() {
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
        bgMusic.onended = null; // 🆕 CRÍTICO: Limpiar el listener para evitar reproducciones en galería
        bgMusic.oncanplaythrough = null; // 🆕 Limpiar también este listener
    }
}

// ==========================================
// 🚀 INICIALIZACIÓN
// ==========================================

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