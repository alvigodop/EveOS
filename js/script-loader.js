/* Script Loader for EveOS */
(function () {
    const scripts = window.EveModuleManifest ? window.EveModuleManifest.scripts : [];
    const EXTERNAL_SCRIPT_LOAD_TIMEOUT_MS = 45000;
    const MAX_BOOTSTRAP_RELOADS = 1;
    const RELOAD_ATTEMPT_KEY = 'eveos.scriptLoader.reloadAttempts';
    const DEFERRED_LOAD_DELAY_MS = 6000;
    const CRITICAL_BATCH_SIZE = 16;
    const CRITICAL_BATCH_PAUSE_MS = 10;
    const LOCALHOST_CRITICAL_BATCH_MIN_SCRIPTS = 80;
    const DEFERRED_IDLE_TIMEOUT_MS = 2500;
    const DEFERRED_BATCH_SIZE = 4;
    const DEFERRED_BATCH_PAUSE_MS = 300;
    const DEFERRED_QUIET_WINDOW_MS = 2000;
    let lastUserInteractionAt = Date.now();

    if (!window.EveModuleManifest) {
        console.error("EveOS Manifest not found! Scripts will not load.");
    }

    function noteUserInteraction() {
        lastUserInteractionAt = Date.now();
    }

    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((eventName) => {
        window.addEventListener(eventName, noteUserInteraction, { passive: true });
    });

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

    function shouldDeferScript(src) {
        const normalized = String(src || '');
        if (isExternalScript(normalized)) return true;
        const host = String(window.location.hostname || '').toLowerCase();
        const isLocalBootstrapContext = window.location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
        if (!isLocalBootstrapContext) return false;
        if (normalized.includes('/scraper/')) return true;
        return false;
    }

    function shouldBatchCriticalScripts(criticalScripts) {
        if (!Array.isArray(criticalScripts) || criticalScripts.length < LOCALHOST_CRITICAL_BATCH_MIN_SCRIPTS) {
            return false;
        }
        const host = String(window.location.hostname || '').toLowerCase();
        return host === 'localhost' || host === '127.0.0.1';
    }

    function getBootBuckets() {
        const criticalScripts = [];
        const deferredScripts = [];
        scripts.forEach((src) => {
            if (shouldDeferScript(src)) deferredScripts.push(src);
            else criticalScripts.push(src);
        });
        return { criticalScripts, deferredScripts };
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

    function sleep(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function loadScriptsInBatches(scriptSources, batchSize, pauseMs = 0) {
        if (!Array.isArray(scriptSources) || !scriptSources.length) return;
        const size = Math.max(1, Number(batchSize) || 1);
        for (let i = 0; i < scriptSources.length; i += size) {
            const batch = scriptSources.slice(i, i + size);
            await Promise.all(batch.map((src) => loadScript(src)));
            if (pauseMs > 0 && i + size < scriptSources.length) {
                await sleep(pauseMs);
            }
        }
    }

    function waitForIdleTask() {
        return new Promise((resolve) => {
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => resolve(), { timeout: DEFERRED_IDLE_TIMEOUT_MS });
                return;
            }
            window.setTimeout(resolve, DEFERRED_BATCH_PAUSE_MS);
        });
    }

    async function waitForQuietWindow() {
        while (true) {
            const quietForMs = Date.now() - lastUserInteractionAt;
            const isVisible = document.visibilityState !== 'hidden';
            if (isVisible && quietForMs >= DEFERRED_QUIET_WINDOW_MS) {
                return;
            }
            await sleep(Math.max(200, DEFERRED_QUIET_WINDOW_MS - quietForMs));
        }
    }

    async function loadDeferredScriptsInBatches(deferredScripts) {
        if (!Array.isArray(deferredScripts) || !deferredScripts.length) return;

        window.__EVE_DEFERRED_SCRIPT_STATE = {
            total: deferredScripts.length,
            loaded: 0,
            failed: 0,
            startedAt: Date.now()
        };

        console.log(`Loading deferred scripts in background (${deferredScripts.length})...`);

        for (let i = 0; i < deferredScripts.length; i += DEFERRED_BATCH_SIZE) {
            await waitForQuietWindow();
            await waitForIdleTask();

            const batch = deferredScripts.slice(i, i + DEFERRED_BATCH_SIZE);
            const results = await Promise.allSettled(batch.map((src) => loadScript(src)));

            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    window.__EVE_DEFERRED_SCRIPT_STATE.loaded += 1;
                } else {
                    window.__EVE_DEFERRED_SCRIPT_STATE.failed += 1;
                }
            });

            if (i + DEFERRED_BATCH_SIZE < deferredScripts.length) {
                await sleep(DEFERRED_BATCH_PAUSE_MS);
            }
        }

        window.__EVE_DEFERRED_SCRIPT_STATE.completedAt = Date.now();
    }

    async function init() {
        // Optimize: Create head alias
        document.h = document.head || document.getElementsByTagName('head')[0];
        const previousReloadAttempts = getReloadAttempts();
        // Clear stale attempts at startup so manual reloads can auto-recover once again.
        if (previousReloadAttempts > 0) clearReloadAttempts();

        try {
            const { criticalScripts, deferredScripts } = getBootBuckets();
            const hasDeferredScripts = deferredScripts.length > 0;
            let deferredLoadPromise = null;
            if (shouldBatchCriticalScripts(criticalScripts)) {
                console.log(`Starting batched critical script loading (${criticalScripts.length})...`);
                await loadScriptsInBatches(criticalScripts, CRITICAL_BATCH_SIZE, CRITICAL_BATCH_PAUSE_MS);
            } else {
                console.log('Starting parallel script loading...');
                await Promise.all(criticalScripts.map((src) => loadScript(src)));
            }
            clearReloadAttempts();
            if (hasDeferredScripts) {
                console.log(`Critical scripts loaded (${criticalScripts.length}/${scripts.length}). Initializing...`);
            } else {
                console.log('All scripts loaded. Initializing...');
            }

            // Initialize Modals
            if (typeof initModals === 'function') initModals();

            // Initialize UI Components
            if (typeof initContextMenus === 'function') initContextMenus();
            if (typeof initScratchpad === 'function') initScratchpad();
            if (typeof initBulkToolbar === 'function') initBulkToolbar();

            if (!hasDeferredScripts && window.ScraperInit && typeof ScraperInit.init === 'function') {
                ScraperInit.init();
            }

            // Initialize Data
            if (typeof loadData === 'function') loadData();

            // Attach global listeners that were on body
            document.body.onclick = (e) => {
                if (typeof closeAllMenus === 'function') closeAllMenus();
            };

            const runDeferredLoad = async () => {
                if (!hasDeferredScripts) {
                    return;
                }
                if (!deferredLoadPromise) {
                    deferredLoadPromise = (async () => {
                        try {
                            await loadDeferredScriptsInBatches(deferredScripts);
                            if (window.ScraperInit && typeof ScraperInit.init === 'function') ScraperInit.init();
                            console.log('All scripts loaded.');
                        } catch (deferredError) {
                            console.warn('[ScriptLoader] Deferred script load warning:', deferredError);
                            throw deferredError;
                        }
                    })();
                }
                return deferredLoadPromise;
            };

            window.__loadDeferredScriptsNow = function () {
                return runDeferredLoad();
            };

            if (typeof window.requestIdleCallback === 'function' && hasDeferredScripts) {
                window.requestIdleCallback(() => { runDeferredLoad(); }, { timeout: DEFERRED_LOAD_DELAY_MS });
            } else {
                window.setTimeout(() => { runDeferredLoad(); }, hasDeferredScripts ? DEFERRED_LOAD_DELAY_MS : 0);
            }

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
