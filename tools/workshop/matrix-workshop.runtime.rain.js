// Matrix rain render loop and visual effect drawing.
        // Frame timestamp of the last rendered frame, in requestAnimationFrame's clock.
        let lastDrawTime = 0;

        function stopAnimation() {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
            // Retire a timer from any earlier setInterval-based session so the two cannot both run.
            if (interval) clearInterval(interval);
            interval = undefined;
        }

        // setInterval fires on its own schedule, so frames landed out of step with the display's
        // refresh and produced visible judder, and it kept running flat out in a background tab.
        // requestAnimationFrame aligns to vsync and is suspended while the tab is hidden. The speed
        // slider still means "milliseconds between frames", so it is honoured as a throttle here
        // rather than changing what the control does.
        function frame(now) {
            animationFrameId = requestAnimationFrame(frame);
            // Self-heal the canvas size. Sizing happens once at script load, and if the window has
            // no layout yet at that moment -- a hidden tab, a pane that has not been shown -- every
            // canvas is created 0x0 and stays invisible until a resize event happens to fire. This
            // also picks up a devicePixelRatio change from dragging the window to another monitor,
            // which emits no resize event of its own. Two number comparisons per frame.
            if (viewWidth !== window.innerWidth || viewHeight !== window.innerHeight) {
                if (typeof resizeCanvases === 'function') resizeCanvases();
                else sizeAllCanvases();
            }
            if (now - lastDrawTime < speed) return;
            lastDrawTime = now;
            draw();
        }

        function startAnimation() {
            stopAnimation();
            // Without this, returning from a background tab hands draw() a delta covering the whole
            // time away, and every column teleports off-screen in one step.
            lastFrameTime = Date.now();
            lastDrawTime = 0;
            animationFrameId = requestAnimationFrame(frame);
        }

        function draw() {
            if (paused) return;

            const currentTime = Date.now();
            // Clamped to 100ms. requestAnimationFrame is suspended while the tab is hidden, so the
            // first frame back would otherwise carry the entire time away as one delta and fling
            // every column off-screen. Capping it costs nothing at normal frame rates and turns a
            // visible teleport into a single slow frame.
            const deltaTime = Math.min(0.1, (currentTime - lastFrameTime) / 1000);
            lastFrameTime = currentTime;

            frameCount++;
            if (currentTime - lastFpsTime >= 1000) {
                fps = frameCount;
                frameCount = 0;
                lastFpsTime = currentTime;
                const fpsEl = document.getElementById('fpsCounter');
                if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
            }

            // Apply fade effect
            ctx.fillStyle = `rgba(0, 0, 0, ${fadeSpeed})`;
            ctx.fillRect(0, 0, viewWidth, viewHeight);

            // Handle color cycling if enabled
            if (colorCycleEnabled) {
                if (currentTime - lastColorChange > colorCycleSpeed * 1000) {
                    color = `hsl(${Math.random() * 360}, 100%, 50%)`;
                    document.getElementById('colorPicker').value = color;
                    updateMenuButtonColor(color);

                    // Sync phone widget frame color
                    syncWidgetColors();

                    lastColorChange = currentTime;
                }
            }

            // Set character style
            if (gradientMode && gradientColors) {
                ctx.fillStyle = createGradient(ctx);
            } else {
                ctx.fillStyle = color;
            }

            // Apply glow if enabled
            if (glowEnabled) {
                ctx.shadowBlur = 5;
                ctx.shadowColor = color;
            } else {
                ctx.shadowBlur = 0;
            }

            // Draw characters
            ctx.font = fontSize + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const time = currentTime / 1000; // Time in seconds for movement calculations

            for (let i = 0; i < rainDrops.length; i++) {
                // Calculate base x position with horizontal movement if enabled
                let x = i * fontSize + fontSize / 2;
                if (movementEnabled && horizontalMovement > 0) {
                    x += calculateColumnMovement(i, time, horizontalMovement);
                }

                if (waterfallEnabled) {
                    // Waterfall mode logic
                    const y = rainDrops[i] * fontSize;

                    // Calculate speed based on intensity
                    const baseSpeed = 1;
                    const intensityFactor = waterfallIntensity / 100;

                    let speed = baseSpeed;
                    const time = Date.now() * 0.001; // Current time in seconds

                    if (intensityFactor === 0.5) {
                        // At 50%: Perfect uniform speed
                        speed = baseSpeed;
                    } else if (intensityFactor < 0.5) {
                        // Below 50%: Natural variations with increasing randomness
                        const variationStrength = 1 - (intensityFactor * 2); // 1 at 0%, 0 at 50%
                        // Use column index and time for consistent variations
                        const columnPhase = i * 0.1;
                        const timePhase = time * 0.5;
                        speed = baseSpeed * (1 + Math.sin(columnPhase + timePhase) * variationStrength * 0.3);
                    } else {
                        // Above 50%: Wave patterns
                        const patternStrength = (intensityFactor - 0.5) * 2; // 0 at 50%, 1 at 100%
                        const columnPhase = i * 0.2;
                        const timePhase = time * 0.3;

                        // Create a wave pattern that moves through the columns
                        speed = baseSpeed * (1 + Math.sin(columnPhase + timePhase) * patternStrength * 0.5);
                    }

                    // Ensure speed stays within reasonable bounds
                    speed = Math.max(0.7, Math.min(1.3, speed));

                    // Draw character
                    ctx.fillText(rainDropsChars[i], x, y);

                    // Update position
                    rainDrops[i] += speed;

                    // Reset when character reaches bottom
                    if (y > viewHeight) {
                        // Reset position
                        rainDrops[i] = intensityFactor === 0.5 ? 0 : Math.random() * -1;

                        // Update character
                        if (sequenceEnabled) {
                            const selectedCharsArray = Array.from(selectedChars);
                            switch (sequenceMode) {
                                case 'random':
                                    rainDropsChars[i] = selectedCharsArray[Math.floor(Math.random() * selectedCharsArray.length)];
                                    break;
                                case 'orderly':
                                    const position = Math.floor(i / trailLength);
                                    rainDropsChars[i] = selectedCharsArray[position % selectedCharsArray.length];
                                    break;
                                case 'sequential':
                                    if (customSequence) {
                                        const position = Math.floor(i / trailLength);
                                        rainDropsChars[i] = customSequence[position % customSequence.length];
                                    }
                                    break;
                            }
                        } else {
                            rainDropsChars[i] = getRandomSelectedChar();
                        }
                    }
                } else if (!movementEnabled || precipitationMode === 'continuous') {
                    // Normal continuous rain behavior
                    const y = rainDrops[i] * fontSize;

                    if (sequenceEnabled) {
                        if (y > viewHeight && Math.random() > 0.975) {
                            rainDrops[i] = 0;
                            updateSequenceCharacters();
                        }
                    } else {
                        const currentLine = Math.floor(y / fontSize);
                        if (currentLine > 0 && currentLine % lineChangeRate === 0 &&
                            Math.floor((y - fontSize) / fontSize) !== currentLine) {
                            rainDropsChars[i] = getRandomSelectedChar();
                        }

                        if (y > viewHeight && Math.random() > 0.975) {
                            rainDrops[i] = 0;
                        }
                    }

                    // Apply alpha trail effect
                    const alpha = Math.min(1, (viewHeight - y) / (viewHeight * 0.3));
                    ctx.globalAlpha = alpha;
                    ctx.fillText(rainDropsChars[i], x, y - fontSize / 2);
                    ctx.globalAlpha = 1;

                    rainDrops[i] += adjustDensity(1, 'continuous');
                } else if (precipitationMode === 'dense') {
                    // Dense packed rain behavior
                    const y = rainDrops[i] * fontSize;

                    // Apply line variation delay
                    const delay = columnDelays[i];
                    if (y < delay) continue;

                    // Check for gap with previous character
                    const prevY = i > 0 ? rainDrops[i - 1] * fontSize : -fontSize;
                    const gap = y - prevY;

                    // Adjust velocity based on gap and dense pack setting
                    const targetGap = fontSize * (densePack / 10);
                    if (gap < targetGap) {
                        columnVelocities[i] *= 0.95; // Slow down if too close
                    } else if (gap > targetGap * 2) {
                        columnVelocities[i] *= 1.05; // Speed up if too far
                    }

                    // Keep velocity within bounds
                    columnVelocities[i] = Math.max(baseVerticalSpeed * 0.5,
                        Math.min(baseVerticalSpeed * 1.5, columnVelocities[i]));

                    // Draw trail characters with fading effect
                    for (let t = 0; t < trailChars; t++) {
                        const trailY = y - (t * fontSize * (densePack / 10));
                        if (trailY > 0) {
                            const alpha = 1 - (t / trailChars);
                            ctx.globalAlpha = alpha;
                            ctx.fillText(getRandomSelectedChar(), x, trailY - fontSize / 2);
                        }
                    }
                    ctx.globalAlpha = 1;
                    ctx.fillText(rainDropsChars[i], x, y - fontSize / 2);

                    if (y > viewHeight) {
                        rainDrops[i] = 0;
                        rainDropsChars[i] = getRandomSelectedChar();
                        columnVelocities[i] = baseVerticalSpeed;
                        // Add random variation to starting position for natural look
                        rainDrops[i] = Math.random() * -3; // Random start height above screen
                        columnDelays[i] = Math.random() * lineVariation;
                    }

                    rainDrops[i] += (columnVelocities[i] * deltaTime) / fontSize;
                } else if (precipitationMode === 'individual') {
                    // Individual rain lines with spacing
                    const y = rainDrops[i] * fontSize;

                    // Dynamic line variation - changes as lines fall
                    const time = currentTime / 1000; // Time in seconds
                    const variationSpeed = 0.2; // Slower speed for smoother variation
                    const variationPhase = columnPhases[i]; // Use existing phase for consistency

                    // Calculate dynamic variation using multiple sine waves for more natural movement
                    const primaryWave = Math.sin(time * variationSpeed + variationPhase);
                    const secondaryWave = Math.sin(time * variationSpeed * 0.5 + variationPhase * 2) * 0.5;
                    const dynamicVariation = (primaryWave + secondaryWave) * lineVariation;

                    // Scale variation based on screen height for longer-lasting effect
                    const variationScale = viewHeight / 2;
                    const variationOffset = (dynamicVariation / 100) * variationScale;
                    const adjustedY = y + variationOffset;

                    // Change characters based on position
                    const currentLine = Math.floor(adjustedY / fontSize);
                    if (currentLine > 0 && currentLine % lineChangeRate === 0 &&
                        Math.floor((adjustedY - fontSize) / fontSize) !== currentLine) {
                        rainDropsChars[i] = getRandomSelectedChar();
                    }

                    if (adjustedY > -fontSize && adjustedY < viewHeight + fontSize) {
                        // Improved fade effect - starts fading from middle of screen
                        const fadeStart = viewHeight * 0.5; // Start fading halfway down
                        const fadeLength = viewHeight * 0.5; // Fade over the remaining height
                        let alpha = 1;

                        if (adjustedY > fadeStart) {
                            alpha = Math.max(0.1, 1 - ((adjustedY - fadeStart) / fadeLength));
                        }

                        ctx.globalAlpha = alpha;
                        ctx.fillText(rainDropsChars[i], x, adjustedY - fontSize / 2);
                        ctx.globalAlpha = 1;
                    }

                    const spacing = adjustDensity(fontSize * lineSpacing, 'individual');
                    if (y > viewHeight + spacing) {
                        rainDrops[i] = 0;
                        lastSpawnTimes[i] = currentTime;
                        rainDropsChars[i] = getRandomSelectedChar();
                        // Update phase for next cycle with slight randomization
                        columnPhases[i] = (columnPhases[i] + Math.random() * Math.PI) % (Math.PI * 2);
                    }

                    // All lines move together
                    rainDrops[i] += 1;

                    // Start new cycle when all lines have finished
                    if (i === rainDrops.length - 1 && y > viewHeight + spacing) {
                        // Reset all lines to start together with new random phases
                        for (let j = 0; j < rainDrops.length; j++) {
                            rainDrops[j] = 0;
                            lastSpawnTimes[j] = currentTime;
                            rainDropsChars[j] = getRandomSelectedChar();
                            // Give each column a new random phase with some relation to neighbors
                            const neighborPhase = j > 0 ? columnPhases[j - 1] : Math.random() * Math.PI * 2;
                            columnPhases[j] = (neighborPhase + Math.random() * Math.PI * 0.5) % (Math.PI * 2);
                        }
                    }
                } else if (precipitationMode === 'single') {
                    // Single line per cycle mode
                    if (i === currentColumn) {
                        const y = rainDrops[i] * fontSize;
                        ctx.fillText(rainDropsChars[i], x, y - fontSize / 2);

                        if (y > viewHeight) {
                            rainDrops[i] = 0;
                            rainDropsChars[i] = getRandomSelectedChar();
                            currentColumn = (currentColumn + 1) % rainDrops.length;
                            lastSpawnTimes[currentColumn] = currentTime;
                        }

                        rainDrops[i] += adjustDensity(1, 'single');
                    }
                }
            }

            // Draw additional effects
            if (gridEnabled) drawGrid();
            if (lightingEnabled) drawLighting();
            if (particlesEnabled) drawParticles();

            // Draw Interactive Particles overlay
            animateInteractiveParticles();

            // Draw Bouncy Dots overlay (full-screen mode)
            animateBouncyDots();
        }

        function drawGrid() {
            // Clear the grid canvas
            gridCtx.clearRect(0, 0, viewWidth, viewHeight);

            // Set grid line style with custom color and opacity
            const rgb = hexToRgb(gridColor);

            // Draw cell backgrounds first
            gridCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${gridOpacity * 0.05})`;
            const columns = Math.ceil(viewWidth / fontSize);
            const rows = Math.ceil(viewHeight / fontSize);

            for (let col = 0; col < columns; col++) {
                for (let row = 0; row < rows; row++) {
                    const x = col * fontSize;
                    const y = row * fontSize;
                    gridCtx.fillRect(x, y, fontSize, fontSize);
                }
            }

            // Draw grid lines
            gridCtx.beginPath();
            gridCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${gridOpacity})`;
            gridCtx.lineWidth = 1;

            // Draw vertical lines
            for (let col = 0; col <= columns; col++) {
                const x = col * fontSize;
                gridCtx.moveTo(x, 0);
                gridCtx.lineTo(x, viewHeight);
            }

            // Draw horizontal lines
            for (let row = 0; row <= rows; row++) {
                const y = row * fontSize;
                gridCtx.moveTo(0, y);
                gridCtx.lineTo(viewWidth, y);
            }

            gridCtx.stroke();
        }

        function hexToRgb(hex) {
            // Remove the # if present
            hex = hex.replace(/^#/, '');

            // Parse the hex values
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

            // Update existing particles
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

            // Add new particles occasionally
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

