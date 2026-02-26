/**
 * Confirm Modal Module
 * 
 * Provides a custom confirmation modal dialog.
 * Consumes styles from ConfirmModalStyles.
 * 
 * @version 1.1.0
 */

const ConfirmModal = {
    version: '1.1.0',
    _initialized: false,

    /**
     * Initialize the module
     */
    init() {
        if (this._initialized) return this;
        console.log('ConfirmModal module initializing...');

        // Add animation keyframes via Style module if available
        if (window.ConfirmModalStyles) {
            window.ConfirmModalStyles.ensureKeyframes();
        } else {
            console.warn('ConfirmModalStyles not found, animations may be missing');
        }

        this._initialized = true;
        console.log('ConfirmModal module initialized');
        return this;
    },

    /**
     * Show a custom confirmation modal dialog
     */
    show(title, message, onConfirm, onCancel, options = {}) {
        const {
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmStyle = 'danger'
        } = options;

        // Remove any existing modal
        const existingModal = document.getElementById('custom-confirm-modal');
        if (existingModal) existingModal.remove();

        const styles = window.ConfirmModalStyles || {
            // Fallback minimal styles if module missing
            overlayCss: 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:999;',
            contentCss: 'background:#333;color:#fff;padding:20px;border-radius:8px;text-align:center;',
            buttonGradients: { danger: 'red', primary: 'blue', success: 'green' }
        };

        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'custom-confirm-modal';
        modal.style.cssText = styles.overlayCss;

        const confirmBg = styles.buttonGradients[confirmStyle] || styles.buttonGradients.danger || 'red';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.cssText = styles.contentCss;

        modalContent.innerHTML = `
            <h2 style="color: #fff; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">${title}</h2>
            <p style="color: rgba(255,255,255,0.8); margin: 0 0 28px 0; font-size: 16px; line-height: 1.5;">${message}</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="confirm-modal-cancel" style="
                    padding: 12px 28px;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 8px;
                    background: transparent;
                    color: #fff;
                    font-size: 15px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                ">${cancelText}</button>
                <button id="confirm-modal-ok" style="
                    padding: 12px 28px;
                    border: none;
                    border-radius: 8px;
                    background: ${confirmBg};
                    color: #fff;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">${confirmText}</button>
            </div>
        `;

        modal.appendChild(modalContent);

        // Ensure styles again just in case
        if (window.ConfirmModalStyles) window.ConfirmModalStyles.ensureKeyframes();

        document.body.appendChild(modal);

        // Handle button clicks
        const cancelBtn = document.getElementById('confirm-modal-cancel');
        const okBtn = document.getElementById('confirm-modal-ok');

        const closeModal = (callback) => {
            modal.remove();
            if (callback) callback();
        };

        cancelBtn.onclick = () => closeModal(onCancel);
        okBtn.onclick = () => closeModal(onConfirm);

        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal(onCancel);
            }
        };

        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal(onCancel);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        return modal;
    },

    /**
     * Programmatically close any open modal
     */
    close() {
        const modal = document.getElementById('custom-confirm-modal');
        if (modal) modal.remove();
    }
};

// Auto-initialize
ConfirmModal.init();

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ConfirmModal', ConfirmModal);
}

// Expose globally
window.ConfirmModal = ConfirmModal;

console.log('ConfirmModal module loaded');
