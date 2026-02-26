/**
 * Popup History Component
 * Handles history stack and navigation state
 */
const PopupHistory = {
    _popupHistory: [],
    _currentHistoryIndex: -1,

    /**
     * Add a state to popup history
     * @param {Object} state - The state to add {type, url, title, domain, source}
     */
    addToHistory: function (state) {
        // If we're not at the end of history, truncate forward history
        if (this._currentHistoryIndex < this._popupHistory.length - 1) {
            this._popupHistory = this._popupHistory.slice(0, this._currentHistoryIndex + 1);
        }

        this._popupHistory.push(state);
        this._currentHistoryIndex = this._popupHistory.length - 1;

        this.updateNavigationButtons();
    },

    /**
     * Reset history with optional initial state
     * @param {Array} initialState 
     */
    resetHistory: function (initialState = []) {
        this._popupHistory = initialState;
        this._currentHistoryIndex = initialState.length > 0 ? 0 : -1;
    },

    /**
     * Navigate popup history
     * @param {string} direction - 'back' or 'forward'
     */
    navigatePopupHistory: function (direction) {
        if (direction === 'back' && this._currentHistoryIndex > 0) {
            this._currentHistoryIndex--;
        } else if (direction === 'forward' && this._currentHistoryIndex < this._popupHistory.length - 1) {
            this._currentHistoryIndex++;
        } else {
            return; // No valid navigation
        }

        const state = this._popupHistory[this._currentHistoryIndex];

        // Delegate rendering to PopupViewer
        if (window.PopupViewer) {
            PopupViewer.renderState(state);
        }

        this.updateNavigationButtons();
    },

    /**
     * Navigate popup back
     */
    navigatePopupBack: function () {
        this.navigatePopupHistory('back');
    },

    /**
     * Navigate popup forward
     */
    navigatePopupForward: function () {
        this.navigatePopupHistory('forward');
    },

    /**
     * Update navigation button states
     */
    updateNavigationButtons: function () {
        // Wiki Popup Buttons
        const wikiBackBtn = document.getElementById('popupBackBtn');
        const wikiForwardBtn = document.getElementById('popupForwardBtn');

        // Data Popup Buttons
        const dataBackBtn = document.getElementById('dataPopupBackBtn');
        const dataForwardBtn = document.getElementById('dataPopupForwardBtn');

        const hasBack = this._currentHistoryIndex > 0;
        const hasForward = this._currentHistoryIndex < this._popupHistory.length - 1;

        // Update Wiki Popup buttons
        if (wikiBackBtn) {
            wikiBackBtn.classList.toggle('active', hasBack);
            wikiBackBtn.disabled = !hasBack;
        }
        if (wikiForwardBtn) {
            wikiForwardBtn.classList.toggle('active', hasForward);
            wikiForwardBtn.disabled = !hasForward;
        }

        // Update Data Popup buttons
        if (dataBackBtn) {
            dataBackBtn.classList.toggle('active', hasBack);
            dataBackBtn.disabled = !hasBack;
        }
        if (dataForwardBtn) {
            dataForwardBtn.classList.toggle('active', hasForward);
            dataForwardBtn.disabled = !hasForward;
        }
    },

    /**
     * Get current history state
     * @returns {Object|null} Current history state or null
     */
    getCurrentHistoryState: function () {
        if (this._currentHistoryIndex >= 0 && this._currentHistoryIndex < this._popupHistory.length) {
            return this._popupHistory[this._currentHistoryIndex];
        }
        return null;
    },

    /**
     * Check if can navigate back
     * @returns {boolean}
     */
    canGoBack: function () {
        return this._currentHistoryIndex > 0;
    },

    /**
     * Check if can navigate forward
     * @returns {boolean}
     */
    canGoForward: function () {
        return this._currentHistoryIndex < this._popupHistory.length - 1;
    }
};

window.PopupHistory = PopupHistory;
