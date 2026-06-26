// js/modules/gemini/audio_playback_controls/audioPlaybackStopper.js

function stopAudioPlayback(container) {
    if (!container) return;
    try {
        console.log(`[stopAudioPlayback] Stopping container`, container);
    } catch (e) { console.log('[stopAudioPlayback] Stopping container (log failed)'); }

    // Cancel animation frame first
    if (container.animationFrame) {
        cancelAnimationFrame(container.animationFrame);
        container.animationFrame = null;
    }

    // Then stop the audio source
    if (container.audioSource) {
        try {
            console.log('[stopAudioPlayback] Calling audioSource.stop()');
            container.audioSource.stop();
        } catch (e) {
            console.error('Error stopping audio source:', e);
        }
        container.audioSource = null;
    }

    // Reset position tracking
    container.playbackStartPosition = 0;

    // Update UI elements
    const progressBar = container.progressBar || container.querySelector('.audio-progress-bar');
    if (progressBar) {
        progressBar.style.width = '0%';
    }

    const timeDisplay = container.timeDisplay || container.querySelector('.audio-time');
    if (timeDisplay && container.audioDuration) {
        // formatTime is expected to be globally available from timeFormatter.js
        timeDisplay.textContent = `${formatTime(container.audioDuration)} / ${formatTime(container.audioDuration)}`;
    } else if (timeDisplay) {
        timeDisplay.textContent = '00:00 / 00:00';
    }

    const playButton = container.playButton || container.querySelector('button');
    if (playButton && playButton.querySelector('i')) {
        playButton.querySelector('i').textContent = 'play_arrow';
    }

    // Settle the live waveform back to idle.
    if (typeof container._stopWaveform === 'function') {
        try { container._stopWaveform(); } catch (e) { /* visualizer optional */ }
    }

    // Reset all flags
    container.isPlaying = false;
    container.isStartingPlayback = false;
    container.needsToStop = false;
}

function stopAllAudioPlayback() {
    // Stop any audio player containers
    const containers = document.querySelectorAll('.audio-player-container');
    console.log(`[stopAllAudioPlayback] Found ${containers.length} containers`);
    containers.forEach(container => {
        if (container.isPlaying) {
            console.log('[stopAllAudioPlayback] Stopping playing container');
            stopAudioPlayback(container);
        }
    });

    // Stop the interim audio scheduler and active sources
    if (window.AudioIngestCore && window.AudioIngestCore.InterimIngestHandler) {
        window.AudioIngestCore.InterimIngestHandler.stopAll();
    }

    // Stop the worklet audio if it exists
    // audioInputContext and workletNode are expected to be global, managed by audioContextManager.js
    if (typeof audioInputContext !== 'undefined' && audioInputContext && typeof workletNode !== 'undefined' && workletNode) {
        try {
            workletNode.port.postMessage({ command: 'stop' });
        } catch (e) {
            console.error('Error stopping worklet:', e);
        }
    }

    // Stop any current source in fallback mode
    if (typeof audioInputContext !== 'undefined' && audioInputContext && audioInputContext.currentSource) {
        try {
            audioInputContext.currentSource.stop();
            audioInputContext.currentSource = null;
        } catch (e) {
            console.error('Error stopping current source:', e);
        }
    }

    // Clear the audio queue and reset queue state
    // audioQueue and isPlayingFromQueue are expected to be global, managed by audioQueueManager.js
    if (typeof audioQueue !== 'undefined') {
        audioQueue = [];
    }
    if (typeof isPlayingFromQueue !== 'undefined') {
        isPlayingFromQueue = false;
    }
}
