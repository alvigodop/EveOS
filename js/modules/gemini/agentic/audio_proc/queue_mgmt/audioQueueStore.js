console.log("js/modules/gemini/audio_playback_queue_management/audioQueueStore.js started loading");

/**
 * @type {Array<Object>}
 * Queue for sequential audio playback.
 * Each object in the queue typically contains:
 * {
 *   container: HTMLElement,
 *   audioData: string, // base64 audio data
 *   format: string,    // e.g., 'audio/pcm'
 *   playButton: HTMLElement,
 *   progressBar: HTMLElement,
 *   timeDisplay: HTMLElement
 * }
 */
window.audioQueue = [];

/**
 * @type {boolean}
 * Flag to indicate if we're currently playing from the audioQueue.
 */
window.isPlayingFromQueue = false;

console.log("Audio queue state (audioQueue, isPlayingFromQueue) initialized by audioQueueStore.js");
console.log("js/modules/gemini/audio_playback_queue_management/audioQueueStore.js finished loading and initial execution"); 