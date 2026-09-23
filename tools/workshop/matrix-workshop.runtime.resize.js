// Resize the visible viewport without restarting the Matrix world.
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
                for (let index = 0; index < oldCount; index++) {
                    const x = index * fontSize;
                    const width = Math.min(fontSize, oldWidth - x, viewWidth - x);
                    if (width <= 0) break;
                    const shiftY = (previousDrops[index] || 0) * fontSize * (heightRatio - 1);
                    ctx.drawImage(previousRain, Math.round(x * oldRatio), 0,
                        Math.round(width * oldRatio), previousRain.height,
                        x, shiftY, width, oldHeight);
                }
            }

            buildDotGrid();
            columns = viewWidth / fontSize;
            const count = Math.ceil(columns);
            rainDrops = Array.from({ length: count }, (_, index) =>
                previousDrops[index] !== undefined
                    ? previousDrops[index] * heightRatio : Math.random() * (viewHeight / fontSize));
            rainDropsChars = Array.from({ length: count }, (_, index) =>
                rainDropsChars[index] ?? alphabet.charAt(Math.floor(Math.random() * alphabet.length)));
            resizeColumnState(count);
            seedNewRainColumns(oldCount);
            if (gridEnabled) drawGrid();
        }

        resizeCanvases();
