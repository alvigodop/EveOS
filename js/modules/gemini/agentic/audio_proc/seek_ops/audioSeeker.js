// js/modules/gemini/audio_seeking_operations/audioSeeker.js

// Function to seek to a specific position in the audio
function seekAudio(container, position, playButton, progressBar, timeDisplay) {
    console.log(`Seeking to position: ${position * 100}%`);
    
    // Immediately update the progress bar for visual feedback
    progressBar.style.width = `${position * 100}%`;
    
    if (!container.audioBuffer) {
        // If we don't have a buffer yet, load the audio first
        const audioData = container.audioData;
        const audioFormat = 'audio/pcm';
        if (audioData) {
            playAudioFromBase64(container, audioData, audioFormat, playButton, progressBar, timeDisplay);
            return;
        }
        return;
    }
    
    // Mark all other audio players for stopping
    const allContainers = document.querySelectorAll('.audio-player-container');
    allContainers.forEach(otherContainer => {
        if (otherContainer !== container && otherContainer.isPlaying) {
            otherContainer.needsToStop = true;
            if (!otherContainer.isStartingPlayback) {
                stopAudioPlayback(otherContainer);
            }
        }
    });
    
    // Mark we're starting a playback
    container.isStartingPlayback = true;
    
    // Stop current playback if it exists
    if (container.audioSource) {
        try {
            container.audioSource.stop();
        } catch (e) {
            console.error('Error stopping audio source:', e);
        }
        container.audioSource = null;
    }
    
    // If we were asked to stop, don't continue
    if (container.needsToStop) {
        console.log("Seek canceled - container marked to stop");
        container.isStartingPlayback = false;
        container.needsToStop = false;
        container.isPlaying = false;
        playButton.querySelector('i').textContent = 'play_arrow';
        return;
    }
    
    try {
        // Create a new source
        const newSource = container.audioContext.createBufferSource();
        newSource.buffer = container.audioBuffer;
        
        // Set playback rate if specified
        if (container.playbackRate) {
            newSource.playbackRate.value = container.playbackRate;
            console.log(`Setting playback rate to ${container.playbackRate}x`);
        }
        
        // Set up gain node for volume control if needed
        if (container.volume !== undefined || container.querySelector('.volume-slider')) {
            // Get volume value from slider or use stored value
            const volumeSlider = container.querySelector('.volume-slider');
            const volumeValue = container.volume !== undefined ? container.volume : 
                               (volumeSlider ? parseFloat(volumeSlider.value) : 1);
            
            // Create gain node if it doesn't exist
            if (!container.gainNode) {
                container.gainNode = container.audioContext.createGain();
            }
            
            // Set gain value
            container.gainNode.gain.value = volumeValue;
            console.log(`Setting volume to ${volumeValue}`);
            
            // Connect source to gain node, then to destination
            newSource.connect(container.gainNode);
            container.gainNode.connect(container.audioContext.destination);
        } else {
            // Connect directly to destination if no volume control
            newSource.connect(container.audioContext.destination);
        }
        
        // Calculate seek time in seconds
        const duration = container.audioDuration;
        const seekTime = position * duration;
        
        // Update time display
        if (duration) {
            timeDisplay.textContent = `${formatTime(seekTime)} / ${formatTime(duration)}`;
        }
        
        // Store references to UI elements for easier access
        container.progressBar = progressBar;
        container.timeDisplay = timeDisplay;
        container.playButton = playButton;
        
        // Check again if we should stop
        if (container.needsToStop) {
            console.log("Seek canceled during setup - container marked to stop");
            container.isStartingPlayback = false;
            container.needsToStop = false;
            container.isPlaying = false;
            playButton.querySelector('i').textContent = 'play_arrow';
            return;
        }
        
        // Store when we started and where
        container.playbackStartTime = container.audioContext.currentTime;
        container.playbackStartPosition = position;
        
        console.log(`Starting playback at position: ${position}, time: ${seekTime}s, duration: ${duration}s`);
        
        try {
            // Start playback from the new position
            newSource.start(0, seekTime);
            
            // Update source reference and state
            container.audioSource = newSource;
            container.isPlaying = true;
            
            // Cancel any existing animation frame
            if (container.animationFrame) {
                cancelAnimationFrame(container.animationFrame);
                container.animationFrame = null;
            }
            
            // Start progress updates using our helper function
            startProgressUpdates(container);
            
            // Update play button icon
            playButton.querySelector('i').textContent = 'pause';
            
            // When playback ends
            newSource.onended = function() {
                console.log("Audio playback ended");
                playButton.querySelector('i').textContent = 'play_arrow';
                if (container.animationFrame) {
                    cancelAnimationFrame(container.animationFrame);
                    container.animationFrame = null;
                }
                progressBar.style.width = '0%';
                timeDisplay.textContent = `00:00 / ${formatTime(duration)}`;
                container.audioSource = null;
                container.isPlaying = false;
                container.isStartingPlayback = false;
            };
        } catch (error) {
            console.error('Error starting audio playback:', error);
            playButton.querySelector('i').textContent = 'play_arrow';
            container.isPlaying = false;
            container.isStartingPlayback = false;
            container.needsToStop = false;
        }
        
        // Clear starting playback flag after a short delay
        setTimeout(() => {
            container.isStartingPlayback = false;
            // Check if we were asked to stop during playback start
            if (container.needsToStop) {
                console.log("Playback was cancelled during start");
                stopAudioPlayback(container);
                container.needsToStop = false;
            }
        }, 100);
        
    } catch (error) {
        console.error('Error seeking audio:', error);
        displayMessage(`System Message: Error seeking audio - ${error.message}`, true);
        
        // Reset UI and flags
        playButton.querySelector('i').textContent = 'play_arrow';
        container.isPlaying = false;
        container.isStartingPlayback = false;
        container.needsToStop = false;
    }
} 