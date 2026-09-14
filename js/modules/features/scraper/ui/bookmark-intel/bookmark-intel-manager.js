/**
 * bookmark-intel-manager.js
 *
 * Card-scoped Knowledge Base manager for Bookmark Intel.
 * Provides embedded UI frame integration, live health/status probing,
 * service lifecycle controls, and a non-destructive expanded Scraper view.
 */
(function () {
    'use strict';

    if (window.BookmarkIntelManager) return;

    const STATUS_ENDPOINT = '/api/bookmark-intel/status';
    const START_ENDPOINT = '/api/bookmark-intel/start';
    const STOP_ENDPOINT = '/api/bookmark-intel/stop';
    const HEALTH_ENDPOINT = '/api/health';
    const DETACHED_WINDOW_NAME = 'eveBookmarkIntelWindow';
    const EXPANDED_CLASS = 'bookmark-intel-workspace-expanded';
    const EXPANDED_STYLE_ID = 'bookmark-intel-expanded-layout-style';
    const observedPanels = new WeakSet();

    let currentStatus = {
        running: false,
        port: 9077,
        state: 'unknown',
        message: 'Checking Bookmark Intel status...',
        lastChecked: 0
    };
    let isActionBusy = false;
    let isExpanded = false;
    let detachedWindow = null;

    function getPort() {
        return Number(window.EveOSPortRegistry?.get?.('BOOKMARK_INTEL_PORT', 9077)) || 9077;
    }

    function getServiceUrl() {
        const base = window.EveOSPortRegistry?.url?.('BOOKMARK_INTEL_PORT') || `http://127.0.0.1:${getPort()}`;
        return base.endsWith('/') ? base : `${base}/`;
    }

    function candidateControlBases() {
        const bases = [];
        const localControlBase = window.EveOSLocalControl?.baseUrl?.();
        if (localControlBase) bases.push(localControlBase);
        const configuredControlPort = Number(window.config?.bridges?.localControlPort || 9082) || 9082;
        bases.push(`http://127.0.0.1:${configuredControlPort}`);
        if (/^https?:$/.test(window.location.protocol) && /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname)) {
            bases.push(window.location.origin);
        }
        const configuredServerPort = Number(window.config?.bridges?.serverPort || 8765) || 8765;
        [configuredServerPort, 8765, 3000].forEach(port => {
            bases.push(`http://127.0.0.1:${port}`);
        });
        return Array.from(new Set(bases));
    }

    async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 2500) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                cache: 'no-store',
                ...options,
                signal: controller.signal
            });
            const data = await response.json().catch(() => ({}));
            return { ok: response.ok, status: response.status, data };
        } catch (error) {
            return { ok: false, status: 0, error };
        } finally {
            clearTimeout(timer);
        }
    }

    async function queryStatus() {
        const bases = candidateControlBases();
        for (const base of bases) {
            const result = await fetchJsonWithTimeout(`${base}${STATUS_ENDPOINT}`, {}, 1800);
            if (result.ok && result.data && typeof result.data.running === 'boolean') {
                currentStatus = {
                    running: !!result.data.running,
                    port: Number(result.data.port) || getPort(),
                    state: result.data.state || (result.data.running ? 'running' : 'stopped'),
                    message: result.data.message || (result.data.running ? 'Ready' : 'Stopped'),
                    lastChecked: Date.now()
                };
                return currentStatus;
            }
        }

        const directHealth = await fetchJsonWithTimeout(`${getServiceUrl()}${HEALTH_ENDPOINT.replace(/^\//, '')}`, {}, 1200);
        if (directHealth.ok && directHealth.data?.ok === true) {
            currentStatus = {
                running: true,
                port: getPort(),
                state: 'running',
                message: 'Bookmark Intel is running (direct response).',
                lastChecked: Date.now()
            };
            return currentStatus;
        }

        currentStatus = {
            running: false,
            port: getPort(),
            state: 'stopped',
            message: 'Bookmark Intel service is stopped.',
            lastChecked: Date.now()
        };
        return currentStatus;
    }

    async function invokeControlAction(endpoint) {
        const bases = candidateControlBases();
        for (const base of bases) {
            const result = await fetchJsonWithTimeout(`${base}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, 8000);
            if (result.ok && result.data) {
                return result.data;
            }
        }
        return { ok: false, message: 'Could not reach EveOS control plane to toggle Bookmark Intel.' };
    }

    function ensureExpandedLayoutStyles() {
        if (document.getElementById(EXPANDED_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = EXPANDED_STYLE_ID;
        style.textContent = `
            .app-layout.${EXPANDED_CLASS} > .main-column {
                display: none !important;
            }
            .app-layout.${EXPANDED_CLASS} > .sidebar-column {
                flex: 1 1 100% !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: none !important;
                position: static !important;
                max-height: none !important;
                overflow: visible !important;
            }
            .app-layout.${EXPANDED_CLASS} #bookmarkIntelManagement,
            .app-layout.${EXPANDED_CLASS} #bookmark-intel-scraper-panel-container,
            .app-layout.${EXPANDED_CLASS} .bookmark-intel-scraper-shell {
                width: 100% !important;
                max-width: none !important;
            }
            .app-layout.${EXPANDED_CLASS} .bookmark-intel-content-area {
                min-height: 72vh !important;
            }
            .app-layout.${EXPANDED_CLASS} #bookmark-intel-frame {
                height: 76vh !important;
                min-height: 720px !important;
            }
        `;
        document.head.appendChild(style);
    }

    function expandedLayout(container) {
        return container?.closest?.('.app-layout')
            || document.getElementById('bookmarkIntelManagement')?.closest?.('.app-layout')
            || null;
    }

    function applyExpandedState(container, nextState = isExpanded) {
        ensureExpandedLayoutStyles();
        isExpanded = !!nextState;
        const layout = expandedLayout(container);
        if (layout) layout.classList.toggle(EXPANDED_CLASS, isExpanded);
        const button = container?.querySelector?.('.btn-bi-expand');
        if (button) {
            button.textContent = isExpanded ? 'Collapse ⤡' : 'Expand ⤢';
            button.setAttribute('aria-pressed', isExpanded ? 'true' : 'false');
            button.title = isExpanded
                ? 'Restore the normal Scraper split view'
                : 'Give Bookmark Intel the full Scraper workspace width';
        }
        return isExpanded;
    }

    function ensurePanelVisibilityObserver(container) {
        const panel = container?.closest?.('#bookmarkIntelManagement');
        if (!panel || observedPanels.has(panel) || typeof MutationObserver !== 'function') return;
        const observer = new MutationObserver(() => {
            if (window.getComputedStyle(panel).display === 'none' && isExpanded) {
                applyExpandedState(container, false);
            }
        });
        observer.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
        observedPanels.add(panel);
    }

    function getDetachedWindowFeatures() {
        const availableWidth = Math.max(900, Number(window.screen?.availWidth) || 1440);
        const availableHeight = Math.max(680, Number(window.screen?.availHeight) || 900);
        const width = Math.min(1500, Math.max(900, availableWidth - 100));
        const height = Math.min(1000, Math.max(680, availableHeight - 100));
        const left = Math.max(0, Math.round((availableWidth - width) / 2));
        const top = Math.max(0, Math.round((availableHeight - height) / 2));
        return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    }

    function detachBookmarkIntel(url) {
        const targetUrl = url || getServiceUrl();
        if (detachedWindow && !detachedWindow.closed) {
            try {
                detachedWindow.focus();
            } catch {}
            return detachedWindow;
        }
        detachedWindow = window.open(targetUrl, DETACHED_WINDOW_NAME, getDetachedWindowFeatures());
        if (detachedWindow) {
            try {
                detachedWindow.focus();
            } catch {}
        }
        return detachedWindow;
    }

    const BookmarkIntelManager = {
        getStatus: function () {
            return { ...currentStatus };
        },

        getServiceUrl: getServiceUrl,

        checkStatus: async function () {
            return await queryStatus();
        },

        detach: function (url) {
            return detachBookmarkIntel(url);
        },

        getDetachedWindow: function () {
            return detachedWindow;
        },

        setExpanded: function (expanded, container = null) {
            const target = container || document.getElementById('bookmark-intel-scraper-panel-container');
            return applyExpandedState(target, expanded);
        },

        startService: async function () {
            isActionBusy = true;
            try {
                const result = await invokeControlAction(START_ENDPOINT);
                await queryStatus();
                return result;
            } finally {
                isActionBusy = false;
            }
        },

        stopService: async function () {
            isActionBusy = true;
            try {
                const result = await invokeControlAction(STOP_ENDPOINT);
                await queryStatus();
                return result;
            } finally {
                isActionBusy = false;
            }
        },

        restartService: async function () {
            isActionBusy = true;
            try {
                await invokeControlAction(STOP_ENDPOINT);
                await new Promise(resolve => setTimeout(resolve, 800));
                const result = await invokeControlAction(START_ENDPOINT);
                await queryStatus();
                return result;
            } finally {
                isActionBusy = false;
            }
        },

        renderPanelUI: async function (container, options = {}) {
            if (!container) return;

            const serviceUrl = getServiceUrl();
            const port = getPort();
            ensureExpandedLayoutStyles();
            ensurePanelVisibilityObserver(container);

            const renderTemplate = () => {
                const isRunning = currentStatus.running;
                const statusBadgeClass = isRunning ? 'running' : (isActionBusy ? 'busy' : 'stopped');
                const statusBadgeText = isActionBusy
                    ? 'Working...'
                    : (isRunning ? `Running (Port ${port})` : 'Stopped');

                container.innerHTML = `
                    <div class="api-scraper-shell bookmark-intel-scraper-shell" style="display: flex; flex-direction: column; gap: 14px; width: 100%;">
                        <div class="api-scraper-hero" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 14px 18px; background: rgba(18, 23, 34, 0.85); border: 1px solid #283347; border-radius: 14px;">
                            <div>
                                <div class="api-scraper-kicker" style="font-size: 0.76rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8aa4ff; font-weight: 700;">Knowledge Base • Card Scoped</div>
                                <div class="api-scraper-provider-title" style="font-size: 1.3rem; font-weight: 800; color: #f2f5fa; margin: 2px 0 4px;">Bookmark Intel</div>
                                <div class="api-scraper-provider-meta" style="font-size: 0.84rem; color: #9aa7bc; max-width: 650px; line-height: 1.4;">Autonomous URL intelligence, comic & video resource analysis, and relationship graphs.</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span class="bookmark-intel-badge ${statusBadgeClass}" style="padding: 5px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background: ${isRunning ? '#1c3326' : (isActionBusy ? '#3b321a' : '#331f24')}; color: ${isRunning ? '#8fe5b2' : (isActionBusy ? '#fed275' : '#ffa4ad')}; border: 1px solid ${isRunning ? '#2c593f' : (isActionBusy ? '#6e5a2c' : '#5c323c')};">
                                    ${statusBadgeText}
                                </span>
                                <div class="bookmark-intel-controls" style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    ${isRunning ? `
                                        <button class="tool-btn btn-bi-refresh" style="padding: 6px 12px; font-size: 0.82rem;" title="Reload embedded application frame">Refresh Frame</button>
                                        <button class="tool-btn btn-bi-restart" style="padding: 6px 12px; font-size: 0.82rem;" ${isActionBusy ? 'disabled' : ''}>Restart</button>
                                        <button class="tool-btn btn-bi-stop" style="padding: 6px 12px; font-size: 0.82rem; background: #331f24; color: #ffa4ad; border: 1px solid #5c323c;" ${isActionBusy ? 'disabled' : ''}>Stop</button>
                                    ` : `
                                        <button class="tool-btn btn-bi-start" style="padding: 6px 14px; font-size: 0.82rem; background: #1f382a; color: #8fe5b2; border: 1px solid #2e5c42; font-weight: 700;" ${isActionBusy ? 'disabled' : ''}>Start Service</button>
                                    `}
                                    <button class="tool-btn btn-bi-expand" type="button" aria-pressed="${isExpanded ? 'true' : 'false'}" style="padding: 6px 12px; font-size: 0.82rem;" title="Give Bookmark Intel the full Scraper workspace width">
                                        ${isExpanded ? 'Collapse ⤡' : 'Expand ⤢'}
                                    </button>
                                    <a href="${serviceUrl}" target="_blank" rel="noopener noreferrer" class="tool-btn btn-bi-popout" style="padding: 6px 12px; font-size: 0.82rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Open Bookmark Intel in a detached window">
                                        Detached ↗
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div class="bookmark-intel-content-area" style="width: 100%; border-radius: 14px; overflow: hidden; background: #0c0e12; border: 1px solid #242c3b; min-height: 620px;">
                            ${isRunning ? `
                                <iframe id="bookmark-intel-frame" src="${serviceUrl}" style="width: 100%; height: 75vh; min-height: 620px; border: 0; display: block; background: #0c0e12;" title="Bookmark Intel Workspace"></iframe>
                            ` : `
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 480px; padding: 40px 20px; text-align: center;">
                                    <div style="font-size: 2.8rem; margin-bottom: 12px;">🔖</div>
                                    <h3 style="font-size: 1.25rem; font-weight: 800; color: #e1e7f2; margin: 0 0 8px;">Bookmark Intel is Offline</h3>
                                    <p style="color: #929fad; max-width: 540px; font-size: 0.9rem; line-height: 1.5; margin: 0 0 20px;">
                                        Start the local Bookmark Intel service on loopback port ${port} to analyze bookmark batches, inspect media sources, and discover relationships inside this card.
                                    </p>
                                    <button class="tool-btn btn-bi-start-hero" style="padding: 10px 22px; font-size: 0.95rem; font-weight: 800; background: #234734; color: #a4f0c4; border: 1px solid #376e51; border-radius: 10px; cursor: pointer;" ${isActionBusy ? 'disabled' : ''}>
                                        ${isActionBusy ? 'Starting Service...' : 'Start Bookmark Intel'}
                                    </button>
                                    <div style="font-size: 0.78rem; color: #626e82; margin-top: 14px;">
                                        Endpoint: <code>http://127.0.0.1:${port}/</code> • Managed by EveOS Control Plane
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                `;

                applyExpandedState(container, isExpanded);

                const refreshBtn = container.querySelector('.btn-bi-refresh');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => {
                        const frame = container.querySelector('#bookmark-intel-frame');
                        if (frame) frame.src = serviceUrl;
                    });
                }

                const expandBtn = container.querySelector('.btn-bi-expand');
                if (expandBtn) {
                    expandBtn.addEventListener('click', () => {
                        applyExpandedState(container, !isExpanded);
                    });
                }

                const popoutBtn = container.querySelector('.btn-bi-popout');
                if (popoutBtn) {
                    popoutBtn.addEventListener('click', (event) => {
                        event.preventDefault();
                        detachBookmarkIntel();
                    });
                }

                const startBtn = container.querySelector('.btn-bi-start');
                if (startBtn) {
                    startBtn.addEventListener('click', async () => {
                        isActionBusy = true;
                        renderTemplate();
                        await BookmarkIntelManager.startService();
                        renderTemplate();
                    });
                }

                const heroStartBtn = container.querySelector('.btn-bi-start-hero');
                if (heroStartBtn) {
                    heroStartBtn.addEventListener('click', async () => {
                        isActionBusy = true;
                        renderTemplate();
                        await BookmarkIntelManager.startService();
                        renderTemplate();
                    });
                }

                const stopBtn = container.querySelector('.btn-bi-stop');
                if (stopBtn) {
                    stopBtn.addEventListener('click', async () => {
                        isActionBusy = true;
                        renderTemplate();
                        await BookmarkIntelManager.stopService();
                        renderTemplate();
                    });
                }

                const restartBtn = container.querySelector('.btn-bi-restart');
                if (restartBtn) {
                    restartBtn.addEventListener('click', async () => {
                        isActionBusy = true;
                        renderTemplate();
                        await BookmarkIntelManager.restartService();
                        renderTemplate();
                    });
                }
            };

            renderTemplate();

            queryStatus().then(() => {
                renderTemplate();
            }).catch(() => {});
        }
    };

    window.BookmarkIntelManager = BookmarkIntelManager;
})();
