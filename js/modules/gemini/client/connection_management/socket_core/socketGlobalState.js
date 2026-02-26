/**
 * socketGlobalState.js
 * 
 * Manages shared state for the modularized socket connection system.
 * Replaces the closure state from the original socketClientCore.js.
 */

console.log("socketGlobalState.js loading...");

window.SocketGlobalState = {
    // Constants
    WS_URL: "ws://localhost:9083",
    MAX_RECONNECT_ATTEMPTS: 10,
    INITIAL_CONNECTION_ATTEMPT_INTERVAL: 2000,
    MAX_BACKOFF_INTERVAL: 30000,

    MAX_PREVIEW_MODEL_FAILURES: 5,
    PREVIEW_MODEL_COOLDOWN_TIME: 30000,

    APPLICATION_PONG_MESSAGE: "pong",

    CONTINUOUS_RECONNECT_INTERVAL: 3000,
    BASE_RECONNECT_DELAY: 2000,
    MAX_RECONNECT_DELAY: 30000,

    PREVIEW_MODEL_RETRY_DELAYS: [2000, 5000, 10000, 15000, 20000],

    // Mutable State
    reconnectAttempts: 0,
    reconnectTimeout: null,
    isConnecting: false,
    lastConnectionAttempt: 0,
    connectionBackoffDelay: 2000, // Initialize with INITIAL_CONNECTION_ATTEMPT_INTERVAL
    isInitialConnection: true,
    continuousReconnectInterval: null,

    lastErrorTime: null,
    errorCount: 0,
    lastPongReceived: null,

    autoReconnectEnabled: true,
    serverStartupDetection: true,
    serverStartupMaxChecks: 3,
    serverOfflinePauseActive: false,
    lastReconnectPauseNoticeAt: 0,

    previewModelCooldownStart: null,
    geminiApiReady: false,

    // Helper to reset state
    resetState: function () {
        this.reconnectAttempts = 0;
        this.connectionBackoffDelay = this.INITIAL_CONNECTION_ATTEMPT_INTERVAL;

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.continuousReconnectInterval) {
            clearInterval(this.continuousReconnectInterval);
            this.continuousReconnectInterval = null;
        }

        this.geminiApiReady = false;
        this.serverOfflinePauseActive = false;
        this.lastReconnectPauseNoticeAt = 0;
    }
};

console.log("socketGlobalState.js loaded.");
