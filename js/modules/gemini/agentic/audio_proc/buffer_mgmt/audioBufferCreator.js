function createAudioBufferFromPCM(arrayBuffer, audioContext) {
    // Convert Int16 PCM data to Float32
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }

    // Create an audio buffer (mono, 24kHz)
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);

    // Copy the float32 data to the buffer
    audioBuffer.getChannelData(0).set(float32Array);

    return audioBuffer;
} 