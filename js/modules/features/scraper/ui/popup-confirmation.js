/**
 * Popup Confirmation Component
 * Handles confirmation modal dialogs
 */
const PopupConfirmation = {
    _confirmationResolve: null,

    /**
     * Show a confirmation modal
     * @param {string} message - The message to display
     * @returns {Promise<boolean>} - Resolves to true if confirmed, false otherwise
     */
    showConfirmation: function (message) {
        return new Promise((resolve) => {
            this._confirmationResolve = resolve;
            const popup = document.getElementById('confirmationPopup');
            const msgEl = document.getElementById('confirmationPopupMessage');
            const yesBtn = document.getElementById('confirmYesBtn');

            if (popup && msgEl && yesBtn) {
                msgEl.textContent = message;

                // Set up handlers using addEventListener to avoid overwriting or scope issues
                // Clone checks to remove old listeners
                const newYesBtn = yesBtn.cloneNode(true);
                yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

                newYesBtn.addEventListener('click', () => {
                    this.closeConfirmation(true);
                });

                // Ensure close button also works for 'No'
                const closeBtns = popup.querySelectorAll('.close-btn, .secondary-btn');
                closeBtns.forEach(btn => {
                    const newBtn = btn.cloneNode(true);
                    btn.parentNode.replaceChild(newBtn, btn);

                    newBtn.addEventListener('click', () => {
                        this.closeConfirmation(false);
                    });
                });

                // Force visibility
                popup.classList.remove('hidden');
                popup.style.display = 'flex';
                console.log('PopupConfirmation: Confirmation popup displayed');
            } else {
                console.error('Confirmation popup elements not found, falling back to confirm()');
                resolve(confirm(message));
            }
        });
    },

    /**
     * Close the confirmation modal
     * @param {boolean} confirmed - Whether the user confirmed
     */
    closeConfirmation: function (confirmed) {
        const popup = document.getElementById('confirmationPopup');
        if (popup) {
            popup.classList.add('hidden');
            popup.style.display = 'none';
        }

        if (this._confirmationResolve) {
            this._confirmationResolve(confirmed);
            this._confirmationResolve = null;
        }
    }
};

window.PopupConfirmation = PopupConfirmation;
