// ==========================================
// 💷 WORKER.JS (OPTIMIZADO - PINTADO FLUIDO)
// ==========================================

let cache = {
    w: 0, h: 0,
    solData: null,
    wallMap: null,
    visited: null
};

const TOLERANCE_THRESHOLD = 15; 

self.onmessage = function(e) {
    const { type } = e.data;

    if (type === 'INIT') {
        const { width, height, solBuffer, wallBuffer } = e.data;
        cache.w = width;
        cache.h = height;
        cache.solData = new Uint8ClampedArray(solBuffer);
        cache.wallMap = new Uint8Array(wallBuffer);
        cache.visited = new Uint8Array(width * height);
    }

    if (type === 'FILL') {
        const { sx, sy, color, currentBuffer } = e.data;
        const currentData = new Uint8ClampedArray(currentBuffer);
        const paintedIndices = getFloodFillIndices(sx, sy, color, currentData);

        self.postMessage(
            { type: 'FILL_RESULT', indices: paintedIndices }, 
            [paintedIndices.buffer]
        );
    }

    if (type === 'FIND_HINT') {
        const { pixelsBuffer, candidateIndices, color } = e.data;
        const currentPixels = new Uint8ClampedArray(pixelsBuffer);
        
        let foundX = -1, foundY = -1;
        
        for (let i = 0; i < candidateIndices.length; i++) {
            const idx = candidateIndices[i]; 
            const pIdx = idx * 4;

            // Buscar un pixel que NO esté pintado (alpha bajo O color diferente)
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
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    const diff = (dr < 0 ? -dr : dr) + (dg < 0 ? -dg : dg) + (db < 0 ? -db : db);
    return diff <= TOLERANCE_THRESHOLD;
}

function getFloodFillIndices(sx, sy, col, currentData) {
    const w = cache.w;
    const h = cache.h;
    
    cache.visited.fill(0); 

    const sol = cache.solData;
    const walls = cache.wallMap;
    const targetR = col.r, targetG = col.g, targetB = col.b;

    const q = new Int32Array(w * h * 2); 
    let qStart = 0, qEnd = 0;
    
    const resultIndices = [];
    
    const startIdx = sy * w + sx;
    
    // Verificar si es una pared
    if (walls[startIdx] === 1) return new Int32Array(0);
    
    // Verificar si el pixel inicial coincide con el color objetivo
    const iStart = startIdx * 4;
    if (!colorsMatch(sol[iStart], sol[iStart+1], sol[iStart+2], targetR, targetG, targetB)) {
        return new Int32Array(0);
    }

    cache.visited[startIdx] = 1;
    q[qEnd++] = sx; 
    q[qEnd++] = sy;
    
    // CORRECCIÓN IMPORTANTE: Solo agregar a resultIndices si NO está pintado
    const pStart = startIdx * 4;
    // Verificar que alpha sea bajo (< 200) O que el color no coincida
    if (currentData[pStart+3] < 200 || !colorsMatch(currentData[pStart], currentData[pStart+1], currentData[pStart+2], targetR, targetG, targetB)) {
        resultIndices.push(startIdx);
    }

    const DX = [0, 0, 1, -1];
    const DY = [-1, 1, 0, 0];

    let cx, cy, nIdx, nPx, nx, ny;

    while(qStart < qEnd) {
        cx = q[qStart++];
        cy = q[qStart++];

        for(let i = 0; i < 4; i++) {
            nx = cx + DX[i];
            ny = cy + DY[i];

            // Chequeo de límites
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            
            nIdx = ny * w + nx;
            
            // Si ya fue visitado o es una pared, saltar
            if (cache.visited[nIdx] === 1 || walls[nIdx] === 1) continue;
            
            nPx = nIdx * 4;
            
            // Verificar si el pixel en la solución coincide con el color objetivo
            if (colorsMatch(sol[nPx], sol[nPx+1], sol[nPx+2], targetR, targetG, targetB)) {
                cache.visited[nIdx] = 1;
                q[qEnd++] = nx; 
                q[qEnd++] = ny;
                
                // CORRECCIÓN CRÍTICA: Solo agregar si NO está ya pintado correctamente
                // Verificar alpha bajo O color diferente
                if (currentData[nPx+3] < 200 || !colorsMatch(currentData[nPx], currentData[nPx+1], currentData[nPx+2], targetR, targetG, targetB)) {
                    resultIndices.push(nIdx);
                }
            }
        }
    }

    return new Int32Array(resultIndices);
}