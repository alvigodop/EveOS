/**
 * Page Freeze Notifications Module (Facade)
 * 
 * Handles UI notifications for page freeze recovery.
 * Delegates to PFNStyles and PFNUI.
 * 
 * @version 1.0.1 (Modularized)
 */

const PageFreezeNotifications = {
    version: '1.0.1',
    _initialized: false,

    /**
     * Initialize the module
     */
    init() {
        if (this._initialized) return this;

        if (window.PFNStyles) {
            PFNStyles.injectStyles();
        } else {
            console.warn('PageFreezeNotifications: PFNStyles not found');
        }

        this._initialized = true;
        return this;
    },

    /**
     * Show recovery notification to the user
     * @param {string} message - Message to display
     * @param {Object} options - Optional configuration
     * @param {number} options.duration - Auto-hide duration in ms (default: 8000, 0 = persistent)
     * @param {string} options.type - Notification type: 'success', 'warning', 'error' (default: 'success')
     */
    showRecoveryNotification(message, options = {}) {
        if (!window.PFNUI) {
            console.error('PageFreezeNotifications: PFNUI missing');
            return null;
        }

        const { duration = 8000, type = 'success' } = options;

        // Remove existing notification if present
        const existingNotification = document.getElementById('freeze-recovery-notification');
        if (existingNotification) {
            existingNotification.parentNode.removeChild(existingNotification);
        }

        // Color schemes based on type
        const colors = {
            success: { bg: '#4CAF50', text: 'white' },
            warning: { bg: '#FF9800', text: 'white' },
            error: { bg: '#f44336', text: 'white' }
        };
        const color = colors[type] || colors.success;

        // Create notification element via delegate
        const notification = PFNUI.createNotification(message, color);

        // Add to document
        document.body.appendChild(notification);

        // Auto-remove after duration (if > 0)
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, duration);
        }

        return notification;
    },

    /**
     * Show manual recovery options when automatic recovery isn't sufficient
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.onReset - Called when reset button clicked
     * @param {Function} callbacks.onReload - Called when reload button clicked
     * @param {Function} callbacks.onDismiss - Called when dismiss button clicked
     * @param {string} technicalDetails - Technical details to display
     */
    showManualRecoveryOptions(callbacks = {}, technicalDetails = '') {
        if (!window.PFNUI) {
            console.error('PageFreezeNotifications: PFNUI missing');
            return null;
        }

        // Remove existing options if present
        const existingOptions = document.getElementById('freeze-recovery-options');
        if (existingOptions) {
            existingOptions.parentNode.removeChild(existingOptions);
        }

        const options = PFNUI.createRecoveryOptions(callbacks, technicalDetails);
        document.body.appendChild(options);

        return options;
    },

    /**
     * Show a floating recovery button
     * @param {Function} onClick - Callback when button is clicked
     * @param {string} text - Button text (default: 'Recover Search')
     */
    showRecoveryButton(onClick, text = 'Recover Search') {
        // Remove existing button if present
        const existingButton = document.getElementById('cse-recovery-button');
        if (existingButton) {
            existingButton.parentNode.removeChild(existingButton);
        }

        const recoveryButton = document.createElement('div');
        recoveryButton.id = 'cse-recovery-button';
        recoveryButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            cursor: pointer;
            z-index: 999999;
            font-weight: bold;
            transition: transform 0.2s, box-shadow 0.2s;
        `;
        recoveryButton.innerHTML = text;
        recoveryButton.onclick = onClick;

        // Add hover effects
        recoveryButton.onmouseenter = () => {
            recoveryButton.style.transform = 'scale(1.05)';
            recoveryButton.style.boxShadow = '0 4px 10px rgba(0,0,0,0.4)';
        };
        recoveryButton.onmouseleave = () => {
            recoveryButton.style.transform = 'scale(1)';
            recoveryButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        };

        document.body.appendChild(recoveryButton);
        return recoveryButton;
    },

    /**
     * Hide the recovery button
     */
    hideRecoveryButton() {
        const button = document.getElementById('cse-recovery-button');
        if (button && button.parentNode) {
            button.parentNode.removeChild(button);
        }
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PageFreezeNotifications.init());
} else {
    PageFreezeNotifications.init();
}

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('PageFreezeNotifications', PageFreezeNotifications);
}

// Expose globally
window.PageFreezeNotifications = PageFreezeNotifications;
