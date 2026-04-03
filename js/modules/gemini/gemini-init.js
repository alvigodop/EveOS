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
            window.__loadGeminiScriptsNow();
            return;
        }

        // Script_Loader may not be parsed yet; retry once shortly.
        window.setTimeout(function () {
            if (typeof window.__loadGeminiScriptsNow === 'function') {
                window.__loadGeminiScriptsNow();
            } else {
                debugBootLog(`Gemini Init: Boot requested (${reason || 'manual'}), waiting for Script_Loader.`);
            }
        }, 250);
    }

    function syncFullUiReadiness(container) {
        if (!container) return;
        const hasFullUi = !!container.querySelector('.mdl-layout__container');
        container.dataset.geminiFullReady = hasFullUi ? '1' : '0';
        syncWorkspaceShell(container);
        if (hasFullUi && container.dataset.geminiMonitorView === 'full') {
            ensureExpandedWorkspace(container);
        }
    }

    function syncWorkspaceShell(container) {
        if (!container) return;
        const shell = container.querySelector('#gemini-monitor-workspace-shell');
        const primarySlot = container.querySelector('#gemini-monitor-live-link-slot');
        const secondarySlot = container.querySelector('#gemini-monitor-workspace-secondary');
        const note = container.querySelector('#gemini-monitor-workspace-note');
        if (!shell || !primarySlot || !secondarySlot || !note) return;

        const liveLinkCard = document.getElementById('gemini-live-link-card');
        if (liveLinkCard && liveLinkCard.parentElement !== primarySlot) {
            primarySlot.appendChild(liveLinkCard);
        }

        const legacyCards = Array.from(document.querySelectorAll('.agentic-function-card'))
            .filter(function (card) {
                return card.id && card.id !== 'gemini-live-link-card' && card.parentElement !== secondarySlot;
            });
        legacyCards.forEach(function (card) {
            secondarySlot.appendChild(card);
        });

        const hasPrimary = primarySlot.children.length > 0;
        const hasSecondary = secondarySlot.children.length > 0;
        const nextNoteText = hasPrimary
            ? (hasSecondary
                ? 'Legacy Gemini controls are available below the compact monitor card.'
                : 'Full Gemini Live Link controls are available below the compact monitor card.')
            : 'Loading the expanded Gemini Live Link controls...';

        shell.dataset.hasCards = hasPrimary || hasSecondary ? '1' : '0';
        if (note.textContent !== nextNoteText) {
            note.textContent = nextNoteText;
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

        if (headerButton) headerButton.title = 'Collapse Demo';
        if (headerIcon) headerIcon.textContent = 'expand_less';
    }

    function stopWorkspaceSyncLoop(container) {
        if (!container || !container.__geminiWorkspaceSyncTimer) return;
        window.clearInterval(container.__geminiWorkspaceSyncTimer);
        container.__geminiWorkspaceSyncTimer = null;
    }

    function startWorkspaceSyncLoop(container) {
        if (!container || container.__geminiWorkspaceSyncTimer) return;
        const startedAt = Date.now();
        container.__geminiWorkspaceSyncTimer = window.setInterval(function () {
            if (!document.body.contains(container) || container.dataset.geminiMonitorView !== 'full' || Date.now() - startedAt > 30000) {
                stopWorkspaceSyncLoop(container);
                return;
            }
            ensureExpandedWorkspace(container);
            syncWorkspaceShell(container);
        }, 400);
    }

    function updateMonitorViewState(container, view) {
        if (!container) return;
        const normalized = savePreferredMonitorView(view);
        container.dataset.geminiMonitorView = normalized;
        syncFullUiReadiness(container);

        container.querySelectorAll('[data-gemini-monitor-view-btn]').forEach(function (button) {
            const isActive = button.dataset.geminiMonitorViewBtn === normalized;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (normalized === 'full') {
            ensureExpandedWorkspace(container);
            startWorkspaceSyncLoop(container);
            requestGeminiBoot('full-monitor-view');
        } else {
            stopWorkspaceSyncLoop(container);
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

    function observeMonitorShell(container) {
        if (!container || container.__geminiMonitorObserver) return;
        const observer = new MutationObserver(function () {
            syncFullUiReadiness(container);
        });
        observer.observe(container, { childList: true, subtree: true });
        container.__geminiMonitorObserver = observer;
        syncFullUiReadiness(container);
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
                <div class="gemini-monitor-view-switch" role="group" aria-label="Gemini monitor view">
                    <button type="button" class="gemini-monitor-view-btn" data-gemini-monitor-view-btn="summary">Compact</button>
                    <button type="button" class="gemini-monitor-view-btn" data-gemini-monitor-view-btn="full">Workspace</button>
                </div>
            </div>
            <div id="gemini-monitor-summary-pane" class="gemini-monitor-summary-pane">
                <div id="gemini-monitor-summary-card" class="gemini-monitor-card">
                    <div class="gemini-monitor-head">
                        <div>
                            <div class="gemini-monitor-kicker">Gemini Live Link</div>
                            <h3 class="gemini-monitor-title">Search Monitor Surface</h3>
                        </div>
                        <div class="gemini-monitor-pill">On Demand</div>
                    </div>
                    <div class="gemini-monitor-body">
                        <div class="gemini-monitor-status-row">
                            <span class="gemini-monitor-status-dot" aria-hidden="true"></span>
                            <span class="gemini-monitor-status-text">Standing by for context relay, prompt assist, and live tool controls.</span>
                        </div>
                        <p class="gemini-monitor-copy">Compact keeps the short relay surface. Workspace keeps this summary visible and opens the full Gemini layout underneath it.</p>
                        <p class="gemini-monitor-meta">Modules stay deferred until needed, then the broader Gemini workspace boots in-place without leaving Search Monitor.</p>
                    </div>
                </div>
            </div>
            <div id="gemini-monitor-workspace-shell" class="gemini-monitor-workspace-shell">
                <div class="gemini-monitor-workspace-head">
                    <div>
                        <div class="gemini-monitor-workspace-kicker">Legacy Workspace</div>
                        <div class="gemini-monitor-workspace-title">Expanded Gemini Controls</div>
                    </div>
                    <div class="gemini-monitor-workspace-pill">Full</div>
                </div>
                <div id="gemini-monitor-live-link-slot" class="gemini-monitor-workspace-primary"></div>
                <div id="gemini-monitor-workspace-secondary" class="gemini-monitor-workspace-secondary"></div>
                <div id="gemini-monitor-workspace-note" class="gemini-monitor-workspace-note">Loading the expanded Gemini Live Link controls...</div>
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
        observeMonitorShell(geminiContainer);
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
