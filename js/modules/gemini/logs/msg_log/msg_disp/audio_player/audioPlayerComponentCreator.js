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
