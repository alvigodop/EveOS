/**
 * Error Notifier UI Renderer
 * Handles the DOM creation and styles for error notifications.
 */
const ErrorNotifierUIRenderer = {
    /**
     * Initialize the UI styles
     */
    init: function () {
        this._createStyles();
    },

    /**
     * Create CSS styles for notifications
     * @private
     */
    _createStyles: function () {
        if (document.getElementById('error-notifier-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'error-notifier-styles';

        // Use external styles if available
        if (window.ErrorNotifierStyles && typeof ErrorNotifierStyles.getStyles === 'function') {
            style.textContent = ErrorNotifierStyles.getStyles();
        } else {
            console.warn('ErrorNotifierStyles module not found, styles may be missing');
            style.textContent = '';
        }

        document.head.appendChild(style);
    },

    /**
     * Render the notification element
     * @param {Object} options - Configuration options
     * @returns {HTMLElement} The notification element
     */
    render: function (options) {
        const { title, message, tips = [], onFix, fixText = 'Fix Issue', autoHide = 0 } = options;

        // Create notification container if it doesn't exist
        this.ensureContainer();

        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'error-notification';

        // Create header
        const header = document.createElement('div');
        header.className = 'error-notification-header';

        const titleEl = document.createElement('h3');
        titleEl.textContent = title || 'Error';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'error-notification-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => {
            notification.classList.add('error-notification-hiding');
            setTimeout(() => {
                notification.remove();
            }, 300);
        });

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Create content
        const content = document.createElement('div');
        content.className = 'error-notification-content';

        const messageEl = document.createElement('p');
        messageEl.className = 'error-notification-message';
        messageEl.textContent = message || 'An error occurred.';
        content.appendChild(messageEl);

        // Add troubleshooting tips
        if (tips && tips.length > 0) {
            const tipsList = document.createElement('ul');
            tipsList.className = 'error-notification-tips';

            tips.forEach(tip => {
                const tipItem = document.createElement('li');
                tipItem.textContent = tip;
                tipsList.appendChild(tipItem);
            });

            content.appendChild(tipsList);
        }

        // Add actions
        const actions = document.createElement('div');
        actions.className = 'error-notification-actions';

        if (onFix) {
            const fixButton = document.createElement('button');
            fixButton.className = 'error-notification-fix';
            fixButton.textContent = fixText;
            fixButton.addEventListener('click', () => {
                const result = onFix();

                // Show result if available
                if (result && typeof result === 'string') {
                    messageEl.textContent = result;
                    // Hide tips
                    const tipsList = notification.querySelector('.error-notification-tips');
                    if (tipsList) {
                        tipsList.style.display = 'none';
                    }
                    // Disable fix button after use
                    fixButton.disabled = true;
                    fixButton.textContent = 'Applied';
                }
            });

            actions.appendChild(fixButton);
        }

        // Assemble notification
        notification.appendChild(header);
        notification.appendChild(content);
        notification.appendChild(actions);

        // Add to container
        document.getElementById('error-notifier-container').appendChild(notification);

        // Auto-hide after delay if specified
        if (autoHide > 0) {
            setTimeout(() => {
                notification.classList.add('error-notification-hiding');
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }, autoHide);
        }

        // Force reflow for animation
        notification.offsetHeight;
        notification.classList.add('error-notification-visible');

        return notification;
    },

    /**
     * Ensure the notification container exists
     */
    ensureContainer: function () {
        if (!document.getElementById('error-notifier-container')) {
            const container = document.createElement('div');
            container.id = 'error-notifier-container';
            document.body.appendChild(container);
        }
    }
};

window.ErrorNotifierUIRenderer = ErrorNotifierUIRenderer;
