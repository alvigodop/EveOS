// Logic for setting up audio source nodes and gain
window.AudioSourceConfigurator = window.AudioSourceConfigurator || {};

window.AudioSourceConfigurator.setupSourceAndGain = function (container, audioBuffer) {
    // Create a new audio source
    const source = container.audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Set playback rate if specified
    if (container.playbackRate) {
        source.playbackRate.value = container.playbackRate;
        console.log(`Setting playback rate to ${container.playbackRate}x`);
    } else {
        // Reset playback rate to default if not set (or keep at 1)
        source.playbackRate.value = 1.0;
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
        source.connect(container.gainNode);
        container.gainNode.connect(container.audioContext.destination);
    } else {
        // Connect directly to destination if no volume control
        source.connect(container.audioContext.destination);
    }

    return source;
};
