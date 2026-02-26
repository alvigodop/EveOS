/**
 * audioBufferHandler.js
 * Handles the conversion of base64 data to ArrayBuffer and the creation of AudioBuffer.
 */

window.Base64PlayerCore = window.Base64PlayerCore || {};

window.Base64PlayerCore.BufferHandler = {
    // Convert base64 string to ArrayBuffer
    base64ToArrayBuffer: function (base64) {
        // Use global helper if available, otherwise implement it or assume it's available
        if (typeof base64ToArrayBuffer === 'function') {
            return base64ToArrayBuffer(base64);
        }

        // Inline fallback just in case (though it should be global)
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    },

    createAudioBuffer: function (arrayBuffer, context) {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error("Audio buffer is empty");
        }

        let audioBuffer;
        try {
            // Using global helper function
            if (typeof createAudioBufferFromPCM === 'function') {
                audioBuffer = createAudioBufferFromPCM(arrayBuffer, context);
            } else {
                throw new Error("createAudioBufferFromPCM global function not found");
            }

            if (!audioBuffer || audioBuffer.duration === 0) {
                throw new Error("Created audio buffer is invalid or empty");
            }
            return audioBuffer;

        } catch (error) {
            throw error; // Re-throw to be handled by coordinator (potentially triggering fallback)
        }
    }
};

console.log("audioBufferHandler.js loaded.");
