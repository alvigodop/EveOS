window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect } = fxBase;

    class BlurredLoaderEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.createDivLayer(container, 'map-fx-layer fx-blurred-loader');
            this.div.innerHTML = `
                <div class="glass-bg"></div>
                <div class="orbit-container">
                    <div class="blob blob-1"></div>
                    <div class="blob blob-2"></div>
                    <div class="blob blob-3"></div>
                    <div class="blob blob-4"></div>
                </div>
            `;
            this.bindPointer(window);
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                this.syncSettings();
            };
            animate();
        }

        syncSettings() {
            if (!this.div) return;
            const glow = this.getFxValue('glow');
            const speed = this.getFxValue('speed');
            const parallax = this.getFxValue('parallax');
            const interaction = this.getFxValue('interaction');
            this.div.style.setProperty('--fx-blur-strength', (86 + glow * 54).toFixed(1) + 'px');
            this.div.style.setProperty('--fx-blob-speed', (12 / Math.max(0.2, speed)).toFixed(2) + 's');
            this.div.style.setProperty('--fx-hue-shift', String(Math.round(188 + (this.pointer.x - 0.5) * 70)));
            this.div.style.setProperty('--fx-orbit-tilt-x', (((this.pointer.y - 0.5) * -10 * parallax)).toFixed(2) + 'deg');
            this.div.style.setProperty('--fx-orbit-tilt-y', (((this.pointer.x - 0.5) * 14 * parallax)).toFixed(2) + 'deg');
            this.div.style.setProperty('--fx-blob-scale', (1 + glow * 0.18 + interaction * 0.06).toFixed(3));
        }
    }

    class SVGFiltersEffect extends BaseEffect {
        init(container) {
            super.init(container);
            if (!document.getElementById('fx-svg-defs')) {
                const svgNS = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(svgNS, 'svg');
                svg.id = 'fx-svg-defs';
                svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
                svg.innerHTML = `
                    <defs>
                        <filter id="fx-svg-liquid" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" seed="3" />
                            <feDisplacementMap in="SourceGraphic" in2="noise" scale="24" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                    </defs>
                `;
                document.body.appendChild(svg);
            }
            this.el = document.createElement('div');
            this.el.className = 'map-fx-layer fx-svg-dramatic';
            this.el.innerHTML = `<div class="glass-wall">${Array(6).fill('<div class="glass-card"><div class="card-glow"></div></div>').join('')}</div>`;
            container.prepend(this.el);
            this.bindPointer(window);
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                this.syncSettings();
            };
            animate();
        }

        syncSettings() {
            if (!this.el) return;
            const parallax = this.getFxValue('parallax');
            const glow = this.getFxValue('glow');
            this.el.style.setProperty('--fx-svg-tilt-x', (((this.pointer.y - 0.5) * -12 * parallax)).toFixed(2) + 'deg');
            this.el.style.setProperty('--fx-svg-tilt-y', (((this.pointer.x - 0.5) * 14 * parallax)).toFixed(2) + 'deg');
            this.el.style.setProperty('--fx-svg-glow', (0.06 + glow * 0.07).toFixed(3));
        }
    }

    class NeuralNexusHUD extends BaseEffect {
        init(container) {
            super.init(container);
            this.el = document.createElement('div');
            this.el.className = 'map-fx-layer fx-hud-layer';
            this.el.innerHTML = `
                <div class="hud-frame">
                    <div class="hud-corner tl"></div>
                    <div class="hud-corner tr"></div>
                    <div class="hud-corner bl"></div>
                    <div class="hud-corner br"></div>
                    <div class="hud-scanline"></div>
                    <div class="hud-ring hud-ring-a"></div>
                    <div class="hud-ring hud-ring-b"></div>
                </div>
            `;
            container.appendChild(this.el);
            this.bindPointer(window);
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                this.syncSettings();
            };
            animate();
        }

        syncSettings() {
            if (!this.el) return;
            const glow = this.getFxValue('glow');
            const contrast = this.getFxValue('contrast');
            this.el.style.setProperty('--fx-hud-glow', (0.16 + glow * 0.16).toFixed(3));
            this.el.style.setProperty('--fx-hud-contrast', (0.84 + contrast * 0.24).toFixed(3));
        }
    }

    const fxDom = ns._fxDom = ns._fxDom || {};
    Object.assign(fxDom, {
        BlurredLoaderEffect,
        SVGFiltersEffect,
        NeuralNexusHUD
    });
})(window.EveConstellationMap);
