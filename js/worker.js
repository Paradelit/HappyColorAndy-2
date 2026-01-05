// ==========================================
// 🚀 WORKER.JS (MODO TURBO - LOOKUP TABLE)
// ==========================================

let cache = {
    w: 0, h: 0,
    solData: null,
    wallMap: null,
    visited: null
};

// Tolerancia para considerar colores iguales
const TOLERANCE_THRESHOLD = 15; 

self.onmessage = function(e) {
    const { type } = e.data;

    // --- ANÁLISIS DE IMAGEN (EL CUELLO DE BOTELLA) ---
    if (type === 'ANALYZE_LEVEL') {
        const { width, height, solBuffer, linBuffer, colors } = e.data;
        
        cache.w = width;
        cache.h = height;
        cache.solData = new Uint8ClampedArray(solBuffer);
        const linData = new Uint8ClampedArray(linBuffer);
        cache.wallMap = new Uint8Array(width * height);
        
        // Inicializamos los arrays de resultados
        const pixelMap = Array.from({length: colors.length}, () => []);
        const pixelsRemaining = new Array(colors.length).fill(0);
        
        // ⚡ TRUCO DE VELOCIDAD: LOOKUP TABLE (LUT) ⚡
        // Creamos un array gigante de 16 millones de posiciones (2^24 para RGB).
        // Esto consume unos 32MB de RAM pero hace que el análisis sea INSTANTÁNEO.
        // -1 significa "color no visto todavía".
        const colorLUT = new Int16Array(16777216).fill(-1);
        
        const len = width * height;

        // Bucle principal optimizado
        for(let i = 0; i < len; i++) {
            const idx = i * 4;
            
            // 1. Paredes (Rápido)
            if(linData[idx] < 150 && linData[idx+1] < 150 && linData[idx+2] < 150 && linData[idx+3] > 200) {
                cache.wallMap[i] = 1;
                continue; 
            } 
            cache.wallMap[i] = 0;
            
            // 2. Colores
            // Solo procesamos si el pixel tiene opacidad
            if(cache.solData[idx+3] > 0) {
                const r = cache.solData[idx];
                const g = cache.solData[idx+1];
                const b = cache.solData[idx+2];
                
                // Generamos una clave única numérica para este color RGB
                // Ejemplo: Rojo puro se convierte en un número único.
                const rgbKey = (r << 16) | (g << 8) | b;
                
                // MIRAMOS EN LA TABLA (LUT) -> Velocidad O(1)
                let best = colorLUT[rgbKey];
                
                // Si es -1, es la primera vez que vemos este color exacto. Toca calcular.
                if (best === -1) {
                    let minD = 999;
                    
                    // Cálculo pesado (Solo ocurre unas 100-200 veces en toda la imagen)
                    for(let c = 0; c < colors.length; c++) {
                        const col = colors[c];
                        // Distancia Manhattan
                        const d = Math.abs(r - col.r) + Math.abs(g - col.g) + Math.abs(b - col.b);
                        if(d < minD) {
                            minD = d;
                            best = c;
                        }
                        if (d === 0) break; // Coincidencia exacta
                    }
                    
                    // Si la diferencia es demasiada, no es ningún color válido
                    if (minD > 30) best = -2; // -2 marca "Color inválido conocido"
                    
                    // GUARDAMOS EL RESULTADO EN LA TABLA
                    // La próxima vez que aparezca este color, no calcularemos nada.
                    colorLUT[rgbKey] = best;
                }
                
                // Si encontramos un color válido (y no es -2), lo guardamos
                if(best >= 0) { 
                    pixelMap[best].push(i);
                    pixelsRemaining[best]++;
                }
            }
        }

        // Liberar memoria del buffer temporal de paredes
        const wallBufferToSend = cache.wallMap.buffer;

        // Devolvemos resultados
        self.postMessage({ 
            type: 'ANALYSIS_COMPLETE', 
            pixelMap: pixelMap,
            pixelsRemaining: pixelsRemaining,
            wallBuffer: wallBufferToSend
        }, [wallBufferToSend]); // Transferencia rápida
    }

    // --- RELLENO (Mantener lógica de inundación) ---
    if (type === 'FILL') {
        const { sx, sy, color, currentBuffer } = e.data;
        // Requerimos cache.visited para esto
        if (!cache.visited) cache.visited = new Uint8Array(cache.w * cache.h);
        
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
        for (let i = 0; i < candidateIndices.length; i++) {
            const idx = candidateIndices[i]; 
            const pIdx = idx * 4;
            if (currentPixels[pIdx+3] < 200 || !colorsMatch(currentPixels[pIdx], currentPixels[pIdx+1], currentPixels[pIdx+2], color.r, color.g, color.b)) {
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
    const w = cache.w, h = cache.h;
    cache.visited.fill(0); 

    const sol = cache.solData;
    const walls = cache.wallMap;
    const tr = col.r, tg = col.g, tb = col.b;

    const q = new Int32Array(w * h * 2); 
    let qStart = 0, qEnd = 0;
    const resultIndices = []; 
    
    const startIdx = sy * w + sx;
    if (startIdx < 0 || startIdx >= w*h || walls[startIdx] === 1) return new Int32Array(0);
    
    const iStart = startIdx * 4;
    if (!colorsMatch(sol[iStart], sol[iStart+1], sol[iStart+2], tr, tg, tb)) return new Int32Array(0);

    cache.visited[startIdx] = 1;
    q[qEnd++] = sx; q[qEnd++] = sy;
    
    const pStart = startIdx * 4;
    if (currentData[pStart+3] < 200 || !colorsMatch(currentData[pStart], currentData[pStart+1], currentData[pStart+2], tr, tg, tb)) {
        resultIndices.push(startIdx);
    }

    const DX = [0, 0, 1, -1], DY = [-1, 1, 0, 0];

    while(qStart < qEnd) {
        const cx = q[qStart++], cy = q[qStart++];
        for(let i = 0; i < 4; i++) {
            const nx = cx + DX[i], ny = cy + DY[i];
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            
            if (cache.visited[nIdx] === 1 || walls[nIdx] === 1) continue;
            
            const nPx = nIdx * 4;
            if (colorsMatch(sol[nPx], sol[nPx+1], sol[nPx+2], tr, tg, tb)) {
                cache.visited[nIdx] = 1;
                q[qEnd++] = nx; q[qEnd++] = ny;
                if (currentData[nPx+3] < 200 || !colorsMatch(currentData[nPx], currentData[nPx+1], currentData[nPx+2], tr, tg, tb)) {
                    resultIndices.push(nIdx);
                }
            }
        }
    }
    return new Int32Array(resultIndices);
}