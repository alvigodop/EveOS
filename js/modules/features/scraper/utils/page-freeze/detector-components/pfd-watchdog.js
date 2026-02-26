/**
 * PageFreezeDetector Watchdog Component
 * Contains timer-based monitoring and freeze validation logic
 */
window.PageFreezeWatchdog = {
    /**
     * Start the watchdog timer to detect freezes
     * @private
     */
    _startWatchdog: function () {
        // Clear any existing timer
        if (this._state.watchdogTimer) {
            clearInterval(this._state.watchdogTimer);
        }

        this._state.watchdogTimer = setInterval(() => {
            this._checkForFreeze();
        }, this._config.checkInterval);

        console.log(`PageFreezeDetector: Watchdog started with interval ${this._config.checkInterval}ms`);
    },

    /**
     * Start the heartbeat to indicate JavaScript is executing
     * @private
     */
    _startHeartbeat: function () {
        // Update heartbeat every 1 second
        setInterval(() => {
            // Guard against null state (component not yet fully initialized)
            if (!this._state) {
                return;
            }

            this._state.lastHeartbeat = Date.now();
            this._state.heartbeatCount++;

            // Update sentinel element
            const sentinel = document.getElementById('page-freeze-sentinel');
            if (sentinel) {
                sentinel.setAttribute('data-heartbeat', this._state.heartbeatCount.toString());
                sentinel.setAttribute('data-timestamp', Date.now().toString());
            }
        }, 1000);
    },

    /**
     * Check for page freeze conditions
     * @private
     */
    _checkForFreeze: function () {
        // Guard against null state/config (component not yet fully initialized)
        if (!this._state || !this._config) {
            return;
        }

        const now = Date.now();

        // Skip check if recovery is already in progress
        if (this._state.recoveryInProgress) {
            return;
        }

        // Check heartbeat if enabled
        if (this._config.enableHeartbeatCheck) {
            const heartbeatDelta = now - this._state.lastHeartbeat;
            if (heartbeatDelta > this._config.freezeThreshold) {
                console.warn(`PageFreezeDetector: Heartbeat timeout detected. Last heartbeat: ${heartbeatDelta}ms ago`);
                this._handleFreeze('heartbeat', heartbeatDelta);
                return;
            }
        }

        // Check UI responsiveness if enabled
        if (this._config.enableUICheck) {
            const uiDelta = now - this._state.lastUIResponse;
            if (uiDelta > this._config.freezeThreshold) {
                console.warn(`PageFreezeDetector: UI responsiveness timeout detected. Last response: ${uiDelta}ms ago`);
                this._handleFreeze('ui', uiDelta);
                return;
            }

            // Check for consistently slow UI responses
            if (this._state.uiResponseTimes.length >= 5) {
                const avgResponseTime = this._state.uiResponseTimes.reduce((a, b) => a + b, 0) / this._state.uiResponseTimes.length;
                if (avgResponseTime > 500) {
                    console.warn(`PageFreezeDetector: Consistently slow UI responses detected. Avg: ${avgResponseTime.toFixed(2)}ms`);
                    this._handleFreeze('slowUi', avgResponseTime);
                    return;
                }
            }
        }

        // Check for Google CSE specific issues
        if (this._checkForGoogleCSEIssues) {
            this._checkForGoogleCSEIssues();
        }

        // If we got here, no freeze detected
        if (this._state.freezeDetected) {
            console.log('PageFreezeDetector: System has recovered from previous freeze');
            this._state.freezeDetected = false;
        }
    },

    /**
     * Handle a detected freeze condition
     * @private
     * @param {string} type - Type of freeze detected
     * @param {number} value - Value associated with the freeze (e.g., time delta)
     */
    _handleFreeze: function (type, value) {
        // Mark freeze as detected
        this._state.freezeDetected = true;

        // Don't attempt recovery if already in progress
        if (this._state.recoveryInProgress) {
            return;
        }

        console.error(`PageFreezeDetector: Page freeze detected (${type}: ${value}). Attempting recovery...`);

        // Start recovery process
        this._state.recoveryInProgress = true;

        // Identify the type of freeze and handle accordingly
        if (this._isGoogleCSERelated && this._isGoogleCSERelated()) {
            if (this._recoverFromGoogleCSEFreeze) this._recoverFromGoogleCSEFreeze();
        } else {
            if (this._performGeneralRecovery) this._performGeneralRecovery();
        }

        // Reset recovery flag after a delay
        setTimeout(() => {
            this._state.recoveryInProgress = false;
        }, 5000);
    }
};
