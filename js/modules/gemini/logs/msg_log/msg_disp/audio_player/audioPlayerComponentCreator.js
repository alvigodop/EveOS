// Module for creating audio player components
window.MessagingLog = window.MessagingLog || {};
window.MessagingLog.AudioPlayerComponentCreator = {
    createAudioPlayer: function (audioData) {
        const audioPlayerContainer = document.createElement('div');
        audioPlayerContainer.className = 'audio-player-container';
        // Dark theme: Dark background to stand out on message bubble
        audioPlayerContainer.style.cssText = 'display: flex; align-items: center; background-color: #424242; padding: 8px 12px; border-radius: 24px; margin-top: 8px; width: fit-content; max-width: 100%; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: background-color 0.3s ease;';

        // Create the play button
        const playButton = document.createElement('button');
        playButton.className = 'mdl-button mdl-js-button mdl-button--icon';
        playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
        // Ensure icon is visible (white) on dark background
        playButton.style.color = 'white';

        // Create progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'audio-progress-container';
        // Dark theme: Darker background for the progress track
        progressContainer.style.cssText = 'flex: 1; height: 4px; background-color: #4a4a4a; border-radius: 2px; position: relative; margin: 0 10px; cursor: pointer;';

        // Create progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'audio-progress-bar';
        // Dark theme: Purple accent is good, maybe slightly brighter? Keeping existing for now.
        progressBar.style.cssText = 'width: 0%; height: 100%; background-color: #7c4dff; border-radius: 2px; position: absolute;';
        progressContainer.appendChild(progressBar);

        // Live waveform — a small "vocal-cord vibration" visualizer between the controls and the
        // time. Bars react to the audio intensity while it plays (and sit idle/flat otherwise).
        const waveformCanvas = document.createElement('canvas');
        waveformCanvas.className = 'audio-waveform-canvas';
        waveformCanvas.width = 132;   // hi-dpi backing store; CSS scales it down for crispness
        waveformCanvas.height = 44;
        waveformCanvas.style.cssText = 'width: 66px; height: 22px; margin: 0 8px; flex: 0 0 auto; opacity: 0.95;';

        const WAVE_BARS = 16;
        const WAVE_ACCENT = '#b39dff';
        function drawWaveBars(values) {
            const ctx = waveformCanvas.getContext('2d');
            if (!ctx) return;
            const W = waveformCanvas.width, H = waveformCanvas.height;
            ctx.clearRect(0, 0, W, H);
            const slot = W / values.length;
            const bw = Math.max(2, slot * 0.55);
            ctx.fillStyle = WAVE_ACCENT;
            for (let i = 0; i < values.length; i++) {
                const v = Math.max(0, Math.min(1, values[i]));
                const bh = Math.max(2, v * (H - 2));
                const x = i * slot + (slot - bw) / 2;
                const y = (H - bh) / 2;
                ctx.fillRect(x, y, bw, bh);
            }
        }
        function idleBars() { return new Array(WAVE_BARS).fill(0.07); }

        audioPlayerContainer._waveformCanvas = waveformCanvas;
        audioPlayerContainer._startWaveform = function (analyser) {
            if (!analyser || typeof analyser.getByteFrequencyData !== 'function') return;
            let data;
            try { data = new Uint8Array(analyser.frequencyBinCount); } catch (e) { return; }
            const self = this;
            const frame = function () {
                if (!self.isPlaying) { self._stopWaveform(); return; }
                analyser.getByteFrequencyData(data);
                const vals = [];
                for (let b = 0; b < WAVE_BARS; b++) {
                    const idx = Math.floor((b / WAVE_BARS) * data.length);
                    vals.push((data[idx] || 0) / 255);
                }
                drawWaveBars(vals);
                self._waveformRAF = requestAnimationFrame(frame);
            };
            if (self._waveformRAF) cancelAnimationFrame(self._waveformRAF);
            self._waveformRAF = requestAnimationFrame(frame);
        };
        audioPlayerContainer._stopWaveform = function () {
            if (this._waveformRAF) { cancelAnimationFrame(this._waveformRAF); this._waveformRAF = null; }
            drawWaveBars(idleBars());
        };
        // Draw a set of bar values directly. Used by the LIVE incoming-audio driver so the waveform
        // also dances while a Gemini reply is streaming in (not only when you replay it).
        audioPlayerContainer._renderWaveBars = function (values) {
            drawWaveBars(values && values.length ? values : idleBars());
        };
        audioPlayerContainer._waveformBarCount = WAVE_BARS;
        drawWaveBars(idleBars());   // idle state on creation

        // Create time display
        const timeDisplay = document.createElement('div');
        timeDisplay.className = 'audio-time-display';
        // Dark theme: Light text
        timeDisplay.style.cssText = 'font-size: 12px; color: #e0e0e0; min-width: 80px; text-align: center; font-family: monospace;';
        timeDisplay.textContent = '00:00.0 / 00:00.0';

        // Create volume control
        const volumeSlider = document.createElement('input');
        volumeSlider.type = 'range';
        volumeSlider.className = 'volume-slider';
        volumeSlider.min = '0';
        volumeSlider.max = '1';
        volumeSlider.step = '0.1';
        volumeSlider.value = '1';
        volumeSlider.style.cssText = 'width: 60px; margin-left: 10px; accent-color: #7c4dff;';

        // Create playback speed selector
        const speedSelector = document.createElement('select');
        speedSelector.className = 'playback-speed-selector';
        // Dark theme: Dark background, light text, subtle border
        speedSelector.style.cssText = 'margin-left: 10px; height: 24px; background-color: #333; color: #fff; border: 1px solid #555; border-radius: 3px; padding: 0 5px; font-size: 12px;';

        // Add speed options
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        speeds.forEach(speed => {
            const option = document.createElement('option');
            option.value = speed;
            option.textContent = speed + 'x';
            if (speed === 1) option.selected = true;
            speedSelector.appendChild(option);
        });

        // Add all elements to the container
        audioPlayerContainer.appendChild(playButton);
        audioPlayerContainer.appendChild(progressContainer);
        audioPlayerContainer.appendChild(waveformCanvas);
        audioPlayerContainer.appendChild(timeDisplay);
        audioPlayerContainer.appendChild(volumeSlider);
        audioPlayerContainer.appendChild(speedSelector);

        // Store the audio data in the container
        audioPlayerContainer.audioData = audioData;

        // Return object with all components for easy access (avoids querySelector later)
        return {
            container: audioPlayerContainer,
            playButton: playButton,
            progressContainer: progressContainer,
            progressBar: progressBar,
            timeDisplay: timeDisplay,
            volumeSlider: volumeSlider,
            speedSelector: speedSelector
        };
    }
};
