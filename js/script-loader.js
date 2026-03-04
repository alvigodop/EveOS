/* Script Loader for EveOS */
(function () {
    const scripts = window.EveModuleManifest ? window.EveModuleManifest.scripts : [];
    const EXTERNAL_SCRIPT_LOAD_TIMEOUT_MS = 45000;
    const MAX_BOOTSTRAP_RELOADS = 1;
    const RELOAD_ATTEMPT_KEY = 'eveos.scriptLoader.reloadAttempts';

    if (!window.EveModuleManifest) {
        console.error("EveOS Manifest not found! Scripts will not load.");
    }

    function getReloadAttempts() {
        try {
            const raw = Number(sessionStorage.getItem(RELOAD_ATTEMPT_KEY) || '0');
            return Number.isFinite(raw) && raw > 0 ? raw : 0;
        } catch {
            return 0;
        }
    }

    function setReloadAttempts(value) {
        try {
            sessionStorage.setItem(RELOAD_ATTEMPT_KEY, String(Math.max(0, Number(value) || 0)));
        } catch {
            // Ignore storage errors in restricted browser modes.
        }
    }

    function clearReloadAttempts() {
        try {
            sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
        } catch {
            // Ignore storage errors in restricted browser modes.
        }
    }

    function isExternalScript(src) {
        try {
            const target = new URL(String(src || ''), window.location.href);
            return target.origin !== window.location.origin;
        } catch {
            return false;
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            let settled = false;
            let timeoutId = null;

            const cleanup = () => {
                s.onload = null;
                s.onerror = null;
                if (timeoutId) {
                    window.clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            const fail = (reason, event) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (s.parentNode) {
                    s.parentNode.removeChild(s);
                }
                reject({ src, reason, event });
            };

            s.src = src;
            s.async = false; // Key for parallel download + sequential execution
            s.onload = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(src);
            };
            s.onerror = (event) => fail('error', event);
            // Do not timeout same-origin scripts; this app intentionally loads a very large local module graph.
            if (isExternalScript(src)) {
                timeoutId = window.setTimeout(() => fail('timeout'), EXTERNAL_SCRIPT_LOAD_TIMEOUT_MS);
            }
            document.h.appendChild(s);
        });
    }

    async function init() {
        // Optimize: Create head alias
        document.h = document.head || document.getElementsByTagName('head')[0];
        const previousReloadAttempts = getReloadAttempts();
        // Clear stale attempts at startup so manual reloads can auto-recover once again.
        if (previousReloadAttempts > 0) clearReloadAttempts();

        try {
            console.log('Starting parallel script loading...');

            // Create all script tags immediately to trigger parallel downloads
            const promises = scripts.map(src => loadScript(src));

            // Wait for all to complete
            await Promise.all(promises);
            clearReloadAttempts();
            console.log('All scripts loaded. Initializing...');

            // Initialize Modals
            if (typeof initModals === 'function') initModals();

            // Initialize UI Components
            if (typeof initContextMenus === 'function') initContextMenus();
            if (typeof initScratchpad === 'function') initScratchpad();
            if (typeof initBulkToolbar === 'function') initBulkToolbar();

            // Initialize Scraper Feature
            if (window.ScraperInit && typeof ScraperInit.init === 'function') ScraperInit.init();

            // Initialize Data
            if (typeof loadData === 'function') loadData();

            // Attach global listeners that were on body
            document.body.onclick = (e) => {
                if (typeof closeAllMenus === 'function') closeAllMenus();
            };

        } catch (err) {
            const failedSrc = err?.src || err?.event?.target?.src || 'unknown script';
            const reloadAttempts = previousReloadAttempts;
            console.warn(`[ScriptLoader] Failed to load ${failedSrc} (${err?.reason || 'error'}).`, err?.event || err);

            if (reloadAttempts < MAX_BOOTSTRAP_RELOADS) {
                const nextAttempt = reloadAttempts + 1;
                setReloadAttempts(nextAttempt);
                console.warn(`[ScriptLoader] Retrying bootstrap by reloading page (${nextAttempt}/${MAX_BOOTSTRAP_RELOADS})...`);
                window.setTimeout(() => window.location.reload(), 250);
                return;
            }

            clearReloadAttempts();
            console.warn('Initialization warning:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
