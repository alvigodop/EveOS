window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect } = fxBase;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    class AttractionEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.createCanvasLayer(container);
            this.bindPointer(window);
            this.trail = [];
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001;
                this.updatePointerIdle(time);
                this.drawFrame(time);
            };
            animate();
        }

        drawFrame(time) {
            const speed = this.getFxValue('speed');
            const glow = this.getFxValue('glow');
            const interaction = this.getFxValue('interaction');
            const ctx = this.ctx;
            if (!ctx) return;
            this.trail.push({ x: this.pointer.px || (this.width * 0.5), y: this.pointer.py || (this.height * 0.5), t: time });
            const maxTrail = Math.round(30 + glow * 22 + interaction * 10);
            while (this.trail.length > maxTrail) this.trail.shift();
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.fillStyle = 'rgba(0, 8, 18, 0.1)';
            ctx.fillRect(0, 0, this.width, this.height);
            if (this.trail.length < 2) return;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let i = 1; i < this.trail.length; i += 1) {
                const left = this.trail[i - 1];
                const right = this.trail[i];
                const ratio = i / this.trail.length;
                ctx.beginPath();
                ctx.moveTo(left.x, left.y);
                const mx = (left.x + right.x) * 0.5 + Math.sin(time * speed * 2 + i * 0.3) * 10 * interaction;
                const my = (left.y + right.y) * 0.5 + Math.cos(time * speed * 1.6 + i * 0.25) * 10 * interaction;
                ctx.quadraticCurveTo(mx, my, right.x, right.y);
                ctx.strokeStyle = 'rgba(72, 235, 255, ' + (ratio * (0.12 + glow * 0.24)).toFixed(3) + ')';
                ctx.lineWidth = 2 + ratio * (18 + glow * 12);
                ctx.stroke();
            }
            const head = this.trail[this.trail.length - 1];
            const gradient = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 120 + glow * 70);
            gradient.addColorStop(0, 'rgba(104, 242, 255, 0.44)');
            gradient.addColorStop(0.35, 'rgba(31, 184, 255, 0.18)');
            gradient.addColorStop(1, 'rgba(0, 20, 40, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(head.x, head.y, 120 + glow * 70, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    class LinesDotsEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.createCanvasLayer(container);
            this.bindPointer(window);
            this.particles = [];
            this.syncSettings();
            this.populateParticles();
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001;
                this.updatePointerIdle(time);
                this.drawFrame(time);
            };
            animate();
        }

        syncSettings() {
            this.density = this.getFxValue('density');
            this.speed = this.getFxValue('speed');
            this.glow = this.getFxValue('glow');
            this.interaction = this.getFxValue('interaction');
        }

        resizeCanvas() {
            super.resizeCanvas();
            if (this.particles?.length) this.populateParticles();
        }

        populateParticles() {
            const count = Math.max(56, Math.round(86 + this.density * 88));
            this.particles = Array.from({ length: count }, () => ({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * (0.35 + this.speed * 0.85),
                vy: (Math.random() - 0.5) * (0.35 + this.speed * 0.85),
                size: 0.8 + Math.random() * (1.8 + this.glow * 1.2),
                hue: 188 + Math.random() * 44
            }));
        }

        drawFrame(time) {
            this.syncSettings();
            const ctx = this.ctx;
            if (!ctx) return;
            const pointerX = this.pointer.px || (this.width * 0.5);
            const pointerY = this.pointer.py || (this.height * 0.5);
            const linkDistance = 90 + this.density * 52;
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.fillStyle = 'rgba(0, 10, 18, 0.08)';
            ctx.fillRect(0, 0, this.width, this.height);
            for (let i = 0; i < this.particles.length; i += 1) {
                const particle = this.particles[i];
                const dxMouse = pointerX - particle.x;
                const dyMouse = pointerY - particle.y;
                const distMouse = Math.max(30, Math.hypot(dxMouse, dyMouse));
                const field = Math.max(0, 1 - (distMouse / (180 + this.interaction * 120))) * 0.02 * this.interaction;
                particle.vx += dxMouse * field;
                particle.vy += dyMouse * field;
                particle.vx += Math.sin(time * 0.6 + i * 0.31) * 0.004 * this.speed;
                particle.vy += Math.cos(time * 0.8 + i * 0.22) * 0.004 * this.speed;
                particle.x += particle.vx * this.speed;
                particle.y += particle.vy * this.speed;
                particle.vx *= 0.985;
                particle.vy *= 0.985;
                if (particle.x < -20) particle.x = this.width + 20;
                if (particle.x > this.width + 20) particle.x = -20;
                if (particle.y < -20) particle.y = this.height + 20;
                if (particle.y > this.height + 20) particle.y = -20;
            }
            for (let i = 0; i < this.particles.length; i += 1) {
                const particle = this.particles[i];
                for (let j = i + 1; j < this.particles.length; j += 1) {
                    const other = this.particles[j];
                    const dx = particle.x - other.x;
                    const dy = particle.y - other.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > linkDistance) continue;
                    const alpha = (1 - dist / linkDistance) * (0.08 + this.glow * 0.1);
                    ctx.strokeStyle = 'rgba(56, 218, 255, ' + alpha.toFixed(3) + ')';
                    ctx.lineWidth = 0.4 + this.glow * 0.45;
                    ctx.beginPath();
                    ctx.moveTo(particle.x, particle.y);
                    ctx.lineTo(other.x, other.y);
                    ctx.stroke();
                }
            }
            this.particles.forEach((particle) => {
                const halo = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, 10 + this.glow * 8);
                halo.addColorStop(0, 'hsla(' + particle.hue.toFixed(1) + ', 100%, 72%, ' + (0.24 + this.glow * 0.15).toFixed(3) + ')');
                halo.addColorStop(1, 'hsla(' + particle.hue.toFixed(1) + ', 100%, 72%, 0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, 10 + this.glow * 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'hsla(' + particle.hue.toFixed(1) + ', 100%, 72%, 0.84)';
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    class AuraCursorEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.createCanvasLayer(container);
            this.bindPointer(window);
            this.orbiters = Array.from({ length: 36 }, (_, index) => ({
                angle: (index / 36) * Math.PI * 2,
                radius: 30 + Math.random() * 120,
                drift: 0.4 + Math.random() * 1.2,
                size: 1 + Math.random() * 2.8
            }));
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001;
                this.updatePointerIdle(time);
                this.drawFrame(time);
            };
            animate();
        }

        drawFrame(time) {
            const ctx = this.ctx;
            if (!ctx) return;
            const glow = this.getFxValue('glow');
            const speed = this.getFxValue('speed');
            const interaction = this.getFxValue('interaction');
            const centerX = this.pointer.px || (this.width * 0.5);
            const centerY = this.pointer.py || (this.height * 0.5);
            ctx.clearRect(0, 0, this.width, this.height);
            const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 160 + glow * 80);
            coreGradient.addColorStop(0, 'rgba(112, 255, 244, 0.34)');
            coreGradient.addColorStop(0.45, 'rgba(46, 142, 255, 0.12)');
            coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = coreGradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 160 + glow * 80, 0, Math.PI * 2);
            ctx.fill();
            this.orbiters.forEach((orbiter, index) => {
                orbiter.angle += (0.004 + orbiter.drift * 0.0015) * speed;
                const wobble = Math.sin(time * orbiter.drift + index) * (12 + interaction * 12);
                const radius = orbiter.radius + wobble;
                const x = centerX + Math.cos(orbiter.angle) * radius;
                const y = centerY + Math.sin(orbiter.angle * 1.2) * radius * 0.56;
                ctx.strokeStyle = 'rgba(78, 226, 255, 0.08)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.fillStyle = 'rgba(124, 244, 255, 0.72)';
                ctx.beginPath();
                ctx.arc(x, y, orbiter.size + glow * 0.8, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    const fxCanvasInteractive = ns._fxCanvasInteractive = ns._fxCanvasInteractive || {};
    Object.assign(fxCanvasInteractive, {
        AttractionEffect,
        LinesDotsEffect,
        AuraCursorEffect
    });
})(window.EveConstellationMap);
