window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect } = fxBase;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function createGradientWash(ctx, width, height, strength) {
        const gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, width * 0.06, width * 0.5, height * 0.5, width * 0.72);
        gradient.addColorStop(0, 'rgba(48, 226, 255,' + (0.08 * strength).toFixed(3) + ')');
        gradient.addColorStop(0.45, 'rgba(11, 78, 132,' + (0.06 * strength).toFixed(3) + ')');
        gradient.addColorStop(1, 'rgba(0, 7, 18, 0)');
        return gradient;
    }

    class MementoEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.createCanvasLayer(container);
            this.bindPointer(window);
            this.syncSettings();
            this.particles = [];
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
            if (this.particles?.length) {
                this.populateParticles();
            }
        }

        populateParticles() {
            const targetCount = Math.max(42, Math.round(44 + (this.density * 48)));
            this.particles = Array.from({ length: targetCount }, (_, index) => ({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * (0.45 + this.speed * 0.55),
                vy: (Math.random() - 0.5) * (0.45 + this.speed * 0.55),
                hue: 182 + ((index * 17) % 54),
                trail: []
            }));
        }

        drawFrame(time) {
            this.syncSettings();
            if (!this.ctx) return;
            const ctx = this.ctx;
            ctx.fillStyle = 'rgba(1, 8, 18, 0.15)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.fillStyle = createGradientWash(ctx, this.width, this.height, this.glow);
            ctx.fillRect(0, 0, this.width, this.height);
            const pointerX = this.pointer.px || (this.width * 0.5);
            const pointerY = this.pointer.py || (this.height * 0.5);
            this.particles.forEach((particle, index) => {
                const dx = pointerX - particle.x;
                const dy = pointerY - particle.y;
                const dist = Math.max(28, Math.hypot(dx, dy));
                const force = Math.max(0, 1 - (dist / (240 + this.interaction * 120))) * 0.012 * this.interaction;
                particle.vx += dx * force;
                particle.vy += dy * force;
                particle.vx += Math.cos(time * 0.7 + index) * 0.0025 * this.speed;
                particle.vy += Math.sin(time * 0.5 + index * 0.33) * 0.0025 * this.speed;
                particle.x += particle.vx * this.speed;
                particle.y += particle.vy * this.speed;
                particle.vx *= 0.986;
                particle.vy *= 0.986;
                if (particle.x < -24) particle.x = this.width + 24;
                if (particle.x > this.width + 24) particle.x = -24;
                if (particle.y < -24) particle.y = this.height + 24;
                if (particle.y > this.height + 24) particle.y = -24;
                particle.trail.push({ x: particle.x, y: particle.y });
                const limit = 18 + Math.round(this.glow * 16);
                if (particle.trail.length > limit) particle.trail.shift();
                if (particle.trail.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(particle.trail[0].x, particle.trail[0].y);
                    for (let i = 1; i < particle.trail.length; i += 1) {
                        ctx.lineTo(particle.trail[i].x, particle.trail[i].y);
                    }
                    ctx.strokeStyle = 'hsla(' + particle.hue + ', 100%, 70%, ' + (0.1 + this.glow * 0.18).toFixed(3) + ')';
                    ctx.lineWidth = 1.1 + this.glow * 1.4;
                    ctx.stroke();
                }
            });
        }
    }

    class ArtEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.createCanvasLayer(container);
            this.bindPointer(window);
            this.syncSettings();
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
            this.parallax = this.getFxValue('parallax');
        }

        drawFrame(time) {
            this.syncSettings();
            if (!this.ctx) return;
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.fillStyle = 'rgba(4, 14, 28, 0.12)';
            ctx.fillRect(0, 0, this.width, this.height);
            const waveCount = Math.max(16, Math.round(20 + this.density * 26));
            const centerX = this.width * (0.5 + (this.pointer.x - 0.5) * 0.05 * this.parallax);
            const centerY = this.height * 0.5;
            const spreadY = this.height * 0.68;
            for (let i = 0; i < waveCount; i += 1) {
                const phase = (i / waveCount) * Math.PI * 2;
                const hue = 184 + ((i * 9) % 68);
                ctx.beginPath();
                for (let step = 0; step <= 120; step += 1) {
                    const t = step / 120;
                    const y = centerY + ((t - 0.5) * spreadY);
                    const envelope = Math.sin(t * Math.PI);
                    const wobble = Math.sin((time * this.speed * 1.6) + phase + (t * 10)) * (54 + this.glow * 38);
                    const secondary = Math.cos((t * 16) - (time * this.speed * 2.2) + phase) * (18 + this.glow * 20);
                    const pointerShift = (this.pointer.x - 0.5) * 90 * envelope * this.parallax;
                    const x = centerX + pointerShift + envelope * (wobble + secondary);
                    if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = 'hsla(' + hue + ', 100%, 70%, ' + (0.055 + this.glow * 0.05).toFixed(3) + ')';
                ctx.lineWidth = 0.8 + this.glow * 0.9;
                ctx.stroke();
            }
        }
    }

    class AsciiEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.createCanvasLayer(container);
            this.bindPointer(window);
            this.chars = '.,:;irsXA253hMHGS#9B&@';
            this.textMetrics = { fontSize: 10, charWidth: 8, lineHeight: 10, cols: 80, rows: 40 };
            this.syncSettings();
            this.recalculateGrid();
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
            this.density = this.getFxValue('asciiDensity');
            this.scale = this.getFxValue('asciiScale');
            this.speed = this.getFxValue('speed');
            this.glow = this.getFxValue('glow');
            this.interaction = this.getFxValue('interaction');
        }

        resizeCanvas() {
            super.resizeCanvas();
            this.recalculateGrid();
        }

        recalculateGrid() {
            if (!this.ctx || !this.width || !this.height) return;
            this.syncSettings();
            const baseSize = clamp(9.5 * this.scale, 7, 18);
            this.ctx.font = baseSize.toFixed(2) + 'px monospace';
            const metrics = this.ctx.measureText('M');
            const charWidth = Math.max(5.5, metrics.width * (1.08 / this.density));
            const ascent = metrics.actualBoundingBoxAscent || (baseSize * 0.75);
            const descent = metrics.actualBoundingBoxDescent || (baseSize * 0.25);
            const lineHeight = Math.max(baseSize * 0.95, ascent + descent + 1.5);
            this.textMetrics = {
                fontSize: baseSize,
                charWidth,
                lineHeight,
                cols: Math.max(24, Math.ceil(this.width / charWidth) + 2),
                rows: Math.max(12, Math.ceil(this.height / lineHeight) + 2),
                offsetX: 0,
                offsetY: 0
            };
            this.textMetrics.offsetX = ((this.width - (this.textMetrics.cols * charWidth)) * 0.5);
            this.textMetrics.offsetY = ((this.height - (this.textMetrics.rows * lineHeight)) * 0.5);
        }

        drawFrame(time) {
            this.syncSettings();
            if (!this.ctx) return;
            const ctx = this.ctx;
            const metrics = this.textMetrics;
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.fillStyle = 'rgba(0, 6, 16, 0.42)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.font = metrics.fontSize.toFixed(2) + 'px monospace';
            ctx.textBaseline = 'top';
            const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
            gradient.addColorStop(0, 'rgba(107, 243, 255, ' + (0.28 + this.glow * 0.12).toFixed(3) + ')');
            gradient.addColorStop(0.5, 'rgba(59, 159, 255, ' + (0.22 + this.glow * 0.12).toFixed(3) + ')');
            gradient.addColorStop(1, 'rgba(93, 255, 222, ' + (0.24 + this.glow * 0.1).toFixed(3) + ')');
            ctx.fillStyle = gradient;
            const pointerCol = (this.pointer.px || (this.width * 0.5)) / metrics.charWidth;
            const pointerRow = (this.pointer.py || (this.height * 0.5)) / metrics.lineHeight;
            for (let row = 0; row < metrics.rows; row += 1) {
                const y = metrics.offsetY + (row * metrics.lineHeight);
                for (let col = 0; col < metrics.cols; col += 1) {
                    const nx = col / Math.max(1, metrics.cols - 1);
                    const ny = row / Math.max(1, metrics.rows - 1);
                    const field = Math.sin((nx * 7.4) + (time * this.speed * 0.9)) + Math.cos((ny * 8.2) - (time * this.speed * 0.6));
                    const dist = Math.hypot(col - pointerCol, row - pointerRow);
                    const ripple = Math.max(0, 1 - (dist / (8 + this.interaction * 7))) * (1.4 * this.interaction);
                    const value = clamp(((field + 2) / 4) + ripple * 0.5 + (Math.sin(time * 0.7 + (col * 0.2)) * 0.08), 0, 1);
                    const idx = Math.min(this.chars.length - 1, Math.max(0, Math.floor(value * (this.chars.length - 1))));
                    ctx.fillText(this.chars[idx], metrics.offsetX + (col * metrics.charWidth), y);
                }
            }
            ctx.fillStyle = 'rgba(118, 255, 233, 0.06)';
            ctx.fillRect(0, 0, this.width, this.height);
        }
    }

    const fxCanvasAmbient = ns._fxCanvasAmbient = ns._fxCanvasAmbient || {};
    Object.assign(fxCanvasAmbient, {
        MementoEffect,
        ArtEffect,
        AsciiEffect
    });
})(window.EveConstellationMap);
