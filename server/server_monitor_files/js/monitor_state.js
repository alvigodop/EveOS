/**
 * monitor_state.js
 * 
 * Shared state and constants for the Server Monitor.
 */

window.MonitorState = {
    LAUNCHER_URL: 'http://localhost:9084',
    CHECK_INTERVAL: 10000, // 10 seconds between checks
    RETRY_DELAY: 2000,     // 2 seconds between retries
    MAX_RETRIES: 3,

    lastCheckTime: 0,
    isCheckingStatus: false,
    connectionAttempts: 0,
    isRestartingMainServer: false,

    // Server state tracking
    serverStates: {
        launcher: { running: false, port: 9084, command: { start: '1', stop: '4' } },
        main: { running: false, port: 9083, command: { start: '2', stop: '5' } },
        http: { running: false, port: 8000, command: { start: '3', stop: '6' } }
    }
};
