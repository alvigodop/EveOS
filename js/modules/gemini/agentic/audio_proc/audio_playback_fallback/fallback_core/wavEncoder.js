/**
 * wavEncoder.js
 * Utility for converting PCM audio data to WAV format.
 */

window.FallbackAudioCore = window.FallbackAudioCore || {};

// Helper function to create WAV file from PCM data
window.FallbackAudioCore.createWAVFromPCM = function (pcmBuffer) {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;

    // Convert Float32Array to Int16Array
    const pcmData = new Float32Array(pcmBuffer);
    const int16Data = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
        int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(pcmData[i] * 32767)));
    }

    const byteLength = int16Data.length * 2;
    const buffer = new ArrayBuffer(44 + byteLength);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + byteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, byteLength, true);

    // PCM data
    const dataOffset = 44;
    for (let i = 0; i < int16Data.length; i++) {
        view.setInt16(dataOffset + i * 2, int16Data[i], true);
    }

    return buffer;
};

console.log("wavEncoder.js loaded.");
