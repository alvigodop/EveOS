/**
 * Loading Indicator Module (Facade)
 * Handles the display and updates of the loading indicator / search monitor.
 * 
 * Delegates to:
 * - LIStats: Phase-based stats text generation
 * 
 * @version 1.1.0-facade
 */

const LoadingIndicator = {
    version: '1.1.0-facade',
    _loadingIndicatorCompact: true, // State for compact mode

    /**
     * Initialize the module
     */
    /**
     * Initialize the module
     */
    init: function () {
        if (window.LIStats && typeof LIStats.init === 'function') {
            LIStats.init();
            LIStats._initialized = true;
        }

        // Only create loading indicator if DOM is ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this.createLoadingIndicator();
            this.setupEventListeners();
        } else {
            // Wait for DOM to be ready
            document.addEventListener('DOMContentLoaded', () => {
                this.createLoadingIndicator();
                this.setupEventListeners();
            });
        }
        this._initialized = true;

        // Periodic check to ensure it stays on top of any newly created DOM elements
        setInterval(() => this._ensureTopLevel(), 5000);

        return this;
    },

    setupEventListeners: function () {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            indicator.addEventListener('click', (e) => {
                // If compact, expand it.
                if (this._loadingIndicatorCompact) {
                    this.expand();
                    e.stopPropagation(); // Prevent immediate closing
                }
                // If already expanded, do nothing (allow interaction with contents)
            });
        }

        // Bind the outside click handler so we can add/remove it properly
        this._boundHandleOutsideClick = this.handleOutsideClick.bind(this);
    },

    /**
     * Creates a loading indicator if it doesn't exist
     * NOW USES #loadingIndicator exclusively
     */
    createLoadingIndicator: function () {
        // Safely check if we have access to the DOM
        if (!document.body) {
            console.log('DOM not ready yet, skipping loading indicator creation');
            return;
        }

        // Check if loading indicator already exists in HTML (preferred)
        let indicator = document.getElementById('loadingIndicator');

        if (!indicator) {
            // Fallback: Check for legacy #loading
            indicator = document.getElementById('loading');
            if (indicator) {
                // Return if legacy exists, or maybe upgrade it? 
                // For now, let's just stick to finding the main one or creating it if absolutely missing.
                console.log('Found legacy #loading, but expected #loadingIndicator');
                return;
            }

            console.log('Creating loading indicator (fallback)');

            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'loadingIndicator'; // Use correct ID
            loadingDiv.className = 'loading-indicator compact visible'; // Add default classes

            // ... (rest of creation logic if needed, but we expect it to be in HTML) ...
            // Simplified creation for fallback
            loadingDiv.innerHTML = `
                <div class="dot"></div>
                <div class="indicator-content">
                    <div class="indicator-title">Search Monitor</div>
                    <div id="gemini-placeholder"></div>
                    <div class="status-group">
                        <div class="status-text">Idle</div>
                        <div class="wave-container">
                            <div class="wave"></div>
                        </div>
                    </div>
                    <div class="expanded-content">
                        <div class="stats-row">
                            <span class="stats-label">Status:</span>
                            <span class="stats-value" id="searchStatus">Idle</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">Wikis Searched:</span>
                            <span class="stats-value" id="wikisSearched">0/0</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">Results Found:</span>
                            <span class="stats-value" id="resultsFound">0</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(loadingDiv);

            // Re-setup listeners since we just created it
            this.setupEventListeners();
        } else {
            // Indicator exists, but let's check for missing pieces surgically
            const content = indicator.querySelector('.indicator-content');
            if (content) {
                if (!content.querySelector('#gemini-placeholder')) {
                    const title = content.querySelector('.indicator-title');
                    const placeholder = document.createElement('div');
                    placeholder.id = 'gemini-placeholder';
                    if (title && title.nextSibling) {
                        content.insertBefore(placeholder, title.nextSibling);
                    } else {
                        content.prepend(placeholder);
                    }
                }
                if (!content.querySelector('.status-group')) {
                    const placeholder = content.querySelector('#gemini-placeholder');
                    const statusGroup = document.createElement('div');
                    statusGroup.className = 'status-group';
                    statusGroup.innerHTML = `
                        <div class="status-text">Idle</div>
                        <div class="wave-container"><div class="wave"></div></div>
                    `;
                    if (placeholder && placeholder.nextSibling) {
                        content.insertBefore(statusGroup, placeholder.nextSibling);
                    } else {
                        content.appendChild(statusGroup);
                    }
                }
                if (!indicator.querySelector('.expanded-content')) {
                    const expanded = document.createElement('div');
                    expanded.className = 'expanded-content';
                    expanded.innerHTML = `
                        <div class="stats-row"><span class="stats-label">Status:</span><span class="stats-value" id="searchStatus">Idle</span></div>
                        <div class="stats-row"><span class="stats-label">Wikis Searched:</span><span class="stats-value" id="wikisSearched">0/0</span></div>
                        <div class="stats-row"><span class="stats-label">Results Found:</span><span class="stats-value" id="resultsFound">0</span></div>
                    `;
                    content.appendChild(expanded);
                }
            }
        }

        // CRITICAL: Ensure it is the LAST element in the body to sit on top of everything
        // This moves it to the end even if it already existed
        if (indicator && document.body.lastElementChild !== indicator) {
            document.body.appendChild(indicator);
            console.log('Moved #loadingIndicator to end of body for z-index stacking');
        }
    },

    /**
     * Ensures the indicator is the last element in the body
     * This fixes stacking issues when other elements (like MDL wrapper) are injected later
     */
    _ensureTopLevel: function () {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator && document.body.lastElementChild !== indicator) {
            document.body.appendChild(indicator);
            // console.log('Moved #loadingIndicator to end of body (enforced)');
        }
    },

    /**
     * Show the loading indicator
     * @param {string} message - Optional message to display
     * @returns {boolean} - True if successful
     */
    show: function (message) {
        this._ensureTopLevel(); // Ensure it's on top before showing
        // Use #loadingIndicator
        const loading = document.getElementById('loadingIndicator');
        if (loading) {
            // Ensure visible class is present
            loading.classList.add('visible');
            loading.style.display = ''; // Clear inline display:none if present

            // Update status text if provided
            const statusText = loading.querySelector('.status-text');
            if (statusText && message) {
                statusText.textContent = message;
            }

            return true;
        }
        return false;
    },

    /**
     * Hide the loading indicator
     * @returns {boolean} - True if successful
     */
    hide: function () {
        const loading = document.getElementById('loadingIndicator');
        if (loading) {
            loading.classList.remove('visible');
            // Optional: loading.style.display = 'none'; 
            // But we usually want to keep it in DOM, just hidden or compact?
            // If strictly hiding:
            loading.style.display = 'none';
            return true;
        }
        return false;
    },

    /**
     * Expands the loading indicator
     */
    expand: function () {
        this._ensureTopLevel(); // Ensure it's on top before expanding
        const indicator = document.getElementById('loadingIndicator');
        if (!indicator) return;

        this._loadingIndicatorCompact = false;
        indicator.classList.remove('compact');
        indicator.classList.add('visible');

        // Add outside click listener
        document.addEventListener('click', this._boundHandleOutsideClick);
    },

    /**
     * Collapses the loading indicator
     */
    collapse: function () {
        const indicator = document.getElementById('loadingIndicator');
        if (!indicator) return;

        this._loadingIndicatorCompact = true;
        indicator.classList.add('compact');

        // Remove outside click listener
        document.removeEventListener('click', this._boundHandleOutsideClick);
    },

    /**
     * Handles clicks outside the loading indicator
     * @param {Event} event 
     */
    handleOutsideClick: function (event) {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator && !indicator.contains(event.target)) {
            this.collapse();
        }
    },

    /**
     * Toggle the loading indicator between compact and expanded modes
     * Kept for backward compatibility but routes to expand/collapse
     */
    toggleCompactMode: function () {
        if (this._loadingIndicatorCompact) {
            this.expand();
        } else {
            this.collapse();
        }
    },

    /**
     * Updates the loading indicator with enhanced stats display
     * @param {boolean} isSearching - Whether a search is in progress
     * @param {string} message - Status message to display (default: 'Idle')
     * @param {Object} stats - Statistics object with optional properties
     */
    updateEnhanced: function (isSearching, message = 'Idle', stats = {}) {
        this._ensureTopLevel(); // Ensure it's on top on every update
        const indicator = document.getElementById('loadingIndicator');
        if (!indicator) {
            return;
        }

        const statusText = indicator.querySelector('.status-text');
        const searchStatus = indicator.querySelector('#searchStatus');
        const wikisSearched = indicator.querySelector('#wikisSearched');
        const resultsFound = indicator.querySelector('#resultsFound');
        const dot = indicator.querySelector('.dot');

        indicator.classList.toggle('searching', isSearching);
        indicator.classList.add('visible');

        // Reset error state when starting a new search or going idle
        if (isSearching || message === 'Idle') {
            indicator.classList.remove('error');
        }

        if (!isSearching) {
            if (statusText) statusText.textContent = 'Idle';
            if (searchStatus) searchStatus.textContent = 'Idle';
            if (wikisSearched) wikisSearched.textContent = '0/0';
            if (resultsFound) resultsFound.textContent = '0';
            if (dot) dot.style.background = '#e0e0e0';
        } else {
            // Delegate text generation to LIStats if available
            if (statusText) {
                const phase = stats.statusPhase || 'search';
                const title = stats.currentResult;

                if (window.LIStats) {
                    statusText.textContent = LIStats.getStatusText(phase, title, message);
                } else {
                    // Fallback
                    statusText.textContent = title ? `→ ${title}` : message;
                }
            }

            if (searchStatus) searchStatus.textContent = message;
            if (stats.wikisSearched !== undefined && wikisSearched) {
                if (window.LIStats) {
                    wikisSearched.textContent = LIStats.formatWikiProgress(stats.wikisSearched, stats.totalWikis);
                } else {
                    wikisSearched.textContent = `${stats.wikisSearched}/${stats.totalWikis || 0}`;
                }
            }
            if (stats.resultsFound !== undefined && resultsFound) {
                resultsFound.textContent = stats.resultsFound;
            }
            if (dot) dot.style.background = '#9e9e9e';
        }
    },

    /**
     * Displays an error message within the search monitor
     * @param {string} message - The error message to display
     */
    showErrorInMonitor: function (message) {
        const indicator = document.getElementById('loadingIndicator');
        if (!indicator) return;

        const statusText = indicator.querySelector('.status-text');
        const searchStatus = indicator.querySelector('#searchStatus');

        // Make sure it's visible
        indicator.classList.add('visible');
        indicator.classList.remove('compact');
        indicator.classList.remove('searching');
        indicator.classList.add('error');

        // Update text
        if (statusText) statusText.textContent = 'Error';
        if (searchStatus) searchStatus.textContent = message;

        this._loadingIndicatorCompact = false;
    },

    /**
     * Updates the loading indicator (redirects to enhanced version)
     * @param {boolean} show - Whether to show or hide the loading indicator
     * @param {string} message - Optional message to display
     */
    update: function (show, message = 'Loading...') {
        this.updateEnhanced(show, message);
    }
};

// Auto-initialize
LoadingIndicator.init();

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('LoadingIndicator', LoadingIndicator);
}

// Make globally available
window.LoadingIndicator = LoadingIndicator;

console.log('LoadingIndicator module loaded');
