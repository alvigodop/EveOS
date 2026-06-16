(function () {
    'use strict';

    const STATUS_URL = 'http://127.0.0.1:9084/status';
    const WS_FALLBACK = 'ws://127.0.0.1:9083';
    let refreshTimer = 0;

    function wsLabel(code) {
        return ['Connecting', 'Open', 'Closing', 'Closed'][Number(code)] || 'Unknown';
    }

    function shortJson(value) {
        try {
            return JSON.stringify(value || {}, null, 2).slice(0, 700);
        } catch (error) {
            return String(value || '').slice(0, 700);
        }
    }

    function ensurePanel() {
        let panel = document.getElementById('geminiServerInspectorPanel');
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = 'geminiServerInspectorPanel';
        panel.className = 'gemini-server-inspector-panel';
        panel.hidden = true;
        panel.innerHTML = `
            <div class="gemini-server-inspector-head">
                <div>
                    <div class="gemini-server-inspector-kicker">Runtime Ports</div>
                    <h4>Gemini Server Monitor</h4>
                </div>
                <div class="gemini-server-inspector-actions">
                    <button type="button" data-gemini-server-inspector-refresh title="Refresh server status">
                        <i class="material-icons" aria-hidden="true">refresh</i>
                    </button>
                    <button type="button" data-gemini-server-inspector-close title="Close server monitor">
                        <i class="material-icons" aria-hidden="true">close</i>
                    </button>
                </div>
            </div>
            <div class="gemini-server-inspector-grid" data-gemini-server-inspector-grid></div>
        `;

        const root = document.getElementById('gemini-ui-root') || document.body;
        root.appendChild(panel);
        panel.querySelector('[data-gemini-server-inspector-close]')?.addEventListener('click', closePanel);
        panel.querySelector('[data-gemini-server-inspector-refresh]')?.addEventListener('click', refreshPanel);
        return panel;
    }

    function statusClass(ok) {
        if (ok === true) return 'is-online';
        if (ok === false) return 'is-offline';
        return 'is-checking';
    }

    function card(title, status, detail, ok) {
        return `
            <section class="gemini-server-inspector-card ${statusClass(ok)}">
                <div class="gemini-server-inspector-card-head">
                    <span>${title}</span>
                    <strong>${status}</strong>
                </div>
                <pre>${detail}</pre>
            </section>
        `;
    }

    async function fetchStatusServer() {
        try {
            const payload = await window.GeminiServerNetwork.fetchJson(STATUS_URL, null, 900);
            return { ok: true, payload };
        } catch (error) {
            return { ok: false, error: error?.message || 'Unavailable' };
        }
    }

    async function buildCards() {
        const control = window.GeminiServerControl?.getState?.() || {};
        const ws = window.webSocket || null;
        const socketState = ws ? wsLabel(ws.readyState) : 'Not created';
        const status = await fetchStatusServer();
        const bases = window.GeminiServerNetwork?.localCandidateBases?.() || [];
        const currentOrigin = /^https?:$/i.test(window.location.protocol)
            ? window.location.origin
            : window.location.href.split(/[?#]/)[0];

        return [
            card(
                'EveOS Page',
                /^https?:$/i.test(window.location.protocol) ? 'Served' : 'Local file',
                `Current: ${currentOrigin}\nCandidates:\n${bases.join('\n') || 'None'}`,
                /^https?:$/i.test(window.location.protocol)
            ),
            card(
                'Lifecycle Controller',
                control.serverState || 'Unknown',
                `Base: ${control.baseUrl || 'not found'}\nRunning: ${control.running ? 'yes' : 'no'}\nPhase: ${control.connectionPhase || 'n/a'}\n${control.message || ''}`,
                !!control.controllerAvailable
            ),
            card(
                'Gemini WebSocket',
                socketState,
                `URL: ${window.SocketGlobalState?.WS_URL || WS_FALLBACK}\nAPI ready: ${window.SocketGlobalState?.geminiApiReady ? 'yes' : 'no'}\nAuto reconnect: ${window.SocketGlobalState?.autoReconnectEnabled === false ? 'off' : 'on'}`,
                ws?.readyState === WebSocket.OPEN
            ),
            card(
                'Gemini Status Server',
                status.ok ? 'Online' : 'Offline',
                status.ok ? shortJson(status.payload) : status.error,
                status.ok
            )
        ].join('');
    }

    async function refreshPanel() {
        const panel = ensurePanel();
        const grid = panel.querySelector('[data-gemini-server-inspector-grid]');
        if (!grid) return;
        grid.innerHTML = card('Refreshing', 'Checking', 'Polling local ports...', null);
        grid.innerHTML = await buildCards();
    }

    function openPanel() {
        const panel = ensurePanel();
        panel.hidden = false;
        panel.classList.add('is-open');
        refreshPanel();
        if (!refreshTimer) {
            refreshTimer = window.setInterval(function () {
                if (!panel.hidden && document.visibilityState === 'visible') refreshPanel();
            }, 5000);
        }
    }

    function closePanel() {
        const panel = ensurePanel();
        panel.hidden = true;
        panel.classList.remove('is-open');
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
            refreshTimer = 0;
        }
    }

    function bind(root) {
        (root || document).querySelectorAll('[data-gemini-server-inspector-toggle]').forEach(function (button) {
            if (button.dataset.geminiInspectorBound === '1') return;
            button.dataset.geminiInspectorBound = '1';
            button.addEventListener('click', function () {
                const panel = ensurePanel();
                if (panel.hidden) openPanel();
                else closePanel();
            });
        });
    }

    function initialize() {
        bind(document);
        const observer = new MutationObserver(function () {
            bind(document);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener('eve:gemini-server-status', function () {
            const panel = document.getElementById('geminiServerInspectorPanel');
            if (panel && !panel.hidden) refreshPanel();
        });
    }

    window.GeminiServerInspector = { open: openPanel, close: closePanel, refresh: refreshPanel };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
