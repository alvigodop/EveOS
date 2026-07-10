window.GeminiLiveLinkAssistRuntime = window.GeminiLiveLinkAssistRuntime || {};

(function () {
    if (window.GeminiLiveLinkAssistRuntime.ready) return;

    const DESCRIPTIONS = {
        auto: 'Auto follows your current EveOS surface: card when drilled into one, tab branch in normal tab view, group branch in overview, and whole datapack only from Unidex/global context.',
        'tab-current': 'Current Tab Only sends the active tab, its cards, folders, bookmarks, notes, URLs, status/progress, pins, and compact system-view hints. Sub-tabs are listed as path context only when available; their contents are not included.',
        'tab-branch': 'Current Tab + Sub Tabs sends the active tab branch: parent tab plus visible child tabs, their cards, folder trees, shortcuts, bookmarks, notes, timestamps, pins, and compact system-view hints.',
        tab: 'Current Tab + Sub Tabs sends the active tab branch: parent tab plus visible child tabs, their cards, folder trees, shortcuts, bookmarks, notes, timestamps, pins, and compact system-view hints.',
        group: 'Current Group sends all tabs, sub-tabs, cards, folders, bookmarks, notes, and library connections belonging to the active sidebar group.',
        card: 'Specific Card sends one chosen card only, including its folder tree, root bookmarks, shortcut links, notes, URLs, linked-library status, task state, bookmark identifier markers, category/order data, and scoped Nexus traces.',
        all: 'Whole Datapack is only available from Unidex/global context. Large payloads are chunked and capped before Gemini Live transport.'
    };

    function getModeLabel(value) {
        if (value === 'brief') return 'Quick Brief';
        if (value === 'deep') return 'Deep Snapshot';
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
