/**
 * PageFreezeDetector Core Component
 * Contains state, configuration, and initialization logic
 */
window.PageFreezeDetectorCore = {
    version: '1.0.0-modular',
    _initialized: false,
    _config: {
        checkInterval: 5000,        // Relaxed from 2000ms
        freezeThreshold: 10000,     // Relaxed from 5000ms
        maxConsecutiveResets: 3,    // Maximum automatic resets before requiring manual intervention
        enableHeartbeatCheck: true, // Check JavaScript heartbeat
        enableUICheck: false,       // Disabled by default to prevent false positives
        enableMemoryCheck: true,    // Check for memory leaks
        debugMode: true,           // Enable debug logging
    },
    _state: {
        lastHeartbeat: 0,
        lastUIResponse: 0,
        heartbeatCount: 0,
        uiResponseTimes: [],
        resetCount: 0,
        knownFreezePatterns: {
            googleCse: {
                detected: false,
                recoveryAttempts: 0,
                lastRecoveryTime: 0
            },
            infiniteLoop: {
                detected: false,
                recoveryAttempts: 0,
                lastRecoveryTime: 0
            }
        },
        watchdogTimer: null,
        uiWatchdogTimer: null,
        freezeDetected: false,
        recoveryInProgress: false
    },

    /**
     * Initialize the PageFreezeDetector module
     * @param {Object} config - Optional configuration to override defaults
     */
    init: function (config = {}) {
        if (this._initialized) {
            console.log('PageFreezeDetector: Already initialized');
            return this;
        }

        console.log('PageFreezeDetectorCore initialized');
        this._initialized = true;

        console.log(`PageFreezeDetector: Initializing v${this.version}`);

        // Merge provided config with defaults
        this._config = { ...this._config, ...config };

        // Initialize state
        this._state.lastHeartbeat = Date.now();
        this._state.lastUIResponse = Date.now();

        // Start watchdog timer
        if (this._startWatchdog) this._startWatchdog();

        // Initialize heartbeat
        if (this._startHeartbeat) this._startHeartbeat();

        // Initialize UI response monitoring
        if (this._config.enableUICheck && this._startUIMonitoring) {
            this._startUIMonitoring();
        }

        // Listen for error events that might indicate freezes
        if (this._onError) window.addEventListener('error', this._onError.bind(this));
        if (this._onUnhandledRejection) window.addEventListener('unhandledrejection', this._onUnhandledRejection.bind(this));

        // Monitor for page navigation attempts that might be blocked
        if (this._monitorNavigationBlocking) this._monitorNavigationBlocking();

        // Create hidden sentinel element for easier debugging
        if (this._createSentinelElement) this._createSentinelElement();

        this._initialized = true;

        // Check for Google CSE integration
        if (this._setupGoogleCSEMonitoring) this._setupGoogleCSEMonitoring();

        console.log('PageFreezeDetector: Initialization complete');
        return this;
    }
};
