window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect, NOISE_GLSL } = fxBase;

class BlurredLoaderEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.div = document.createElement('div');
            this.div.className = 'map-fx-layer fx-blurred-loader';
            this.div.innerHTML = `
                <div class="glass-bg">
                    <div class="orbit-container">
                        <div class="blob blob-1"></div>
                        <div class="blob blob-2"></div>
                        <div class="blob blob-3"></div>
                    </div>
                </div>
            `;
            container.prepend(this.div);
        }
    }

class SVGFiltersEffect extends BaseEffect {
        init(container) {
            super.init(container);
            // Inject SVG Filters if not present
            if (!document.getElementById('fx-svg-defs')) {
                const svgNS = "http://www.w3.org/2000/svg";
                const svg = document.createElementNS(svgNS, "svg");
                svg.id = 'fx-svg-defs';
                svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
                svg.innerHTML = `
                    <defs>
                        <filter id="🌀🎨" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" result="noise" seed="1" />
                            <feDisplacementMap in="SourceGraphic" in2="noise" scale="40" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                        <filter id="🌀↖️" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="turbulence" />
                            <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="20" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                    </defs>
                `;
                document.body.appendChild(svg);
            }

            this.el = document.createElement('div');
            this.el.className = 'map-fx-layer fx-svg-dramatic';
            this.el.innerHTML = `
                <div class="glass-wall">
                    ${Array(6).fill('<div class="glass-card"><div class="card-glow"></div></div>').join('')}
                </div>
            `;
            container.prepend(this.el);
        }
        dispose() {
            super.dispose();
            if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
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
                </div>
            `;
            container.appendChild(this.el);
        }
        dispose() {
            super.dispose();
            if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
        }
    }

    const fxDom = ns._fxDom = ns._fxDom || {};

    Object.assign(fxDom, {
        BlurredLoaderEffect,
        SVGFiltersEffect,
        NeuralNexusHUD
    });

})(window.EveConstellationMap);
