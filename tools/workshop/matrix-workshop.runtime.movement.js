// Matrix sequence, movement, density, and waterfall controls.
        function toggleSequence(enabled) {
            sequenceEnabled = enabled;
            const controls = document.getElementById('sequenceControls');
            const sequentialControls = document.getElementById('sequentialControls');
            controls.style.display = enabled ? 'block' : 'none';

            if (enabled) {
                // Initialize sequence mode
                sequenceMode = document.getElementById('sequenceModeSelect').value;
                if (sequenceMode === 'sequential') {
                    sequentialControls.style.display = 'block';
                }
                updateSequenceCharacters();
            } else {
                // Reset to normal matrix rain
                sequentialControls.style.display = 'none';
                if (!waterfallEnabled) {
                    rainDropsChars = rainDropsChars.map(() => getRandomSelectedChar());
                }
            }
        }

        function updateSequenceMode(value) {
            sequenceMode = value;
            const sequentialControls = document.getElementById('sequentialControls');
            sequentialControls.style.display = value === 'sequential' ? 'block' : 'none';

            // Reset sequence index
            currentSequenceIndex = 0;

            // Update characters based on new mode
            if (sequenceEnabled) {
                updateSequenceCharacters();
            }
        }

        function updateSequenceCharacters() {
            if (!sequenceEnabled) return;

            switch (sequenceMode) {
                case 'random':
                    rainDropsChars = rainDropsChars.map((_, index) => {
                        return Array.from(selectedChars)[Math.floor(Math.random() * selectedChars.size)];
                    });
                    break;

                case 'orderly':
                    const selectedCharsArray = Array.from(selectedChars);
                    rainDropsChars = rainDropsChars.map((_, index) => {
                        const position = Math.floor(index / trailLength);
                        return selectedCharsArray[position % selectedCharsArray.length];
                    });
                    break;

                case 'sequential':
                    if (customSequence) {
                        rainDropsChars = rainDropsChars.map((_, index) => {
                            const position = Math.floor(index / trailLength);
                            return customSequence[position % customSequence.length];
                        });
                    }
                    break;
            }
        }

        function updateCustomSequence(value) {
            customSequence = value;
            currentSequenceIndex = 0;
            if (sequenceEnabled && sequenceMode === 'sequential') {
                updateSequenceCharacters();
            }
        }

        function updateTrailLength(value) {
            trailLength = parseInt(value);
            document.getElementById('trailLengthValue').textContent = value;
            if (sequenceEnabled) {
                updateSequenceCharacters();
            }
        }

        function updateColorSpeed(value) {
            colorCycleSpeed = parseFloat(value);
            document.getElementById('colorSpeedValue').textContent = value;
        }

        function toggleColorCycle(enabled) {
            colorCycleEnabled = enabled;
            const controls = document.getElementById('colorCycleControls');
            controls.style.display = enabled ? 'block' : 'none';

            if (!enabled) {
                // Reset color to default green when disabling
                color = '#00ff00';
                document.getElementById('colorPicker').value = color;
                updateMenuButtonColor(color);
            }
        }

        function updateHorizontalMovement(value) {
            horizontalMovement = parseInt(value);
            document.getElementById('horizontalMovementValue').textContent = value;
        }

        function updatePrecipitationMode(value) {
            precipitationMode = value;
            const controls = document.getElementById('precipitationControls');
            const denseControls = document.getElementById('denseControls');
            controls.style.display = value !== 'continuous' ? 'block' : 'none';
            denseControls.style.display = value === 'dense' ? 'block' : 'none';

            // Reset rain drops for new mode
            rainDrops = Array(Math.ceil(columns)).fill(1);
            lastSpawnTimes = Array(Math.ceil(columns)).fill(Date.now());
            currentColumn = 0;
            initializeColumns();
        }

        function updateSpawnDelay(value) {
            spawnDelay = parseInt(value);
            document.getElementById('spawnDelayValue').textContent = (value / 1000).toFixed(1) + 's';
        }

        function updateLineSpacing(value) {
            lineSpacing = parseInt(value);
            document.getElementById('lineSpacingValue').textContent = value;
        }

        function toggleMovement(enabled) {
            movementEnabled = enabled;
            const controls = document.getElementById('movementControls');
            controls.style.display = enabled ? 'block' : 'none';

            if (!enabled) {
                // Reset to normal rain
                precipitationMode = 'continuous';
                horizontalMovement = 0;
                document.getElementById('precipitationSelect').value = 'continuous';
                document.getElementById('horizontalMovementSlider').value = '0';
                document.getElementById('horizontalMovementValue').textContent = '0';
                rainDrops = Array(Math.ceil(columns)).fill(1);
                lastSpawnTimes = Array(Math.ceil(columns)).fill(Date.now());
                currentColumn = 0;
            }
            initializeColumns();
        }

        function updateDensity(value) {
            density = parseInt(value);
            document.getElementById('densityValue').textContent = value;

            // Adjust font size based on density
            const baseFontSize = 16;
            const scaleFactor = 1 + ((10 - density) / 100); // ±15% max adjustment
            fontSize = Math.round(baseFontSize * scaleFactor);

            // Recalculate columns and reinitialize
            columns = viewWidth / fontSize;
            rainDrops = Array(Math.ceil(columns)).fill(1);
            rainDropsChars = Array(Math.ceil(columns)).fill().map(() => getRandomSelectedChar());
            initializeColumns();
        }

        function adjustDensity(baseSpacing, mode) {
            const densityFactor = density / 5; // normalize to 1 at density=5
            let spacing = baseSpacing;

            if (mode === 'dense') {
                spacing *= 3 * densityFactor; // Increased spacing for dense mode
                spacing = Math.max(3, spacing); // Increased minimum gap
            } else {
                spacing *= densityFactor;
            }

            return spacing;
        }

        function calculateColumnMovement(index, time, horizontalIntensity) {
            if (horizontalIntensity === 0) return 0;

            const maxOffset = movementRange; // Use custom range instead of fontSize * 0.15
            let offset = 0;

            if (horizontalIntensity <= 5) {
                // Coordinated group sway - groups of 3 columns move together
                const groupIndex = Math.floor(index / 3);
                const frequency = 0.5 + (horizontalIntensity * 0.1);
                const amplitude = (horizontalIntensity / 5) * maxOffset;
                offset = Math.sin(time * frequency + columnPhases[groupIndex]) * amplitude;
            } else {
                // Chaotic individual drift
                const frequency = 0.5 + ((horizontalIntensity - 5) * 0.2);
                const amplitude = ((horizontalIntensity - 5) / 5) * maxOffset;
                offset = Math.sin(time * frequency + columnPhases[index]) * amplitude;

                // Add secondary chaotic movement
                offset += Math.sin(time * frequency * 1.5 + columnPhases[index] * 2) * (amplitude * 0.3);
            }

            return offset;
        }

        function updateMovementRange(value) {
            movementRange = Math.max(1, parseInt(value) || 15); // Ensure positive value, default to 15
            document.getElementById('movementRangeInput').value = movementRange;
        }

        function updateDensePack(value) {
            densePack = parseInt(value);
            document.getElementById('densePackValue').textContent = value;
        }

        function updateTrailChars(value) {
            trailChars = parseInt(value);
            document.getElementById('trailCharValue').textContent = value;
        }

        function updateLineVariation(value) {
            lineVariation = parseInt(value);
            document.getElementById('lineVariationValue').textContent = value + '%';
            initializeColumns();
        }

        function getRandomSelectedChar() {
            const chars = Array.from(selectedChars);
            return chars[Math.floor(Math.random() * chars.length)];
        }

        // Add waterfall mode functions
        function toggleWaterfall(checked) {
            waterfallEnabled = checked;
            const controls = document.getElementById('waterfallControls');
            controls.style.display = checked ? 'block' : 'none';

            if (checked) {
                // Reset all columns to start from top when waterfall is enabled
                for (let i = 0; i < rainDrops.length; i++) {
                    rainDrops[i] = 0;
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
                columnSpeeds = new Array(Math.ceil(columns)).fill(1);
            } else {
                // Reset speeds when disabling waterfall
                columnSpeeds = new Array(Math.ceil(columns)).fill(1);
            }
        }

        function updateWaterfallIntensity(value) {
            waterfallIntensity = parseInt(value);
            document.getElementById('waterfallIntensityValue').textContent = value;

            // Reset positions when intensity is set to 50 to restore perfect unison
            if (waterfallIntensity === 50) {
                for (let i = 0; i < rainDrops.length; i++) {
                    rainDrops[i] = 0;
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
            }
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
