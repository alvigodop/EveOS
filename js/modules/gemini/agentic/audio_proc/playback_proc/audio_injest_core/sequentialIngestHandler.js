/**
 * sequentialIngestHandler.js
 * Handles audio ingestion when sequential playback is enabled.
 */

window.AudioIngestCore = window.AudioIngestCore || {};

window.AudioIngestCore.SequentialIngestHandler = {
    handleSequentialIngest: async function (audioData, isInterim = false) {
        console.log(`[SequentialIngestHandler] Queuing audio chunk. isInterim: ${isInterim}`);

        // We typically need to create a UI container for the queue item,
        // or re-use a global one.
        // For now, we will create a "virtual" container or reuse the last known container if possible.
        // Or better, we assume the main UI will handle the display, and we just queue the data.

        // HOWEVER, the legacy logic created a whole UI row if one didn't exist.
        // To keep this pure, we should probably interact with a Queue Manager.

        if (window.audioQueue) {
            // Ensure we have a valid container and control refs for the queued item.
            let container = null;
            let playButton = null;
            let progressBar = null;
            let timeDisplay = null;

            try {
                // Try to reuse the last message's audio container if present
                const lastMsg = document.querySelector('.message-container:last-child .message');
                if (lastMsg) {
                    const found = lastMsg.querySelector('.audio-player-container');
                    if (found) {
                        container = found;
                        playButton = found.querySelector('button');
                        progressBar = found.querySelector('.audio-progress-bar');
                        timeDisplay = found.querySelector('.audio-time');
                    }
                }

                // If no existing container, create one using public API if available
                if (!container && typeof createAudioPlayer === 'function') {
                    const created = createAudioPlayer(lastMsg || document.body);
                    if (created) {
                        if (created.container && created.container instanceof HTMLElement) {
                            container = created.container;
                            playButton = created.playButton || created.container.querySelector('button');
                            progressBar = created.progressBar || created.container.querySelector('.audio-progress-bar');
                            timeDisplay = created.timeDisplay || created.container.querySelector('.audio-time');
                        } else if (created instanceof HTMLElement) {
                            container = created;
                            playButton = container.querySelector && container.querySelector('button');
                            progressBar = container.querySelector && container.querySelector('.audio-progress-bar');
                            timeDisplay = container.querySelector && container.querySelector('.audio-time');
                        }
                    }
                }
            } catch (e) {
                console.warn('[SequentialIngestHandler] Error finding/creating container:', e);
            }

            // Push a complete item with UI refs (may be null but better attempt)
            window.audioQueue.push({
                audioData: audioData,
                format: 'audio/pcm',
                isInterim: isInterim,
                container: container,
                playButton: playButton,
                progressBar: progressBar,
                timeDisplay: timeDisplay
            });

            console.log(`[SequentialIngestHandler] Pushed to queue. Queue length: ${window.audioQueue.length}`);

            // Start playing if not already
            if (!window.isPlayingFromQueue && typeof window.playNextInQueue === 'function') {
                console.log("[SequentialIngestHandler] Triggering playback.");
                window.playNextInQueue();
            }
        } else {
            console.error("[SequentialIngestHandler] window.audioQueue is not defined!");
        }
    }
};

console.log("sequentialIngestHandler.js loaded.");
