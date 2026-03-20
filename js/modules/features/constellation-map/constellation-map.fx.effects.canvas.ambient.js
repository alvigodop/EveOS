window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect } = fxBase;

class MementoEffect extends BaseEffect {

        async init(container) {

            super.init(container);

            this.canvas = document.createElement('canvas');

            this.canvas.className = 'map-fx-layer';

            this.canvas.width = window.innerWidth;

            this.canvas.height = window.innerHeight;

            container.prepend(this.canvas);

            const ctx = this.canvas.getContext('2d');

            const particles = Array.from({length: 60}, () => ({

                x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height,

                vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, h: []

            }));

            const animate = () => {

                if (!this.running) return;

                this.animationFrame = requestAnimationFrame(animate);

                ctx.fillStyle = 'rgba(0, 5, 12, 0.15)';

                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                ctx.strokeStyle = 'rgba(0, 212, 255, 0.25)';

                particles.forEach(p => {

                    p.x+=p.vx; p.y+=p.vy;

                    if(p.x<0||p.x>this.canvas.width) p.vx*=-1;

                    if(p.y<0||p.y>this.canvas.height) p.vy*=-1;

                    p.h.push({x:p.x, y:p.y}); if(p.h.length>40) p.h.shift();

                    if(p.h.length>1){

                        ctx.beginPath(); ctx.moveTo(p.h[0].x, p.h[0].y);

                        for(let i=1; i<p.h.length; i++) ctx.lineTo(p.h[i].x, p.h[i].y);

                        ctx.stroke();

                    }

                });

            };

            animate();

        }

    }

class ArtEffect extends BaseEffect {

        async init(container) {

            super.init(container);

            this.canvas = document.createElement('canvas');

            this.canvas.className = 'map-fx-layer';

            this.canvas.width = window.innerWidth;

            this.canvas.height = window.innerHeight;

            container.prepend(this.canvas);

            const ctx = this.canvas.getContext('2d');

            let frame = 0;

            const animate = () => {

                if (!this.running) return;

                this.animationFrame = requestAnimationFrame(animate);

                frame++; ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                ctx.strokeStyle = `rgba(0, 255, 255, 0.2)`;

                const cx = this.canvas.width / 2, cy = this.canvas.height / 2;

                for(let i=0; i<60; i++) {

                    const ph = (i / 60) * Math.PI * 2;

                    ctx.beginPath();

                    for(let j=0; j<=100; j++) {

                        const t = j / 100, y = (t - 0.5) * (this.canvas.height * 0.7);

                        const env = Math.sin(t * Math.PI);

                        const w = Math.sin(frame * 0.04 + ph) * 60 + Math.cos(t * 10 + frame * 0.08) * 40;

                        const x = env * (w + 120);

                        if(j === 0) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y);

                    }

                    ctx.stroke();

                }

            };

            animate();

        }

    }

class AsciiEffect extends BaseEffect {

        async init(container) {

            super.init(container);

            this.div = document.createElement('div');

            this.div.className = 'map-fx-layer';

            this.div.style.cssText = 'position:absolute;inset:0;font-family:monospace;font-size:10px;line-height:8px;color:rgba(0,255,200,0.3);white-space:pre;overflow:hidden;user-select:none;pointer-events:none;';

            container.prepend(this.div);

            const chars = '@#%*+=-:. ', cols = Math.floor(window.innerWidth / 8), rows = Math.floor(window.innerHeight / 8);

            const animate = () => {

                if (!this.running) return;

                this.animationFrame = requestAnimationFrame(animate);

                let text = ''; const t = Date.now() * 0.001;

                for (let y = 0; y < rows; y++) {

                    for (let x = 0; x < cols; x++) {

                        const n = Math.sin(x * 0.1 + t) + Math.cos(y * 0.1 + t * 0.7);

                        const idx = Math.floor(((n + 2) / 4) * (chars.length - 1));

                        text += chars[Math.min(Math.max(idx, 0), chars.length - 1)];

                    }

                    text += '\n';

                }

                this.div.textContent = text;

            };

            animate();

        }

        dispose() {

            this.running = false;

            if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

            if (this.div && this.div.parentElement) this.div.parentElement.removeChild(this.div);

        }

    }

    const fxCanvasAmbient = ns._fxCanvasAmbient = ns._fxCanvasAmbient || {};
    Object.assign(fxCanvasAmbient, {
        MementoEffect,
        ArtEffect,
        AsciiEffect
    });
})(window.EveConstellationMap);
