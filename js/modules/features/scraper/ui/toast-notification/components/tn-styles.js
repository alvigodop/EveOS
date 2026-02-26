/**
 * Toast Notification - Styles
 * Animation keyframes and position styles
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const TNStyles = {
        version: '1.0.0',

        init: function () {
            this.ensureAnimationStyles();
            this._initialized = true;
            return this;
        },

        /**
         * Ensure animation keyframes are present
         */
        ensureAnimationStyles: function () {
            if (!document.getElementById('toast-keyframes')) {
                const style = document.createElement('style');
                style.id = 'toast-keyframes';
                style.textContent = `
                    @keyframes toastSlideIn {
                        from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0); }
                    }
                    @keyframes toastSlideInRight {
                        from { opacity: 0; transform: translateX(20px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                    @keyframes toastSlideInBottom {
                        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0); }
                    }
                `;
                document.head.appendChild(style);
            }
        },

        /**
         * Get position styles based on position name
         */
        getPositionStyles: function (position) {
            const positions = {
                'top-center': {
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    animation: 'toastSlideIn 0.3s ease'
                },
                'top-right': {
                    top: '20px',
                    right: '20px',
                    animation: 'toastSlideInRight 0.3s ease'
                },
                'bottom-center': {
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    animation: 'toastSlideInBottom 0.3s ease'
                },
                'bottom-right': {
                    bottom: '20px',
                    right: '20px',
                    animation: 'toastSlideInRight 0.3s ease'
                }
            };
            return positions[position] || positions['top-center'];
        },

        /**
         * Get color scheme for toast type
         */
        getTypeColors: function (type) {
            const colors = {
                info: { bg: '#2196F3', text: '#fff' },
                success: { bg: '#4CAF50', text: '#fff' },
                warning: { bg: '#FF9800', text: '#000' },
                error: { bg: '#f44336', text: '#fff' }
            };
            return colors[type] || colors.info;
        }
    };

    // Expose globally
    window.TNStyles = TNStyles;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('TNStyles', TNStyles);
    }
})();
