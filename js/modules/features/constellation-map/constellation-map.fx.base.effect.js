window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared;

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

    const moduleApi = ns._fxBaseEffect = ns._fxBaseEffect || {};
    Object.assign(moduleApi, { BaseEffect });
})(window.EveConstellationMap);
