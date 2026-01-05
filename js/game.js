// ==========================================
// 🎮 LÓGICA DEL JUEGO (OPTIMIZADO - CARGA RÁPIDA)
// ==========================================

const sMagic = new Audio('magic.mp3'); sMagic.volume = 0.6;
const sHint = new Audio('hint.mp3');   sHint.volume = 0.6;

const Game = {
    state: {
        currentLevel: null,
        coloresRGB: [],
        selectedColorIndex: 0,
        scale: 1, pX: 0, pY: 0,
        isVictoryShown: false,
        progressUpdateQueued: false,
        isProcessing: false, 
        
        isDrag: false, isPinch: false, hasMov: false, loadedCount: 0,
        pixelsRemaining: [], 
        pixelMap: [],
        initialPixels: [],
        
        lastTransformUpdate: 0,
        transformThrottle: 16
    },

    input: { lX: 0, lY: 0, initDist: 0, lZoomT: 0 },

    cache: {
        solData: null,
        wallMap: null,
        saveTimeout: null,
        backupImg: null,
        idleTimer: null,
        pendingAction: null,
        lastHighlightIndex: -1
    },

    assets: { imgLineas: new Image(), imgSolucion: new Image() },
    
    worker: null,

    ui: {}, ctx: null, hlCtx: null, hCtx: null, lCtx: null, lineDrawCtx: null,

    init: function() {
        this.ui = {
            screen: document.getElementById('game-screen'),
            loading: document.getElementById('loading-overlay'),
            loadingText: document.querySelector('#loading-overlay'),
            title: document.querySelector('header h1'),
            progressBar: document.getElementById('progress-bar'),
            paleta: document.getElementById('paleta'),
            canvas: document.getElementById('lienzo'),
            hlCanvas: document.getElementById('highlight-canvas'),
            linesCanvas: document.getElementById('lines-canvas'),
            zoomLayer: document.getElementById('zoom-layer'),
            shakeLayer: document.getElementById('shake-layer'),
            viewport: document.getElementById('viewport'),
            
            btnBack: document.getElementById('btn-back'),
            btnHint: document.getElementById('btn-hint'),
            btnMagic: document.getElementById('btn-magic'),
            btnReset: document.getElementById('btn-reset'),
            btnDownload: document.getElementById('btn-download'),
            btnSol: document.getElementById('btn-solucion'),
            btnSound: document.getElementById('btn-sound-game'),
            
            victoryModal: document.getElementById('victory-modal'),
            victoryTitle: document.getElementById('victory-title'),
            victoryCanvas: document.getElementById('victory-canvas'),
            btnCloseVictory: document.getElementById('btn-close-victory'),

            confirmModal: document.getElementById('confirm-modal'),
            cTitle: document.getElementById('c-title'),
            cText: document.getElementById('c-text'),
            cCheck: document.getElementById('c-dont-show'),
            cBtnOk: document.getElementById('c-btn-ok'),
            cBtnCancel: document.getElementById('c-btn-cancel')
        };

        this.ctx = this.ui.canvas.getContext('2d', { willReadFrequently: true, desynchronized: false });
        this.hlCtx = this.ui.hlCanvas.getContext('2d', { willReadFrequently: false }); 
        this.lineDrawCtx = this.ui.linesCanvas.getContext('2d', { willReadFrequently: false }); 
        
        const hiddenCanvas = document.createElement('canvas');
        this.hCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
        this.hiddenCanvasElement = hiddenCanvas;

        const linesCanvas = document.createElement('canvas');
        this.lCtx = linesCanvas.getContext('2d', { willReadFrequently: true });
        this.linesCanvasElement = linesCanvas;

        window.onpopstate = (event) => {
            if (!this.ui.screen.classList.contains('hidden')) {
                this.exitGame(true); 
            }
        };

        this.bindEvents();
        
        this.assets.imgLineas.onload = () => this.checkLoad();
        this.assets.imgSolucion.onload = () => this.checkLoad();
    },

    startWorker: function() {
        if (this.worker) this.worker.terminate();
        this.worker = new Worker('js/worker.js');
        this.worker.onmessage = (e) => this.handleWorkerMessage(e);
    },

    handleWorkerMessage: function(e) {
        if (e.data.type === 'FILL_RESULT') {
            const { indices } = e.data;
            const color = this.state.coloresRGB[this.state.selectedColorIndex];
            this.animateFillFluid(indices, color);
        
        } else if (e.data.type === 'HINT_FOUND') {
            const { x, y } = e.data;
            this.state.isProcessing = false; 
            
            if (x !== -1 && y !== -1) {
                const currentIdx = this.state.selectedColorIndex;
                const c = this.state.coloresRGB[currentIdx];
                
                if(typeof playEffect === 'function') playEffect(sHint);

                this.fillAreaWorker(x, y, c);
                
                if (this.state.scale < 2.5) this.state.scale = 2.5;
                this.state.pX = (this.ui.viewport.clientWidth / 2) - (x * this.state.scale);
                this.state.pY = (this.ui.viewport.clientHeight / 2) - (y * this.state.scale);
                this.updateTransform();
                
                this.ui.hlCanvas.classList.add('smart-pulse');
            }
        } else if (e.data.type === 'PREPROCESS_PROGRESS') {
            // Actualizar indicador de progreso
            this.ui.loadingText.innerHTML = `Procesando imagen...<br><span style="font-size:2rem;color:#d63384">${e.data.progress}%</span>`;
        
        } else if (e.data.type === 'PREPROCESS_COMPLETE') {
            // Pre-procesamiento completado
            const { wallBuffer, pixelMap, pixelsRemaining } = e.data;
            
            this.cache.wallMap = new Uint8Array(wallBuffer);
            
            // Convertir pixelMap de vuelta a arrays normales
            this.state.pixelMap = pixelMap.map(typedArr => Array.from(typedArr));
            this.state.pixelsRemaining = [...pixelsRemaining];
            this.state.initialPixels = [...pixelsRemaining];
            
            // Guardar en caché para futuras cargas
            this.saveProcessedDataToCache();
            
            // Continuar con la carga del nivel
            this.finishLevelLoad();
        }
    },

    animateFillFluid: function(indices, color) {
        if (!indices || indices.length === 0) {
            this.state.isProcessing = false;
            return;
        }

        const w = this.ui.canvas.width;
        const h = this.ui.canvas.height;
        
        let minX = w, maxX = 0, minY = h, maxY = 0;
        
        for(let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const x = idx % w;
            const y = (idx - x) / w;
            if(x < minX) minX = x;
            if(x > maxX) maxX = x;
            if(y < minY) minY = y;
            if(y > maxY) maxY = y;
        }

        minX = Math.max(0, minX - 2);
        minY = Math.max(0, minY - 2);
        maxX = Math.min(w - 1, maxX + 2);
        maxY = Math.min(h - 1, maxY + 2);

        const rectW = maxX - minX + 1;
        const rectH = maxY - minY + 1;

        const imgData = this.ctx.getImageData(minX, minY, rectW, rectH);
        const data = imgData.data;
        const linesImgData = this.lineDrawCtx.getImageData(minX, minY, rectW, rectH);
        const lData = linesImgData.data;

        const r = color.r, g = color.g, b = color.b;

        const localIndices = [];
        const startIdx = indices[0];
        const startX = startIdx % w; 
        const startY = (startIdx - startX)/w;

        for(let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const gx = idx % w;
            const gy = (idx - gx) / w;
            
            const dist = (gx - startX)**2 + (gy - startY)**2;          
            const lx = gx - minX;
            const ly = gy - minY;
            localIndices.push({ 
                lIdx: (ly * rectW + lx) * 4,
                dist: dist
            });
        }
        
        localIndices.sort((a, b) => a.dist - b.dist);

        const total = localIndices.length;
        const duration = total < 1000 ? 200 : 400; 
        
        const startTime = performance.now();
        let currentIndex = 0;

        const loop = () => {
            const elapsed = performance.now() - startTime;
            let progress = elapsed / duration;
            if(progress > 1) progress = 1;
            
            const targetIndex = Math.floor(progress * total);
            
            while (currentIndex < targetIndex) {
                const p = localIndices[currentIndex];
                const idx = p.lIdx;
                
                data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = 255;
                lData[idx+3] = 0;
                currentIndex++;
            }

            this.ctx.putImageData(imgData, minX, minY);
            this.lineDrawCtx.putImageData(linesImgData, minX, minY);

            if (progress < 1) {
                requestAnimationFrame(loop);
            } else {
                this.finishPaintOperation(total);
            }
        };
        
        requestAnimationFrame(loop);
    },

    finishPaintOperation: function(paintedCount) {
        this.updateHighlightLayerOptimized(this.state.selectedColorIndex);
        
        const currentIdx = this.state.selectedColorIndex;
        if(this.state.pixelsRemaining[currentIdx] > 0) {
            this.state.pixelsRemaining[currentIdx] -= paintedCount;
            this.updateAllPaletaProgress();
            if(this.state.pixelsRemaining[currentIdx] <= 0) {
                this.state.pixelsRemaining[currentIdx] = 0;
                this.onColorCompleted(currentIdx);
            }
        }
        this.scheduleSave();
        this.queueProgressUpdate();
        this.state.isProcessing = false; 
    },

    showConfirm: function(actionKey, title, text, callback) {
        const skip = localStorage.getItem('skip_confirm_' + actionKey);
        if (skip === 'true') {
            callback();
            return;
        }

        this.ui.cTitle.innerText = title;
        this.ui.cText.innerText = text;
        this.ui.cCheck.checked = false;
        
        this.cache.pendingAction = () => {
            if (this.ui.cCheck.checked) {
                localStorage.setItem('skip_confirm_' + actionKey, 'true');
            }
            this.ui.confirmModal.classList.add('hidden');
            callback();
        };

        this.ui.confirmModal.classList.remove('hidden');
    },

    bindEvents: function() {
        this.ui.btnBack.onclick = () => this.exitGame(false);

        this.ui.btnHint.onclick = () => {
            this.showConfirm('hint', '💡 Usar Pista', '¿Quieres que te indiquemos dónde pintar un píxel difícil?', () => {
                this.useHint(); this.resetIdleTimer();
            });
        };

        this.ui.btnMagic.onclick = () => {
            this.showConfirm('magic', '✨ Varita Mágica', '¿Quieres completar automáticamente todo el color seleccionado?', () => {
                this.useMagic(); this.resetIdleTimer();
            });
        };

        this.ui.btnReset.onclick = () => {
            this.showConfirm('reset', '🗑️ Borrar Progreso', '¡Cuidado! Se borrará todo lo que has pintado en esta foto.', () => {
                this.resetLevel();
            });
        };

        this.ui.btnDownload.onclick = () => {
             this.showConfirm('download', '💾 Descargar', '¿Quieres guardar la imagen en tu dispositivo?', () => {
                this.downloadImage();
            });
        };

        this.ui.cBtnCancel.onclick = () => {
            this.ui.confirmModal.classList.add('hidden');
            this.cache.pendingAction = null;
        };
        this.ui.cBtnOk.onclick = () => {
            if (this.cache.pendingAction) this.cache.pendingAction();
        };

        const startPeek = (e) => {
            if(e.cancelable) e.preventDefault();
            if(this.cache.backupImg) return;
            
            this.cache.backupImg = this.ctx.getImageData(0,0, this.ui.canvas.width, this.ui.canvas.height); 
            this.ctx.drawImage(this.assets.imgSolucion, 0, 0); 
            this.ui.hlCanvas.style.opacity = '0'; 
            this.ui.linesCanvas.style.opacity = '0'; 
        };
        
        const endPeek = (e) => {
             if(e && e.cancelable) e.preventDefault();
             if(!this.cache.backupImg) return; 
             this.ctx.putImageData(this.cache.backupImg, 0, 0); 
             this.cache.backupImg = null; 
             if(!this.state.isVictoryShown) { 
                 this.ui.hlCanvas.style.opacity = '1'; 
                 this.ui.linesCanvas.style.opacity = '1'; 
            }
        };

        this.ui.btnSol.addEventListener('touchstart', startPeek, {passive:false}); 
        this.ui.btnSol.addEventListener('touchend', endPeek);
        this.ui.btnSol.addEventListener('mousedown', startPeek); 
        window.addEventListener('mouseup', endPeek);

        if(this.ui.btnCloseVictory) this.ui.btnCloseVictory.onclick = () => this.closeVictory();
        if(this.ui.btnSound) {
            this.ui.btnSound.onclick = () => {
                if(typeof toggleSound === 'function') {
                    toggleSound();
                    updateSoundState(this.state.currentLevel && !this.state.isVictoryShown);
                }
            };
        }

        this.ui.viewport.addEventListener('touchstart', (e) => { 
            this.resetIdleTimer(); 
            this.handleTouchStart(e); 
        }, {passive: false});
        
        this.ui.viewport.addEventListener('touchmove', (e) => {
            this.handleTouchMoveThrottled(e);
        }, {passive: false});
        
        window.addEventListener('touchend', (e) => {
            if(this.state.isDrag || this.state.isPinch) {
                this.resetIdleTimer();
                this.handleTouchEnd(e);
            }
        }, {passive: false});
        
        this.ui.viewport.addEventListener('mousedown', (e) => {
            this.resetIdleTimer(); this.state.isDrag = true; this.state.hasMov = false; 
            this.input.lX = e.clientX; this.input.lY = e.clientY;
        });
        
        this.ui.viewport.addEventListener('mousemove', (e) => {
            if(!this.state.isDrag) return;
            const dx = e.clientX - this.input.lX, dy = e.clientY - this.input.lY;
            if(Math.abs(dx) > 2 || Math.abs(dy) > 2) this.state.hasMov = true;
            this.state.pX += dx; this.state.pY += dy; 
            this.input.lX = e.clientX; this.input.lY = e.clientY;
            this.updateTransformThrottled();
        });
        
        window.addEventListener('mouseup', (e) => {
            if(this.state.isDrag) {
                this.resetIdleTimer();
                this.state.isDrag = false;
                if(!this.state.hasMov && e.target.closest('#viewport')) {
                    this.handleInput(e.clientX, e.clientY);
                }
            }
        });
        
        this.ui.viewport.addEventListener('wheel', (e) => { 
            this.resetIdleTimer(); 
            this.handleWheel(e); 
        }, {passive: false});
    },

    loadLevel: function(index) {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        this.startWorker();

        const level = niveles[index];
        this.state.currentLevel = level;
        this.ui.title.innerText = level.nombre;
        
        this.state.coloresRGB = level.colores.map(hex => ({
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        }));
        
        history.pushState({ page: 'game' }, 'Juego', '#game');

        document.getElementById('gallery-screen').classList.add('hidden');
        this.ui.screen.classList.remove('hidden');
        this.ui.loading.classList.remove('hidden');
        this.ui.loadingText.innerHTML = 'Cargando imágenes...';
        
        this.state.isVictoryShown = false;
        this.ui.progressBar.style.width = '0%';
        this.ui.btnHint.className = 'icon-btn';
        this.ui.btnMagic.className = 'icon-btn';
        
        this.ui.canvas.classList.remove('framed-art');
        this.ui.linesCanvas.style.opacity = '1'; 
        
        this.state.loadedCount = 0;
        this.ctx.clearRect(0, 0, this.ui.canvas.width, this.ui.canvas.height);
        this.hlCtx.clearRect(0, 0, this.ui.canvas.width, this.ui.canvas.height);
        this.lineDrawCtx.clearRect(0, 0, this.ui.canvas.width, this.ui.canvas.height);

        const globalCache = window.imageCache || {};
        if (globalCache[level.lineas]?.complete) {
            this.assets.imgLineas = globalCache[level.lineas];
            this.state.loadedCount++;
        } else {
            this.assets.imgLineas.src = level.lineas + '?' + Date.now();
        }
        if (globalCache[level.solucion]?.complete) {
            this.assets.imgSolucion = globalCache[level.solucion];
            this.state.loadedCount++;
        } else {
            this.assets.imgSolucion.src = level.solucion + '?' + Date.now();
        }
        
        if (this.state.loadedCount === 2) setTimeout(() => this.startGame(), 50);
        if(typeof updateSoundState === 'function') updateSoundState(true);
    },

    checkLoad: function() {
        this.state.loadedCount++;
        if(this.state.loadedCount === 2) setTimeout(() => this.startGame(), 50);
    },

    getCacheKey: function() {
        return 'processed_' + this.state.currentLevel.id;
    },

    async saveProcessedDataToCache() {
        const cacheData = {
            pixelMap: this.state.pixelMap,
            pixelsRemaining: this.state.pixelsRemaining,
            wallMap: Array.from(this.cache.wallMap),
            version: 1
        };
        
        try {
            await saveToDB(this.getCacheKey(), JSON.stringify(cacheData));
        } catch(e) {
            console.warn('No se pudo guardar caché:', e);
        }
    },

    async loadProcessedDataFromCache() {
        try {
            const cached = await loadFromDB(this.getCacheKey());
            if (cached) {
                const cacheData = JSON.parse(cached);
                if (cacheData.version === 1) {
                    this.state.pixelMap = cacheData.pixelMap;
                    this.state.pixelsRemaining = cacheData.pixelsRemaining;
                    this.state.initialPixels = [...cacheData.pixelsRemaining];
                    this.cache.wallMap = new Uint8Array(cacheData.wallMap);
                    return true;
                }
            }
        } catch(e) {
            console.warn('Error cargando caché:', e);
        }
        return false;
    },

    startGame: async function() {
        const w = this.assets.imgLineas.width;
        const h = this.assets.imgLineas.height;
        const levelId = this.state.currentLevel.id;

        this.ui.canvas.width = w; this.ui.canvas.height = h;
        this.ui.hlCanvas.width = w; this.ui.hlCanvas.height = h; 
        this.ui.linesCanvas.width = w; this.ui.linesCanvas.height = h;
        this.hiddenCanvasElement.width = w; this.hiddenCanvasElement.height = h;
        this.linesCanvasElement.width = w; this.linesCanvasElement.height = h;

        const isAlreadyDone = localStorage.getItem('completed_' + levelId) === 'true';

        if (isAlreadyDone) {
            this.ctx.drawImage(this.assets.imgSolucion, 0, 0); 
            this.lineDrawCtx.clearRect(0, 0, w, h); 
            
            this.ui.progressBar.style.width = '100%';
            this.ui.loading.classList.add('hidden');
            this.state.isVictoryShown = true; 
            
            this.ui.canvas.classList.add('framed-art');
            
            this.state.pixelsRemaining = new Array(this.state.coloresRGB.length).fill(0);
            this.state.initialPixels = new Array(this.state.coloresRGB.length).fill(1);
            this.generarPaletaUI();
            
            this.fitCamera(w, h);
            return; 
        }

        this.ui.canvas.classList.remove('framed-art');

        this.hCtx.clearRect(0, 0, w, h);
        this.lCtx.clearRect(0, 0, w, h);

        this.lineDrawCtx.drawImage(this.assets.imgLineas, 0, 0);
        this.hCtx.drawImage(this.assets.imgSolucion, 0, 0);
        this.lCtx.drawImage(this.assets.imgLineas, 0, 0);
        
        this.ctx.clearRect(0, 0, w, h);

        this.cache.solData = this.hCtx.getImageData(0, 0, w, h).data;
        
        // INTENTAR CARGAR DESDE CACHÉ
        this.ui.loadingText.innerHTML = 'Verificando caché...';
        const cachedSuccess = await this.loadProcessedDataFromCache();
        
        if (cachedSuccess) {
            // ¡Caché encontrada! Saltar procesamiento
            this.ui.loadingText.innerHTML = '¡Cargado desde caché! ⚡';
            setTimeout(() => this.finishLevelLoad(), 100);
        } else {
            // No hay caché, procesar con worker
            this.ui.loadingText.innerHTML = 'Procesando imagen...<br><span style="font-size:2rem;color:#d63384">0%</span>';
            
            const linData = this.lCtx.getImageData(0, 0, w, h).data;
            const solBuffer = this.cache.solData.buffer.slice(0);
            const linBuffer = linData.buffer.slice(0);
            
            this.worker.postMessage({
                type: 'PREPROCESS',
                width: w,
                height: h,
                solBuffer,
                linBuffer,
                coloresRGB: this.state.coloresRGB
            }, [solBuffer, linBuffer]);
        }
    },

    async finishLevelLoad() {
        const w = this.ui.canvas.width;
        const h = this.ui.canvas.height;
        const levelId = this.state.currentLevel.id;
        
        // Inicializar worker con datos procesados
        const wallBuffer = this.cache.wallMap.buffer.slice(0);
        const solBuffer = this.cache.solData.buffer.slice(0);
        this.worker.postMessage({
            type: 'INIT', width: w, height: h, wallBuffer, solBuffer
        }, [wallBuffer, solBuffer]);

        // Cargar progreso guardado o iniciar nuevo
        const savedData = await loadFromDB(levelId);
        if(savedData) {
            const img = new Image();
            img.onload = () => { 
                this.ctx.drawImage(img, 0, 0);
                this.restoreLinesErasure(); 
                this.recalculateRemainingPixels(); 
                this.generarPaletaUI(); 
                this.selectColor(0); 
                this.queueProgressUpdate();
                this.ui.loading.classList.add('hidden');
                this.resetIdleTimer();
            };
            img.src = savedData;
        } else { 
            this.generarPaletaUI();
            this.selectColor(0);
            this.queueProgressUpdate();
            this.ui.loading.classList.add('hidden');
            this.resetIdleTimer();
        }

        this.fitCamera(w, h);

        if (Tutorial.init()) {
            setTimeout(() => {
                Tutorial.show();
            }, 1500);
        }
    },

    fitCamera: function(w, h) {
        const vW = this.ui.viewport.clientWidth, vH = this.ui.viewport.clientHeight;
        const sW = (vW - 40) / w, sH = (vH - 40) / h;
        this.state.scale = Math.min(sW, sH) || 0.5;
        this.state.pX = (vW - w * this.state.scale) / 2;
        this.state.pY = (vH - h * this.state.scale) / 2;
        this.updateTransform();
    },

    restoreLinesErasure: function() {
        const w = this.ui.canvas.width;
        const h = this.ui.canvas.height;
        const imgData = this.ctx.getImageData(0,0,w,h).data;
        const linesData = this.lineDrawCtx.getImageData(0,0,w,h);
        const lDat = linesData.data;

        for(let i=0; i<w*h; i++) {
            const idx = i*4;
            if (imgData[idx+3] > 200 && (imgData[idx] < 250 || imgData[idx+1] < 250 || imgData[idx+2] < 250)) {
                lDat[idx+3] = 0; 
            }
        }
        this.lineDrawCtx.putImageData(linesData, 0, 0);
    },

    recalculateRemainingPixels: function() {
        const w = this.ui.canvas.width;
        const curData = this.ctx.getImageData(0,0,w,this.ui.canvas.height).data;
        
        this.state.pixelMap.forEach((pixels, colorIdx) => {
            let paintedCount = 0;
            const c = this.state.coloresRGB[colorIdx];
            for(let pIdx of pixels) {
                const idx = pIdx * 4;
                if(curData[idx+3] > 200 &&
                   Math.abs(curData[idx] - c.r) < 15 && 
                   Math.abs(curData[idx+1] - c.g) < 15 && 
                   Math.abs(curData[idx+2] - c.b) < 15) {
                    paintedCount++;
                }
            }
            this.state.pixelsRemaining[colorIdx] -= paintedCount;
            if(this.state.pixelsRemaining[colorIdx] < 0) this.state.pixelsRemaining[colorIdx] = 0;
        });
    },

    generarPaletaUI: function() {
        this.ui.paleta.innerHTML = ''; 
        this.state.coloresRGB.forEach((c, i) => {
            const btn = document.createElement('div');
            btn.className = 'color-btn';
            btn.id = 'color-btn-' + i; 
            btn.style.setProperty('--btn-color', `rgb(${c.r},${c.g},${c.b})`);
            
            const isLight = (c.r*0.299 + c.g*0.587 + c.b*0.114) > 186;
            if (isLight) btn.classList.add('light');
            
            const txtColor = isLight ? '#333' : '#fff';
            btn.innerHTML = `<span class="color-number" style="color:${txtColor}">${i + 1}</span>`;

            btn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                if(this.state.pixelsRemaining[i] > 0) {
                    this.selectColor(i);
                }
            };
            this.ui.paleta.appendChild(btn);
        });
        
        this.updateAllPaletaProgress();
    },

    updateAllPaletaProgress: function() {
        this.state.pixelsRemaining.forEach((rem, i) => {
            const total = this.state.initialPixels[i] || 1;
            const btn = document.getElementById('color-btn-' + i);
            if(btn) {
                if (rem <= 0) {
                    if(!btn.classList.contains('completed')) btn.classList.add('completed');
                    btn.style.setProperty('--progress', '100%'); 
                } else {
                    const done = total - rem;
                    const pct = (done / total) * 100;
                    btn.style.setProperty('--progress', `${pct}%`);
                }
            }
        });
    },

    selectColor: function(index) {
        this.resetIdleTimer(); 
        this.state.selectedColorIndex = index;
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
        const btn = document.getElementById('color-btn-' + index);
        if(btn) btn.classList.add('selected');
        if(btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        this.updateHighlightLayerOptimized(index);
    },

    onColorCompleted: function(index) {
        this.updateAllPaletaProgress(); 
        if(navigator.vibrate) navigator.vibrate([50, 50, 50]);

        let nextIndex = -1;
        for(let i = index + 1; i < this.state.pixelsRemaining.length; i++) {
            if(this.state.pixelsRemaining[i] > 0) { nextIndex = i; break; }
        }
        if(nextIndex === -1) {
            for(let i = 0; i < index; i++) {
                if(this.state.pixelsRemaining[i] > 0) { nextIndex = i; break; }
            }
        }
        if(nextIndex !== -1) {
            setTimeout(() => {
                this.selectColor(nextIndex);
            }, 300); 
        }
    },

    updateHighlightLayerOptimized: function(colorIndex) {
        if (this.cache.lastHighlightIndex === colorIndex && 
            this.state.pixelsRemaining[colorIndex] === 0) {
            return;
        }
        
        this.cache.lastHighlightIndex = colorIndex;
        this.updateHighlightLayer(colorIndex);
    },

    updateHighlightLayer: function(colorIndex) {
        const w = this.ui.canvas.width;
        const h = this.ui.canvas.height;
        this.hlCtx.clearRect(0, 0, w, h);
        
        if(this.state.pixelsRemaining[colorIndex] <= 0) return;

        const pixels = this.state.pixelMap[colorIndex];
        if(!pixels) return;

        const hlImgData = this.hlCtx.createImageData(w, h);
        const data = hlImgData.data;
        const imgData = this.ctx.getImageData(0,0,w,h).data;
        const c = this.state.coloresRGB[colorIndex];

        for(let i=0; i<pixels.length; i++) {
            const idx = pixels[i];
            const pIdx = idx * 4;
            const diff = Math.abs(imgData[pIdx] - c.r) + Math.abs(imgData[pIdx+1] - c.g) + Math.abs(imgData[pIdx+2] - c.b);
            
            if (diff > 30) { 
                const x = idx % w;
                const y = Math.floor(idx / w);
                if ((x + y) % 10 < 3) {
                    data[pIdx] = 100; data[pIdx+1] = 100; data[pIdx+2] = 100; data[pIdx+3] = 120; 
                }
            }
        }
        this.hlCtx.putImageData(hlImgData, 0, 0);
    },

    resetIdleTimer: function() {
        if (this.cache.idleTimer) clearTimeout(this.cache.idleTimer);
        if (this.ui.hlCanvas && this.ui.hlCanvas.classList.contains('smart-pulse')) {
            this.ui.hlCanvas.classList.remove('smart-pulse');
        }
        if (this.state.isVictoryShown || !this.state.currentLevel) return;
        this.cache.idleTimer = setTimeout(() => {
            if (this.state.pixelsRemaining[this.state.selectedColorIndex] > 0) {
                this.ui.hlCanvas.classList.add('smart-pulse');
            }
        }, 8000); 
    },

    updateTransformThrottled: function() {
        const now = performance.now();
        if (now - this.state.lastTransformUpdate < this.state.transformThrottle) {
            return;
        }
        this.state.lastTransformUpdate = now;
        this.updateTransform();
    },

    updateTransform: function() {
        this.ui.zoomLayer.style.transform = `translate(${this.state.pX}px, ${this.state.pY}px) scale(${this.state.scale})`;
    },

    handleInput: function(cx, cy) {
        const rect = this.ui.viewport.getBoundingClientRect();
        if(cy > rect.bottom) return;
        
        const x = Math.floor((cx - rect.left - this.state.pX) / this.state.scale);
        const y = Math.floor((cy - rect.top - this.state.pY) / this.state.scale);
        
        if(x >= 0 && x < this.ui.canvas.width && y >= 0 && y < this.ui.canvas.height) {
            this.tryPaint(x, y);
        }
    },

    tryPaint: function(x, y) {
        if(this.state.isProcessing || this.state.isVictoryShown) return;

        const w = this.ui.canvas.width;
        const idx = (y * w + x) * 4;
        const sol = this.cache.solData;
        
        if(this.cache.wallMap[y*w + x] === 1 || sol[idx+3] === 0) return;

        const pR = sol[idx], pG = sol[idx+1], pB = sol[idx+2];
        let best = -1, minD = 999;
        
        this.state.coloresRGB.forEach((c, i) => {
            const d = Math.abs(pR - c.r) + Math.abs(pG - c.g) + Math.abs(pB - c.b);
            if(d < minD) { minD = d; best = i; }
        });

        if(best === this.state.selectedColorIndex) {
            if(typeof playEffect === 'function') playEffect(sPaint);
            this.state.isProcessing = true; 
            this.fillAreaWorker(x, y, this.state.coloresRGB[best]);
        } else {
            if(navigator.vibrate) navigator.vibrate(200);
            this.ui.shakeLayer.classList.add('shake');
            setTimeout(() => this.ui.shakeLayer.classList.remove('shake'), 300);
        }
    },

    fillAreaWorker: function(sx, sy, col) {
        const w = this.ui.canvas.width;
        const h = this.ui.canvas.height;
        const imgData = this.ctx.getImageData(0, 0, w, h);
        this.worker.postMessage({
            type: 'FILL', currentBuffer: imgData.data.buffer, sx: sx, sy: sy, color: col
        }, [imgData.data.buffer]);
    },

    queueProgressUpdate: function() {
        if (this.state.progressUpdateQueued) return;
        this.state.progressUpdateQueued = true;
        requestAnimationFrame(() => {
            this.updateProgress();
            this.state.progressUpdateQueued = false;
        });
    },

    updateProgress: function() {
        if(this.state.isVictoryShown) return;
        let totalPixels = 0;
        let remainingTotal = 0;
        this.state.pixelsRemaining.forEach((rem, i) => {
            remainingTotal += rem;
            totalPixels += this.state.pixelMap[i].length; 
        });
        if(totalPixels === 0) totalPixels = 1;
        const ok = totalPixels - remainingTotal;
        const pct = (ok / totalPixels) * 100;
        this.ui.progressBar.style.width = pct + '%';

        if(pct > 10) {
            this.ui.btnMagic.classList.add('active');
            this.ui.btnHint.classList.add('active');
        } else if (pct > 5) {
            this.ui.btnHint.classList.add('active');
            this.ui.btnMagic.classList.remove('active');
        } else {
            this.ui.btnHint.classList.remove('active');
            this.ui.btnMagic.classList.remove('active');
        }

        if(remainingTotal === 0) this.triggerVictory();
    },

    triggerVictory: function() {
        if (this.cache.idleTimer) clearTimeout(this.cache.idleTimer);
        this.ui.hlCanvas.classList.remove('smart-pulse');
        this.state.isVictoryShown = true;
        localStorage.setItem('completed_' + this.state.currentLevel.id, 'true');
        
        this.ui.hlCanvas.style.transition = 'opacity 1s ease';
        this.ui.linesCanvas.style.transition = 'opacity 1.5s ease';
        this.ui.hlCanvas.style.opacity = '0';
        this.ui.linesCanvas.style.opacity = '0';
        
        if(typeof updateSoundState === 'function') updateSoundState(false);
        if(typeof playEffect === 'function') playEffect(sVictory);
        
        setTimeout(() => {
            const w = this.ui.canvas.width;
            const h = this.ui.canvas.height;
            const vW = this.ui.viewport.clientWidth;
            const vH = this.ui.viewport.clientHeight;
            
            const targetScale = Math.min((vW - 80) / w, (vH - 80) / h);
            const targetX = (vW - w * targetScale) / 2;
            const targetY = (vH - h * targetScale) / 2;
            
            this.ui.zoomLayer.style.transition = 'transform 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
            this.state.scale = targetScale;
            this.state.pX = targetX;
            this.state.pY = targetY;
            this.updateTransform();
            
            setTimeout(() => {
                this.ui.canvas.classList.add('framed-art');
            }, 800);
        }, 300);
        
        setTimeout(() => {
            confetti({ 
                particleCount: 100, 
                spread: 70, 
                origin: { y: 0.6 },
                colors: ['#d63384', '#667eea', '#764ba2', '#f093fb', '#4facfe']
            });
        }, 500);
        
        setTimeout(() => {
            confetti({ 
                particleCount: 80, 
                spread: 100, 
                origin: { y: 0.7 },
                colors: ['#FFD700', '#FFA500', '#FF69B4', '#00CED1']
            });
        }, 900);
        
        setTimeout(() => {
            confetti({ 
                particleCount: 120, 
                spread: 90, 
                origin: { y: 0.5 },
                colors: ['#d63384', '#667eea', '#FFD700', '#4facfe', '#FF69B4']
            });
        }, 1400);
        
        setTimeout(() => {
            this.ui.victoryTitle.innerText = this.state.currentLevel.nombreCompleto;
            this.ui.victoryCanvas.width = this.assets.imgSolucion.width;
            this.ui.victoryCanvas.height = this.assets.imgSolucion.height;
            this.ui.victoryCanvas.getContext('2d').drawImage(this.assets.imgSolucion, 0, 0);
            this.ui.victoryModal.classList.remove('hidden');
        }, 2500);
    },

    closeVictory: function() {
        this.ui.victoryModal.classList.add('hidden');
        this.exitGame(false);
    },

    exitGame: function(isPopState = false) {
        if(typeof bgMusic !== 'undefined') {
            bgMusic.pause();
            bgMusic.currentTime = 0;
        }

        if (this.worker) {
            this.worker.terminate(); 
            this.worker = null;      
            this.state.isProcessing = false; 
        }

        if(this.state.currentLevel && !this.state.isVictoryShown) {
            saveToDB(this.state.currentLevel.id, this.ui.canvas.toDataURL());
        }
        if (this.cache.saveTimeout) clearTimeout(this.cache.saveTimeout);
        if (this.cache.idleTimer) clearTimeout(this.cache.idleTimer);
        
        if (!isPopState && history.state && history.state.page === 'game') {
            history.back();
        }

        this.ui.hlCanvas.classList.remove('smart-pulse');
        this.ui.hlCanvas.style.transition = '';
        this.ui.linesCanvas.style.transition = '';
        this.ui.zoomLayer.style.transition = '';
        
        this.ui.screen.classList.add('hidden');
        document.getElementById('gallery-screen').classList.remove('hidden');
        
        this.ui.canvas.classList.remove('framed-art');
        
        this.state.currentLevel = null;
        if(typeof renderGallery === 'function') renderGallery();
        if(typeof updateSoundState === 'function') updateSoundState(false);
    },

    resetLevel: function() {
        deleteFromDB(this.state.currentLevel.id);
        deleteFromDB(this.getCacheKey());
        localStorage.removeItem('completed_' + this.state.currentLevel.id);
        
        this.ui.canvas.classList.remove('framed-art');

        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0,0,this.ui.canvas.width, this.ui.canvas.height);
        this.lineDrawCtx.clearRect(0,0,this.ui.canvas.width, this.ui.canvas.height);
        this.lineDrawCtx.drawImage(this.assets.imgLineas, 0, 0);
        
        this.ui.linesCanvas.style.opacity = '1';
        this.state.isVictoryShown = false;

        this.state.pixelsRemaining.fill(0);
        this.state.pixelMap.forEach((arr, i) => {
            this.state.pixelsRemaining[i] = arr.length;
        });
        this.generarPaletaUI();
        this.selectColor(0);
        this.queueProgressUpdate();
        this.resetIdleTimer();
    },

    downloadImage: function() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.ui.canvas.width;
        tempCanvas.height = this.ui.canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(this.ui.canvas, 0, 0); 
        
        if (!this.state.isVictoryShown) {
            tCtx.drawImage(this.linesCanvasElement, 0, 0); 
        }
        
        const link = document.createElement('a');
        link.download = this.state.currentLevel.nombre + '.png';
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    },

    useHint: function() {
        if(this.state.isProcessing || this.state.isVictoryShown) return; 

        const currentIdx = this.state.selectedColorIndex;
        const candidates = this.state.pixelMap[currentIdx];
        
        if (!candidates || candidates.length === 0) return;

        const w = this.ui.canvas.width;
        const h = this.ui.canvas.height;
        const imgData = this.ctx.getImageData(0, 0, w, h);
        
        this.state.isProcessing = true; 

        this.worker.postMessage({
            type: 'FIND_HINT',
            pixelsBuffer: imgData.data.buffer,
            candidateIndices: candidates,
            color: this.state.coloresRGB[currentIdx]
        }, [imgData.data.buffer]);
    },

    useMagic: function() {
        if(this.state.isVictoryShown) return;
        
        if(typeof playEffect === 'function') playEffect(sMagic);

        const currentIdx = this.state.selectedColorIndex;
        const c = this.state.coloresRGB[currentIdx];
        const pixels = this.state.pixelMap[currentIdx];
        const w = this.ui.canvas.width;
        const h = this.ui.canvas.height;
        
        const imgData = this.ctx.getImageData(0,0,w,h);
        const dat = imgData.data;
        const linesData = this.lineDrawCtx.getImageData(0,0,w,h);
        const lDat = linesData.data;

        let paintedAny = false;
        let count = 0;
        for(let pIdx of pixels) {
            const idx = pIdx * 4;
            if(dat[idx+3] < 200 || Math.abs(dat[idx] - c.r) > 15 || 
               Math.abs(dat[idx+1] - c.g) > 15 || Math.abs(dat[idx+2] - c.b) > 15) {
                dat[idx] = c.r; dat[idx+1] = c.g; dat[idx+2] = c.b; dat[idx+3] = 255;
                lDat[idx+3] = 0; 
                paintedAny = true;
                count++;
            }
        }
        
        if(paintedAny) {
            this.ctx.putImageData(imgData, 0, 0);
            this.lineDrawCtx.putImageData(linesData, 0, 0);
            this.finishPaintOperation(count); 
        }
    },

    scheduleSave: function() {
        clearTimeout(this.cache.saveTimeout);
        this.cache.saveTimeout = setTimeout(() => {
            if (this.state.currentLevel && !this.state.isVictoryShown) saveToDB(this.state.currentLevel.id, this.ui.canvas.toDataURL());
        }, 2000);
    },

    getDist: function(t1, t2) { return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); },

    handleTouchStart: function(e) {
        if(e.target.closest('.paleta-container')) return;
        if(e.touches.length === 1) { 
            this.state.isDrag = true; this.state.hasMov = false; 
            this.input.lX = e.touches[0].clientX; this.input.lY = e.touches[0].clientY; 
        } else if(e.touches.length === 2) { 
            this.state.isDrag = false; this.state.isPinch = true; 
            this.input.initDist = this.getDist(e.touches[0], e.touches[1]); 
            this.input.lZoomT = Date.now(); 
        }
    },

    handleTouchMoveThrottled: function(e) {
        e.preventDefault();
        
        const now = performance.now();
        if (now - this.state.lastTransformUpdate < this.state.transformThrottle) {
            return;
        }
        
        this.handleTouchMove(e);
    },

    handleTouchMove: function(e) {
        if(e.touches.length === 2) this.input.lZoomT = Date.now();
        if(this.state.isDrag && e.touches.length === 1) {
            const dx = e.touches[0].clientX - this.input.lX;
            const dy = e.touches[0].clientY - this.input.lY;
            if(Math.abs(dx) > 2 || Math.abs(dy) > 2) this.state.hasMov = true;
            this.state.pX += dx; this.state.pY += dy;
            this.input.lX = e.touches[0].clientX; this.input.lY = e.touches[0].clientY;
            this.updateTransform();
            this.state.lastTransformUpdate = performance.now();
        } else if(this.state.isPinch && e.touches.length === 2) {
            const dist = this.getDist(e.touches[0], e.touches[1]);
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const ns = Math.min(Math.max(0.1, this.state.scale * (dist / this.input.initDist)), 12);
            this.state.pX = midX - (midX - this.state.pX) * (ns / this.state.scale);
            this.state.pY = midY - (midY - this.state.pY) * (ns / this.state.scale);
            this.state.scale = ns; this.input.initDist = dist;
            this.updateTransform();
            this.state.lastTransformUpdate = performance.now();
        }
    },

    handleTouchEnd: function(e) {
        this.state.isDrag = false; this.state.isPinch = false;
        if(Date.now() - this.input.lZoomT < 400) return;
        if(e.changedTouches.length === 1 && !this.state.hasMov) {
            const t = e.changedTouches[0];
            this.handleInput(t.clientX, t.clientY);
        }
    },
    
    handleWheel: function(e) {
        e.preventDefault();
        const rect = this.ui.viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const ns = Math.min(Math.max(0.1, this.state.scale * (e.deltaY > 0 ? 0.9 : 1.1)), 12);
        this.state.pX = mx - (mx - this.state.pX) * (ns / this.state.scale);
        this.state.pY = my - (my - this.state.pY) * (ns / this.state.scale);
        this.state.scale = ns;
        this.updateTransform();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});