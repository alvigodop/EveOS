// Resize the visible viewport without restarting the Matrix world.
        let resizeFillDrops = [];
        let rainKnownBottom = [];
        let initialRainSeeded = false;

        function rainFillStyle() {
            ctx.font = `${fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = gradientMode && gradientColors ? createGradient(ctx) : color;
            if (glowEnabled) {
                ctx.shadowBlur = 5;
                ctx.shadowColor = color;
            }
        }

        function rainFillAlpha(y) {
            return Math.max(0, Math.min(1, (viewHeight - y) / (viewHeight * 0.3)));
        }

        function seedExposedRainBottom(oldHeight, oldCount, shifts) {
            if (viewHeight <= oldHeight || waterfallEnabled
                || (movementEnabled && precipitationMode !== 'continuous')) return;
            ctx.save();
            rainFillStyle();
            const count = Math.min(oldCount, rainDrops.length);
            for (let column = 0; column < count; column++) {
                const copiedBottom = Math.min(viewHeight,
                    (rainKnownBottom[column] ?? oldHeight) + (shifts[column] ?? 0));
                const gap = viewHeight - copiedBottom;
                if (gap < fontSize * 3) {
                    rainKnownBottom[column] = copiedBottom;
                    continue;
                }
                if ((column * 7 + 11) % 3 !== 0) {
                    rainKnownBottom[column] = copiedBottom;
                    continue;
                }
                // A taller viewport reveals pixels that the old canvas never rendered.
                // Sparse temporary streams fill that space without creating a second rain wall.
                const y = copiedBottom + gap * (0.15 + Math.random() * 0.75);
                resizeFillDrops = resizeFillDrops.filter(drop => drop.column !== column);
                resizeFillDrops.push({ column, y, char: getRandomSelectedChar() });
                const x = column * fontSize + fontSize / 2;
                for (let trail = 0; trail < Math.min(16, Math.ceil(gap / fontSize)); trail++) {
                    const glyphY = y - trail * fontSize;
                    if (glyphY < copiedBottom || glyphY > viewHeight) continue;
                    ctx.globalAlpha = Math.pow(1 - fadeSpeed, trail) * rainFillAlpha(glyphY);
                    ctx.fillText(getRandomSelectedChar(), x, glyphY - fontSize / 2);
                }
                rainKnownBottom[column] = viewHeight;
            }
            ctx.restore();
        }

        function drawResizeFillRain() {
            if (!resizeFillDrops.length) return;
            if (waterfallEnabled || (movementEnabled && precipitationMode !== 'continuous')) {
                resizeFillDrops = [];
                return;
            }
            ctx.save();
            rainFillStyle();
            const advance = adjustDensity(1, 'continuous') * fontSize;
            resizeFillDrops = resizeFillDrops.filter(drop => {
                if (drop.column >= rainDrops.length || drop.y > viewHeight + fontSize) return false;
                const x = drop.column * fontSize + fontSize / 2;
                ctx.globalAlpha = rainFillAlpha(drop.y);
                ctx.fillText(drop.char, x, drop.y - fontSize / 2);
                drop.y += advance;
                drop.char = getRandomSelectedChar();
                return true;
            });
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
            const trailLength = Math.min(32, Math.ceil(viewHeight / fontSize));
            for (let column = firstColumn; column < rainDrops.length; column++) {
                const headY = rainDrops[column] * fontSize;
                const x = column * fontSize + fontSize / 2;
                for (let trail = 0; trail < trailLength; trail++) {
                    const y = headY - trail * fontSize;
                    if (y < 0) break;
                    if (y > viewHeight) continue;
                    ctx.globalAlpha = Math.pow(1 - fadeSpeed, trail)
                        * Math.max(0, Math.min(1, (viewHeight - y) / (viewHeight * 0.3)));
                    ctx.fillText(alphabet.charAt(Math.floor(Math.random() * alphabet.length)),
                        x, y - fontSize / 2);
                }
            }
            ctx.restore();
        }

        function resizeCanvases() {
            const oldWidth = viewWidth;
            const oldHeight = viewHeight;
            const previousDrops = rainDrops;
            const oldCount = previousDrops.length;
            const shifts = [];
            const previousRain = canvas.width && canvas.height && oldWidth && oldHeight
                ? document.createElement('canvas') : null;
            if (previousRain) {
                previousRain.width = canvas.width;
                previousRain.height = canvas.height;
                previousRain.getContext('2d').drawImage(canvas, 0, 0);
            }

            // Resizing a canvas clears it and its drawing transform. Reapply the DPR transform,
            // then translate each old column to its new relative vertical phase. Copying strips
            // preserves the glyph size and keeps their trails aligned with the live stream heads.
            sizeAllCanvases();
            const heightRatio = oldHeight ? viewHeight / oldHeight : 1;
            if (previousRain) {
                const oldRatio = previousRain.width / oldWidth;
                const newRatio = canvas.width / viewWidth;
                ctx.save();
                // Copy existing trails on the physical-pixel grid. Fractional CSS-pixel
                // translations bilinearly resample the same glyphs on every resize, so a
                // few window drags turn crisp rain into a soft, widening ghost.
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.imageSmoothingEnabled = false;
                for (let index = 0; index < oldCount; index++) {
                    const x = index * fontSize;
                    const width = Math.min(fontSize, oldWidth - x, viewWidth - x);
                    if (width <= 0) break;
                    const shiftY = (previousDrops[index] || 0) * fontSize * (heightRatio - 1);
                    shifts[index] = shiftY;
                    const sourceX = Math.round(x * oldRatio);
                    const sourceEndX = Math.round((x + width) * oldRatio);
                    const destinationX = Math.round(x * newRatio);
                    const destinationEndX = Math.round((x + width) * newRatio);
                    ctx.drawImage(previousRain, sourceX, 0,
                        sourceEndX - sourceX, previousRain.height,
                        destinationX, Math.round(shiftY * newRatio),
                        destinationEndX - destinationX, Math.round(oldHeight * newRatio));
                }
                ctx.restore();
            }

            resizeFillDrops = resizeFillDrops.filter(drop => drop.column < Math.ceil(viewWidth / fontSize));
            resizeFillDrops.forEach(drop => { drop.y += shifts[drop.column] ?? 0; });

            buildDotGrid();
            columns = viewWidth / fontSize;
            const count = Math.ceil(columns);
            rainDrops = Array.from({ length: count }, (_, index) =>
                previousDrops[index] !== undefined
                    ? previousDrops[index] * heightRatio : Math.random() * (viewHeight / fontSize));
            rainDropsChars = Array.from({ length: count }, (_, index) =>
                rainDropsChars[index] ?? alphabet.charAt(Math.floor(Math.random() * alphabet.length)));
            resizeColumnState(count);
            seedNewRainColumns(initialRainSeeded ? oldCount : 0);
            initialRainSeeded = true;
            if (viewHeight <= oldHeight) {
                rainKnownBottom = rainKnownBottom.map((bottom, index) =>
                    Math.min(viewHeight, (bottom ?? oldHeight) + (shifts[index] ?? 0)));
            }
            seedExposedRainBottom(oldHeight, oldCount, shifts);
            rainKnownBottom.length = count;
            for (let index = 0; index < count; index++) {
                if (rainKnownBottom[index] === undefined) rainKnownBottom[index] = viewHeight;
            }
            if (gridEnabled) drawGrid();
        }

        resizeCanvases();
