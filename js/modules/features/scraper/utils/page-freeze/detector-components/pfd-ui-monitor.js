/**
 * PageFreezeDetector UI Monitor Component
 * Monitors UI thread responsiveness using invisible elements
 */
window.PageFreezeUIMonitor = {
    /**
     * Start monitoring UI responsiveness
     * @private
     */
    _startUIMonitoring: function () {
        // Create invisible button to measure UI thread responsiveness
        const button = document.createElement('button');
        button.id = 'freeze-detector-button';
        button.style.position = 'absolute';
        button.style.left = '-9999px';
        button.style.top = '-9999px';
        button.style.width = '1px';
        button.style.height = '1px';
        button.style.opacity = '0.01';
        document.body.appendChild(button);

        // Check UI responsiveness every 500ms
        this._state.uiWatchdogTimer = setInterval(() => {
            const startTime = performance.now();

            // Queue a click event
            setTimeout(() => {
                const btn = document.getElementById('freeze-detector-button');
                if (btn) {
                    btn.click();

                    // Measure time it takes for the event to be processed
                    const responseTime = performance.now() - startTime;

                    // Store response time
                    this._state.uiResponseTimes.push(responseTime);

                    // Keep only the last 10 measurements
                    if (this._state.uiResponseTimes.length > 10) {
                        this._state.uiResponseTimes.shift();
                    }

                    // Update last UI response time
                    this._state.lastUIResponse = Date.now();

                    // Log unusual response times
                    if (responseTime > 200 && this._config.debugMode) {
                        console.warn(`PageFreezeDetector: Slow UI response: ${responseTime.toFixed(2)}ms`);
                    }
                }
            }, 0);
        }, 500);
    },

    /**
     * Create a hidden sentinel element for easier debugging
     * @private
     */
    _createSentinelElement: function () {
        const sentinel = document.createElement('div');
        sentinel.id = 'page-freeze-sentinel';
        sentinel.setAttribute('data-module', 'PageFreezeDetector');
        sentinel.setAttribute('data-version', this.version);
        sentinel.setAttribute('data-heartbeat', '0');
        sentinel.setAttribute('data-timestamp', Date.now().toString());
        sentinel.style.display = 'none';
        document.body.appendChild(sentinel);
    }
};
