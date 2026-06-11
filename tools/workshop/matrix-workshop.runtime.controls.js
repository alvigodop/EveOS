// Matrix reset, section, and effect control wiring.
        function resetToDefaults() {
            color = '#0f0';
            speed = 50;
            fontSize = 16;
            fadeSpeed = 0.05;
            lineChangeRate = 1;
            minLineChange = 1;
            maxLineChange = 4;
            alphabet = katakana + latin + nums;

            document.getElementById('colorPicker').value = color;
            document.getElementById('speedSlider').value = speed;
            document.getElementById('fontSizeSlider').value = fontSize;
            document.getElementById('fadeSpeedSlider').value = fadeSpeed;
            document.getElementById('lineChangeSlider').value = lineChangeRate;
            document.getElementById('minLineChange').value = minLineChange;
            document.getElementById('maxLineChange').value = maxLineChange;
            document.getElementById('charSetSelect').value = 'matrix';

            updateColor(color);
            updateSpeed(speed);
            updateFontSize(fontSize);
            updateFadeSpeed(fadeSpeed);
            updateLineChangeRate(lineChangeRate);
            updateLineChangeRange();

            columns = canvas.width / fontSize;
            rainDrops = Array(Math.ceil(columns)).fill(1);
            rainDropsChars = Array(Math.ceil(columns)).fill().map(() =>
                alphabet.charAt(Math.floor(Math.random() * alphabet.length))
            );
            selectedChars = new Set(alphabet.split('')); // Reset character selection
            updateCharacterSelector();
            updateCharacterChangeIntervalState();

            gradientMode = false;
            glowEnabled = false;
            gridEnabled = false;
            particlesEnabled = false;
            lightingEnabled = false;
            gradientColors = null;

            // Reset checkboxes
            document.getElementById('gradientCheckbox').checked = false;
            document.getElementById('glowCheckbox').checked = false;
            document.getElementById('gridCheckbox').checked = false;
            document.getElementById('particleCheckbox').checked = false;
            document.getElementById('lightingCheckbox').checked = false;
            document.getElementById('themeSelect').value = 'matrix';
            document.getElementById('gradientPresetSelect').value = 'custom';

            gridColor = '#00ff00';
            gridOpacity = 0.15;
            document.getElementById('gridColorPicker').value = gridColor;
            document.getElementById('gridOpacitySlider').value = gridOpacity;

            particleColor = '#00ff00';
            lightingColor = '#00ff00';
            document.getElementById('particleColorPicker').value = particleColor;
            document.getElementById('lightingColorPicker').value = lightingColor;

            document.getElementById('customCharInput').value = '';
            document.getElementById('customCharSetControls').style.display = 'none';

            sequenceEnabled = false;
            sequenceMode = 'random';
            customSequence = '';
            trailLength = 3;
            colorCycleSpeed = 2;
            colorCycleEnabled = false;
            currentSequenceIndex = 0;

            document.getElementById('sequenceCheckbox').checked = false;
            document.getElementById('sequenceControls').style.display = 'none';
            document.getElementById('sequenceModeSelect').value = 'random';
            document.getElementById('customSequenceInput').value = '';
            document.getElementById('trailLengthSlider').value = trailLength;
            document.getElementById('trailLengthValue').textContent = trailLength;
            document.getElementById('colorSpeedSlider').value = colorCycleSpeed;
            document.getElementById('colorSpeedValue').textContent = colorCycleSpeed;
            document.getElementById('colorCycleCheckbox').checked = false;
            document.getElementById('colorCycleControls').style.display = 'none';

            movementEnabled = false;
            horizontalMovement = 0;
            precipitationMode = 'continuous';
            spawnDelay = 500;
            lineSpacing = 4;
            currentColumn = 0;

            document.getElementById('movementCheckbox').checked = false;
            document.getElementById('movementControls').style.display = 'none';
            document.getElementById('horizontalMovementSlider').value = horizontalMovement;
            document.getElementById('horizontalMovementValue').textContent = horizontalMovement;
            document.getElementById('precipitationSelect').value = precipitationMode;
            document.getElementById('spawnDelaySlider').value = spawnDelay;
            document.getElementById('spawnDelayValue').textContent = '0.5s';
            document.getElementById('lineSpacingSlider').value = lineSpacing;
            document.getElementById('lineSpacingValue').textContent = lineSpacing;

            density = 5;
            document.getElementById('densitySlider').value = density;
            document.getElementById('densityValue').textContent = density;

            // Reset velocities and gaps
            columnVelocities = new Array(Math.ceil(columns)).fill(baseVerticalSpeed);
            columnGaps = new Array(Math.ceil(columns)).fill(fontSize);

            movementRange = 15;
            document.getElementById('movementRangeInput').value = movementRange;

            densePack = 3;
            trailChars = 3;
            lineVariation = 30;

            document.getElementById('densePackSlider').value = densePack;
            document.getElementById('densePackValue').textContent = densePack;
            document.getElementById('trailCharSlider').value = trailChars;
            document.getElementById('trailCharValue').textContent = trailChars;
            document.getElementById('lineVariationSlider').value = lineVariation;
            document.getElementById('lineVariationValue').textContent = lineVariation + '%';

            window.EveMatrixDatapackPhone?.toggle(false);
            initializeColumns();
        }

        // Initialize menu button color
        updateMenuButtonColor(color);

        // Initialize character selector
        updateCharacterSet('matrix');

        // Call updateLineChangeRange initially to set proper width
        window.addEventListener('load', () => {
            updateLineChangeRange();
        });

        function toggleSection(sectionId) {
            const section = document.getElementById(sectionId);
            const content = section.querySelector('.section-content');
            const arrow = section.querySelector('.section-arrow');

            // Close all other sections first
            document.querySelectorAll('.section-content').forEach(otherContent => {
                if (otherContent !== content && otherContent.classList.contains('visible')) {
                    otherContent.classList.remove('visible');
                    const otherArrow = otherContent.parentElement.querySelector('.section-arrow');
                    if (otherArrow) {
                        otherArrow.textContent = '▶';
                    }
                }
            });

            // Toggle current section
            content.classList.toggle('visible');
            arrow.textContent = content.classList.contains('visible') ? '▼' : '▶';

            // Close character selector when section is closed
            if (!content.classList.contains('visible')) {
                closeCharacterSelector();
            }
        }

        // Initialize sections
        document.addEventListener('DOMContentLoaded', () => {
            // Show the first section by default
            const firstSection = document.querySelector('.section');
            if (firstSection) {
                const content = firstSection.querySelector('.section-content');
                const arrow = firstSection.querySelector('.section-arrow');
                content.classList.add('visible');
                if (arrow) {
                    arrow.textContent = '▼';
                }
            }

            // Initialize all other sections as collapsed
            document.querySelectorAll('.section:not(:first-child)').forEach(section => {
                const arrow = section.querySelector('.section-arrow');
                if (arrow) {
                    arrow.textContent = '▶';
                }
            });
        });

        function toggleGlow(checked) {
            glowEnabled = checked;
            if (glowEnabled) {
                ctx.shadowBlur = 5;
                ctx.shadowColor = color;
            } else {
                ctx.shadowBlur = 0;
            }
        }

        function toggleGrid(checked) {
            gridEnabled = checked;
            const gridControls = document.getElementById('gridControls');
            gridControls.style.display = checked ? 'block' : 'none';
            gridCanvas.style.display = checked ? 'block' : 'none';

            if (checked) {
                document.getElementById('gridColorPicker').value = gridColor;
                document.getElementById('gridOpacitySlider').value = gridOpacity;
                drawGrid();
            }
        }

        function toggleParticles(checked) {
            particlesEnabled = checked;
            const particleControls = document.getElementById('particleControls');
            particleControls.style.display = checked ? 'block' : 'none';

            if (checked) {
                document.getElementById('particleColorPicker').value = particleColor;
                particles = [];
            }
        }

        function toggleLighting(checked) {
            lightingEnabled = checked;
            const lightingControls = document.getElementById('lightingControls');
            lightingControls.style.display = checked ? 'block' : 'none';

            if (checked) {
                document.getElementById('lightingColorPicker').value = lightingColor;
            }
        }

        function updateParticleColor(newColor) {
            particleColor = newColor;
        }

        function updateLightingColor(newColor) {
            lightingColor = newColor;
        }

