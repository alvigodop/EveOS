window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect } = fxBase;

class AttractionEffect extends BaseEffect {

        async init(container) {

            super.init(container);

            this.canvas = document.createElement('canvas');

            this.canvas.className = 'map-fx-layer';

            this.canvas.width = window.innerWidth;

            this.canvas.height = window.innerHeight;

            container.prepend(this.canvas);

            const ctx = this.canvas.getContext('2d');

            let mouse = { x: this.canvas.width / 2, y: this.canvas.height / 2 }, trail = [];

            const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };

            window.addEventListener('mousemove', onMove);

            this.cleanup = () => window.removeEventListener('mousemove', onMove);

            const animate = () => {

                if (!this.running) return;

                this.animationFrame = requestAnimationFrame(animate);

                trail.push({ ...mouse }); if(trail.length > 30) trail.shift();

                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                if(trail.length < 2) return;

                ctx.lineCap = 'round'; ctx.lineJoin = 'round';

                for(let i=1; i<trail.length; i++) {

                    const r = i / trail.length;

                    ctx.beginPath(); ctx.strokeStyle = `rgba(0, 255, 255, ${r * 0.6})`;

                    ctx.lineWidth = r * 10; ctx.moveTo(trail[i-1].x, trail[i-1].y);

                    ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();

                }

            };

            animate();

        }

        dispose() { super.dispose(); if(this.cleanup) this.cleanup(); }

    }

class LinesDotsEffect extends BaseEffect {

        init(container) {

            super.init(container);

            this.canvas = document.createElement('canvas');

            this.canvas.className = 'map-fx-layer';

            this.canvas.width = window.innerWidth;

            this.canvas.height = window.innerHeight;

            container.prepend(this.canvas);

            const ctx = this.canvas.getContext('2d');

            

            this.particles = Array.from({length: 120}, () => ({

                x: Math.random() * this.canvas.width,

                y: Math.random() * this.canvas.height,

                vx: (Math.random() - 0.5) * 1.2,

                vy: (Math.random() - 0.5) * 1.2,

                size: Math.random() * 2 + 1,

                color: `hsla(${190 + Math.random() * 40}, 100%, 70%, 0.6)`

            }));



            const animate = () => {

                if (!this.running) return;

                this.animationFrame = requestAnimationFrame(animate);

                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                

                this.particles.forEach((p, i) => {

                    p.x += p.vx;

                    p.y += p.vy;

                    if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;

                    if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;



                    ctx.fillStyle = p.color;

                    ctx.beginPath();

                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

                    ctx.fill();



                    for (let j = i + 1; j < this.particles.length; j++) {

                        const p2 = this.particles[j];

                        const dx = p.x - p2.x;

                        const dy = p.y - p2.y;

                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < 150) {

                            const alpha = (1 - dist / 150) * 0.2;

                            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;

                            ctx.lineWidth = 0.5;

                            ctx.beginPath();

                            ctx.moveTo(p.x, p.y);

                            ctx.lineTo(p2.x, p2.y);

                            ctx.stroke();

                        }

                    }

                });

            };

            animate();

        }

        dispose() {

            super.dispose();

            if (this.canvas && this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);

        }

    }

class AuraCursorEffect extends BaseEffect {

        init(container) {

            super.init(container);

            this.canvas = document.createElement('canvas');

            this.canvas.className = 'map-fx-layer';

            this.canvas.width = window.innerWidth;

            this.canvas.height = window.innerHeight;

            container.prepend(this.canvas);

            this.ctx = this.canvas.getContext('2d');

            

            this.particles = Array.from({length: 50}, () => ({

                x: Math.random() * this.canvas.width,

                y: Math.random() * this.canvas.height,

                vx: (Math.random() - 0.5) * 2,

                vy: (Math.random() - 0.5) * 2,

                size: Math.random() * 3 + 1

            }));

            

            this.mouse = { x: this.canvas.width / 2, y: this.canvas.height / 2 };

            this.onMouseMove = (e) => {

                this.mouse.x = e.clientX;

                this.mouse.y = e.clientY;

            };

            window.addEventListener('mousemove', this.onMouseMove);



            this.resize = () => {

                this.canvas.width = window.innerWidth;

                this.canvas.height = window.innerHeight;

            };

            window.addEventListener('resize', this.resize);



            const animate = () => {

                if (!this.running) return;

                this.animationFrame = requestAnimationFrame(animate);

                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                this.ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';

                

                this.particles.forEach(p => {

                    const dx = this.mouse.x - p.x;

                    const dy = this.mouse.y - p.y;

                    const dist = Math.sqrt(dx*dx + dy*dy);

                    if (dist < 250) {

                        p.vx += dx * 0.0005;

                        p.vy += dy * 0.0005;

                    }

                    p.x += p.vx;

                    p.y += p.vy;

                    p.vx *= 0.98;

                    p.vy *= 0.98;



                    if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;

                    if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;



                    this.ctx.beginPath();

                    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

                    this.ctx.fill();

                });

            };

            animate();

        }

        dispose() {

            super.dispose();

            window.removeEventListener('mousemove', this.onMouseMove);

            window.removeEventListener('resize', this.resize);

            if (this.canvas && this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);

        }

    }

    const fxCanvasInteractive = ns._fxCanvasInteractive = ns._fxCanvasInteractive || {};
    Object.assign(fxCanvasInteractive, {
        AttractionEffect,
        LinesDotsEffect,
        AuraCursorEffect
    });
})(window.EveConstellationMap);
