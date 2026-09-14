/**
 * bookmark-intel-manager.js
 *
 * Card-scoped Knowledge Base manager for Bookmark Intel.
 * Provides embedded UI frame integration, live health/status probing,
 * and service lifecycle controls (start/stop/restart/open-tab) inside
 * the EveOS Scraper settings and workspace panel.
 */
(function () {
    'use strict';

    if (window.BookmarkIntelManager) return;

    const STATUS_ENDPOINT = '/api/bookmark-intel/status';
    const START_ENDPOINT = '/api/bookmark-intel/start';
    const STOP_ENDPOINT = '/api/bookmark-intel/stop';
    const HEALTH_ENDPOINT = '/api/health';

    let currentStatus = {
        running: false,
        port: 9077,
        state: 'unknown',
        message: 'Checking Bookmark Intel status...',
        lastChecked: 0
    };
    let isActionBusy = false;

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

    const BookmarkIntelManager = {
        getStatus: function () {
            return { ...currentStatus };
        },

        getServiceUrl: getServiceUrl,

        checkStatus: async function () {
            return await queryStatus();
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
                                    <a href="${serviceUrl}" target="_blank" rel="noopener noreferrer" class="tool-btn btn-bi-popout" style="padding: 6px 12px; font-size: 0.82rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Open Bookmark Intel in standalone tab">
                                        Open ↗
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

                const refreshBtn = container.querySelector('.btn-bi-refresh');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => {
                        const frame = container.querySelector('#bookmark-intel-frame');
                        if (frame) frame.src = serviceUrl;
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
