// ==========================================
// ⚡ WORKER.JS (ULTRA RÁPIDO - CON CACHÉ DE COLOR)
// ==========================================

let cache = {
    w: 0, h: 0,
    solData: null,
    wallMap: null,
    visited: null
};

// Tolerancia para considerar que un color es igual a otro
const TOLERANCE_THRESHOLD = 15; 

self.onmessage = function(e) {
    const { type } = e.data;

    // --- ANÁLISIS OPTIMIZADO CON CACHÉ ---
    if (type === 'ANALYZE_LEVEL') {
        const { width, height, solBuffer, linBuffer, colors } = e.data;
        
        cache.w = width;
        cache.h = height;
        cache.solData = new Uint8ClampedArray(solBuffer);
        const linData = new Uint8ClampedArray(linBuffer);
        cache.wallMap = new Uint8Array(width * height);
        cache.visited = new Uint8Array(width * height); // Pre-reservar memoria
        
        const pixelMap = Array.from({length: colors.length}, () => []);
        const pixelsRemaining = new Array(colors.length).fill(0);
        
        const len = width * height;
        
        // 🚀 OPTIMIZACIÓN DE MEMORIA DE COLOR 🚀
        // Usamos un mapa para recordar combinaciones RGB ya calculadas.
        // Convertimos millones de cálculos en unas pocas búsquedas.
        const colorCache = new Map(); 
        
        // Variables para caché inmediato (píxel anterior)
        let lastR = -1, lastG = -1, lastB = -1;
        let lastMatchIndex = -1;

        for(let i = 0; i < len; i++) {
            const idx = i * 4;
            
            // 1. Detectar Paredes (Líneas negras)
            // Lógica: Si es oscuro (RGB < 150) y opaco (Alpha > 200)
            if(linData[idx] < 150 && linData[idx+1] < 150 && linData[idx+2] < 150 && linData[idx+3] > 200) {
                cache.wallMap[i] = 1;
                continue; // Si es pared, pasamos al siguiente
            } 
            
            cache.wallMap[i] = 0;
            
            // 2. Análisis de Color (Solo si es visible)
            if(cache.solData[idx+3] > 0) {
                const r = cache.solData[idx];
                const g = cache.solData[idx+1];
                const b = cache.solData[idx+2];
                
                let best = -1;

                // --- NIVEL 1: ¿Es idéntico al píxel anterior? (Velocidad extrema) ---
                if (r === lastR && g === lastG && b === lastB) {
                    best = lastMatchIndex;
                } else {
                    // --- NIVEL 2: ¿Ya hemos calculado este color exacto antes? ---
                    // Usamos una clave numérica única para RGB: (r << 16) | (g << 8) | b
                    const rgbKey = (r << 16) | (g << 8) | b;
                    
                    if (colorCache.has(rgbKey)) {
                        best = colorCache.get(rgbKey);
                    } else {
                        // --- NIVEL 3: Cálculo pesado (Solo ocurre la primera vez que vemos un color nuevo) ---
                        let minD = 999;
                        
                        for(let c = 0; c < colors.length; c++) {
                            const col = colors[c];
                            // Distancia Manhattan (Más rápida que Euclidea y suficiente aquí)
                            const d = Math.abs(r - col.r) + Math.abs(g - col.g) + Math.abs(b - col.b);
                            
                            if(d < minD) {
                                minD = d;
                                best = c;
                            }
                            // Si encontramos coincidencia exacta, paramos
                            if (d === 0) break;
                        }

                        // Validar tolerancia
                        if (minD > 30) best = -1;

                        // GUARDAR EN MEMORIA para el futuro
                        colorCache.set(rgbKey, best);
                    }

                    // Actualizar caché inmediato
                    lastR = r; lastG = g; lastB = b;
                    lastMatchIndex = best;
                }
                
                // Si encontramos un color válido, lo guardamos
                if(best !== -1) { 
                    pixelMap[best].push(i);
                    pixelsRemaining[best]++;
                }
            }
        }
        
        // Limpiamos la caché temporal para liberar RAM
        colorCache.clear();

        // Devolvemos resultados al jefe (Game.js)
        self.postMessage({ 
            type: 'ANALYSIS_COMPLETE', 
            pixelMap: pixelMap,
            pixelsRemaining: pixelsRemaining,
            wallBuffer: cache.wallMap.buffer 
        }, [cache.wallMap.buffer]);
    }

    // --- RELLENO (FLOOD FILL) ---
    if (type === 'FILL') {
        const { sx, sy, color, currentBuffer } = e.data;
        const currentData = new Uint8ClampedArray(currentBuffer);
        const paintedIndices = getFloodFillIndices(sx, sy, color, currentData);

        self.postMessage(
            { type: 'FILL_RESULT', indices: paintedIndices }, 
            [paintedIndices.buffer]
        );
    }

    // --- PISTAS (HINT) ---
    if (type === 'FIND_HINT') {
        const { pixelsBuffer, candidateIndices, color } = e.data;
        const currentPixels = new Uint8ClampedArray(pixelsBuffer);
        
        let foundX = -1, foundY = -1;
        
        // Bucle inverso para encontrar píxeles más "difíciles" o centrales a veces ayuda,
        // pero el orden normal está bien.
        for (let i = 0; i < candidateIndices.length; i++) {
            const idx = candidateIndices[i]; 
            const pIdx = idx * 4;

            // Buscar pixel no pintado correctamente
            if (currentPixels[pIdx+3] < 200 || !colorsMatch(
                currentPixels[pIdx], currentPixels[pIdx+1], currentPixels[pIdx+2], 
                color.r, color.g, color.b
            )) {
                foundX = idx % cache.w;
                foundY = Math.floor(idx / cache.w);
                break; 
            }
        }

        self.postMessage({ type: 'HINT_FOUND', x: foundX, y: foundY });
    }
};

