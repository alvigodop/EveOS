/* js/modules/gemini/gemini-init.js */
(function () {
    const GEMINI_MONITOR_VIEW_KEY = 'eve.geminiMonitorView';

    function shouldDebugBootLogs() {
        try {
            const qs = new URLSearchParams(window.location.search || '');
            if (qs.get('debugGeminiBoot') === '1') return true;
            return window.localStorage && window.localStorage.getItem('eve.debugGeminiBoot') === '1';
        } catch (e) {
            return false;
        }
    }

    function debugBootLog() {
        if (!shouldDebugBootLogs()) return;
        console.log.apply(console, arguments);
    }

    debugBootLog('Initializing Gemini Interface Integration...');

    function normalizeMonitorView(view) {
        return String(view || '').toLowerCase() === 'full' ? 'full' : 'summary';
    }

    function getPreferredMonitorView() {
        try {
            return normalizeMonitorView(window.localStorage && window.localStorage.getItem(GEMINI_MONITOR_VIEW_KEY));
        } catch (e) {
            return 'summary';
        }
    }

    function savePreferredMonitorView(view) {
        const normalized = normalizeMonitorView(view);
        try {
            if (window.localStorage) {
                window.localStorage.setItem(GEMINI_MONITOR_VIEW_KEY, normalized);
            }
        } catch (e) {
            // Ignore storage errors.
        }
        return normalized;
    }

    function shouldEagerBoot() {
        try {
            const qs = new URLSearchParams(window.location.search || '');
            if (qs.get('geminiBoot') === 'eager') return true;
            return window.localStorage && window.localStorage.getItem('eve.geminiBoot') === 'eager';
        } catch (e) {
            return false;
        }
    }

    function requestGeminiBoot(reason) {
        window.__GEMINI_BOOT_REQUESTED = true;

        if (typeof window.__loadGeminiScriptsNow === 'function') {
            return window.__loadGeminiScriptsNow();
        }

        // Script_Loader follows this module in the manifest. Keep the request
        // durable instead of relying on a single timing-sensitive retry.
        return new Promise(function (resolve) {
            const startWhenReady = function () {
                window.removeEventListener('eve:gemini-loader-ready', startWhenReady);
                if (typeof window.__loadGeminiScriptsNow === 'function') {
                    Promise.resolve(window.__loadGeminiScriptsNow()).then(resolve);
                    return;
                }
                resolve(null);
            };
            window.addEventListener('eve:gemini-loader-ready', startWhenReady, { once: true });
            window.setTimeout(function () {
                if (typeof window.__loadGeminiScriptsNow !== 'function') return;
                startWhenReady();
            }, 250);
            debugBootLog(`Gemini Init: Boot requested (${reason || 'manual'}), waiting for Script_Loader.`);
        });
    }

    function isWorkspaceCollapsed() {
        try {
            return !!(window.localStorage && window.localStorage.getItem('geminiDemoCollapsed') === 'true');
        } catch (e) {
            return false;
        }
    }

    function syncFullUiReadiness(container) {
        if (!container) return;
        const hasFullUi = !!container.querySelector('.mdl-layout__container');
        container.dataset.geminiFullReady = hasFullUi ? '1' : '0';
        if (hasFullUi && container.dataset.geminiMonitorView === 'full' && !isWorkspaceCollapsed()) {
            ensureExpandedWorkspace(container);
        }
    }

    function ensureExpandedWorkspace(container) {
        if (!container) return;
        try {
            if (window.localStorage) {
                window.localStorage.setItem('geminiDemoCollapsed', 'false');
            }
        } catch (e) {
            // Ignore storage errors.
        }

        container.classList.remove('gemini-collapsed-mode');
        const layout = container.querySelector('.mdl-layout');
        const layoutContainer = container.querySelector('.mdl-layout__container');
        const headerButton = container.querySelector('#header-collapse-btn');
        const headerIcon = container.querySelector('#header-collapse-icon');

        [layout, layoutContainer].forEach(function (node) {
            if (node) node.classList.remove('gemini-collapsed-mode');
        });

        if (headerButton) headerButton.title = 'Collapse Workspace';
        if (headerIcon) headerIcon.textContent = 'expand_less';
    }

    function stopFullUiPolling(container) {
        if (!container || !container.__geminiFullUiPollTimer) return;
        window.clearInterval(container.__geminiFullUiPollTimer);
        container.__geminiFullUiPollTimer = null;
    }

    function startFullUiPolling(container) {
        if (!container || container.__geminiFullUiPollTimer) return;
        const startedAt = Date.now();
        container.__geminiFullUiPollTimer = window.setInterval(function () {
            if (!document.body.contains(container) || container.dataset.geminiMonitorView !== 'full' || Date.now() - startedAt > 30000) {
                stopFullUiPolling(container);
                return;
            }
            syncFullUiReadiness(container);
            if (container.dataset.geminiFullReady === '1') {
                stopFullUiPolling(container);
            }
        }, 500);
    }

    function updateMonitorViewState(container, view) {
        if (!container) return;
        const normalized = savePreferredMonitorView(view);
        container.dataset.geminiMonitorView = normalized;
        const indicator = container.closest('#loadingIndicator');
        indicator?.classList.toggle('gemini-monitor-workspace-active', normalized === 'full');
        syncFullUiReadiness(container);

        container.querySelectorAll('[data-gemini-monitor-view-btn]').forEach(function (button) {
            const isActive = button.dataset.geminiMonitorViewBtn === normalized;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (normalized === 'full') {
            ensureExpandedWorkspace(container);
            requestGeminiBoot('full-monitor-view');
            startFullUiPolling(container);
        } else {
            stopFullUiPolling(container);
        }
    }

    function bindMonitorViewControls(container) {
        if (!container || container.dataset.geminiMonitorViewBound === '1') return;
        container.dataset.geminiMonitorViewBound = '1';

        container.querySelectorAll('[data-gemini-monitor-view-btn]').forEach(function (button) {
            button.addEventListener('click', function () {
                updateMonitorViewState(container, button.dataset.geminiMonitorViewBtn);
            });
        });
    }

    function bindOnDemandBoot(container) {
        if (!container || container.dataset.geminiBootBound === '1') return;
        container.dataset.geminiBootBound = '1';

        const trigger = function () {
            requestGeminiBoot('ui-interaction');
        };

        container.addEventListener('pointerdown', trigger, { once: true, passive: true });
        container.addEventListener('focusin', trigger, { once: true });
        container.addEventListener('keydown', trigger, { once: true });
    }

    function injectGeminiUI() {
        if (document.getElementById('gemini-ui-root')) {
            return;
        }

        const geminiContainer = document.createElement('div');
        geminiContainer.id = 'gemini-ui-root';
        geminiContainer.className = 'gemini-monitor-shell';
        geminiContainer.tabIndex = 0;

        geminiContainer.innerHTML = `
            <div class="gemini-monitor-shell-toolbar">
                <div class="gemini-monitor-shell-copy">
                    <div class="gemini-monitor-shell-kicker">Gemini Link</div>
                    <div class="gemini-monitor-shell-title">Search Monitor Assistant</div>
                </div>
                <div class="gemini-monitor-toolbar-actions">
                    <div class="gemini-server-control" data-gemini-server-control data-state="checking">
                        <span class="gemini-server-state" data-gemini-server-status>Checking</span>
                        <button type="button" class="gemini-server-toggle" data-gemini-server-toggle disabled>
                            <i class="material-icons" aria-hidden="true">sync</i>
                            <span data-gemini-server-action-label>Start</span>
                        </button>
                    </div>
                    <div class="gemini-monitor-view-switch" role="group" aria-label="Gemini monitor view">
                        <button type="button" class="gemini-monitor-view-btn" data-gemini-monitor-view-btn="summary">Compact</button>
                        <button type="button" class="gemini-monitor-view-btn" data-gemini-monitor-view-btn="full">Workspace</button>
                    </div>
                </div>
            </div>
            <div id="gemini-monitor-summary-pane" class="gemini-monitor-summary-pane">
                <div id="gemini-monitor-summary-card" class="gemini-monitor-card" data-collapsible-section="monitor-surface">
                    <div class="gemini-monitor-head" data-collapsible-header>
                        <div>
                            <div class="gemini-monitor-kicker">Gemini Live Link</div>
                            <h3 class="gemini-monitor-title">Search Monitor Surface</h3>
                        </div>
                        <div class="gemini-monitor-pill">On Demand</div>
                    </div>
                    <div class="gemini-monitor-body" data-collapsible-body>
                        <div class="gemini-monitor-status-row">
                            <span class="gemini-monitor-status-dot" aria-hidden="true"></span>
                            <span class="gemini-monitor-status-text">Standing by for context relay, prompt assist, and live tool controls.</span>
                        </div>
                        <p class="gemini-monitor-copy">Compact keeps the short relay surface. Workspace keeps this summary visible and opens the full Gemini layout underneath it.</p>
                        <p class="gemini-monitor-meta">Modules stay deferred until needed, then the broader Gemini workspace boots in-place without leaving Search Monitor.</p>
                    </div>
                </div>
            </div>
        `;

        let target = document.getElementById('gemini-placeholder');
        if (target) {
            target.appendChild(geminiContainer);
            debugBootLog('Gemini Init: UI injected into placeholder.');
        } else {
            const indicatorContent = document.querySelector('#loadingIndicator .indicator-content');
            if (!indicatorContent || !indicatorContent.querySelector('.indicator-title')) {
                debugBootLog('Gemini Init: Search Monitor structure not ready, waiting...');
                setTimeout(injectGeminiUI, 500);
                return;
            }
            const title = indicatorContent.querySelector('.indicator-title');
            if (title && title.nextSibling) {
                indicatorContent.insertBefore(geminiContainer, title.nextSibling);
            } else {
                indicatorContent.prepend(geminiContainer);
            }
            debugBootLog('Gemini Init: UI injected using fallback order logic.');
        }

        bindMonitorViewControls(geminiContainer);
        bindOnDemandBoot(geminiContainer);
        syncFullUiReadiness(geminiContainer);
        updateMonitorViewState(geminiContainer, getPreferredMonitorView());

        if (shouldEagerBoot()) {
            requestGeminiBoot('eager-setting');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectGeminiUI);
    } else {
        injectGeminiUI();
    }
})();
