/**
 * Google Custom Search Engine (CSE) Embedded Module
 * 
 * Facade for seamless integration of Google CSE.
 * Delegates logic to: CSEConfig, CSEUtils, CSEHandlers, CSEResults.
 * 
 * @version 1.1.0
 */

const GoogleCSEEmbedded = (function () {
    // Private state
    const _version = '1.1.0';
    let _isInitialized = false;
    let _isLoading = false;
    let _loadAttempts = 0;
    let _recoveryMode = false;
    let _loadTimeout = null;
    let _config = null;

    // Initialize Google CSE
    function _initializeCSE() {
        if (_isLoading) return;
        _isLoading = true;

        try {
            if (!_config || !_config.cseId) {
                console.error('GoogleCSEEmbedded: Configuration missing or invalid.');
                // Fallback handled by CSEUtils if possible, but we need config for that
                if (window.CSEUtils && _config) {
                    CSEUtils.createFallbackSearch(_config, 'Configuration Invalid', () => _retryInit());
                }
                _isLoading = false;
                return;
            }

            // Ensure containers
            if (window.CSEUtils) {
                CSEUtils.ensureContainersExist(_config.containerIds);
            }

            // Global callback setup
            window.__gcse = Object.assign(window.__gcse || {}, {
                parsetags: 'explicit',
                callback: function () {
                    console.log('GoogleCSEEmbedded: Google CSE script loaded via callback');
                    _isInitialized = true;
                    _isLoading = false;
                    clearTimeout(_loadTimeout);
                }
            });

            // Timeout fallback
            _loadTimeout = setTimeout(function () {
                if (!_isInitialized) {
                    console.error(`GoogleCSEEmbedded: Timeout (${_config.timeout}ms)`);
                    if (window.CSEUtils) {
                        CSEUtils.createFallbackSearch(_config, 'Script Timeout', () => _retryInit());
                    }
                    _isLoading = false;
                }
            }, _config.timeout);

            // Load Script
            console.log(`GoogleCSEEmbedded: Loading CSE ID: ${_config.cseId}`);
            const script = document.createElement('script');
            script.src = `https://cse.google.com/cse.js?cx=${_config.cseId}`;
            script.async = true;
            script.onerror = function (err) {
                console.error('GoogleCSEEmbedded: Script load error', err);
                if (window.CSEUtils) {
                    CSEUtils.createFallbackSearch(_config, 'Script Load Error', () => _retryInit());
                }
                _isLoading = false;
                clearTimeout(_loadTimeout);
            };
            document.head.appendChild(script);

            _loadAttempts++;

        } catch (error) {
            console.error('GoogleCSEEmbedded: Initialization error', error);
            _isLoading = false;
        }
    }

    function _retryInit() {
        if (_loadAttempts < (_config ? _config.retryCount : 3)) {
            // Clean and retry
            if (window.CSEUtils) CSEUtils.cleanup(_config ? _config.containerIds : null);
            _initializeCSE();
        } else {
            alert('Max retries reached.');
        }
    }

    // Public API
    return {
        version: _version,

        init: function (options = {}) {
            if (!_isInitialized || _recoveryMode) {
                console.log(`GoogleCSEEmbedded: Initializing v${_version}...`);

                // Initialize Config
                if (window.CSEConfig) {
                    _config = CSEConfig.initialize(options);
                } else {
                    console.error('GoogleCSEEmbedded: CSEConfig module missing!');
                    return this;
                }

                _initializeCSE();
                return this;
            }
            return this;
        },

        reset: function () {
            console.log('GoogleCSEEmbedded: Resetting');
            if (window.CSEUtils && _config) {
                CSEUtils.cleanup(_config.containerIds);
            }
            if (window.CSEResults) {
                CSEResults.resetRenderState();
            }
            _loadAttempts = 0;
            _isInitialized = false;
            _recoveryMode = true; // Use recovery mode flag to allow re-init
            return this.init(); // Auto re-init on reset? Or just leave it? 
            // Original code called this.init(), so we will too.
        },

        get _initialized() {
            return _isInitialized;
        },

        isInitialized: function () {
            return _isInitialized;
        },

        getConfig: function () {
            return window.CSEConfig ? CSEConfig.getConfig() : {};
        },

        search: function (query, retryCount = 0) {
            if (!_isInitialized) {
                console.error("GoogleCSEEmbedded: Not initialized.");
                return;
            }
            if (window.CSEResults) {
                CSEResults.executeSearch(query, retryCount, (q, r) => this.search(q, r));
            }
        },

        renderCSE: function () {
            if (window.CSEResults && _config) {
                CSEResults.renderCSE(_config);
            }
        }
    };
})();

// Register
if (typeof ModuleRegistry !== 'undefined') {
    ModuleRegistry.register('GoogleCSEEmbedded', GoogleCSEEmbedded);
}
window.GoogleCSEEmbedded = GoogleCSEEmbedded;