/**
 * Cache UI Components - Utilities
 * 
 * Helper functions for Cache UI.
 */
(function () {
    'use strict';

    window.CUIUtils = {
        /**
         * Show a toast notification
         * @param {string} message - The message to display
         * @param {string} type - 'info', 'success', 'warning', or 'error'
         */
        showToast: function (message, type = 'info') {
            // Use HtmlScriptLoader's toast if available (avoid duplication)
            if (window.HtmlScriptLoader && typeof HtmlScriptLoader._showToast === 'function') {
                HtmlScriptLoader._showToast(message, type);
                return;
            }

            const existingToast = document.getElementById('cache-toast');
            if (existingToast) existingToast.remove();

            const toast = document.createElement('div');
            toast.id = 'cache-toast';
            toast.textContent = message;

            const colors = {
                info: { bg: '#2196F3', text: '#fff' },
                success: { bg: '#4CAF50', text: '#fff' },
                warning: { bg: '#FF9800', text: '#000' },
                error: { bg: '#f44336', text: '#fff' }
            };
            const color = colors[type] || colors.info;

            toast.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: ${color.bg};
                color: ${color.text};
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 99999;
                pointer-events: none;
            `;

            document.body.appendChild(toast);

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 3000);
        }
    };

    console.log('[CUIUtils] Loaded');
})();
