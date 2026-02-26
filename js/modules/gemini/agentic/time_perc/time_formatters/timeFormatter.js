// js/modules/gemini/Time_Perception_Agentic/time_formatters/timeFormatter.js

(function () {
    // Format seconds into MM:SS.mss string
    function formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) return "00:00";
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        // Add milliseconds for better precision on short clips
        const milliseconds = Math.floor((seconds % 1) * 10); // Show tenths of a second
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds}`;
    }

    // Expose functionality to the TimePerceptionAgentic global object
    window.TimePerceptionAgentic.formatTime = formatTime;
})(); 