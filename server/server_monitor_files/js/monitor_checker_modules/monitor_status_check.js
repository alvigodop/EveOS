/**
 * monitor_status_check.js
 * 
 * Logic for checking server statuses and connectivity.
 * Part of the modularized MonitorChecker.
 */

window.MonitorChecker = window.MonitorChecker || {};

// Improved server status check with immediate timeout for faster UI response
window.MonitorChecker.checkServerStatus = async function (forceCheck = false) {
    // Access shared state
    const state = window.MonitorState;
    const ui = window.MonitorUI;

    // Allow status check if explicitly forced even if one is in progress
    if (state.isCheckingStatus && !forceCheck) {
        return;
    }

    // Skip if a check was done recently unless forced
    if (!forceCheck && Date.now() - state.lastCheckTime < state.CHECK_INTERVAL) {
        return;
    }

    state.isCheckingStatus = true;
    state.lastCheckTime = Date.now();
    const statusDiv = document.getElementById('status');
    if (statusDiv) statusDiv.textContent = "Server Status: Checking...";

    try {
        // Check each server's status with shorter timeouts for better responsiveness
        const statusPromises = Object.entries(state.serverStates).map(async ([serverId, serverState]) => {
            console.log(`Checking ${serverId} server status on port ${serverState.port}...`);

            try {
                // Use Promise.race to set a short timeout for non-responding servers
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ isRunning: false, timedOut: true }), 500));

                let checkPromise;
                if (serverId === 'main') {
                    // For main server, try WebSocket connection with proper error handling
                    checkPromise = new Promise(resolve => {
                        try {
                            // Prevent WebSocket connection errors from appearing in console
                            const originalConsoleError = console.error;
                            console.error = function () { };

                            // Create WebSocket connection
                            const ws = new WebSocket(`ws://localhost:${serverState.port}`);

                            // Restore console.error
                            setTimeout(() => {
                                console.error = originalConsoleError;
                            }, 100);

                            // Handle successful connection
                            ws.onopen = () => {
                                try {
                                    ws.close();
                                } catch (e) {
                                    // Ignore close errors
                                }
                                resolve({ isRunning: true });
                            };

                            // Handle connection error with try/catch
                            ws.onerror = (err) => {
                                try {
                                    // Prevent error from appearing in console
                                    err.preventDefault && err.preventDefault();

                                    // Close connection to clean up
                                    ws.close();
                                } catch (e) {
                                    // Ignore close errors
                                }
                                resolve({ isRunning: false });
                            };

                            // Ensure connection is closed on timeout
                            setTimeout(() => {
                                try {
                                    ws.close();
                                } catch (e) {
                                    // Ignore close errors
                                }
                            }, 450);
                        } catch (error) {
                            // Handle any constructor errors silently
                            resolve({ isRunning: false });
                        }
                    });
                } else {
                    // For other servers, use HTTP status check with fetch API and AbortController for timeout control
                    checkPromise = new Promise(resolve => {
                        const controller = new AbortController();
                        const signal = controller.signal;

                        fetch(`http://localhost:${serverState.port}/status`, {
                            method: 'HEAD',
                            cache: 'no-store',
                            headers: { 'Cache-Control': 'no-cache' },
                            signal: signal
                        }).then(response => {
                            resolve({ isRunning: response.ok });
                        }).catch(() => {
                            // Suppress fetch errors in console
                            resolve({ isRunning: false });
                        });

                        // Set a shorter timeout for the fetch request
                        setTimeout(() => controller.abort(), 400);
                    });
                }

                // Race between the check and the timeout
                const result = await Promise.race([checkPromise, timeoutPromise]);

                // Update status immediately after each check instead of waiting for all
                if (ui && typeof ui.updateButtonState === 'function') {
                    ui.updateButtonState(serverId, result.isRunning);
                }

                // Update launcher status display immediately
                if (serverId === 'launcher') {
                    const statusSpan = document.getElementById('serverStatus');
                    if (statusSpan) {
                        statusSpan.textContent = result.isRunning ? 'Launcher: Running' : 'Launcher: Stopped';
                        statusSpan.className = result.isRunning ? 'status-running' : 'status-stopped';
                    }
                }

                return { serverId, ...result };
            } catch (error) {
                // Catch and handle errors silently - avoid console log
                if (ui && typeof ui.updateButtonState === 'function') {
                    ui.updateButtonState(serverId, false);
                }
                return { serverId, isRunning: false, error: true };
            }
        });

        // Wait for all status checks to complete
        const results = await Promise.all(statusPromises);

        // Update main status display
        let statusText = '';
        if (state && state.serverStates) {
            for (const [id, st] of Object.entries(state.serverStates)) {
                statusText += `${id.charAt(0).toUpperCase() + id.slice(1)} Server: ${st.running ? 'Running' : 'Stopped'} (Port ${st.port})\n`;
            }
        }
        if (statusDiv) {
            statusDiv.textContent = statusText;
            statusDiv.style.whiteSpace = 'pre-line';
        }

    } catch (error) {
        console.error('Error checking server status:', error);
        if (statusDiv) {
            statusDiv.textContent = 'Error checking server status';
            statusDiv.style.backgroundColor = '#ffebee';
        }
    } finally {
        state.isCheckingStatus = false;
    }
};

// Add function to check WebSocket connectivity to the Main Server
window.MonitorChecker.checkMainServerWebSocket = async function () {
    return new Promise((resolve) => {
        try {
            // Create WebSocket connection with timeout
            const ws = new WebSocket('ws://localhost:9083');

            // Set timeout for connection
            const timeout = setTimeout(() => {
                try {
                    ws.close();
                } catch (e) { }
                resolve(false); // Not connected within timeout
            }, 2000);

            // Connection opened successfully
            ws.onopen = () => {
                clearTimeout(timeout);
                try {
                    ws.close();
                } catch (e) { }
                resolve(true); // Connected successfully
            };

            // Connection error
            ws.onerror = () => {
                clearTimeout(timeout);
                try {
                    ws.close();
                } catch (e) { }
                resolve(false); // Connection failed
            };
        } catch (error) {
            resolve(false); // Error creating connection
        }
    });
};
