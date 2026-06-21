// js/modules/gemini/audio_seeking_operations/audioSeeker.js

// Function to seek to a specific position in the audio
async function seekAudio(container, position, playButton, progressBar, timeDisplay) {
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToArrayBufferLocal(base64) {
        if (typeof window.base64ToArrayBuffer === 'function') {
            return window.base64ToArrayBuffer(base64);
        }
        if (window.Base64PlayerCore?.BufferHandler?.base64ToArrayBuffer) {
            return window.Base64PlayerCore.BufferHandler.base64ToArrayBuffer(base64);
        }
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

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
        
        const suppress = window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.() === true;

        // Set up gain node for volume control if needed
        if (suppress || container.volume !== undefined || container.querySelector('.volume-slider')) {
            // Get volume value from slider or use stored value
            const volumeSlider = container.querySelector('.volume-slider');
            const volumeValue = suppress ? 0 : (container.volume !== undefined ? container.volume : 
                               (volumeSlider ? parseFloat(volumeSlider.value) : 1));
            
            // Create gain node if it doesn't exist
            if (!container.gainNode) {
                container.gainNode = container.audioContext.createGain();
            }
            
            // Set gain value
            container.gainNode.gain.value = volumeValue;
            console.log(`Setting volume to ${volumeValue} (seek, suppress: ${suppress})`);
            
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
            if (suppress && container.audioData) {
                try {
                    const rawBuffer = base64ToArrayBufferLocal(container.audioData);
                    const totalBytes = rawBuffer.byteLength;
                    let seekByteIndex = Math.floor(position * totalBytes);
                    // Align to 2-byte boundary (16-bit PCM samples)
                    seekByteIndex = seekByteIndex - (seekByteIndex % 2);
                    
                    if (seekByteIndex < totalBytes) {
                        const slicedBuffer = rawBuffer.slice(seekByteIndex);
                        const slicedBase64 = arrayBufferToBase64(slicedBuffer);
                        
                        const nativeHandled = await window.EveAudioflixNative.sendGeminiChunk(slicedBase64, {
                            kind: 'replay',
                            sampleRate: 24000,
                            channels: 1
                        });
                        console.log("[audioSeeker] Native seek replay sent, handled:", nativeHandled);
                    }
                } catch (nativeError) {
                    console.warn("[audioSeeker] Native seek playback failed:", nativeError);
                }
            }

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