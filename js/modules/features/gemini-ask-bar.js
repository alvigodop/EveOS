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
            '.gemini-ask-panel-body { min-height: 320px; max-height: 60vh; overflow-y: auto; overflow-x: hidden; display: flex; align-items: center; justify-content: center; padding: 18px; position: relative; }',
            '.gemini-ask-panel.is-collapsed .gemini-ask-panel-body { display: none; }',
            '.gemini-ask-panel-placeholder { font-size: 2.4rem; font-weight: 700; letter-spacing: 2px; color: var(--text-main, #eee); opacity: 0.25; text-transform: uppercase; }',
            '.agent-space-popout-btn { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); color: var(--text-main, #eee); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; outline: none; transition: background 0.2s, border-color 0.2s, color 0.2s; overflow: hidden; }',
            '.agent-space-tools-btn { position: absolute; top: 12px; right: 54px; width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); color: var(--text-main, #eee); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; outline: none; transition: background 0.2s, border-color 0.2s, color 0.2s; overflow: hidden; }',
            '.agent-space-popout-btn:hover, .agent-space-tools-btn:hover { background: rgba(0, 212, 255, 0.1); border-color: color-mix(in srgb, var(--accent, #00d4ff) 50%, transparent); color: var(--accent, #00d4ff); }',
            '.agent-space-popout-btn, .agent-space-tools-btn { font-size: 18px; line-height: 1; }',
            '#agenticPopupOverlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 1000; }',
            '.agentic-popup-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(90%, 800px); max-height: 85%; display: flex; flex-direction: column; background: linear-gradient(145deg, rgba(12, 17, 24, 0.96), rgba(8, 12, 18, 0.95)) !important; border: 1px solid rgba(0, 212, 255, 0.15) !important; border-radius: 18px !important; z-index: 1001 !important; overflow-y: auto !important; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6) !important; color: #e8f7ff !important; padding: 16px !important; }',
            '#agenticPopupCloseButton { align-self: flex-end; margin: 0 0 10px 0; cursor: pointer; width: 32px; height: 32px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.5); font-size: 18px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }',
            '#agenticPopupCloseButton:hover { background: rgba(255, 82, 82, 0.2); border-color: rgba(255, 82, 82, 0.4); color: #ff8a80; }',
            '.agentic-popup-content .gemini-agentic-shell { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }',
            // Hide the floating Search Monitor while the chat popout or agentic functions popup is open. (The popup is
            // appended at the END of body, so a sibling combinator can never match the
            // earlier #loadingIndicator — :has() on body is the working form.)
            'body:has(#chatPopup) #loadingIndicator, body:has(.agentic-popup-content) #loadingIndicator { display: none !important; }',
            // --- Data Stream state (stream toggle ON) + Insight Gathering viewer ---
            '.gemini-ask-panel-body.is-streaming { flex-direction: column; align-items: stretch; justify-content: flex-start; }',
            '.gemini-ask-panel-body.is-streaming .gemini-ask-panel-placeholder { display: none; }',
            '.gemini-ask-stream-state { display: none; }',
            '.gemini-ask-panel-body.is-streaming:not(.is-insight-open) .gemini-ask-stream-state { display: flex; flex-direction: column; flex: 1; }',
            '.gemini-ask-stream-header { text-align: center; margin: 2px auto 0; padding: 6px 96px 0; font-size: 1.15rem; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: var(--accent, #00d4ff); opacity: 0.75; text-shadow: 0 0 14px color-mix(in srgb, var(--accent, #00d4ff) 30%, transparent); }',
            '.gemini-ask-stream-box { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 22px 34px; border: 1px solid color-mix(in srgb, var(--accent, #00d4ff) 30%, transparent); border-radius: 14px; background: rgba(0, 212, 255, 0.045); box-shadow: 0 0 18px color-mix(in srgb, var(--accent, #00d4ff) 10%, transparent); }',
            '.gemini-ask-stream-box-title { font-size: 0.78rem; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; color: var(--text-main, #eee); opacity: 0.7; }',
            '.gemini-ask-insight-btn { width: 52px; height: 52px; border-radius: 16px; background: rgba(0, 212, 255, 0.05); border: 1px solid color-mix(in srgb, var(--accent, #00d4ff) 30%, transparent); color: var(--text-main, #eee); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; outline: none; transition: background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s; font-size: 22px; line-height: 1; }',
            '.gemini-ask-insight-btn:hover { background: rgba(0, 212, 255, 0.12); border-color: color-mix(in srgb, var(--accent, #00d4ff) 55%, transparent); color: var(--accent, #00d4ff); box-shadow: 0 0 12px color-mix(in srgb, var(--accent, #00d4ff) 25%, transparent); }',
            '.gemini-ask-stream-box-note { font-size: 0.72rem; opacity: 0.55; text-align: center; max-width: 320px; }',
            '.gemini-ask-insight-viewer { display: none; width: 100%; flex: 1; min-height: 0; flex-direction: column; gap: 10px; }',
            '.gemini-ask-panel-body.is-insight-open { height: 60vh; overflow: hidden; }',
            '.gemini-ask-panel-body.is-insight-open .gemini-ask-insight-viewer { display: flex; }',
            '.gemini-ask-panel-body.is-insight-open .gemini-ask-stream-state { display: none; }',
            '.gemini-ask-insight-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-right: 96px; }',
            '.gemini-ask-insight-title { color: var(--accent, #00d4ff); font-weight: 600; font-size: 0.9rem; letter-spacing: 0.6px; }',
            '.gemini-ask-insight-actions { display: flex; gap: 6px; margin-left: auto; }',
            '.gemini-ask-insight-actions button { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--text-main, #eee); border-radius: 8px; padding: 4px 12px; font-size: 0.7rem; letter-spacing: 0.6px; cursor: pointer; transition: background 0.2s, border-color 0.2s, color 0.2s; }',
            '.gemini-ask-insight-actions button:hover { background: rgba(0, 212, 255, 0.1); border-color: color-mix(in srgb, var(--accent, #00d4ff) 50%, transparent); color: var(--accent, #00d4ff); }',
            '.gemini-ask-insight-status { font-size: 0.72rem; opacity: 0.7; letter-spacing: 0.3px; }',
            '.gemini-ask-insight-feed { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }',
            '.gemini-ask-insight-empty { margin: auto; opacity: 0.45; font-size: 0.85rem; text-align: center; max-width: 380px; }',
            '.gemini-ask-insight-entry { border: 1px solid rgba(255, 255, 255, 0.08); border-left: 3px solid var(--accent, #00d4ff); border-radius: 10px; padding: 9px 12px; background: rgba(255, 255, 255, 0.03); font-size: 0.78rem; }',
            '.gemini-ask-insight-entry.is-skipped { border-left-color: #ffb347; }',
            '.gemini-ask-insight-entry.is-marker { border-left-color: rgba(255, 255, 255, 0.25); opacity: 0.75; text-align: center; font-size: 0.7rem; }',
            '.gemini-ask-insight-row { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }',
            '.gemini-ask-insight-chip { font-size: 0.62rem; letter-spacing: 0.8px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent, #00d4ff) 18%, transparent); color: var(--accent, #00d4ff); white-space: nowrap; }',
            '.gemini-ask-insight-entry.is-skipped .gemini-ask-insight-chip { background: rgba(255, 179, 71, 0.15); color: #ffb347; }',
            '.gemini-ask-insight-entry.is-prompt { border-left-color: #7ee2a8; }',
            '.gemini-ask-insight-entry.is-prompt .gemini-ask-insight-chip { background: rgba(126, 226, 168, 0.14); color: #7ee2a8; }',
            '.gemini-ask-insight-entry.is-brain { border-left-color: #b388ff; }',
            '.gemini-ask-insight-entry.is-brain .gemini-ask-insight-chip { background: rgba(179, 136, 255, 0.14); color: #b388ff; }',
            '.gemini-ask-insight-entry.is-relay { border-left-color: #64b5f6; }',
            '.gemini-ask-insight-entry.is-relay .gemini-ask-insight-chip { background: rgba(100, 181, 246, 0.14); color: #64b5f6; }',
            '.gemini-ask-insight-prompt-text { margin-top: 4px; font-style: italic; opacity: 0.85; }',
            '.gemini-ask-insight-time { opacity: 0.5; font-size: 0.68rem; }',
            '.gemini-ask-insight-scope { opacity: 0.9; }',
            '.gemini-ask-insight-meta { opacity: 0.6; font-size: 0.7rem; margin-top: 3px; }',
            '.gemini-ask-insight-entry details { margin-top: 6px; }',
            '.gemini-ask-insight-entry summary { cursor: pointer; font-size: 0.68rem; opacity: 0.6; user-select: none; }',
            '.gemini-ask-insight-entry summary:hover { opacity: 1; color: var(--accent, #00d4ff); }',
            '.gemini-ask-insight-entry pre { margin: 6px 0 0; padding: 8px 10px; background: rgba(0, 0, 0, 0.35); border-radius: 8px; overflow: auto; font-size: 0.68rem; line-height: 1.45; color: #9fdcef; max-height: 240px; }'
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

        // Opening from Agent Space always means Agent Space MODE: the popout chats through the
        // same Mode 2 / surface-prefixed pipeline as the ask bar. Prefer the popout API; fall
        // back to a one-shot mode flag + synthetic click while the API is still booting.
        function triggerAgentSpacePopout() {
            if (window.EvePopoutChat && typeof window.EvePopoutChat.toggleAgentSpace === 'function') {
                window.EvePopoutChat.toggleAgentSpace();
                return true;
            }
            const realPopout = document.getElementById('popoutButton');
            if (realPopout) {
                window.__evePopoutOpenMode = 'agent-space';
                realPopout.click();
                return true;
            }
            return false;
        }

        const shortcutBtn = document.createElement('button');
        shortcutBtn.type = 'button';
        shortcutBtn.className = 'agent-space-popout-btn';
        shortcutBtn.title = 'Open Gemini in a separate window (Agent Space Mode)';
        shortcutBtn.innerHTML = '<i class="material-icons">open_in_new</i>';
        shortcutBtn.addEventListener('click', function (e) {
            e.stopPropagation();

            if (triggerAgentSpacePopout()) return;

            // Gemini UI not booted yet. There is no window.requestGeminiBoot global — the
            // real boot trigger is __loadGeminiScriptsNow, exported by the gemini
            // Script_Loader (which may itself still be in the deferred queue, so poll for it).
            window.__GEMINI_BOOT_REQUESTED = true;
            let bootStarted = false;
            let retries = 60;
            const poll = setInterval(function () {
                if (!bootStarted && typeof window.__loadGeminiScriptsNow === 'function') {
                    bootStarted = true;
                    window.__loadGeminiScriptsNow();
                }
                if (triggerAgentSpacePopout()) {
                    clearInterval(poll);
                    return;
                }
                retries--;
                if (retries <= 0) {
                    clearInterval(poll);
                    if (typeof window.showToast === 'function') {
                        window.showToast('Failed to initialize popout chat.', 'error');
                    }
                }
            }, 200);
        });
        body.appendChild(shortcutBtn);

        const toolsBtn = document.createElement('button');
        toolsBtn.type = 'button';
        toolsBtn.className = 'agent-space-tools-btn';
        toolsBtn.title = 'Agentic Functions';
        toolsBtn.innerHTML = '<i class="material-icons">widgets</i>';

        let popupOpen = false;
        let popupOverlay = null;
        let popupContent = null;
        let originalParent = null;

        function closeAgenticPopup() {
            if (!popupOpen) return;
            const shell = popupContent?.querySelector('.gemini-agentic-shell');
            if (shell && originalParent) {
                originalParent.appendChild(shell);
            }
            if (popupContent) popupContent.remove();
            if (popupOverlay) popupOverlay.remove();

            const inactiveRoot = document.getElementById('gemini-ui-root-inactive');
            if (inactiveRoot) {
                inactiveRoot.id = 'gemini-ui-root';
            }
            popupOpen = false;
        }

        function openAgenticPopup() {
            if (popupOpen) return false;
            const originalRoot = document.getElementById('gemini-ui-root');
            const shell = document.querySelector('.gemini-agentic-shell');
            if (!shell) {
                return false;
            }

            originalParent = shell.parentNode;

            if (originalRoot) {
                originalRoot.id = 'gemini-ui-root-inactive';
            }

            popupOverlay = document.createElement('div');
            popupOverlay.id = 'agenticPopupOverlay';
            popupOverlay.addEventListener('click', closeAgenticPopup);

            popupContent = document.createElement('div');
            popupContent.id = 'gemini-ui-root';
            popupContent.className = 'gemini-monitor-shell agentic-popup-content';

            const closeBtn = document.createElement('button');
            closeBtn.id = 'agenticPopupCloseButton';
            closeBtn.type = 'button';
            closeBtn.className = 'mdl-button mdl-js-button mdl-button--icon';
            closeBtn.innerHTML = '<i class="material-icons">close</i>';
            closeBtn.addEventListener('click', function (event) {
                event.stopPropagation();
                closeAgenticPopup();
            });
            popupContent.appendChild(closeBtn);
            popupContent.appendChild(shell);

            document.body.appendChild(popupOverlay);
            document.body.appendChild(popupContent);
            popupOpen = true;
            return true;
        }

        toolsBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (popupOpen) {
                closeAgenticPopup();
                return;
            }

            if (openAgenticPopup()) return;

            // Not booted/loaded yet, trigger boot
            window.__GEMINI_BOOT_REQUESTED = true;
            let bootStarted = false;
            let retries = 60;
            const poll = setInterval(function () {
                if (!bootStarted && typeof window.__loadGeminiScriptsNow === 'function') {
                    bootStarted = true;
                    window.__loadGeminiScriptsNow();
                }
                if (openAgenticPopup()) {
                    clearInterval(poll);
                    return;
                }
                retries--;
                if (retries <= 0) {
                    clearInterval(poll);
                    if (typeof window.showToast === 'function') {
                        window.showToast('Failed to load Agentic Functions.', 'error');
                    }
                }
            }, 200);
        });
        body.appendChild(toolsBtn);

        // --- Data Stream state + Insight Gathering viewer -----------------------------------
        // While the Context Relay's Data Stream toggle is ON, the placeholder gives way to a
        // stream header plus the "Data Stream Activated" box, whose Insight Gathering button
        // opens a live view of everything the stream sends and what the agent holds.
        function getSyncApi() {
            return window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync || null;
        }

        function getInsightLog() {
            const api = getSyncApi();
            if (api && typeof api.getDataStreamInsightLog === 'function') return api.getDataStreamInsightLog();
            return window.__eveDataStreamInsightLog = window.__eveDataStreamInsightLog || [];
        }

        function routeStatusText() {
            if (window.EveAudioflixState?.isTextBrainMode?.() === true) return 'Text Brain (Mode 2)';
            const ws = window.webSocket;
            return (ws && ws.readyState === 1) ? 'Live socket' : 'Offline — updates will be skipped';
        }

        const streamState = document.createElement('div');
        streamState.className = 'gemini-ask-stream-state';
        const streamHeader = document.createElement('div');
        streamHeader.className = 'gemini-ask-stream-header';
        streamHeader.textContent = 'Datapack Stream Initiated';
        const streamBox = document.createElement('div');
        streamBox.className = 'gemini-ask-stream-box';
        const streamBoxTitle = document.createElement('div');
        streamBoxTitle.className = 'gemini-ask-stream-box-title';
        streamBoxTitle.textContent = 'Data Stream Activated';
        const insightBtn = document.createElement('button');
        insightBtn.type = 'button';
        insightBtn.className = 'gemini-ask-insight-btn';
        insightBtn.title = 'Insight Gathering';
        insightBtn.textContent = '📡';
        const streamNote = document.createElement('div');
        streamNote.className = 'gemini-ask-stream-box-note';
        streamBox.appendChild(streamBoxTitle);
        streamBox.appendChild(insightBtn);
        streamBox.appendChild(streamNote);
        streamState.appendChild(streamHeader);
        streamState.appendChild(streamBox);
        body.appendChild(streamState);

        const viewer = document.createElement('div');
        viewer.className = 'gemini-ask-insight-viewer';
        const viewerHead = document.createElement('div');
        viewerHead.className = 'gemini-ask-insight-head';
        const viewerTitle = document.createElement('span');
        viewerTitle.className = 'gemini-ask-insight-title';
        viewerTitle.textContent = '📡 Insight Gathering — Live Data Stream';
        const viewerActions = document.createElement('div');
        viewerActions.className = 'gemini-ask-insight-actions';
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = 'Clear';
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.textContent = 'Back';
        viewerActions.appendChild(clearBtn);
        viewerActions.appendChild(backBtn);
        viewerHead.appendChild(viewerTitle);
        viewerHead.appendChild(viewerActions);
        const viewerStatus = document.createElement('div');
        viewerStatus.className = 'gemini-ask-insight-status';
        const feed = document.createElement('div');
        feed.className = 'gemini-ask-insight-feed';
        viewer.appendChild(viewerHead);
        viewer.appendChild(viewerStatus);
        viewer.appendChild(feed);
        body.appendChild(viewer);

        function appendMetaLine(card, textContent, className) {
            if (!text(textContent, '')) return;
            const line = document.createElement('div');
            line.className = className || 'gemini-ask-insight-meta';
            line.textContent = textContent;
            card.appendChild(line);
        }

        function appendPayloadDetails(card, label, payload, asText) {
            if (payload == null) return;
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = label;
            const pre = document.createElement('pre');
            if (asText) pre.textContent = String(payload);
            else { try { pre.textContent = JSON.stringify(payload, null, 2); } catch { pre.textContent = String(payload); } }
            details.appendChild(summary);
            details.appendChild(pre);
            card.appendChild(details);
        }

        function buildInsightEntryCard(entry) {
            const card = document.createElement('div');
            const entryType = text(entry.type, 'send');
            const isMarker = entryType === 'marker';
            const isSkipped = entry.outcome === 'skipped';
            card.className = 'gemini-ask-insight-entry'
                + (isSkipped ? ' is-skipped' : '')
                + (isMarker ? ' is-marker' : '')
                + (entryType === 'prompt' ? ' is-prompt' : '')
                + (entryType === 'brain-turn' ? ' is-brain' : '')
                + (entryType === 'relay' ? ' is-relay' : '');
            const when = new Date(entry.at || Date.now()).toLocaleTimeString();
            if (isMarker) {
                card.textContent = when + ' — ' + text(entry.note, 'marker');
                return card;
            }

            const row = document.createElement('div');
            row.className = 'gemini-ask-insight-row';
            const chip = document.createElement('span');
            chip.className = 'gemini-ask-insight-chip';
            if (entryType === 'prompt') {
                chip.textContent = 'prompt · ' + text(entry.route, 'unknown');
            } else if (entryType === 'brain-turn') {
                chip.textContent = isSkipped
                    ? 'brain · failed'
                    : 'brain · ' + text(entry.model, 'default');
            } else if (entryType === 'relay') {
                chip.textContent = (isSkipped ? 'relay skipped · ' : 'relay · ') + text(entry.relayMode, 'context');
            } else {
                chip.textContent = isSkipped
                    ? 'skipped · ' + text(entry.reason, 'unknown')
                    : 'sent · ' + text(entry.route, 'unknown');
            }
            const time = document.createElement('span');
            time.className = 'gemini-ask-insight-time';
            time.textContent = when;
            row.appendChild(chip);
            row.appendChild(time);
            const scope = entry.scope || {};
            if (text(scope.label, text(scope.scope, ''))) {
                const scopeEl = document.createElement('span');
                scopeEl.className = 'gemini-ask-insight-scope';
                scopeEl.textContent = text(scope.label, scope.scope);
                row.appendChild(scopeEl);
            }
            card.appendChild(row);

            if (entryType === 'prompt') {
                appendMetaLine(card, '“' + text(entry.promptText, '') + '”', 'gemini-ask-insight-prompt-text');
                if (isSkippedRouteNote(entry)) appendMetaLine(card, isSkippedRouteNote(entry));
                return card;
            }

            if (entryType === 'brain-turn') {
                if (isSkipped) {
                    appendMetaLine(card, 'brain call failed (' + text(entry.reason, 'error') + ') — the live model answered directly');
                } else {
                    const bits = [];
                    if (entry.durationMs) bits.push(Math.round(entry.durationMs / 100) / 10 + 's turn');
                    if (typeof entry.updatesInContext === 'number') bits.push(entry.updatesInContext + ' stream update(s) in its context');
                    if (entry.contextChars) bits.push('snapshot: ' + entry.contextChars + ' chars');
                    if (entry.usage && (entry.usage.totalTokens || entry.usage.total_tokens)) {
                        bits.push('tokens: ' + (entry.usage.totalTokens || entry.usage.total_tokens));
                    }
                    bits.push(entry.injectedToLive ? 'extraction injected to the live model' : (entry.noContext ? 'no context this turn' : 'repeat extraction — not re-injected'));
                    appendMetaLine(card, bits.join(' · '));
                }
                appendMetaLine(card, 'prompt: “' + text(entry.promptText, '') + '”');
                if (entry.responsePreview) {
                    appendPayloadDetails(card, 'what the brain curated for the live model', entry.responsePreview, true);
                }
                return card;
            }

            if (entryType === 'relay') {
                const bits = [];
                if (entry.counts && typeof entry.counts === 'object') {
                    Object.keys(entry.counts).forEach(function (key) {
                        if (entry.counts[key]) bits.push(entry.counts[key] + ' ' + key);
                    });
                }
                if (entry.messageChars) bits.push(entry.messageChars + ' chars');
                if (entry.transportChunks > 1) bits.push(entry.transportChunks + ' chunks');
                if (entry.autoDegradedFrom) bits.push('auto-stepped down from ' + entry.autoDegradedFrom);
                if (isSkipped) bits.push('reason: ' + text(entry.reason, 'unknown'));
                if (text(entry.route, '')) bits.push('route: ' + entry.route);
                appendMetaLine(card, bits.join(' · '));
                if (entry.payload && entry.payload.preview) {
                    appendPayloadDetails(card, 'sent layer content (preview)', entry.payload.preview, true);
                } else if (entry.payload) {
                    appendPayloadDetails(card, 'payload sent to the agent', entry.payload);
                }
                return card;
            }

            const meta = document.createElement('div');
            meta.className = 'gemini-ask-insight-meta';
            const mutation = entry.mutation || {};
            const metaBits = [
                'mutation: ' + text(mutation.source, 'state') + '/' + text(mutation.kind, 'data') + ' #' + (mutation.mutationSeq || 0)
            ];
            if (text(entry.deltaSummary, '')) metaBits.push(entry.deltaSummary);
            if (entry.messageChars) metaBits.push(entry.messageChars + ' chars');
            if (typeof entry.brainQueueCount === 'number') metaBits.push('brain queue: ' + entry.brainQueueCount + ' pending');
            meta.textContent = metaBits.join(' · ');
            card.appendChild(meta);
            if (entry.nexus && (entry.nexus.summary || entry.nexus.query)) {
                appendMetaLine(card, 'nexus: ' + text(entry.nexus.query, '') + (entry.nexus.summary ? ' — ' + entry.nexus.summary : ''));
            }
            if (entry.payload) {
                appendPayloadDetails(card, 'payload sent to the agent', entry.payload);
            }
            return card;
        }

        function isSkippedRouteNote(entry) {
            return text(entry.reason, '')
                ? 'brain skipped (' + entry.reason + ') — sent straight to the live model'
                : '';
        }

        function refreshInsightStatus() {
            const cfg = getConfig();
            const streamOn = !!cfg.geminiContextDataStreamEnabled;
            const relayOn = !!cfg.geminiLiveLinkEnabled;
            const queue = window.EveGeminiMode2?.getEveContextStatus?.();
            const bits = [
                'Stream: ' + (streamOn ? 'ON' : 'OFF'),
                'Relay: ' + (relayOn ? 'ON' : 'OFF — stream paused'),
                'Route: ' + routeStatusText(),
                'Events: ' + getInsightLog().length
            ];
            if (queue && typeof queue.updateCount === 'number') {
                bits.splice(3, 0, 'Brain queue: ' + queue.updateCount + ' pending update(s)');
            }
            viewerStatus.textContent = bits.join('  ·  ');
        }

        // Reconciliation state so the feed can self-heal if an insight event is ever missed:
        // the 2s tick compares the log's tail id + length against what was last rendered.
        let renderedCount = 0;
        let renderedLastId = '';

        function syncRenderedMarkers() {
            const log = getInsightLog();
            renderedCount = log.length;
            renderedLastId = log.length ? String(log[log.length - 1].id || '') : '';
        }

        function renderInsightFeed() {
            feed.innerHTML = '';
            const log = getInsightLog();
            syncRenderedMarkers();
            if (!log.length) {
                const empty = document.createElement('div');
                empty.className = 'gemini-ask-insight-empty';
                empty.textContent = 'No stream events yet — change something in the datapack (add, edit, or move a bookmark) and the update will flow through here.';
                feed.appendChild(empty);
                return;
            }
            log.slice().reverse().forEach(function (entry) {
                feed.appendChild(buildInsightEntryCard(entry));
            });
        }

        function reconcileInsightFeed() {
            const log = getInsightLog();
            const lastId = log.length ? String(log[log.length - 1].id || '') : '';
            if (log.length !== renderedCount || lastId !== renderedLastId) {
                renderInsightFeed();
                refreshInsightStatus();
            }
        }

        function refreshStreamNote() {
            const cfg = getConfig();
            if (!cfg.geminiLiveLinkEnabled) {
                streamNote.textContent = 'Context Relay master toggle is OFF — the stream is paused until it is re-enabled.';
            } else {
                streamNote.textContent = 'Route: ' + routeStatusText();
            }
        }

        function closeInsightViewer() {
            body.classList.remove('is-insight-open');
        }

        function openInsightViewer() {
            body.classList.add('is-insight-open');
            renderInsightFeed();
            refreshInsightStatus();
        }

        function refreshStreamPanelState() {
            const cfg = getConfig();
            // The Context Relay master toggle governs the whole agentic function — with it off
            // the stream is dead regardless of its own toggle, so the panel must fall back to
            // the idle placeholder, not keep announcing an initiated stream.
            const enabled = !!cfg.geminiContextDataStreamEnabled && !!cfg.geminiLiveLinkEnabled;
            body.classList.toggle('is-streaming', enabled);
            if (!enabled) closeInsightViewer();
            else refreshStreamNote();
        }

        insightBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            openInsightViewer();
        });
        backBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            closeInsightViewer();
        });
        clearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const log = getInsightLog();
            log.length = 0;
            renderInsightFeed();
            refreshInsightStatus();
        });

        window.addEventListener('eve:datastream-toggled', refreshStreamPanelState);
        window.addEventListener('eve:datastream-insight', function (event) {
            if (!body.classList.contains('is-insight-open')) return;
            const empty = feed.querySelector('.gemini-ask-insight-empty');
            if (empty) empty.remove();
            feed.insertBefore(buildInsightEntryCard(event.detail || {}), feed.firstChild);
            syncRenderedMarkers();
            refreshInsightStatus();
        });
        // Poll fallback: the toggle can flip through paths that do not dispatch the event
        // (settings import, direct config edits, the relay MASTER toggle), status lines must
        // stay honest, and the feed self-heals if an insight event was ever missed.
        window.setInterval(function () {
            refreshStreamPanelState();
            if (body.classList.contains('is-insight-open')) {
                reconcileInsightFeed();
                refreshInsightStatus();
            }
        }, 2000);
        refreshStreamPanelState();

        if (window.EveGeminiAskBar) {
            window.EveGeminiAskBar.refreshStreamPanel = refreshStreamPanelState;
            window.EveGeminiAskBar.openInsightViewer = openInsightViewer;
        }

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
            // Shared routing for every "ask about the datapack" entry point (search bar, Agent
            // Space popout): Mode 2 text brain when active, live send otherwise, always with
            // the [User is viewing: ...] surface prefix.
            sendQuestion: sendQuestion,
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
