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
        const scope = getModularSync()?.getCurrentGeminiContextScope?.() || null;
        const cfg = getConfig();
        if (!scope) return 'Tab "' + text(cfg.activeWorkspace, 'main') + '"';
        if (scope.scope === 'all') {
            if (text(scope.label, '')) return scope.label;
            return text(scope.source, '').indexOf('group') === 0 ? 'Group overview' : 'Unidex datapack overview';
        }
        const helpers = window.EveWorkspaceHelpers;
        const root = helpers?.findById ? helpers.findById(cfg.workspaces || [], scope.workspaceId) : null;
        const tabName = text(root?.name, scope.workspaceId);
        if (scope.scope === 'card' && text(scope.categoryName, '')) {
            return 'card "' + scope.categoryName + '" in tab "' + tabName + '"';
        }
        return 'tab "' + tabName + '"';
    }

    function sendQuestion(question) {
        const message = '[User is viewing: ' + describeSurface() + '] ' + question;
        if (window.EveAudioflixState?.isTextBrainMode?.() === true
            && typeof window.EveGeminiMode2?.relayUserUtterance === 'function') {
            window.EveGeminiMode2.relayUserUtterance(message);
            return { sent: true, route: 'mode2' };
        }
        if (typeof window.sendTextMessage === 'function') {
            window.sendTextMessage(message);
            return { sent: true, route: 'live' };
        }
        return { sent: false };
    }

    function injectStyles() {
        if (document.getElementById('gemini-ask-bar-style')) return;
        const style = document.createElement('style');
        style.id = 'gemini-ask-bar-style';
        style.textContent = [
            '.search-gemini-btn.is-active { color: var(--accent, #00d4ff); text-shadow: 0 0 8px color-mix(in srgb, var(--accent, #00d4ff) 60%, transparent); }',
            '.search-wrapper.is-gemini-ask-mode { border-color: color-mix(in srgb, var(--accent, #00d4ff) 55%, transparent); box-shadow: 0 0 12px color-mix(in srgb, var(--accent, #00d4ff) 22%, transparent); }',
            '.search-wrapper.is-gemini-ask-mode #search { caret-color: var(--accent, #00d4ff); }'
        ].join('\n');
        document.head.appendChild(style);
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
        const originalPlaceholder = input.placeholder;

        function setActive(next) {
            active = !!next;
            wrapper.classList.toggle('is-gemini-ask-mode', active);
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
            input.placeholder = active
                ? 'Ask Gemini — viewing ' + describeSurface() + '…'
                : originalPlaceholder;
            if (active) input.focus();
        }

        button.addEventListener('click', function () { setActive(!active); });

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
            describeSurface: describeSurface
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
