window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared;

    const state = shared.state;



class FXManager {

        constructor() {

            this.engines = new Map();

            this.activeEngine = null;

            this.activeOverlays = new Map(); // Store togglable overlays

            this.container = null;

            this.initialized = false;

        }



        init(container) {

            this.container = container;

            this.initialized = true;

            this.update();

        }



        register(name, EngineClass) {

            this.engines.set(name, EngineClass);

        }



        update() {

            if (!this.initialized) return;



            const targetFx = state.activeWebGlFx || 'none';

            

            // Background Engine

            if (this.activeEngine?.name !== targetFx) {

                if (this.activeEngine) {

                    this.activeEngine.instance.dispose();

                    this.activeEngine = null;

                }



                if (targetFx !== 'none' && this.engines.has(targetFx)) {

                    const EngineClass = this.engines.get(targetFx);

                    const instance = new EngineClass();

                    instance.init(this.container);

                    this.activeEngine = { name: targetFx, instance };

                }

            }

            if (this.activeEngine?.instance?.syncSettings) {
                this.activeEngine.instance.syncSettings();
            }



            // Overlays (Toggles)

            const handleOverlay = (id, enabled) => {

                const current = this.activeOverlays.get(id);

                if (enabled && !current) {

                    const EngineClass = this.engines.get(id);

                    if (EngineClass) {

                        const instance = new EngineClass();

                        instance.init(this.container);

                        this.activeOverlays.set(id, instance);

                    }

                } else if (!enabled && current) {

                    current.dispose();

                    this.activeOverlays.delete(id);

                }

                const next = this.activeOverlays.get(id);
                if (next?.syncSettings) {
                    next.syncSettings();
                }

            };



            handleOverlay('neuralhud', !!state.fxNeuralHudEnabled);



            this.updateCssLayers();

        }



