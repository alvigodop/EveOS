// Matrix settings export, import, and application.
        function saveSettings() {
            const settings = {
                // Basic settings
                color: color,
                speed: speed,
                fontSize: fontSize,
                fadeSpeed: fadeSpeed,
                lineChangeRate: lineChangeRate,
                minLineChange: minLineChange,
                maxLineChange: maxLineChange,
                alphabet: alphabet,
                selectedChars: Array.from(selectedChars),

                // Effect toggles
                gradientMode: gradientMode,
                glowEnabled: glowEnabled,
                gridEnabled: gridEnabled,
                particlesEnabled: particlesEnabled,
                lightingEnabled: lightingEnabled,
                interactiveParticlesEnabled: interactiveParticlesEnabled,
                bouncyDotsEnabled: bouncyDotsEnabled,
                bouncyDotsMode: bouncyDotsMode,
                bouncyDotsPhonePosition: {
                    x: bouncyPhoneWidget.style.left,
                    y: bouncyPhoneWidget.style.top
                },
                datapackPhone: window.EveMatrixDatapackPhone?.exportSettings?.() || null,

                // Effect colors and properties
                gradientColors: gradientColors,
                gridColor: gridColor,
                gridOpacity: gridOpacity,
                particleColor: particleColor,
                lightingColor: lightingColor,

                // UI states
                customCharacters: document.getElementById('customCharInput').value,
                charSetType: document.getElementById('charSetSelect').value,
                themeType: document.getElementById('themeSelect').value,
                gradientPreset: document.getElementById('gradientPresetSelect').value,
                sequenceEnabled: sequenceEnabled,
                sequenceMode: sequenceMode,
                customSequence: customSequence,
                trailLength: trailLength,
                colorCycleSpeed: colorCycleSpeed,
                colorCycleEnabled: colorCycleEnabled,
                movementEnabled: movementEnabled,
                horizontalMovement: horizontalMovement,
                precipitationMode: precipitationMode,
                spawnDelay: spawnDelay,
                lineSpacing: lineSpacing,
                density: density,
                movementRange: movementRange,
                densePack: densePack,
                trailChars: trailChars,
                lineVariation: lineVariation
            };

            try {
                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'matrix-settings.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error saving settings:', error);
                alert('Error saving settings. Please try again.');
            }
        }

        function loadSettings() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const settings = JSON.parse(event.target.result);
                        console.log('Loading settings:', settings);
                        applySettings(settings);
                    } catch (error) {
                        console.error('Error parsing settings file:', error);
                        alert('Error loading settings file. Please ensure it is a valid JSON file.');
                    }
                };
                reader.onerror = (error) => {
                    console.error('Error reading file:', error);
                    alert('Error reading the settings file. Please try again.');
                };
                reader.readAsText(file);
            };
            input.click();
        }

        function applySettings(settings) {
            try {
                // First, ensure all sections are properly initialized
                document.querySelectorAll('.section').forEach(section => {
                    const content = section.querySelector('.section-content');
                    const arrow = section.querySelector('.section-arrow');
                    if (content) content.classList.remove('visible');
                    if (arrow) arrow.textContent = '▶';
                });

                // Show the first section by default
                const firstSection = document.querySelector('.section');
                if (firstSection) {
                    const content = firstSection.querySelector('.section-content');
                    const arrow = firstSection.querySelector('.section-arrow');
                    if (content) content.classList.add('visible');
                    if (arrow) arrow.textContent = '▼';
                }

                // Apply basic settings with validation
                if (settings.color) color = settings.color;
                if (settings.speed) speed = parseInt(settings.speed);
                if (settings.fontSize) fontSize = parseInt(settings.fontSize);
                if (settings.fadeSpeed) fadeSpeed = parseFloat(settings.fadeSpeed);
                if (settings.lineChangeRate) lineChangeRate = parseInt(settings.lineChangeRate);
                if (settings.minLineChange) minLineChange = parseInt(settings.minLineChange);
                if (settings.maxLineChange) maxLineChange = parseInt(settings.maxLineChange);
                if (settings.alphabet) alphabet = settings.alphabet;
                if (settings.selectedChars) selectedChars = new Set(settings.selectedChars);

                // Apply effect settings
                gradientMode = Boolean(settings.gradientMode);
                glowEnabled = Boolean(settings.glowEnabled);
                gridEnabled = Boolean(settings.gridEnabled);
                particlesEnabled = Boolean(settings.particlesEnabled);
                lightingEnabled = Boolean(settings.lightingEnabled);
                if (settings.hasOwnProperty('interactiveParticlesEnabled')) {
                    interactiveParticlesEnabled = Boolean(settings.interactiveParticlesEnabled);
                }
                if (settings.hasOwnProperty('bouncyDotsEnabled')) {
                    bouncyDotsEnabled = Boolean(settings.bouncyDotsEnabled);
                }
                if (settings.bouncyDotsMode) {
                    bouncyDotsMode = settings.bouncyDotsMode;
                }
                if (settings.bouncyDotsPhonePosition) {
                    bouncyPhoneWidget.style.left = settings.bouncyDotsPhonePosition.x || '20px';
                    bouncyPhoneWidget.style.top = settings.bouncyDotsPhonePosition.y || '20px';
                }
                if (settings.datapackPhone && window.EveMatrixDatapackPhone?.applySettings) {
                    window.EveMatrixDatapackPhone.applySettings(settings.datapackPhone);
                }

                // Apply effect colors and properties
                if (settings.gradientColors) gradientColors = settings.gradientColors;
                if (settings.gridColor) gridColor = settings.gridColor;
                if (settings.gridOpacity) gridOpacity = parseFloat(settings.gridOpacity);
                if (settings.particleColor) particleColor = settings.particleColor;
                if (settings.lightingColor) lightingColor = settings.lightingColor;

                // Update UI elements - with null checks
                const elements = {
                    colorPicker: document.getElementById('colorPicker'),
                    speedSlider: document.getElementById('speedSlider'),
                    fontSizeSlider: document.getElementById('fontSizeSlider'),
                    fadeSpeedSlider: document.getElementById('fadeSpeedSlider'),
                    lineChangeSlider: document.getElementById('lineChangeSlider'),
                    minLineChange: document.getElementById('minLineChange'),
                    maxLineChange: document.getElementById('maxLineChange'),
                    gradientCheckbox: document.getElementById('gradientCheckbox'),
                    glowCheckbox: document.getElementById('glowCheckbox'),
                    gridCheckbox: document.getElementById('gridCheckbox'),
                    gridControls: document.getElementById('gridControls'),
                    gridColorPicker: document.getElementById('gridColorPicker'),
                    gridOpacitySlider: document.getElementById('gridOpacitySlider'),
                    particleCheckbox: document.getElementById('particleCheckbox'),
                    particleControls: document.getElementById('particleControls'),
                    particleColorPicker: document.getElementById('particleColorPicker'),
                    lightingCheckbox: document.getElementById('lightingCheckbox'),
                    lightingControls: document.getElementById('lightingControls'),
                    lightingColorPicker: document.getElementById('lightingColorPicker'),
                    interactiveParticleCheckbox: document.getElementById('interactiveParticleCheckbox'),
                    bouncyDotsCheckbox: document.getElementById('bouncyDotsCheckbox'),
                    charSetSelect: document.getElementById('charSetSelect'),
                    customControls: document.getElementById('customCharSetControls'),
                    customCharInput: document.getElementById('customCharInput'),
                    themeSelect: document.getElementById('themeSelect'),
                    gradientPresetSelect: document.getElementById('gradientPresetSelect'),
                    toolbar: document.getElementById('toolbar')
                };

                // Update UI elements safely
                if (elements.colorPicker) elements.colorPicker.value = color;
                if (elements.speedSlider) elements.speedSlider.value = speed;
                if (elements.fontSizeSlider) elements.fontSizeSlider.value = fontSize;
                if (elements.fadeSpeedSlider) elements.fadeSpeedSlider.value = fadeSpeed;
                if (elements.lineChangeSlider) elements.lineChangeSlider.value = lineChangeRate;
                if (elements.minLineChange) elements.minLineChange.value = minLineChange;
                if (elements.maxLineChange) elements.maxLineChange.value = maxLineChange;

                // Update effect toggles and their controls safely
                if (elements.gradientCheckbox) elements.gradientCheckbox.checked = gradientMode;
                if (elements.glowCheckbox) elements.glowCheckbox.checked = glowEnabled;
                if (elements.interactiveParticleCheckbox) elements.interactiveParticleCheckbox.checked = interactiveParticlesEnabled;
                interactiveParticleCanvas.style.display = interactiveParticlesEnabled ? 'block' : 'none';

                if (elements.bouncyDotsCheckbox) elements.bouncyDotsCheckbox.checked = bouncyDotsEnabled;
                const bouncyModeSelect = document.getElementById('bouncyDotsMode');
                if (bouncyModeSelect) bouncyModeSelect.value = bouncyDotsMode;
                document.getElementById('bouncyDotsOptions').style.display = bouncyDotsEnabled ? 'block' : 'none';
                if (bouncyDotsEnabled) {
                    switchBouncyDotsMode(bouncyDotsMode);
                } else {
                    bouncyDotsCanvas.style.display = 'none';
                    bouncyPhoneWidget.style.display = 'none';
                }

                // Update grid controls safely
                if (elements.gridCheckbox) elements.gridCheckbox.checked = gridEnabled;
                if (elements.gridControls) elements.gridControls.style.display = gridEnabled ? 'block' : 'none';
                if (elements.gridColorPicker) elements.gridColorPicker.value = gridColor;
                if (elements.gridOpacitySlider) elements.gridOpacitySlider.value = gridOpacity;
                if (gridCanvas) gridCanvas.style.display = gridEnabled ? 'block' : 'none';

                // Update particle controls safely
                if (elements.particleCheckbox) elements.particleCheckbox.checked = particlesEnabled;
                if (elements.particleControls) elements.particleControls.style.display = particlesEnabled ? 'block' : 'none';
                if (elements.particleColorPicker) elements.particleColorPicker.value = particleColor;

                // Update lighting controls safely
                if (elements.lightingCheckbox) elements.lightingCheckbox.checked = lightingEnabled;
                if (elements.lightingControls) elements.lightingControls.style.display = lightingEnabled ? 'block' : 'none';
                if (elements.lightingColorPicker) elements.lightingColorPicker.value = lightingColor;

                // Update dropdowns and custom input safely
                if (elements.charSetSelect) elements.charSetSelect.value = settings.charSetType || 'matrix';
                if (elements.customControls) elements.customControls.style.display = settings.charSetType === 'custom' ? 'block' : 'none';
                if (elements.customCharInput && settings.customCharacters) elements.customCharInput.value = settings.customCharacters;
                if (elements.themeSelect) elements.themeSelect.value = settings.themeType || 'matrix';
                if (elements.gradientPresetSelect) elements.gradientPresetSelect.value = settings.gradientPreset || 'custom';

                // Apply all changes
                updateCharacterSet(settings.charSetType || 'matrix');
                updateTheme(settings.themeType || 'matrix');
                updateSpeed(speed);
                updateFontSize(fontSize);
                updateFadeSpeed(fadeSpeed);
                updateLineChangeRate(lineChangeRate);
                updateLineChangeRange();
                updateMenuButtonColor(color);

                // Refresh the matrix
                columns = canvas.width / fontSize;
                rainDrops = Array(Math.ceil(columns)).fill(1);
                rainDropsChars = Array(Math.ceil(columns)).fill().map(() => getRandomSelectedChar());

                // Redraw grid if enabled
                if (gridEnabled) {
                    drawGrid();
                }

                // Make sure the toolbar is visible
                if (elements.toolbar) elements.toolbar.classList.remove('hidden');

                // Apply sequence settings
                if (settings.hasOwnProperty('sequenceEnabled')) {
                    sequenceEnabled = settings.sequenceEnabled;
                    document.getElementById('sequenceCheckbox').checked = sequenceEnabled;
                    document.getElementById('sequenceControls').style.display = sequenceEnabled ? 'block' : 'none';
                }

                if (settings.hasOwnProperty('sequenceMode')) {
                    sequenceMode = settings.sequenceMode;
                    document.getElementById('sequenceModeSelect').value = sequenceMode;
                    document.getElementById('sequentialControls').style.display =
                        sequenceEnabled ? (sequenceMode === 'sequential' ? 'block' : 'none') : 'none';
                }

                if (settings.hasOwnProperty('customSequence')) {
                    customSequence = settings.customSequence;
                    document.getElementById('customSequenceInput').value = customSequence;
                }

                if (settings.hasOwnProperty('trailLength')) {
                    trailLength = settings.trailLength;
                    document.getElementById('trailLengthSlider').value = trailLength;
                    document.getElementById('trailLengthValue').textContent = trailLength;
                }

                if (settings.hasOwnProperty('colorCycleSpeed')) {
                    colorCycleSpeed = settings.colorCycleSpeed;
                    document.getElementById('colorSpeedSlider').value = colorCycleSpeed;
                    document.getElementById('colorSpeedValue').textContent = colorCycleSpeed;
                }

                if (settings.hasOwnProperty('colorCycleEnabled')) {
                    colorCycleEnabled = settings.colorCycleEnabled;
                    document.getElementById('colorCycleCheckbox').checked = colorCycleEnabled;
                    document.getElementById('colorCycleControls').style.display =
                        colorCycleEnabled ? 'block' : 'none';
                }

                if (sequenceEnabled) {
                    updateSequenceCharacters();
                }

                // Apply movement settings
                if (settings.hasOwnProperty('movementEnabled')) {
                    movementEnabled = settings.movementEnabled;
                    document.getElementById('movementCheckbox').checked = movementEnabled;
                    document.getElementById('movementControls').style.display =
                        movementEnabled ? 'block' : 'none';
                }

                if (settings.hasOwnProperty('horizontalMovement')) {
                    horizontalMovement = settings.horizontalMovement;
                    document.getElementById('horizontalMovementSlider').value = horizontalMovement;
                    document.getElementById('horizontalMovementValue').textContent = horizontalMovement;
                }

                if (settings.hasOwnProperty('precipitationMode')) {
                    precipitationMode = settings.precipitationMode;
                    document.getElementById('precipitationSelect').value = precipitationMode;
                    document.getElementById('precipitationControls').style.display =
                        precipitationMode !== 'continuous' ? 'block' : 'none';
                }

                if (settings.hasOwnProperty('spawnDelay')) {
                    spawnDelay = settings.spawnDelay;
                    document.getElementById('spawnDelaySlider').value = spawnDelay;
                    document.getElementById('spawnDelayValue').textContent = (spawnDelay / 1000).toFixed(1) + 's';
                }

                if (settings.hasOwnProperty('lineSpacing')) {
                    lineSpacing = settings.lineSpacing;
                    document.getElementById('lineSpacingSlider').value = lineSpacing;
                    document.getElementById('lineSpacingValue').textContent = lineSpacing;
                }

                if (settings.hasOwnProperty('density')) {
                    density = settings.density;
                    document.getElementById('densitySlider').value = density;
                    document.getElementById('densityValue').textContent = density;
                }

                if (settings.hasOwnProperty('movementRange')) {
                    movementRange = settings.movementRange;
                    document.getElementById('movementRangeInput').value = movementRange;
                }

                if (settings.hasOwnProperty('densePack')) {
                    densePack = settings.densePack;
                    document.getElementById('densePackSlider').value = densePack;
                    document.getElementById('densePackValue').textContent = densePack;
                }

                if (settings.hasOwnProperty('trailChars')) {
                    trailChars = settings.trailChars;
                    document.getElementById('trailCharSlider').value = trailChars;
                    document.getElementById('trailCharValue').textContent = trailChars;
                }

                if (settings.hasOwnProperty('lineVariation')) {
                    lineVariation = settings.lineVariation;
                    document.getElementById('lineVariationSlider').value = lineVariation;
                    document.getElementById('lineVariationValue').textContent = lineVariation + '%';
                }

                initializeColumns();

                console.log('Settings applied successfully');
            } catch (error) {
                console.error('Error applying settings:', error);
                alert(`Error applying settings: ${error.message}`);
            }
        }

