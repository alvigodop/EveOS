// Resize the visible viewport without restarting the Matrix rain world.
        let initialRainSeeded = false;

        function seedExpandedRainHistory(oldHeight, oldCount) {
            const gap = viewHeight - oldHeight;
            const continuousMode = !waterfallEnabled
                && (!movementEnabled || precipitationMode === 'continuous');
            if (gap <= 2 || !continuousMode || rainOpeningWave) return;

            ctx.save();
            ctx.font = `${fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = gradientMode && gradientColors ? createGradient(ctx) : color;
            if (glowEnabled) {
                ctx.shadowBlur = 5;
                ctx.shadowColor = color;
            }

            const count = Math.min(oldCount, rainDrops.length);
            // Small drags need only a few continuations; large expansions need
            // more coverage so the revealed band never reads as a rectangular void.
            const stride = gap <= fontSize * 2 ? 4
                : (gap <= fontSize * 6 ? 3 : 2);
            for (let column = 0; column < count; column++) {
                const phase = Math.abs(Math.floor((rainDrops[column] || 0) * 7) + column * 11);
                if (phase % stride !== 0) continue;

                const char = rainDropsChars[column] || getRandomSelectedChar();
                const landingY = getRainLandingY(char);
                if (landingY <= oldHeight + 1) continue;

                const x = column * fontSize + fontSize / 2;
                // Continue the existing stream's glyph lattice instead of
                // inventing an arbitrary start row. This makes the revealed band
                // visually connect to the rain above at every window height.
                const headDrawY = (rainDrops[column] || 0) * fontSize - fontSize / 2;
                const phaseOffset = ((headDrawY % fontSize) + fontSize) % fontSize;
                let y = oldHeight + ((phaseOffset - oldHeight) % fontSize + fontSize) % fontSize;
                if (y <= oldHeight + 1) y += fontSize;

                let trail = 0;
                while (y < landingY - fontSize * 0.35 && trail < 24) {
                    const depth = Math.max(0, Math.min(1, (y - oldHeight) / gap));
                    ctx.globalAlpha = Math.max(0.12,
                        Math.pow(1 - fadeSpeed, trail + 1) * (0.44 - depth * 0.18));
                    ctx.fillText(getRandomSelectedChar(), x, y);
                    y += fontSize;
                    trail++;
                }

                // Always finish a seeded continuation with the exact same
                // measured endpoint/glow used by live rain. No arbitrary final
                // row means no resize-size-specific bottom sliver.
                drawRainTerminalGlyph(char, x, 0.18);
            }
            ctx.restore();
        }

        function seedNewRainColumns(firstColumn) {
            if (firstColumn >= rainDrops.length) return;
            ctx.save();
            ctx.font = `${fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = gradientMode && gradientColors ? createGradient(ctx) : color;
            if (glowEnabled) {
                ctx.shadowBlur = 5;
                ctx.shadowColor = color;
            }
            const trailLength = Math.min(32, Math.ceil(rainBufferHeight / fontSize));
            for (let column = firstColumn; column < rainDrops.length; column++) {
                const headY = rainDrops[column] * fontSize;
                const x = column * fontSize + fontSize / 2;
                // The live render loop owns the head glyph. Pre-seeding it here
                // paints the same character twice on the first frame/new columns.
                for (let trail = 1; trail < trailLength; trail++) {
                    const y = headY - trail * fontSize;
                    if (y < 0) break;
                    if (y > rainBufferHeight) continue;
                    ctx.globalAlpha = Math.pow(1 - fadeSpeed, trail)
                        * Math.max(0.2, Math.min(1,
                            (rainBufferHeight - y) / (rainBufferHeight * 0.3)));
                    ctx.fillText(alphabet.charAt(Math.floor(Math.random() * alphabet.length)),
                        x, y - fontSize / 2);
                }
            }
            ctx.restore();
        }

        function resizeCanvases() {
            const oldWidth = viewWidth;
            const oldCount = rainDrops.length;
            const oldBufferHeight = rainBufferHeight;
            const nextWidth = window.innerWidth;
            const nextHeight = window.innerHeight;
            const nextRatio = Math.max(1, window.devicePixelRatio || 1);
            const backingChanges = canvas.width !== Math.round(nextWidth * nextRatio)
                || canvas.height !== Math.round(nextHeight * nextRatio);
            const previousRain = backingChanges && canvas.width && canvas.height
                ? document.createElement('canvas') : null;
            if (previousRain) {
                previousRain.width = canvas.width;
                previousRain.height = canvas.height;
                previousRain.getContext('2d').drawImage(canvas, 0, 0);
            }

            // Preserve overlapping rain pixels exactly. If the window grows,
            // seed only the newly exposed band with transient-looking history so
            // a resize never reveals a uniform black box while live streams catch up.
            sizeAllCanvases();
            if (previousRain) {
                const oldRatio = previousRain.width / oldWidth;
                const copiedWidth = Math.min(oldWidth, viewWidth);
                const copiedHeight = Math.min(oldBufferHeight, rainBufferHeight);
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(previousRain, 0, 0,
                    Math.round(copiedWidth * oldRatio),
                    Math.round(copiedHeight * oldRatio),
                    0, 0,
                    Math.round(copiedWidth * nextRatio),
                    Math.round(copiedHeight * nextRatio));
                ctx.restore();
            }

            buildDotGrid();
            columns = viewWidth / fontSize;
            const count = Math.ceil(columns);
            // Never scale the heads vertically on a window drag: that teleports the
            // stream while the copied trail still carries its old pixel history.
            rainDrops.length = count;
            rainDropsChars.length = count;
            for (let index = oldCount; index < count; index++) {
                rainDrops[index] = Math.random() * (rainBufferHeight / fontSize);
                rainDropsChars[index] = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
            }
            resizeColumnState(count);
            seedExpandedRainHistory(oldBufferHeight, oldCount);
            // The initial heads are already ready for the first animation frame;
            // seed history only for columns created by a later width expansion.
            if (initialRainSeeded) seedNewRainColumns(oldCount);
            initialRainSeeded = true;
            if (gridEnabled) drawGrid();
        }

        resizeCanvases();
