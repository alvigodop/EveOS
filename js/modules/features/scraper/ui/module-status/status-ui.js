/**
 * Status UI Module
 * Handles UI interactions, popup creation, and rendering for module status.
 * Extracted from ui-module-status.js
 * 
 * @version 1.0.0
 */

const StatusUI = {
    version: '1.0.0',
    _initialized: false
};

/**
 * Initialize StatusUI
 */
StatusUI.init = function () {
    this._initialized = true;
    console.log('StatusUI initialized');
};

/**
 * Create the module status popup
 * @param {Object} statusInfo - The module status information
 * @param {string} view - The view type: 'full' or 'compact'
 * @param {Function} callbacks - Object containing callbacks (close, copy)
 * @returns {HTMLElement} - The popup element
 */
StatusUI.createStatusPopup = function (statusInfo, view = 'full', callbacks = {}) {
    console.log('Creating module status popup');

    // Remove any existing popups
    this.closeStatus();

    // Create a new popup
    const popup = document.createElement('div');
    popup.id = 'moduleStatusPopup';
    popup.className = 'popup module-status-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'moduleStatusTitle');

    // Create popup structure with blue header
    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-header" style="background-color: #3498db; color: white; display: flex; justify-content: space-between; align-items: center; padding: 10px 15px;">
                <h3 id="moduleStatusTitle" style="margin: 0; font-size: 16px; font-weight: bold;">Module Status</h3>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label style="display: flex; align-items: center; font-size: 12px; cursor: pointer; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 3px;">
                        <input type="checkbox" id="hideCorsToggle" style="margin-right: 5px;" ${window.HIDE_CORS_ERRORS ? 'checked' : ''}>
                        Hide CORS
                    </label>
                    <button id="copyModuleStatusBtn" style="background-color: white; color: #333; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;">Copy</button>
                    <button type="button" class="close-btn" aria-label="Close module status popup" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; padding: 0 5px;">&times;</button>
                </div>
            </div>
            <div class="popup-body" style="padding: 15px; overflow-y: auto; max-height: 70vh;"></div>
        </div>
    `;

    // Add event listener for close button
    const closeBtn = popup.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (callbacks.onClose) callbacks.onClose();
            else this.closeStatus();
        });
    }

    // Add event listener for copy button
    const copyBtn = popup.querySelector('#copyModuleStatusBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (callbacks.onCopy) callbacks.onCopy(statusInfo);
            else this.copyModuleStatus(statusInfo);
        });
    }

    // Add event listener for CORS toggle
    const hideCorsToggle = popup.querySelector('#hideCorsToggle');
    if (hideCorsToggle) {
        hideCorsToggle.addEventListener('change', (e) => {
            if (callbacks.onCorsToggle) callbacks.onCorsToggle(e.target.checked);
        });
    }

    // Set initial display state
    popup.style.display = 'none';

    return popup;
};

/**
 * Render the status popup with content
 * @param {Object} statusInfo - The data to display
 * @param {Object} options - Options including view and callbacks
 * @returns {HTMLElement} - The created popup
 */
StatusUI.renderStatus = function (statusInfo, options = {}) {
    const popup = this.createStatusPopup(statusInfo, options.view, options);

    const popupBody = popup.querySelector('.popup-body');
    if (!popupBody) return popup;

    // Use StatusView content generator
    let html = '';
    if (window.StatusView) {
        html = StatusView.generateStatusContent(statusInfo);
    } else {
        html = '<div style="padding: 20px;">StatusView module not loaded.</div>';
    }

    popupBody.innerHTML = html;

    popup.style.display = 'block';
    document.body.appendChild(popup);

    return popup;
};

/**
 * Close any open module status popup
 */
StatusUI.closeStatus = function () {
    // Find all possible popup elements
    const popups = document.querySelectorAll('.module-status-popup, #moduleStatusPopup');

    if (popups.length === 0) return;

    // Close each popup
    popups.forEach(popup => {
        if (popup) {
            popup.style.display = 'none';
            try {
                if (popup.parentNode) {
                    popup.parentNode.removeChild(popup);
                }
            } catch (e) {
                console.warn('Could not remove popup from DOM:', e);
            }
        }
    });
};

/**
 * Update content of an existing container (legacy support)
 * @param {HTMLElement} container 
 * @param {Object} statusInfo 
 */
StatusUI.updateModuleStatusContent = function (container, statusInfo) {
    if (!container) return;

    // Defer to StatusView if available, but wrap it to match legacy structure if needed
    // The original updateModuleStatusContent had a lot of manual DOM creation.
    // For now, we'll assume the simple HTML generation is sufficient or duplicate the legacy logic if strictly required.
    // Given the refactor goal, using StatusView is preferred.

    if (window.StatusView) {
        container.innerHTML = StatusView.generateStatusContent(statusInfo);
    } else {
        container.innerHTML = 'StatusView not available';
    }
};

/**
 * Copy status info to clipboard
 */
StatusUI.copyModuleStatus = function (statusInfo) {
    console.log('Copying module status information to clipboard');

    try {
        // Generate text representation
        let text = 'Module Status Information\n\n';
        text += `Generated: ${new Date().toISOString()}\n\n`;
        text += 'Modules:\n';

        if (statusInfo.modules && statusInfo.modules.length) {
            statusInfo.modules.forEach(module => {
                text += `- ${module.name}: ${module.hasError ? 'Error' : (module.initialized ? 'Initialized' : 'Not Initialized')}\n`;
                if (module.version) text += `  Version: ${module.version}\n`;
            });
        } else {
            text += 'No modules information available.\n';
        }

        // Add more details if needed...

        navigator.clipboard.writeText(text)
            .then(() => alert('Module status information copied to clipboard'))
            .catch(err => {
                console.error('Could not copy text:', err);
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                alert('Module status information copied to clipboard');
            });
    } catch (error) {
        console.error('Error copying module status information:', error);
        alert('Failed to copy module status information');
    }
};

// Expose to window
window.StatusUI = StatusUI;

// Register with ModuleRegistry
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('StatusUI', StatusUI);
}
