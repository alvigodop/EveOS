window.GeminiLiveLinkAssistRuntime = window.GeminiLiveLinkAssistRuntime || {};

(function () {
    if (window.GeminiLiveLinkAssistRuntime.ready) return;

    const DESCRIPTIONS = {
        auto: 'Auto follows your current EveOS surface: card when you are drilled into one, current tab branch in normal tab view, group branch in overview, and whole datapack only from global/Unidex context.',
        tab: 'Current Tab Branch sends the active tab plus visible child tabs, their cards, folder trees, shortcuts, bookmarks, notes, status/progress, timestamps, pins, and small system-view summaries.',
        card: 'Specific Card sends one chosen card only, including its folder tree, root bookmarks, shortcut links, notes, URLs, linked-library status, task state, category/order data, and scoped Nexus traces.',
        all: 'Whole Datapack sends the broadest site snapshot. Large payloads are now chunked and capped before Gemini Live transport so this mode does not crash the session.'
    };

    function getModeLabel(value) {
        if (value === 'full') return 'Complete Snapshot';
        return 'Rich Summary';
    }

    function ensureNode() {
        const scopeSelect = document.getElementById('geminiLiveLinkScopeMode');
        if (!scopeSelect) return null;
        let node = document.getElementById('geminiLiveLinkScopeExplain');
        if (!node) {
            node = document.createElement('div');
            node.id = 'geminiLiveLinkScopeExplain';
            node.className = 'gemini-live-link-scope-explain';
            const grid = scopeSelect.closest('.gemini-live-link-scope-grid');
            if (grid) grid.insertAdjacentElement('afterend', node);
        }
        return node;
    }

    function update() {
        const node = ensureNode();
        if (!node) return;
        const scope = String(document.getElementById('geminiLiveLinkScopeMode')?.value || 'auto').toLowerCase();
        const mode = String(document.getElementById('geminiLiveLinkMode')?.value || 'summary').toLowerCase();
        const card = document.getElementById('geminiLiveLinkCardScope');
        const cardText = scope === 'card' && card?.value
            ? ` Selected card: ${card.options[card.selectedIndex]?.text || card.value}.`
            : '';
        node.textContent = `${DESCRIPTIONS[scope] || DESCRIPTIONS.auto} ${getModeLabel(mode)} controls detail level only; scope controls what Gemini is allowed to see.${cardText}`;
    }

    function bind() {
        update();
        ['geminiLiveLinkScopeMode', 'geminiLiveLinkMode', 'geminiLiveLinkCardScope'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.geminiScopeAssistBound === '1') return;
            el.dataset.geminiScopeAssistBound = '1';
            el.addEventListener('change', update);
        });
    }

    function waitForRelayControls() {
        if (document.getElementById('geminiLiveLinkScopeMode')) {
            bind();
            return;
        }
        const target = document.getElementById('gemini-live-link-card-placeholder') || document.body;
        if (!target) {
            window.setTimeout(waitForRelayControls, 100);
            return;
        }
        const observer = new MutationObserver(() => {
            if (!document.getElementById('geminiLiveLinkScopeMode')) return;
            observer.disconnect();
            bind();
        });
        observer.observe(target, { childList: true, subtree: true });
        window.setTimeout(() => {
            observer.disconnect();
            bind();
        }, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForRelayControls, { once: true });
    } else {
        waitForRelayControls();
    }

    window.GeminiLiveLinkAssistRuntime = { ready: true, update };
})();
