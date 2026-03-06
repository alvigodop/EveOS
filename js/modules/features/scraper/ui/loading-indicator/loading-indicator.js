/**
 * Loading Indicator Module (Facade)
 * Handles the display and updates of the loading indicator / search monitor.
 *
 * Delegates to:
 * - LIStats: phase-based stats text generation
 * - LoadingIndicatorModules.createDomHelpers
 * - LoadingIndicatorModules.createDisplayHelpers
 *
 * @version 1.2.0-facade
 */
window.LoadingIndicatorModules = window.LoadingIndicatorModules || {};

const LoadingIndicator = (function () {
    const modules = window.LoadingIndicatorModules || {};
    const state = {
        compact: true,
        listenersReady: false,
        boundHandleOutsideClick: null,
        initialized: false,
        ensureTopLevelTimer: null
    };

    const api = {
        version: '1.2.0-facade',
        _loadingIndicatorCompact: true,
        _initialized: false,
        init: function () {
            if (state.initialized) return this;

            if (window.LIStats && typeof LIStats.init === 'function') {
                LIStats.init();
                LIStats._initialized = true;
            }

            const boot = () => {
                api.createLoadingIndicator();
                api.setupEventListeners();
            };

            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                boot();
            } else {
                document.addEventListener('DOMContentLoaded', boot, { once: true });
            }

            state.initialized = true;
            api._initialized = true;

            if (!state.ensureTopLevelTimer) {
                state.ensureTopLevelTimer = setInterval(() => api._ensureTopLevel(), 5000);
            }

            return this;
        }
    };

    const domHelpers = modules.createDomHelpers
        ? modules.createDomHelpers({ state, api })
        : null;
    const displayHelpers = modules.createDisplayHelpers
        ? modules.createDisplayHelpers({ state, api })
        : null;

    if (!domHelpers || !displayHelpers) {
        console.warn('[LoadingIndicator] DOM or display helpers are missing.');
    }

    Object.assign(api, domHelpers || {}, displayHelpers || {});
    return api;
})();

LoadingIndicator.init();

if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('LoadingIndicator', LoadingIndicator);
}

window.LoadingIndicator = LoadingIndicator;

console.log('LoadingIndicator module loaded');
