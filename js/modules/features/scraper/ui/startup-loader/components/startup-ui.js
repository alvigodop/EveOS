/**
 * Startup UI Component
 * Handles the visual loading overlay and progress bar
 */
const StartupUI = {};

/**
 * Create loading overlay if it doesn't exist
 * DISABLED: Page loads instantly without loading screen
 */
StartupUI.createLoadingOverlay = function () {
    // DISABLED - skip the loading overlay for instant page load
    return;
};

/**
 * Add styles for the overlay
 */
StartupUI.addOverlayStyles = function () {
    // Check if styles already exist
    if (document.getElementById('startupLoaderStyles')) {
        return;
    }

    // Create style element
    const style = document.createElement('style');
    style.id = 'startupLoaderStyles';

    // Add CSS rules
    style.textContent = `
        .startup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: #f0f0f0;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            transition: opacity 0.5s ease-in-out;
        }
        
        .startup-content {
            text-align: center;
            padding: 2rem;
            max-width: 500px;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .startup-spinner {
            width: 50px;
            height: 50px;
            border: 5px solid rgba(0, 0, 0, 0.1);
            border-left-color: #3498db;
            border-radius: 50%;
            margin: 1rem auto;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .progress-container {
            width: 100%;
            height: 8px;
            background-color: #f0f0f0;
            border-radius: 4px;
            margin: 1rem 0;
            overflow: hidden;
        }
        
        .progress-bar {
            height: 100%;
            width: 0%;
            background-color: #3498db;
            transition: width 0.3s ease;
        }
        
        .module-status {
            font-size: 14px;
            color: #666;
            max-height: 100px;
            overflow-y: auto;
            margin-top: 1rem;
            text-align: left;
        }
        
        .startup-overlay.fade-out {
            opacity: 0;
            pointer-events: none;
        }
    `;

    // Add style to head
    document.head.appendChild(style);
};

/**
 * Show loading message
 * @param {string} message - The message to display
 */
StartupUI.showLoadingMessage = function (message) {
    const messageElement = document.getElementById('loadingMessage');
    if (messageElement) {
        messageElement.textContent = message;
    }
};

/**
 * Update progress bar
 * @param {number} percentage - The percentage (0-100) to set the progress bar to
 */
StartupUI.updateProgressBar = function (percentage) {
    const progressBar = document.getElementById('loadingProgressBar');
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
};

/**
 * Hide loading overlay
 */
StartupUI.hideLoadingOverlay = function () {
    const overlay = document.getElementById('startupOverlay');
    if (overlay) {
        overlay.classList.add('fade-out');

        // Remove overlay after transition
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 500);
    }
};

/**
 * Increment progress bar
 * @param {number} currentProgress - Current progress value
 * @param {number} amount - The amount to increment by
 * @returns {number} - New progress value
 */
StartupUI.incrementProgress = function (currentProgress, amount) {
    let newProgress = currentProgress + amount;

    // Clamp to 90% max (save last 10% for app:ready)
    if (newProgress > 90) {
        newProgress = 90;
    }

    this.updateProgressBar(newProgress);
    return newProgress;
};

/**
 * Start progress animation for initial loading
 * @param {Object} context - Context object containing state (like loadingProgress)
 */
StartupUI.startProgressAnimation = function (context) {
    // Simulate initial loading progress
    setTimeout(() => this.updateProgressBar(10), 100);
    setTimeout(() => this.updateProgressBar(20), 300);
    setTimeout(() => this.updateProgressBar(30), 500);

    // Show module loading steps
    setTimeout(() => this.showLoadingMessage('Loading core modules...'), 600);

    if (window.StartupStatus) {
        setTimeout(() => StartupStatus.addModuleStatus('Starting module initialization'), 700);
    }

    // If modules aren't being detected, simulate some reasonable progress
    context.progressInterval = setInterval(() => {
        if (context.loadingProgress < 80) {
            context.loadingProgress = this.incrementProgress(context.loadingProgress, 2);

            // Update loading message based on progress
            if (context.loadingProgress > 40 && context.loadingProgress < 50) {
                this.showLoadingMessage('Initializing modules...');
            } else if (context.loadingProgress > 60 && context.loadingProgress < 70) {
                this.showLoadingMessage('Setting up application...');
            } else if (context.loadingProgress >= 70) {
                this.showLoadingMessage('Almost ready...');
            }
        } else {
            clearInterval(context.progressInterval);
        }
    }, 500);
};

// Ensure global availability
window.StartupUI = StartupUI;
console.log('[StartupUI] Loaded');
