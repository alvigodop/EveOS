/**
 * iOSAudioUnlock.js
 * 
 * Handles iOS-specific audio unlocking mechanisms.
 */

window.iOSAudioUnlock = {
    unlockIOSAudio: async function () {
        if (window.AudioContextState.iOSAudioUnlocked) return true;

        try {
            console.log("Attempting iOS-specific audio unlock");

            // Create a silent audio element to unlock iOS audio
            if (!window.AudioContextState.emptyAudioElement) {
                window.AudioContextState.emptyAudioElement = document.createElement("audio");
                window.AudioContextState.emptyAudioElement.setAttribute("x-webkit-airplay", "deny");
                window.AudioContextState.emptyAudioElement.preload = "auto";
                window.AudioContextState.emptyAudioElement.loop = false;
                window.AudioContextState.emptyAudioElement.volume = 0;

                // Create a tiny silent audio file (1 second of silence)
                const silentAudioData = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMeR4HO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMeByHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMeBSGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMeBSGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMeBaGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMeBaGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFClGn+DyvmMeBeGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFClGn+DyvmMeBeGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFElGn+DyvmMeBdGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFElGn+DyvmMeBdGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFEpGn+DyvmMeROGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFEpGn+DyvmMeROGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFEpHn+DyvmMeROGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFDpGn+DyvmMeROGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFDpGn+DyvmMeNyGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFDpGn+DyvmMeNyGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFGpGn+DyvmMeNyGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFGpGn+DyvmMeNyGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFGpGn+DyvmMeNyGO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVF";
                window.AudioContextState.emptyAudioElement.src = silentAudioData;
            }

            // Try to play the silent audio to unlock
            const playPromise = window.AudioContextState.emptyAudioElement.play();
            if (playPromise) {
                await playPromise;
            }

            window.AudioContextState.iOSAudioUnlocked = true;
            console.log("iOS audio unlock successful");

            // Also ensure AudioContext is unlocked
            if (window.AudioContextState.audioInputContext) {
                await window.AudioContextState.audioInputContext.resume();
                console.log("AudioContext resumed after iOS unlock");
            }

            return true;
        } catch (error) {
            console.warn("iOS audio unlock failed:", error);
            return false;
        }
    }
};