        updateCssLayers() {

            if (!this.container) return;

            this.container.classList.toggle('fx-grid-enabled', !!state.fxGridEnabled);

            this.container.classList.toggle('fx-scanline-enabled', !!state.fxScanlineEnabled);

            this.container.classList.toggle('fx-tech-enabled', !!state.fxTechEnabled);

            this.container.classList.toggle('fx-circuit-enabled', !!state.fxCircuitEnabled);

            const contrast = shared.getFxTuningValue ? shared.getFxTuningValue('contrast') : 1;
            const layerOpacity = shared.getFxTuningValue ? shared.getFxTuningValue('layerOpacity') : 1;
            const gridScale = shared.getFxTuningValue ? shared.getFxTuningValue('gridScale') : 1;
            const glow = shared.getFxTuningValue ? shared.getFxTuningValue('glow') : 1;
            const speed = shared.getFxTuningValue ? shared.getFxTuningValue('speed') : 1;

            if (this.container.style && typeof this.container.style.setProperty === 'function') {
                this.container.style.setProperty('--map-fx-contrast', String(contrast.toFixed(3)));
                this.container.style.setProperty('--map-fx-layer-opacity', String(layerOpacity.toFixed(3)));
                this.container.style.setProperty('--map-fx-grid-size', `${Math.max(24, Math.round(60 * gridScale))}px`);
                this.container.style.setProperty('--map-fx-grid-opacity', String((0.028 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-scanline-opacity', String((0.18 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-tech-opacity', String((0.12 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-circuit-opacity', String((0.11 * layerOpacity * contrast).toFixed(4)));
                this.container.style.setProperty('--map-fx-glow-strength', String(glow.toFixed(3)));
                this.container.style.setProperty('--map-fx-motion-speed', String(speed.toFixed(3)));
            }

        }



        dispose() {

            if (this.activeEngine) {

                this.activeEngine.instance.dispose();

                this.activeEngine = null;

            }

            this.activeOverlays.forEach(overlay => overlay.dispose());

            this.activeOverlays.clear();

            this.initialized = false;

        }

    }



    class BaseEffect {

        constructor() {

            this.container = null;

            this.canvas = null;

            this.div = null;

            this.el = null;

            this.running = false;

            this.animationFrame = null;

            this.cleanups = [];

            this.pointer = {
                x: 0.5,
                y: 0.5,
                px: 0.5,
                py: 0.5,
                dx: 0,
                dy: 0,
                active: false
            };

            this.width = 0;

            this.height = 0;

            this.dpr = 1;

        }

        init(container) {

            this.container = container;

            this.running = true;

        }

        addCleanup(fn) {
            if (typeof fn === 'function') {
                this.cleanups.push(fn);
            }
        }

        getFxValue(key, fallback) {
            if (shared.getFxTuningValue) {
                return shared.getFxTuningValue(key);
            }
            return Number.isFinite(fallback) ? fallback : 1;
        }

        getThemeColor(key, fallback) {
            if (shared.getResolvedMapThemeColorValue) {
                return shared.getResolvedMapThemeColorValue(key);
            }
            return typeof fallback === 'string' ? fallback : '#ffffff';
        }

        getThemeRgba(key, alpha, fallback) {
            if (shared.getMapThemeRgba) {
                return shared.getMapThemeRgba(key, alpha);
            }
            const color = this.getThemeColor(key, fallback).replace('#', '');
            const normalized = color.length === 3
                ? color.split('').map((part) => part + part).join('')
                : color;
            const red = parseInt(normalized.slice(0, 2), 16);
            const green = parseInt(normalized.slice(2, 4), 16);
            const blue = parseInt(normalized.slice(4, 6), 16);
            const opacity = Math.min(1, Math.max(0, Number(alpha) || 0));
            return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
        }

        getFxFlag(key) {
            const controls = shared.ensureFxControls ? shared.ensureFxControls() : {};
            return controls?.[key] !== false;
        }

        createCanvasLayer(container) {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer map-engine-layer';
            container.prepend(this.canvas);
            this.ctx = this.canvas.getContext('2d', { alpha: true });
            this.resizeCanvas();
            const onResize = () => this.resizeCanvas();
            window.addEventListener('resize', onResize);
            this.addCleanup(() => window.removeEventListener('resize', onResize));
            return this.canvas;
        }

        createDivLayer(container, className) {
            this.div = document.createElement('div');
            this.div.className = className || 'map-fx-layer';
            container.prepend(this.div);
            return this.div;
        }

        resizeCanvas() {
            if (!this.canvas) return;
            this.width = Math.max(1, Math.floor(window.innerWidth || 0));
            this.height = Math.max(1, Math.floor(window.innerHeight || 0));
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
            this.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
            this.canvas.style.width = this.width + 'px';
            this.canvas.style.height = this.height + 'px';
            if (this.ctx) {
                this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            }
        }

        bindPointer(target) {
            const surface = target || window;
            const onMove = (event) => {
                const width = Math.max(1, this.width || window.innerWidth || 1);
                const height = Math.max(1, this.height || window.innerHeight || 1);
                const nextX = (event.clientX || 0) / width;
                const nextY = (event.clientY || 0) / height;
                this.pointer.dx = nextX - this.pointer.x;
                this.pointer.dy = nextY - this.pointer.y;
                this.pointer.x = nextX;
                this.pointer.y = nextY;
                this.pointer.px = (event.clientX || 0);
                this.pointer.py = (event.clientY || 0);
                this.pointer.active = true;
            };
            const onLeave = () => {
                this.pointer.active = false;
            };
            surface.addEventListener('pointermove', onMove, { passive: true });
            surface.addEventListener('pointerleave', onLeave, { passive: true });
            this.addCleanup(() => surface.removeEventListener('pointermove', onMove));
            this.addCleanup(() => surface.removeEventListener('pointerleave', onLeave));
        }

        updatePointerIdle(timeSeconds) {
            if (this.pointer.active || !this.width || !this.height) return;
            this.pointer.x = 0.5 + Math.cos(timeSeconds * 0.16) * 0.08;
            this.pointer.y = 0.5 + Math.sin(timeSeconds * 0.21) * 0.08;
            this.pointer.px = this.pointer.x * this.width;
            this.pointer.py = this.pointer.y * this.height;
            this.pointer.dx *= 0.92;
            this.pointer.dy *= 0.92;
        }

        dispose() {

            this.running = false;

            if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

            while (this.cleanups.length) {
                const cleanup = this.cleanups.pop();
                try {
                    cleanup();
                } catch (error) {
                    console.warn('FX cleanup failed', error);
                }
            }

            if (this.canvas && this.canvas.parentElement) {

                this.canvas.parentElement.removeChild(this.canvas);

            }

            if (this.div && this.div.parentElement) {

                this.div.parentElement.removeChild(this.div);

            }

            if (this.el && this.el.parentElement) {

                this.el.parentElement.removeChild(this.el);

            }

        }

    }



    const NOISE_GLSL = `

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }

        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }

        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }

        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        

        float snoise(vec3 v) {

            const vec2 C = vec2(1.0/6.0, 1.0/3.0);

            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i = floor(v + dot(v, C.yyy));

            vec3 x0 = v - i + dot(i, C.xxx);

            vec3 g = step(x0.yzx, x0.xyz);

            vec3 l = 1.0 - g;

            vec3 i1 = min(g.xyz, l.zxy);

            vec3 i2 = max(g.xyz, l.zxy);

            vec3 x1 = x0 - i1 + C.xxx;

            vec3 x2 = x0 - i2 + C.yyy;

            vec3 x3 = x0 - D.yyy;

            i = mod289(i);

            vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            float n_ = 0.142857142857;

            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

            vec4 x_ = floor(j * ns.z);

            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ * ns.x + ns.yyyy;

            vec4 y = y_ * ns.x + ns.yyyy;

            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0;

            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);

            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));

            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);

            m = m * m;

            return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));

        }

    `;



    const fxBase = ns._fxBase = ns._fxBase || {};



    Object.assign(fxBase, {

        FXManager,

        BaseEffect,

        NOISE_GLSL

    });



})(window.EveConstellationMap);

