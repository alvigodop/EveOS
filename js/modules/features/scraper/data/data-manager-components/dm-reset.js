/**
 * Data Manager Reset Module
 * Handles clearing/resetting application data
 */
const DMReset = {};

/**
 * Clear all application data - uses custom confirm dialog
 */
DMReset.clearData = function () {
    this._showConfirmDialog(
        'Clear All Data',
        'Are you sure you want to clear ALL data? This includes domains, cached content, and settings. This cannot be undone.',
        () => {
            try {
                StorageManager.clearAllData();

                // Reset global variables
                window.wikiDomains = [];
                window.fandomDomains = [];
                window.wikiEntries = [];
                window.wikiDataStore = { searchResults: {} };
                window.wikiCacheStore = {};

                if (window.DMUtils) DMUtils.showToast('All data cleared. Reloading...', 'success');

                setTimeout(() => window.location.reload(), 1000);
            } catch (e) {
                console.error('Clear data failed:', e);
                if (window.DMUtils) DMUtils.showToast('Failed to clear data: ' + e.message, 'error');
            }
        }
    );
};

/**
 * Show a custom confirm dialog (bypass native confirm which may be blocked)
 */
DMReset._showConfirmDialog = function (title, message, onConfirm) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'confirm-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;';

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = 'background:white;padding:24px;border-radius:8px;max-width:400px;width:90%;text-align:center;';

    modal.innerHTML = `
        <h3 style="margin:0 0 15px 0;color:#c62828;">⚠️ ${title}</h3>
        <p style="margin:0 0 20px 0;color:#333;line-height:1.5;">${message}</p>
        <div style="display:flex;gap:10px;justify-content:center;">
            <button id="confirm-cancel-btn" style="flex:1;max-width:120px;padding:10px;background:#9e9e9e;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
                Cancel
            </button>
            <button id="confirm-ok-btn" style="flex:1;max-width:120px;padding:10px;background:#c62828;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
                Clear Data
            </button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Event handlers
    document.getElementById('confirm-cancel-btn').onclick = () => {
        overlay.remove();
        if (window.DMUtils) DMUtils.showToast('Cancelled', 'info');
    };

    document.getElementById('confirm-ok-btn').onclick = () => {
        overlay.remove();
        onConfirm();
    };

    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
            if (window.DMUtils) DMUtils.showToast('Cancelled', 'info');
        }
    };
};

// Ensure global availability
window.DMReset = DMReset;
console.log('[DMReset] Loaded');
