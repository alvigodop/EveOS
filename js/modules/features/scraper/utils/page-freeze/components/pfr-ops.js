/**
 * Page Freeze Recovery - Operations Component
 * 
 * Handles general system operations for recovery (stopping scripts, clearing timers).
 * 
 * @version 1.0.0
 */

const PFROps = {
    /**
     * Stop potentially intensive JavaScript operations
     */
    stopIntensiveOperations() {
        // Stop any animations
        const animations = document.getAnimations ? document.getAnimations() : [];
        animations.forEach(animation => animation.pause());

        // Pause any videos
        document.querySelectorAll('video').forEach(video => {
            if (!video.paused) video.pause();
        });

        // Pause any audio
        document.querySelectorAll('audio').forEach(audio => {
            if (!audio.paused) audio.pause();
        });

        // Cancel any pending animation frames
        let id = window.requestAnimationFrame(() => { });
        while (id--) {
            window.cancelAnimationFrame(id);
        }
    },

    /**
     * Clear timers with IDs over a specified threshold
     * @param {number} threshold - Minimum timer ID to clear
     */
    clearTimersOverThreshold(threshold) {
        let count = 0;
        // 100000 is an arbitrary high number to check, usually safe enough
        for (let i = threshold; i < 100000; i++) {
            clearTimeout(i);
            clearInterval(i);
            count++;
        }
        console.log(`PFROps: Cleared ${count} potential timers`);
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('PFROps', PFROps);
}

window.PFROps = PFROps;
