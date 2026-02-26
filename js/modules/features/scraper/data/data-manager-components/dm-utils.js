/**
 * Data Manager Utilities
 * Helper functions for alerts and notifications
 */
const DMUtils = {};

/**
 * Helper to show internal toast notifications
 * Use a standalone implementation to ensure it works even if other modules fail
 */
DMUtils.showToast = function (msg, type = 'info') {
    // Check if we have an existing toast container
    let container = document.getElementById('datamanager-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'datamanager-toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '99999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.textContent = msg;

    // Style based on type
    const colors = {
        success: '#4caf50',
        error: '#f44336',
        info: '#2196f3',
        warning: '#ff9800'
    };

    toast.style.backgroundColor = colors[type] || colors.info;
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease-in-out';
    toast.style.fontSize = '14px';
    toast.style.minWidth = '200px';

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    // Remove after delay
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            // Remove container if empty
            if (container.childNodes.length === 0 && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }, 300);
    }, 3000);
};

// Ensure global availability
window.DMUtils = DMUtils;
console.log('[DMUtils] Loaded');
