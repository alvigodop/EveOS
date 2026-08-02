/* Script Loader for EveOS */
(function () {
    const scripts = window.EveModuleManifest ? window.EveModuleManifest.scripts : [];
    const EXTERNAL_SCRIPT_LOAD_TIMEOUT_MS = 45000;
    const bootstrap = window.EveScriptLoaderBootstrap;
    const {
        MAX_BOOTSTRAP_RELOADS,
        getReloadAttempts,
        setReloadAttempts,
        clearReloadAttempts,
        hasRecoverableBootContent,
        preserveVisibleBootstrapState
    } = bootstrap;
    const DEFERRED_LOAD_DELAY_MS = 1500;
    const CRITICAL_BATCH_SIZE = 12;
    // Batching (12 in flight, awaited per batch) is what keeps the main thread responsive;
    // this pause is only extra paint headroom. At 15ms the ~55 inter-batch pauses added a
    // fixed ~825ms to every boot, so keep it just above zero.
    const CRITICAL_BATCH_PAUSE_MS = 3;
    const LOCALHOST_CRITICAL_BATCH_MIN_SCRIPTS = 80;
    const DEFERRED_IDLE_TIMEOUT_MS = 2500;
    const DEFERRED_BATCH_SIZE = 4;
    const DEFERRED_BATCH_PAUSE_MS = 300;
    const DEFERRED_QUIET_WINDOW_MS = 2000;
    const DEFERRED_PRESSURE_DOM_NODES = 12000;
    const DEFERRED_HEAVY_DOM_NODES = 24000;
    const DEFERRED_PRESSURE_IMAGES = 1200;
    const DEFERRED_HEAVY_IMAGES = 2400;
    const DEFERRED_BUSY_PAUSE_MS = 650;
    const DEFERRED_PRESSURE_PAUSE_MS = 900;
    const DEFERRED_HEAVY_PAUSE_MS = 1400;
    const DEFERRED_LARGE_PACK_LINKS = 3500;
    const DEFERRED_LARGE_PACK_HOLD_MS = 45000;
    const DEFERRED_LARGE_PACK_BATCH_SIZE = 1, DEFERRED_LARGE_PACK_PAUSE_MS = 1500;
    let lastUserInteractionAt = Date.now();

    if (!window.EveModuleManifest) {
        console.error("EveOS Manifest not found! Scripts will not load.");
    }

    function noteUserInteraction() { lastUserInteractionAt = Date.now(); }

    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((eventName) => {
        window.addEventListener(eventName, noteUserInteraction, { passive: true });
    });

    function attachGlobalBodyListeners() {
        if (!document.body || window.__eveScriptLoaderBodyListenersAttached) return;
        window.__eveScriptLoaderBodyListenersAttached = true;
        document.body.addEventListener('click', () => {
            if (typeof closeAllMenus === 'function') closeAllMenus();
        });
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
        // Batch on file:// too — without this, 800+ scripts evaluate in one
        // synchronous block causing "page isn't responding" dialogs
        if (window.location.protocol === 'file:') return true;
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
            document.head.appendChild(s);
        });
    }

    function sleep(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

    function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

    function getDomPressure() {
        try {
            return {
                domNodes: document.body ? document.body.getElementsByTagName('*').length : 0,
                images: document.images ? document.images.length : 0
            };
        } catch {
            return { domNodes: 0, images: 0 };
        }
    }

    function getDeferredLiveLinkCount() {
        try {
            if (typeof window.getLiveLinks === 'function') {
                const links = window.getLiveLinks();
                return Array.isArray(links) ? links.length : 0;
            }
            if (Array.isArray(window.eveState?.links)) return window.eveState.links.length;
        } catch {
            // Ignore transient state access errors during bootstrap.
        }
        return 0;
    }

    function getDeferredBusyReason(pressure) {
        const now = Date.now();
        if (document.visibilityState === 'hidden') return 'hidden';
        if (window._eveDashRenderPending) return 'dashboard-render';
        if (Number(window.__eveLargeMutationActiveUntil || 0) > now) return 'large-mutation';
        if (Number(window.__eveSuppressFaviconRefreshUntil || 0) > now) return 'favicon-suppressed';
        const startedAt = Number(window.__EVE_DEFERRED_SCRIPT_STATE?.startedAt || 0);
        const liveLinkCount = getDeferredLiveLinkCount();
        if (
            !window.__RUSH_DEFERRED_LOAD
            && liveLinkCount >= DEFERRED_LARGE_PACK_LINKS
            && startedAt > 0
            && now - startedAt < DEFERRED_LARGE_PACK_HOLD_MS
        ) {
            return 'large-pack-startup-hold';
        }
        const domNodes = Number(pressure?.domNodes || 0);
        const images = Number(pressure?.images || 0);
        if (window._eveStartupBookmarkPaintActive && (domNodes > 6000 || images > 700)) return 'startup-paint';
        if ((domNodes > DEFERRED_PRESSURE_DOM_NODES || images > DEFERRED_PRESSURE_IMAGES)
            && document.querySelector('[data-card-hydrating="1"]')) {
            return 'card-hydration';
        }
        return '';
    }

    function getDeferredBatchPlan() {
        const pressure = getDomPressure();
        let batchSize = DEFERRED_BATCH_SIZE;
        let pauseMs = DEFERRED_BATCH_PAUSE_MS;
        let phase = 'normal';
        const liveLinkCount = getDeferredLiveLinkCount();

        if (!window.__RUSH_DEFERRED_LOAD && liveLinkCount >= DEFERRED_LARGE_PACK_LINKS) {
            batchSize = DEFERRED_LARGE_PACK_BATCH_SIZE;
            pauseMs = DEFERRED_LARGE_PACK_PAUSE_MS;
            phase = 'large-pack-background';
        } else if (pressure.domNodes > DEFERRED_HEAVY_DOM_NODES || pressure.images > DEFERRED_HEAVY_IMAGES) {
            batchSize = 1;
            pauseMs = DEFERRED_HEAVY_PAUSE_MS;
            phase = 'heavy-dom-pressure';
        } else if (pressure.domNodes > DEFERRED_PRESSURE_DOM_NODES || pressure.images > DEFERRED_PRESSURE_IMAGES) {
            batchSize = Math.min(batchSize, 2);
            pauseMs = DEFERRED_PRESSURE_PAUSE_MS;
            phase = 'dom-pressure';
        }

        return {
            batchSize: Math.max(1, batchSize),
            pauseMs: Math.max(0, pauseMs),
            phase,
            domNodes: pressure.domNodes,
            images: pressure.images,
            liveLinkCount
        };
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
            if (window.__RUSH_DEFERRED_LOAD) {
                resolve();
                return;
            }
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => resolve(), { timeout: DEFERRED_IDLE_TIMEOUT_MS });
                return;
            }
            window.setTimeout(resolve, DEFERRED_BATCH_PAUSE_MS);
        });
    }

    async function waitForQuietWindow() {
        while (true) {
            if (window.__RUSH_DEFERRED_LOAD) return;
            const quietForMs = Date.now() - lastUserInteractionAt;
            const isVisible = document.visibilityState !== 'hidden';
            const pressure = getDomPressure();
            const busyReason = getDeferredBusyReason(pressure);
            if (window.__EVE_DEFERRED_SCRIPT_STATE) {
                window.__EVE_DEFERRED_SCRIPT_STATE.pausedReason = busyReason || (isVisible ? '' : 'hidden');
                window.__EVE_DEFERRED_SCRIPT_STATE.domNodes = pressure.domNodes;
                window.__EVE_DEFERRED_SCRIPT_STATE.images = pressure.images;
            }
            if (isVisible && quietForMs >= DEFERRED_QUIET_WINDOW_MS && !busyReason) {
                return;
            }
            const quietWait = Math.max(200, DEFERRED_QUIET_WINDOW_MS - quietForMs);
            await sleep(busyReason ? Math.max(DEFERRED_BUSY_PAUSE_MS, Math.min(quietWait, 1200)) : quietWait);
        }
    }

    async function loadDeferredScriptsInBatches(deferredScripts) {
        if (!Array.isArray(deferredScripts) || !deferredScripts.length) return;

        window.__EVE_DEFERRED_SCRIPT_STATE = {
            total: deferredScripts.length,
            loaded: 0,
            failed: 0,
            startedAt: Date.now(),
            batchSize: DEFERRED_BATCH_SIZE,
            lastPauseMs: 0,
            phase: 'pending',
            pausedReason: ''
        };

        console.log(`Loading deferred scripts in background (${deferredScripts.length})...`);

        for (let i = 0; i < deferredScripts.length;) {
            await waitForQuietWindow();
            await waitForIdleTask();

            const plan = getDeferredBatchPlan();
            const batch = deferredScripts.slice(i, i + plan.batchSize);
            const batchStarted = nowMs();
            window.__EVE_DEFERRED_SCRIPT_STATE.batchSize = batch.length;
            window.__EVE_DEFERRED_SCRIPT_STATE.phase = plan.phase;
            window.__EVE_DEFERRED_SCRIPT_STATE.domNodes = plan.domNodes;
            window.__EVE_DEFERRED_SCRIPT_STATE.images = plan.images;
            window.__EVE_DEFERRED_SCRIPT_STATE.remaining = Math.max(0, deferredScripts.length - i);
            const results = await Promise.allSettled(batch.map((src) => loadScript(src)));
            const batchDuration = nowMs() - batchStarted;
            i += batch.length;

            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    window.__EVE_DEFERRED_SCRIPT_STATE.loaded += 1;
                } else {
                    window.__EVE_DEFERRED_SCRIPT_STATE.failed += 1;
                }
            });
            window.__EVE_DEFERRED_SCRIPT_STATE.loadedAt = Date.now();
            window.__EVE_DEFERRED_SCRIPT_STATE.remaining = Math.max(0, deferredScripts.length - i);

            window.EvePerformanceMonitor?.recordOperation?.('deferred-script-batch', batchDuration, {
                source: 'script-loader',
                batchSize: batch.length,
                remaining: Math.max(0, deferredScripts.length - i),
                total: deferredScripts.length,
                domNodes: plan.domNodes,
                images: plan.images,
                phase: plan.phase,
                liveLinkCount: plan.liveLinkCount
            });

            if (i < deferredScripts.length) {
                const pauseMs = window.__RUSH_DEFERRED_LOAD ? 0 : plan.pauseMs;
                window.__EVE_DEFERRED_SCRIPT_STATE.lastPauseMs = pauseMs;
                if (pauseMs > 0) await sleep(pauseMs);
            }
        }

        window.__EVE_DEFERRED_SCRIPT_STATE.completedAt = Date.now();
    }

    async function init() {
        const previousReloadAttempts = getReloadAttempts();
        // Clear stale attempts at startup so manual reloads can auto-recover once again.
        if (previousReloadAttempts > 0) clearReloadAttempts();

        try {
            const { criticalScripts, deferredScripts } = getBootBuckets();
            const hasDeferredScripts = deferredScripts.length > 0;
            let deferredLoadPromise = null;
            performance.mark('eve:critical-scripts:start');
            if (shouldBatchCriticalScripts(criticalScripts)) {
                console.log(`Starting batched critical script loading (${criticalScripts.length})...`);
                await loadScriptsInBatches(criticalScripts, CRITICAL_BATCH_SIZE, CRITICAL_BATCH_PAUSE_MS);
            } else {
                console.log('Starting parallel script loading...');
                await Promise.all(criticalScripts.map((src) => loadScript(src)));
            }
            performance.mark('eve:critical-scripts:end');
            const criticalMeasure = performance.measure('eve:critical-scripts', 'eve:critical-scripts:start', 'eve:critical-scripts:end');
            const criticalMs = Math.round(criticalMeasure ? criticalMeasure.duration : 0);
            clearReloadAttempts();
            if (hasDeferredScripts) {
                console.log(`Critical scripts loaded (${criticalScripts.length}/${scripts.length}) in ${criticalMs}ms. Initializing...`);
            } else {
                console.log(`All scripts loaded in ${criticalMs}ms. Initializing...`);
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

            // Attach global listeners before data hydration so a preserved post-render warning stays interactive.
            attachGlobalBodyListeners();

            // Initialize Data
            if (typeof loadData === 'function') await loadData();

            const runDeferredLoad = async () => {
                if (!hasDeferredScripts) {
                    return;
                }
                if (!deferredLoadPromise) {
                    deferredLoadPromise = (async () => {
                        try {
                            performance.mark('eve:deferred-scripts:start');
                            await loadDeferredScriptsInBatches(deferredScripts);
                            performance.mark('eve:deferred-scripts:end');
                            const deferredMeasure = performance.measure('eve:deferred-scripts', 'eve:deferred-scripts:start', 'eve:deferred-scripts:end');
                            if (window.ScraperInit && typeof ScraperInit.init === 'function') ScraperInit.init();
                            console.log(`All scripts loaded (deferred phase ${Math.round(deferredMeasure ? deferredMeasure.duration : 0)}ms).`);
                        } catch (deferredError) {
                            console.warn('[ScriptLoader] Deferred script load warning:', deferredError);
                            throw deferredError;
                        }
                    })();
                }
                return deferredLoadPromise;
            };

            window.__loadDeferredScriptsNow = function () {
                window.__RUSH_DEFERRED_LOAD = true;
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

            if (hasRecoverableBootContent()) {
                preserveVisibleBootstrapState(err, failedSrc);
                return;
            }

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
