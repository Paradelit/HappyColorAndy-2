const CACHE_NAME = 'happy-andy-v4';

// Lista de archivos vitales para que la app arranque
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    './js/game.js',
    './js/gallery.js',
    './js/db.js',
    './js/data.js',
    './js/audio.js',
    './js/worker.js',
    // Archivos de audio (asegúrate que existan en la carpeta raíz como indica tu audio.js)
    './bg-music.mp3',
    './paint-ok.mp3',
    './victory.mp3',
    // Librería externa (Ver nota abajo sobre esto)
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
];

// 1. INSTALACIÓN: Cacheamos los recursos estáticos
self.addEventListener('install', (event) => {
    // Forzar al SW a activarse inmediatamente sin esperar
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell');
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// 2. ACTIVACIÓN: Limpiamos caches viejas si actualizas la versión
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[Service Worker] Borrando cache antigua:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Tomar control de clientes abiertos inmediatamente
    );
});

// 3. FETCH: Interceptamos las peticiones de red
self.addEventListener('fetch', (event) => {
    // Solo cacheamos peticiones GET (imágenes, scripts, html)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // A) Si está en caché, lo devolvemos (VELOCIDAD MÁXIMA)
            if (cachedResponse) {
                return cachedResponse;
            }

            // B) Si no está, lo pedimos a internet y lo guardamos dinámicamente
            // Esto es genial para las imágenes de los niveles (lineasX.png) que no pusimos en STATIC_ASSETS
            return fetch(event.request).then((networkResponse) => {
                // Verificar respuesta válida
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    // Nota: type 'basic' excluye peticiones a otros dominios (como el CDN) a menos que usemos CORS
                    // Para simplificar, permitimos cachear todo lo que responda 200 OK
                    if (!networkResponse || networkResponse.status !== 200) return networkResponse;
                }

                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // C) Fallback offline (Opcional: podrías devolver una imagen de "Sin conexión")
                console.log('Fallo de red y sin caché para:', event.request.url);
            });
        })
    );
});