// Resize the visible viewport without restarting the Matrix rain world.
        let initialRainSeeded = false;

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
                for (let trail = 0; trail < trailLength; trail++) {
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
            const nextHeight = Math.max(window.innerHeight, window.screen?.height || 0);
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

            // A height drag within the same display leaves the rain canvas untouched.
            // Only width, display-height, or DPR changes need a new backing store.
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
            seedNewRainColumns(initialRainSeeded ? oldCount : 0);
            initialRainSeeded = true;
            if (gridEnabled) drawGrid();
        }

        resizeCanvases();
