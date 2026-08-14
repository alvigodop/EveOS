// Matrix appearance, character, toolbar, and canvas controls.
        function createGradient(context) {
            const gradient = context.createLinearGradient(0, 0, viewWidth, viewHeight);
            if (gradientMode && gradientColors) {
                gradientColors.forEach((color, index) => {
                    gradient.addColorStop(index / (gradientColors.length - 1), color);
                });
            } else {
                gradient.addColorStop(0, color);
                gradient.addColorStop(1, color);
            }
            return gradient;
        }

        function toggleGradient(checked) {
            gradientMode = checked;
            if (checked && !gradientColors) {
                const presetSelect = document.getElementById('gradientPresetSelect');
                updateGradientPreset(presetSelect.value);
            }
        }

        function updateGradientPreset(value) {
            const presets = {
                custom: [color, '#00ff88', color],
                cyber: ['#ff00ff', '#00ffff', '#ff4500'],
                neon: ['#ff073a', '#4dff03', '#03f7ff'],
                matrix2: ['#0f0', '#00ff88', '#00ff00']
            };
            gradientColors = presets[value];

            // If gradient mode is enabled, force a redraw
            if (gradientMode) {
                ctx.fillStyle = createGradient(ctx);
            }
        }

        function updateTheme(value) {
            switch (value) {
                case 'matrix':
                    color = '#0f0';
                    break;
                case 'cyberpunk':
                    color = '#ff00ff';
                    break;
                case 'neon':
                    color = '#00ffff';
                    break;
                case 'monochrome':
                    color = '#ffffff';
                    break;
            }
            document.getElementById('colorPicker').value = color;
            updateMenuButtonColor(color);

            // Sync widget colors
            syncWidgetColors();

            // Update gradient if in gradient mode
            if (gradientMode && document.getElementById('gradientPresetSelect').value === 'custom') {
                updateGradientPreset('custom');
            }
        }

        function updateGridColor(newColor) {
            gridColor = newColor;
            if (gridEnabled) {
                drawGrid();
            }
        }

        function updateGridOpacity(newOpacity) {
            gridOpacity = parseFloat(newOpacity);
            if (gridEnabled) {
                drawGrid();
            }
        }

        // Start animation
        startAnimation();

        function resizeCanvases() {
            // Re-derives viewWidth/viewHeight and re-applies the device-pixel-ratio transform to
            // every canvas. Resizing a canvas resets its context state, so the transform has to be
            // reinstated here or everything reverts to blurry 1:1 after the first resize -- and
            // dragging a window between a laptop screen and an external monitor changes the ratio.
            sizeAllCanvases();
            buildDotGrid();
            columns = viewWidth / fontSize;
            rainDrops = Array(Math.ceil(columns)).fill(1);
            rainDropsChars = Array(Math.ceil(columns)).fill().map(() =>
                alphabet.charAt(Math.floor(Math.random() * alphabet.length))
            );
            if (gridEnabled) {
                drawGrid();
            }
        }

        // Initial canvas setup
        resizeCanvases();

        function togglePause() {
            paused = !paused;
        }

        function randomizeColor() {
            color = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
            document.getElementById('colorPicker').value = color;
            updateMenuButtonColor(color);
        }

        function syncWidgetColors() {
            // Phone widget frame + drag bar
            const pf = document.getElementById('bouncyPhoneFrame');
            if (pf) {
                pf.style.borderColor = color;
                pf.style.boxShadow = `0 0 20px ${color}`;
            }
            const dragBar = document.querySelector('.phone-drag-bar');
            if (dragBar) {
                dragBar.style.borderColor = color;
                dragBar.style.background = `rgba(${hexToRgbStr(color)}, 0.15)`;
            }
            document.querySelectorAll('.phone-drag-bar .grip').forEach(g => g.style.background = color);
            document.querySelectorAll('.phone-screen .phone-dot').forEach(d => {
                d.style.background = color;
                d.style.boxShadow = `0 0 5px ${color}`;
            });

            // Slideshow bar
            const slBar = document.getElementById('slideshowBar');
            if (slBar) slBar.style.borderTopColor = color;
            const slTab = document.querySelector('.slideshow-toggle-tab');
            if (slTab) slTab.style.borderColor = color;
            document.querySelectorAll('.sl-btn').forEach(btn => {
                btn.style.borderColor = color;
                btn.style.color = color;
            });
            document.querySelectorAll('.sl-thumb').forEach(t => t.style.borderColor = color);
            document.querySelectorAll('.sl-status').forEach(s => s.style.color = color);
            document.querySelectorAll('.sl-opacity-ctrl label').forEach(l => l.style.color = color);
            window.EveMatrixDatapackPhone?.syncColor?.(color);
        }

        // Helper: hex color to "r, g, b" string
        function hexToRgbStr(hex) {
            if (hex.startsWith('hsl')) return '0, 255, 0'; // fallback for HSL
            hex = hex.replace('#', '');
            if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            const n = parseInt(hex, 16);
            return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
        }

        function updateColor(newColor) {
            color = newColor;
            updateMenuButtonColor(newColor);
            syncWidgetColors();
        }

        function updateMenuButtonColor(newColor) {
            document.getElementById('toggleToolbar').style.backgroundColor = newColor;
            document.getElementById('toggleToolbar').style.color = getContrastColor(newColor);
        }

        function getContrastColor(hexcolor) {
            let r = parseInt(hexcolor.substr(1, 2), 16);
            let g = parseInt(hexcolor.substr(3, 2), 16);
            let b = parseInt(hexcolor.substr(5, 2), 16);
            let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (yiq >= 128) ? 'black' : 'white';
        }

        function updateSpeed(newSpeed) {
            speed = parseInt(newSpeed);
            startAnimation();
        }

        function updateFontSize(newSize) {
            fontSize = parseInt(newSize);
            columns = viewWidth / fontSize;
            rainDrops = Array(Math.ceil(columns)).fill(1);
            rainDropsChars = Array(Math.ceil(columns)).fill().map(() => alphabet.charAt(Math.floor(Math.random() * alphabet.length)));
        }

        function updateFadeSpeed(newSpeed) {
            fadeSpeed = parseFloat(newSpeed);
        }

        function updateCharacterSet(set) {
            const customControls = document.getElementById('customCharSetControls');

            switch (set) {
                case 'binary':
                    alphabet = '01';
                    customControls.style.display = 'none';
                    break;
                case 'ascii':
                    alphabet = '';
                    for (let i = 33; i <= 126; i++) {
                        alphabet += String.fromCharCode(i);
                    }
                    customControls.style.display = 'none';
                    break;
                case 'custom':
                    customControls.style.display = 'block';
                    const customInput = document.getElementById('customCharInput');
                    if (customInput.value) {
                        alphabet = customInput.value;
                    } else {
                        customInput.value = alphabet;
                    }
                    break;
                default: // matrix
                    alphabet = katakana + latin + nums;
                    customControls.style.display = 'none';
            }

            // Reset character selection
            selectedChars = new Set(alphabet.split(''));
            updateCharacterSelector();
            updateCharacterChangeIntervalState();

            // Refresh all characters
            rainDropsChars = rainDropsChars.map(() =>
                getRandomSelectedChar()
            );
        }

        function updateCustomCharSet(value) {
            if (value.length > 0) {
                alphabet = value;
                // Reset character selection
                selectedChars = new Set(alphabet.split(''));
                updateCharacterSelector();
                updateCharacterChangeIntervalState();

                // Refresh all characters
                rainDropsChars = rainDropsChars.map(() =>
                    getRandomSelectedChar()
                );
            }
        }

        function toggleCharacterSelector(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const selector = document.getElementById('characterSelector');
            const btn = document.getElementById('charSelectorBtn');

            if (!selector.classList.contains('visible')) {
                // Close any other open selectors first
                document.querySelectorAll('.character-selector.visible').forEach(sel => {
                    if (sel !== selector) {
                        sel.classList.remove('visible');
                    }
                });

                selector.classList.add('visible');
                btn.classList.add('active');

                // Position the selector
                const btnRect = btn.getBoundingClientRect();
                const selectorHeight = selector.offsetHeight;
                const windowHeight = window.innerHeight;

                // Check if there's room below the button
                if (btnRect.bottom + selectorHeight > windowHeight) {
                    // Position above the button if not enough space below
                    selector.style.top = 'auto';
                    selector.style.bottom = '100%';
                    selector.style.marginTop = '0';
                    selector.style.marginBottom = '5px';
                } else {
                    // Position below the button
                    selector.style.top = '100%';
                    selector.style.bottom = 'auto';
                    selector.style.marginTop = '5px';
                    selector.style.marginBottom = '0';
                }

                // Add click outside listener
                setTimeout(() => {
                    document.addEventListener('click', closeCharacterSelector);
                }, 0);
            } else {
                closeCharacterSelector();
            }
        }

        function closeCharacterSelector(event) {
            const selector = document.getElementById('characterSelector');
            const btn = document.getElementById('charSelectorBtn');
            const container = document.querySelector('.character-selector-container');

            if (event) {
                const isClickInside = container.contains(event.target);
                if (isClickInside && event.target !== btn) return;
            }

            selector.classList.remove('visible');
            btn.classList.remove('active');
            document.removeEventListener('click', closeCharacterSelector);
        }

        function updateCharacterSelector() {
            const grid = document.getElementById('characterGrid');
            grid.innerHTML = '';

            alphabet.split('').forEach(char => {
                const box = document.createElement('div');
                box.className = `char-box ${selectedChars.has(char) ? 'selected' : ''}`;
                box.textContent = char;
                box.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedChars.has(char)) {
                        if (selectedChars.size > 1) {
                            selectedChars.delete(char);
                        }
                    } else {
                        selectedChars.add(char);
                    }
                    updateCharacterSelector();
                    updateCharacterChangeIntervalState();
                };
                grid.appendChild(box);
            });
        }

        function selectAllCharacters() {
            selectedChars = new Set(alphabet.split(''));
            updateCharacterSelector();
            updateCharacterChangeIntervalState();
        }

        function deselectAllCharacters() {
            const firstChar = alphabet[0];
            selectedChars = new Set([firstChar]);
            updateCharacterSelector();
            updateCharacterChangeIntervalState();
        }

        function updateCharacterChangeIntervalState() {
            const lineChangeControls = document.querySelector('label[style*="display: flex"]');
            const isSingleChar = selectedChars.size === 1;

            if (isSingleChar) {
                lineChangeControls.style.opacity = '0.5';
                lineChangeControls.style.pointerEvents = 'none';
                document.getElementById('lineChangeSlider').disabled = true;
                document.getElementById('minLineChange').disabled = true;
                document.getElementById('maxLineChange').disabled = true;
            } else {
                lineChangeControls.style.opacity = '1';
                lineChangeControls.style.pointerEvents = 'auto';
                document.getElementById('lineChangeSlider').disabled = false;
                document.getElementById('minLineChange').disabled = false;
                document.getElementById('maxLineChange').disabled = false;
            }
        }

        function getRandomSelectedChar() {
            const chars = Array.from(selectedChars);
            return chars[Math.floor(Math.random() * chars.length)];
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }

        function toggleToolbar() {
            document.getElementById('toolbar').classList.toggle('hidden');
        }

        function updateLineChangeRange() {
            const min = parseInt(document.getElementById('minLineChange').value);
            const max = parseInt(document.getElementById('maxLineChange').value);
            const current = parseInt(document.getElementById('lineChangeSlider').value);

            // Ensure min <= max
            if (min > max) {
                document.getElementById('maxLineChange').value = min;
                maxLineChange = min;
            } else {
                minLineChange = min;
                maxLineChange = max;
            }

            // Update slider range and adjust its visual width based on range
            const slider = document.getElementById('lineChangeSlider');
            slider.min = minLineChange;
            slider.max = maxLineChange;

            // Adjust slider width based on range
            const range = maxLineChange - minLineChange;
            const baseWidth = 150; // Base width in pixels
            const width = Math.max(baseWidth, range * 30); // 30 pixels per unit
            slider.style.width = `${width}px`;

            // Keep current value within new range
            if (current < min) {
                slider.value = min;
                updateLineChangeRate(min);
            } else if (current > max) {
                slider.value = max;
                updateLineChangeRate(max);
            }
        }

        function updateLineChangeRate(newRate) {
            lineChangeRate = parseInt(newRate);
            // Ensure rate stays within min/max bounds
            if (lineChangeRate < minLineChange) lineChangeRate = minLineChange;
            if (lineChangeRate > maxLineChange) lineChangeRate = maxLineChange;
            document.getElementById('lineChangeSlider').value = lineChangeRate;
        }

