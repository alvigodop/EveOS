// audioProgressTracker.js - Handles audio progress tracking

function startProgressTracking(container) {
    console.log("Starting progress tracking");
    
    // Clear any existing interval
    if (container.progressInterval) {
        clearInterval(container.progressInterval);
        container.progressInterval = null;
    }
} 