function colorsMatch(r1, g1, b1, r2, g2, b2) {
    const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
    return diff <= TOLERANCE_THRESHOLD;
}

function getFloodFillIndices(sx, sy, col, currentData) {
    const w = cache.w;
    const h = cache.h;
    
    // Resetear mapa de visitados (muy rápido)
    cache.visited.fill(0); 

    const sol = cache.solData;
    const walls = cache.wallMap;
    const targetR = col.r, targetG = col.g, targetB = col.b;

    const q = new Int32Array(w * h * 2); 
    let qStart = 0, qEnd = 0;
    
    const resultIndices = []; 
    
    const startIdx = sy * w + sx;
    
    // Validaciones iniciales
    if (startIdx < 0 || startIdx >= walls.length || walls[startIdx] === 1) return new Int32Array(0);
    
    const iStart = startIdx * 4;
    // ¿El punto de inicio coincide con el color objetivo en la SOLUCIÓN?
    if (!colorsMatch(sol[iStart], sol[iStart+1], sol[iStart+2], targetR, targetG, targetB)) {
        return new Int32Array(0);
    }

    cache.visited[startIdx] = 1;
    q[qEnd++] = sx; 
    q[qEnd++] = sy;
    
    // Añadir el primer pixel si no está pintado en el LIENZO
    const pStart = startIdx * 4;
    if (currentData[pStart+3] < 200 || !colorsMatch(currentData[pStart], currentData[pStart+1], currentData[pStart+2], targetR, targetG, targetB)) {
        resultIndices.push(startIdx);
    }

    const DX = [0, 0, 1, -1];
    const DY = [-1, 1, 0, 0];

    // Bucle BFS (Breadth-First Search)
    while(qStart < qEnd) {
        const cx = q[qStart++];
        const cy = q[qStart++];

        for(let i = 0; i < 4; i++) {
            const nx = cx + DX[i];
            const ny = cy + DY[i];

            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            
            const nIdx = ny * w + nx;
            
            if (cache.visited[nIdx] === 1 || walls[nIdx] === 1) continue;
            
            const nPx = nIdx * 4;
            
            // 1. Chequeo contra SOLUCIÓN (¿Es parte del área de este color?)
            if (colorsMatch(sol[nPx], sol[nPx+1], sol[nPx+2], targetR, targetG, targetB)) {
                cache.visited[nIdx] = 1;
                q[qEnd++] = nx; 
                q[qEnd++] = ny;
                
                // 2. Chequeo contra LIENZO ACTUAL (¿Necesita pintarse?)
                // Si alpha < 200 (transparente) O color diferente -> Agregar a lista de pintar
                if (currentData[nPx+3] < 200 || !colorsMatch(currentData[nPx], currentData[nPx+1], currentData[nPx+2], targetR, targetG, targetB)) {
                    resultIndices.push(nIdx);
                }
            }
        }
    }

    return new Int32Array(resultIndices);
}