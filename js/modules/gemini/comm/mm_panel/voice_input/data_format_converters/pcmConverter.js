function convertPCM16LEToFloat32(pcmData) {
    const inputArray = new Int16Array(pcmData);
    const float32Array = new Float32Array(inputArray.length);

    for (let i = 0; i < inputArray.length; i++) {
        float32Array[i] = inputArray[i] / 32768;
    }

    return float32Array;
} 