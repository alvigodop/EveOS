// Paced voice sender to avoid sending entire audio to server before playback completes
window.VoiceSender = window.VoiceSender || (function () {
    const queue = [];
    let running = false;
    let paceFactor = 4.0; // multiplier: >1 slows sending (larger => slower)
    let paceMode = 'conservative'; // 'normal' or 'conservative'
    let minIntervalMs = 700; // enforce at least this ms between sends as an extra guard

    function decodeBase64ToPCM(b64) {
        try {
            const binary = atob(b64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            return bytes.buffer;
        } catch (e) {
            console.error('Failed to decode base64 PCM', e);
            return null;
        }
    }

    function estimateDurationSecondsFromPCMBuffer(buffer, sampleRate = 16000, bytesPerSample = 2, channels = 1) {
        if (!buffer) return 0;
        const byteLen = buffer.byteLength;
        const sampleCount = byteLen / (bytesPerSample * channels);
        return sampleCount / sampleRate;
    }

    async function processQueue() {
        if (running) return;
        running = true;
        while (queue.length > 0) {
            const item = queue.shift();
            const { b64, resolve, reject } = item;
            try {
                if (window.webSocket == null || window.webSocket.readyState !== WebSocket.OPEN) {
                    console.warn('websocket not open, aborting send');
                    reject && reject(new Error('websocket not open'));
                    continue;
                }

                // Estimate duration and apply pacing before next send
                const buffer = decodeBase64ToPCM(b64);
                const duration = estimateDurationSecondsFromPCMBuffer(buffer, 16000, 2, 1);

                // Attach a monotonic client-side sequence number so server can ACK
                window._clientAudioSeq = (window._clientAudioSeq || 0) + 1;
                const seq = window._clientAudioSeq;
                const payload = {
                    realtime_input: {
                        media_chunks: [{ mime_type: 'audio/pcm', data: b64, seq: seq }]
                    }
                };

                window.webSocket.send(JSON.stringify(payload));
                console.log('VoiceSender: sent chunk seq=', seq, 'estDuration=', duration.toFixed(3), 's');

                // Wait for server ACK for this seq before sending next (timeout fallback)
                const ackPromise = new Promise((ackResolve, ackReject) => {
                    window._pendingAudioAcks = window._pendingAudioAcks || {};
                    window._pendingAudioAcks[seq] = ackResolve;
                    // Timeout after 10000ms to avoid deadlock (longer to allow slow networks)
                    const t = setTimeout(() => {
                        delete window._pendingAudioAcks[seq];
                        ackReject(new Error('ACK timeout'));
                    }, 5000);
                    // wrap ackResolve to clear timeout
                    const originalResolve = ackResolve;
                    window._pendingAudioAcks[seq] = (v) => { clearTimeout(t); originalResolve(v); };
                });

                try {
                    await ackPromise;
                    console.log('VoiceSender: received ACK for seq', seq);
                } catch (ackErr) {
                    console.warn('VoiceSender: ACK not received for seq', seq, '- falling back to timed pacing', ackErr);
                    let waitMs;
                    if (paceMode === 'conservative') {
                        waitMs = Math.max(500, Math.round(duration * 1000 * paceFactor) + 500);
                    } else {
                        waitMs = Math.max(200, Math.round(duration * 1000 * paceFactor));
                    }
                    // Respect the global minInterval guard
                    waitMs = Math.max(waitMs, minIntervalMs);
                    await new Promise(r => setTimeout(r, waitMs));
                }

                resolve && resolve();
            } catch (err) {
                console.error('VoiceSender send error', err);
                reject && reject(err);
            }
        }
        running = false;
    }

    return {
        send: function (b64PCM) {
            return new Promise((resolve, reject) => {
                queue.push({ b64: b64PCM, resolve, reject });
                processQueue().catch(e => console.error('VoiceSender processQueue failed', e));
            });
        },
        setPaceFactor: function (f) { paceFactor = Math.max(0.1, Number(f) || 1.0); },
        setPaceMode: function(m) { paceMode = (m === 'conservative') ? 'conservative' : 'normal'; },
        setMinInterval: function(ms) { minIntervalMs = Math.max(0, Number(ms) || 0); },
        cancelPending: function () { queue.length = 0; },
        _debugQueueLength: function () { return queue.length; }
    };
})();

function sendVoiceMessage(b64PCM) {
    // Default to paced sending to avoid server receiving audio too early
    VoiceSender.send(b64PCM).catch(e => console.error('sendVoiceMessage failed', e));
}

// Expose a quicker direct send for debugging or when immediate upload is required
function sendVoiceMessageImmediate(b64PCM) {
    if (webSocket == null || webSocket.readyState !== WebSocket.OPEN) {
        console.log('websocket not initialized or not open');
        return;
    }
    const payload = { realtime_input: { media_chunks: [{ mime_type: 'audio/pcm', data: b64PCM }] } };
    webSocket.send(JSON.stringify(payload));
    console.log('sent voice message (immediate)');
}

// Allow external control
window.sendVoiceMessageImmediate = sendVoiceMessageImmediate;
window.sendVoiceMessage = sendVoiceMessage;