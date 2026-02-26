/**
 * Page Freeze Notifications - Styles Component
 * 
 * Injects CSS styles for notifications.
 * 
 * @version 1.0.0
 */

const PFNStyles = {
    /**
     * Inject custom styles for notifications
     */
    injectStyles: function () {
        if (!document.getElementById('freeze-notification-keyframes')) {
            const style = document.createElement('style');
            style.id = 'freeze-notification-keyframes';
            style.textContent = `
                @keyframes freezeNotificationSlideIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        if (!document.getElementById('freeze-options-keyframes')) {
            const style = document.createElement('style');
            style.id = 'freeze-options-keyframes';
            style.textContent = `
                @keyframes freezeOptionsSlideIn {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('PFNStyles', PFNStyles);
}

window.PFNStyles = PFNStyles;
