/**
 * HTML Script Loader - Core Component
 * 
 * Handles initialization, script loading logic, and event listeners.
 */
(function () {
    'use strict';

    const LoadCore = {
        _initialized: false,
        scriptsToLoad: [],
        loadedScripts: [],
        failedScripts: [],

        /**
         * Initialize the HTML script loader
         */
        init: function () {
            console.log('Initializing HtmlScriptLoader (Core)');

            // Set up event listeners
            this.setupEventListeners();

            // Set initialization flag
            this._initialized = true;
            return this;
        },

        /**
         * Set up event listeners for DOM loaded events
         */
        setupEventListeners: function () {
            // Set up a mutation observer to immediately hide any "Loading Errors" sections
            // Delegated to LoadMonitor if available
            if (window.LoadMonitor && typeof LoadMonitor.setupErrorSectionRemover === 'function') {
                document.addEventListener('DOMContentLoaded', LoadMonitor.setupErrorSectionRemover);
            }

            // Load scripts in proper order when DOM is loaded
            document.addEventListener('DOMContentLoaded', this.loadScriptsInOrder.bind(this));

            // Run the repair application automatically after page load - once only
            window.addEventListener('load', function () {
                // Guard against multiple runs of this listener
                if (window._loadCoreRepairComplete) return;
                window._loadCoreRepairComplete = true;

                console.log('Page loaded, auto-running repair application...');

                // Wait a bit for all scripts to load and initialize
                setTimeout(function () {
                    // Check if repair was already done by app-recovery.js
                    if (window._repairComplete) {
                        console.log('Repair already completed, skipping');
                        return;
                    }

                    window._repairComplete = true;
                    console.log('Starting auto-repair...');
                    if (typeof window.repairApplication === 'function') {
                        window.repairApplication();
                        console.log('Auto-repair completed');
                    }
                }, 2000);
            });
        },

        /**
         * Load scripts in proper order with cache busting
         */
        loadScriptsInOrder: function () {
            console.log('HtmlScriptLoader: Skipping dynamic script loading because scripts are already loaded via ScraperTest.html');

            // We still want to perform some cleanup/initialization tasks that were here

            // Suppress all CORS errors right at startup
            if (window.ErrorSuppressor && typeof ErrorSuppressor.suppressAllErrors === 'function') {
                ErrorSuppressor.suppressAllErrors();
            }

            // Show loading status
            const errorDiv = document.getElementById('errorDisplay');
            if (errorDiv) {
                errorDiv.innerHTML = '<h3>Loading modules...</h3>';
                errorDiv.style.display = 'block';
            }

            // Add manual completion handler
            window.forceCompleteLoading = function () {
                const loadingElement = document.getElementById('initialLoading');
                if (loadingElement) loadingElement.style.display = 'none';

                const mainElement = document.querySelector('main');
                if (mainElement) mainElement.style.display = 'block';

                if (errorDiv) errorDiv.style.display = 'none';
            };

            // Trigger completion shortly after since we aren't actually loading scripts
            setTimeout(() => {
                if (typeof window.forceCompleteLoading === 'function') {
                    window.forceCompleteLoading();
                }
            }, 1000);
        },

        /**
         * Check if running locally
         */
        checkIfLocal: function () {
            if (window.location.protocol === 'file:') {
                console.log('Running from local file system');
                return true;
            }
            return false;
        },

        /**
         * Utility function to dynamically load a script with timestamp
         * @param {string} src - The script source path
         * @param {boolean} async - Whether to load async
         * @param {boolean} defer - Whether to defer loading
         */
        addScriptWithTimestamp: function (src, async = true, defer = true) {
            // Use local arrays if global ones aren't initialized yet (though we sync them)
            if (!window.scriptsToLoad) window.scriptsToLoad = this.scriptsToLoad;
            if (!window.loadedScripts) window.loadedScripts = this.loadedScripts;

            // Don't add duplicates
            if (window.scriptsToLoad.includes(src) || window.loadedScripts.includes(src)) {
                console.log(`Script already queued or loaded: ${src}`);
                return;
            }

            window.scriptsToLoad.push(src);

            // Add timestamp for cache busting
            const timestamp = new Date().getTime();
            const scriptSrc = `${src}?t=${timestamp}`;

            const script = document.createElement('script');
            script.src = scriptSrc;
            script.async = async;
            script.defer = defer;

            // Handle load success
            script.onload = function () {
                console.log(`Script loaded: ${src}`);
                window.loadedScripts.push(src);

                // Remove from scriptsToLoad
                const index = window.scriptsToLoad.indexOf(src);
                if (index > -1) {
                    window.scriptsToLoad.splice(index, 1);
                }

                // Update loading status
                const loadingStatus = document.getElementById('loadingStatus');
                if (loadingStatus) {
                    loadingStatus.textContent = `Loaded ${window.loadedScripts.length} modules...`;
                }

                // Check if all scripts are loaded
                if (window.scriptsToLoad.length === 0) {
                    setTimeout(function () {
                        console.log('All scripts loaded, running forceCompleteLoading');
                        if (typeof window.forceCompleteLoading === 'function') {
                            window.forceCompleteLoading();
                        }
                    }, 500);
                }
            };

            // Handle load errors
            script.onerror = function (error) {
                console.error(`Error loading script: ${src}`, error);

                // Create tracking arrays if they don't exist
                if (!window.failedScripts) window.failedScripts = [];

                // Add to failed scripts array
                window.failedScripts.push(src);

                // Remove from scriptsToLoad
                const index = window.scriptsToLoad.indexOf(src);
                if (index > -1) {
                    window.scriptsToLoad.splice(index, 1);
                }

                // Check if we should force complete anyway
                if (window.scriptsToLoad.length === 0) {
                    setTimeout(function () {
                        console.log('All scripts attempted to load, running forceCompleteLoading');
                        if (typeof window.forceCompleteLoading === 'function') {
                            window.forceCompleteLoading();
                        }
                    }, 500);
                }
            };

            // Add the script to the document
            document.head.appendChild(script);
        },

        /**
         * Promise-based script loader
         * @param {string} url - The script URL to load
         * @returns {Promise} - Promise that resolves when the script is loaded
         */
        loadScript: function (url) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.crossOrigin = 'anonymous'; // Try with CORS attributes
                script.onload = () => resolve(url);
                script.onerror = (e) => {
                    console.error(`Failed to load script: ${url}`, e);
                    if (!window.failedScripts) window.failedScripts = [];
                    window.failedScripts.push(url);
                    reject(new Error(`Failed to load script: ${url}`));
                };
                document.head.appendChild(script);
            });
        }
    };

    window.LoadCore = LoadCore;
})();
