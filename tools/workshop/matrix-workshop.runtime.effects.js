// Grid, lighting, and particle overlays remain separate from the rain stream renderer.
        function drawGrid() {
            gridCtx.clearRect(0, 0, viewWidth, viewHeight);
            const rgb = hexToRgb(gridColor);
            gridCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${gridOpacity * 0.05})`;
            const columns = Math.ceil(viewWidth / fontSize);
            const rows = Math.ceil(viewHeight / fontSize);

            for (let col = 0; col < columns; col++) {
                for (let row = 0; row < rows; row++) {
                    gridCtx.fillRect(col * fontSize, row * fontSize, fontSize, fontSize);
                }
            }

            gridCtx.beginPath();
            gridCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${gridOpacity})`;
            gridCtx.lineWidth = 1;
            for (let col = 0; col <= columns; col++) {
                const x = col * fontSize;
                gridCtx.moveTo(x, 0);
                gridCtx.lineTo(x, viewHeight);
            }
            for (let row = 0; row <= rows; row++) {
                const y = row * fontSize;
                gridCtx.moveTo(0, y);
                gridCtx.lineTo(viewWidth, y);
            }
            gridCtx.stroke();
        }

        function hexToRgb(hex) {
            hex = hex.replace(/^#/, '');
            const bigint = parseInt(hex, 16);
            return {
                r: (bigint >> 16) & 255,
                g: (bigint >> 8) & 255,
                b: bigint & 255
            };
        }

        function drawLighting() {
            if (!lightingEnabled) return;
            const gradient = ctx.createRadialGradient(
                viewWidth / 2, viewHeight / 2, 0,
                viewWidth / 2, viewHeight / 2, viewWidth / 2
            );
            const rgb = hexToRgb(lightingColor);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, viewWidth, viewHeight);
        }

        function drawParticles() {
            if (!particlesEnabled) return;
            particles = particles.filter(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.life--;
                p.alpha = p.life / PARTICLE_LIFETIME;
                const rgb = hexToRgb(particleColor);
                ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`;
                ctx.fillRect(p.x, p.y, 2, 2);
                return p.life > 0;
            });
            if (Math.random() < 0.1) {
                particles.push({
                    x: Math.random() * viewWidth,
                    y: Math.random() * viewHeight,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    life: PARTICLE_LIFETIME,
                    alpha: 1
                });
            }
        }
