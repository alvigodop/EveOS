/**
 * Page Freeze Notifications - UI Component
 * 
 * Handles UI element creation for notifications and recovery options.
 * 
 * @version 1.0.0
 */

const PFNUI = {
    /**
     * Create notification element
     * @param {string} message - Message to display
     * @param {Object} colors - Color scheme {bg, text}
     */
    createNotification: function (message, colors) {
        const notification = document.createElement('div');
        notification.id = 'freeze-recovery-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: ${colors.bg};
            color: ${colors.text};
            padding: 10px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 999999;
            max-width: 80%;
            text-align: center;
            animation: freezeNotificationSlideIn 0.3s ease;
        `;
        notification.innerHTML = message;

        // Add close button
        const closeButton = document.createElement('span');
        closeButton.innerHTML = '&times;';
        closeButton.style.cssText = `
            margin-left: 15px;
            cursor: pointer;
            font-weight: bold;
            font-size: 20px;
        `;
        closeButton.onclick = function () {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
        };
        notification.appendChild(closeButton);

        return notification;
    },

    /**
     * Create recovery options modal
     * @param {Function} callbacks - Callback functions
     * @param {string} technicalDetails - Technical details to display
     */
    createRecoveryOptions: function (callbacks, technicalDetails) {
        const options = document.createElement('div');
        options.id = 'freeze-recovery-options';
        options.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: white;
            color: #333;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 9999999;
            max-width: 400px;
            width: 90%;
            text-align: center;
            animation: freezeOptionsSlideIn 0.3s ease;
        `;

        options.innerHTML = `
            <h3 style="margin-top:0;color:#d32f2f;">Page Recovery Required</h3>
            <p>The page has become unresponsive multiple times. Please choose an option:</p>
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:15px;">
                <button id="freeze-recovery-reset" style="padding:10px;background:#2196F3;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
                    Reset Page State
                </button>
                <button id="freeze-recovery-reload" style="padding:10px;background:#FF9800;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
                    Reload Page
                </button>
                <button id="freeze-recovery-close" style="padding:10px;background:#9E9E9E;color:white;border:none;border-radius:4px;cursor:pointer;">
                    Dismiss
                </button>
            </div>
            ${technicalDetails ? `<p style="margin-top:15px;font-size:12px;color:#666;">Technical details: ${technicalDetails}</p>` : ''}
        `;

        // Add event listeners
        setTimeout(() => {
            const resetBtn = options.querySelector('#freeze-recovery-reset');
            const reloadBtn = options.querySelector('#freeze-recovery-reload');
            const closeBtn = options.querySelector('#freeze-recovery-close');

            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    if (callbacks.onReset) callbacks.onReset();
                    if (options.parentNode) options.parentNode.removeChild(options);
                });
            }

            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => {
                    if (callbacks.onReload) callbacks.onReload();
                    else window.location.reload();
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    if (callbacks.onDismiss) callbacks.onDismiss();
                    if (options.parentNode) options.parentNode.removeChild(options);
                });
            }
        }, 0);

        return options;
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('PFNUI', PFNUI);
}

window.PFNUI = PFNUI;
