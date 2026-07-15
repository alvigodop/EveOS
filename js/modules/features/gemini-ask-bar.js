// --- Gemini Ask Bar ---
// A converter button in the main search bar: one click turns the omnibox into a Gemini Live
// message box. Questions are sent to the existing Gemini Link chat (Mode 2 routes through the
// text brain) tagged with the surface the user is on — a normal tab, a Unidex drill-in, or the
// Unidex datapack overview — so answers match the level of depth being viewed.
(function () {
    if (window.EveGeminiAskBar) return;

    function text(value, fallback) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function getConfig() {
        return window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function getModularSync() {
        return window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync || null;
    }

    function describeSurface() {
        const sync = getModularSync();
        const scope = sync?.getCurrentGeminiContextScope?.() || null;
        const cfg = getConfig();
        if (!scope) return 'Tab "' + text(cfg.activeWorkspace, 'main') + '"';
        if (scope.scope === 'all') {
            // A group overview is not a normal tab — the scope label is pre-classified, and the
            // fallback keeps that classification instead of a bare name.
            if (text(scope.label, '')) return scope.label;
            return text(scope.source, '').indexOf('group') === 0
                ? 'group tab (a group of tabs, not a single tab)'
                : 'Unidex datapack overview';
        }
        // Depth-aware classification (root tab / sub tab / sub^N tab with the parent path),
        // from the canonical describer in the context API.
        const surface = typeof sync?.describeWorkspaceTabPath === 'function'
            ? sync.describeWorkspaceTabPath(scope.workspaceId)
            : (function () {
                const helpers = window.EveWorkspaceHelpers;
                const root = helpers?.findById ? helpers.findById(cfg.workspaces || [], scope.workspaceId) : null;
                return 'tab "' + text(root?.name, scope.workspaceId) + '"';
            })();
        if (scope.scope === 'card' && text(scope.categoryName, '')) {
            return 'card "' + scope.categoryName + '" in ' + surface;
        }
        return surface;
    }

    function sendQuestion(question) {
        const message = '[User is viewing: ' + describeSurface() + '] ' + question;
        const canSend = (window.EveAudioflixState?.isTextBrainMode?.() === true
            && typeof window.EveGeminiMode2?.relayUserUtterance === 'function')
            || typeof window.sendTextMessage === 'function';
        if (!canSend) return { sent: false };
        // Mirror the Gemini chat input: the user's message must appear in the conversation feed
        // exactly like a message typed there (the scope prefix stays out of the visible log).
        if (typeof window.displayMessage === 'function') {
            window.displayMessage('YOU: ' + question);
        }
        if (window.EveAudioflixState?.isTextBrainMode?.() === true
            && typeof window.EveGeminiMode2?.relayUserUtterance === 'function') {
            window.EveGeminiMode2.relayUserUtterance(message);
            return { sent: true, route: 'mode2' };
        }
        window.sendTextMessage(message);
        return { sent: true, route: 'live' };
    }

    function injectStyles() {
        if (document.getElementById('gemini-ask-bar-style')) return;
        const style = document.createElement('style');
        style.id = 'gemini-ask-bar-style';
        style.textContent = [
            '.search-gemini-btn.is-active { color: var(--accent, #00d4ff); text-shadow: 0 0 8px color-mix(in srgb, var(--accent, #00d4ff) 60%, transparent); }',
            '.search-wrapper.is-gemini-ask-mode { border-color: color-mix(in srgb, var(--accent, #00d4ff) 55%, transparent); box-shadow: 0 0 12px color-mix(in srgb, var(--accent, #00d4ff) 22%, transparent); }',
            '.search-wrapper.is-gemini-ask-mode #search { caret-color: var(--accent, #00d4ff); }',
            '.gemini-ask-panel { display: none; width: min(900px, 96%); margin: 0 auto 20px; background: var(--card-bg, rgba(255,255,255,0.04)); border: 1px solid color-mix(in srgb, var(--accent, #00d4ff) 35%, transparent); border-radius: 16px; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25), 0 0 12px color-mix(in srgb, var(--accent, #00d4ff) 12%, transparent); overflow: hidden; text-align: left; }',
            '.gemini-ask-panel.is-open { display: block; }',
            '.gemini-ask-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 16px; cursor: pointer; user-select: none; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }',
            '.gemini-ask-panel.is-collapsed .gemini-ask-panel-header { border-bottom: none; }',
            '.gemini-ask-panel-title { color: var(--accent, #00d4ff); font-size: 0.95rem; font-weight: 600; letter-spacing: 0.4px; }',
            '.gemini-ask-panel-collapse { background: transparent; border: none; color: var(--text-main, #eee); opacity: 0.7; font-size: 1rem; cursor: pointer; transition: transform 0.2s, opacity 0.2s; }',
            '.gemini-ask-panel-collapse:hover { opacity: 1; color: var(--accent, #00d4ff); }',
            '.gemini-ask-panel.is-collapsed .gemini-ask-panel-collapse { transform: rotate(-90deg); }',
            // Generous body: this space is reserved for the upcoming ask-surface content.
            '.gemini-ask-panel-body { min-height: 320px; max-height: 60vh; overflow-y: auto; display: flex; align-items: center; justify-content: center; padding: 18px; position: relative; }',
            '.gemini-ask-panel.is-collapsed .gemini-ask-panel-body { display: none; }',
            '.gemini-ask-panel-placeholder { font-size: 2.4rem; font-weight: 700; letter-spacing: 2px; color: var(--text-main, #eee); opacity: 0.25; text-transform: uppercase; }',
            '.agent-space-popout-btn { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); color: var(--text-main, #eee); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; outline: none; transition: background 0.2s, border-color 0.2s, color 0.2s; }',
            '.agent-space-popout-btn:hover { background: rgba(0, 212, 255, 0.1); border-color: color-mix(in srgb, var(--accent, #00d4ff) 50%, transparent); color: var(--accent, #00d4ff); }',
            '.agent-space-popout-btn .material-icons { font-size: 18px; line-height: 1; }',
            '#chatPopup ~ #loadingIndicator, #chatPopupOverlay ~ #loadingIndicator { display: none !important; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function ensureAskPanel() {
        let panel = document.getElementById('gemini-ask-panel');
        if (panel) return panel;
        const searchContainer = document.querySelector('.header .search-container')
            || document.querySelector('.search-container');
        if (!searchContainer || !searchContainer.parentNode) return null;

        panel = document.createElement('div');
        panel.id = 'gemini-ask-panel';
        panel.className = 'gemini-ask-panel';
        if (getConfig().geminiAskPanelCollapsed === true) panel.classList.add('is-collapsed');

        const header = document.createElement('div');
        header.className = 'gemini-ask-panel-header';
        const title = document.createElement('span');
        title.className = 'gemini-ask-panel-title';
        title.textContent = '✨ Agent Space';
        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'gemini-ask-panel-collapse';
        collapseBtn.title = 'Expand / collapse';
        collapseBtn.setAttribute('aria-expanded', String(!panel.classList.contains('is-collapsed')));
        collapseBtn.textContent = '▼';
        header.appendChild(title);
        header.appendChild(collapseBtn);

        const body = document.createElement('div');
        body.className = 'gemini-ask-panel-body';
        const placeholder = document.createElement('div');
        placeholder.className = 'gemini-ask-panel-placeholder';
        placeholder.textContent = 'TO BE FILLED';
        body.appendChild(placeholder);

        const shortcutBtn = document.createElement('button');
        shortcutBtn.type = 'button';
        shortcutBtn.className = 'agent-space-popout-btn';
        shortcutBtn.title = 'Open Gemini in a separate window';
        shortcutBtn.innerHTML = '<i class="material-icons">open_in_new</i>';
        shortcutBtn.addEventListener('click', function (e) {
            e.stopPropagation();

            const realPopout = document.getElementById('popoutButton');
            if (realPopout) {
                realPopout.click();
            } else {
                // Boot Gemini and wait for the popout button to load
                if (typeof window.requestGeminiBoot === 'function') {
                    window.requestGeminiBoot('ui-interaction').then(function () {
                        let retries = 30;
                        const poll = setInterval(function () {
                            const btn = document.getElementById('popoutButton');
                            if (btn) {
                                clearInterval(poll);
                                if (btn.dataset.bubbleStopped !== 'true') {
                                    btn.addEventListener('click', function (event) {
                                        event.stopPropagation();
                                    });
                                    btn.dataset.bubbleStopped = 'true';
                                }
                                btn.click();
                            } else {
                                retries--;
                                if (retries <= 0) {
                                    clearInterval(poll);
                                    if (typeof window.showToast === 'function') {
                                        window.showToast('Failed to initialize popout chat.', 'error');
                                    }
                                }
                            }
                        }, 100);
                    });
                } else {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Gemini connection is not initialized yet.', 'warning');
                    }
                }
            }
        });
        body.appendChild(shortcutBtn);

        panel.appendChild(header);
        panel.appendChild(body);
        // Sits between the search bar and the +Add Link / Sweep / Bulk action row.
        searchContainer.parentNode.insertBefore(panel, searchContainer.nextSibling);

        header.addEventListener('click', function () {
            const collapsed = panel.classList.toggle('is-collapsed');
            collapseBtn.setAttribute('aria-expanded', String(!collapsed));
            const cfg = getConfig();
            cfg.geminiAskPanelCollapsed = collapsed;
            if (typeof window.saveConfig === 'function') {
                window.saveConfig({ source: 'gemini-ask-panel' });
            }
        });
        return panel;
    }

    function init() {
        const wrapper = document.querySelector('.search-wrapper');
        const input = document.getElementById('search');
        if (!wrapper || !input || document.getElementById('geminiAskToggleBtn')) return !!document.getElementById('geminiAskToggleBtn');

        injectStyles();
        const button = document.createElement('button');
        button.id = 'geminiAskToggleBtn';
        button.type = 'button';
        button.className = 'search-advanced-btn search-gemini-btn';
        button.title = 'Ask Gemini from the search bar (about the view you are on)';
        button.setAttribute('aria-pressed', 'false');
        button.textContent = '✨';
        wrapper.appendChild(button);

        let active = false;
        let placeholderTimer = null;
        const originalPlaceholder = input.placeholder;

        function refreshPlaceholder() {
            if (active) input.placeholder = 'Ask Gemini — viewing ' + describeSurface() + '…';
        }

        function setActive(next) {
            active = !!next;
            wrapper.classList.toggle('is-gemini-ask-mode', active);
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
            const panel = ensureAskPanel();
            if (panel) panel.classList.toggle('is-open', active);
            if (active) {
                refreshPlaceholder();
                // Keep the depth hint live while ask mode is on: switching tabs or moving
                // through Unidex updates the label without re-toggling.
                if (!placeholderTimer) placeholderTimer = setInterval(refreshPlaceholder, 1000);
                input.focus();
            } else {
                if (placeholderTimer) { clearInterval(placeholderTimer); placeholderTimer = null; }
                input.placeholder = originalPlaceholder;
                // Leaving ask mode: drop the question text and restore the unfiltered dashboard
                // (the bar is a search filter again from here on).
                input.value = '';
                if (typeof window.renderDashboard === 'function') window.renderDashboard();
            }
        }

        button.addEventListener('click', function () { setActive(!active); });

        // While ask mode is on, typing must NOT run the datapack title filter: block the
        // dashboard's re-render-on-input listener (registered later in boot, so
        // stopImmediatePropagation from this earlier listener wins).
        input.addEventListener('input', function (event) {
            if (active) event.stopImmediatePropagation();
        });

        // Keydown capture + preventDefault suppresses the inline onkeypress omnibox handler, so
        // Enter in ask mode goes to Gemini instead of running a web search.
        input.addEventListener('keydown', function (event) {
            if (!active) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                setActive(false);
                return;
            }
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const question = input.value.trim();
            if (!question) return;
            const result = sendQuestion(question);
            if (!result.sent) {
                if (typeof window.showToast === 'function') {
                    window.showToast('Gemini Live is not connected — open the Search Monitor Gemini workspace first.', 'warning');
                }
                return;
            }
            input.value = '';
            if (typeof window.showToast === 'function') {
                window.showToast(result.route === 'mode2'
                    ? 'Asked Gemini (Mode 2 text brain)'
                    : 'Asked Gemini', 'success');
            }
        }, true);

        // Refresh the placeholder when refocusing, so drilling around Unidex/tabs keeps the
        // depth hint accurate without re-toggling.
        input.addEventListener('focus', function () {
            if (active) input.placeholder = 'Ask Gemini — viewing ' + describeSurface() + '…';
        });

        window.EveGeminiAskBar = {
            ready: true,
            isActive: function () { return active; },
            setActive: setActive,
            describeSurface: describeSurface,
            getPanel: function () { return document.getElementById('gemini-ask-panel'); },
            getPanelBody: function () { return document.querySelector('#gemini-ask-panel .gemini-ask-panel-body'); }
        };
        return true;
    }

    // The header ships in static HTML, but boot order varies — retry briefly until it exists.
    if (!init()) {
        let tries = 0;
        const timer = setInterval(function () {
            if (init() || ++tries > 40) clearInterval(timer);
        }, 250);
    }
})();
