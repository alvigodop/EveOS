window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderProgressiveReady) return;

    var RENDER_BATCH = 50;
    var REVEAL_STATE_KEY = 'eveV22ProgressiveRevealState';
    var MAX_STORED_VISIBLE = 6000;
    var MAX_SCOPE_VISIBLE = 600;
    var STATE_VERSION = 1;

    function nowMs() {
        return Date.now ? Date.now() : new Date().getTime();
    }

    function safeParseRevealState() {
        try {
            var raw = window.localStorage ? window.localStorage.getItem(REVEAL_STATE_KEY) : '';
            var parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object' || parsed.version !== STATE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
                return { version: STATE_VERSION, entries: {} };
            }
            return parsed;
        } catch (error) {
            return { version: STATE_VERSION, entries: {} };
        }
    }

    function saveRevealState(state) {
        if (!window.localStorage || !state || typeof state !== 'object') return;
        try {
            window.localStorage.setItem(REVEAL_STATE_KEY, JSON.stringify(state));
        } catch (error) {
            try { window.localStorage.removeItem(REVEAL_STATE_KEY); } catch (ignored) {}
        }
    }

    function pruneRevealState(state) {
        var entries = state && state.entries && typeof state.entries === 'object' ? state.entries : {};
        var rows = Object.keys(entries).map(function (key) {
            var entry = entries[key] || {};
            return {
                key: key,
                visible: Math.max(0, Number(entry.visible || 0) || 0),
                at: Math.max(0, Number(entry.at || 0) || 0)
            };
        }).filter(function (row) {
            return row.visible > 0;
        }).sort(function (a, b) {
            return b.at - a.at;
        });

        var total = 0;
        var nextEntries = {};
        rows.forEach(function (row) {
            if (total >= MAX_STORED_VISIBLE) return;
            var cappedVisible = Math.min(row.visible, MAX_SCOPE_VISIBLE, MAX_STORED_VISIBLE - total);
            if (cappedVisible <= 0) return;
            nextEntries[row.key] = { visible: cappedVisible, at: row.at };
            total += cappedVisible;
        });
        state.entries = nextEntries;
        return state;
    }

    function normalizeRevealKey(scopeKey, categoryName) {
        var rawKey = String(scopeKey || '').trim();
        if (!rawKey) rawKey = String(categoryName || 'card').trim() || 'card';
        return rawKey;
    }

    function getProgressiveVisibleCount(scopeKey, fallbackCount, totalCount, categoryName) {
        var safeFallback = Math.max(0, Number(fallbackCount || 0) || 0);
        var safeTotal = Math.max(0, Number(totalCount || 0) || 0);
        var key = normalizeRevealKey(scopeKey, categoryName);
        var state = safeParseRevealState();
        var entry = state.entries[key];
        var stored = Math.max(0, Number(entry && entry.visible || 0) || 0);
        return Math.min(safeTotal, Math.max(safeFallback, Math.min(stored, MAX_SCOPE_VISIBLE)));
    }

    function rememberProgressiveVisibleCount(scopeKey, visibleCount, totalCount, categoryName) {
        var key = normalizeRevealKey(scopeKey, categoryName);
        if (!key) return;
        var safeTotal = Math.max(0, Number(totalCount || 0) || 0);
        var safeVisible = Math.min(safeTotal, Math.max(0, Number(visibleCount || 0) || 0), MAX_SCOPE_VISIBLE);
        var state = safeParseRevealState();
        if (safeVisible <= 0) delete state.entries[key];
        else state.entries[key] = { visible: safeVisible, at: nowMs() };
        saveRevealState(pruneRevealState(state));
    }

    function buildShowMoreButton(categoryName, allLinks, alreadyRendered, isFocused, scopeKey) {
        var remaining = allLinks.length - alreadyRendered;
        var safeCategory = String(categoryName || '').replace(/[^a-zA-Z0-9]/g, '_');
        var safeScope = String(scopeKey || 'card').replace(/[^a-zA-Z0-9]/g, '_');
        var buttonId = 'showMore_' + safeCategory + '_' + safeScope + '_' + alreadyRendered;
        if (!window._eveProgressiveLinks) window._eveProgressiveLinks = {};
        window._eveProgressiveLinks[buttonId] = {
            links: allLinks,
            offset: alreadyRendered,
            focused: isFocused,
            scopeKey: normalizeRevealKey(scopeKey, categoryName),
            categoryName: categoryName
        };
        return '<li class="eve-show-more-item" id="' + buttonId + '">'
            + '<button class="eve-show-more-btn"'
            + ' onpointerenter="window._eveLoadMoreLinks(\'' + buttonId + '\')"'
            + ' onmouseenter="window._eveLoadMoreLinks(\'' + buttonId + '\')"'
            + ' onfocus="window._eveLoadMoreLinks(\'' + buttonId + '\')"'
            + ' onclick="window._eveLoadMoreLinks(\'' + buttonId + '\')">'
            + 'Hover to load ' + Math.min(remaining, RENDER_BATCH) + ' bookmarks (' + remaining + ' remaining)'
            + '</button></li>';
    }

    window._eveLoadMoreLinks = function (buttonId) {
        var store = window._eveProgressiveLinks && window._eveProgressiveLinks[buttonId];
        if (!store) return;

        var links = store.links;
        var offset = store.offset;
        var end = Math.min(offset + RENDER_BATCH, links.length);
        var buttonEl = document.getElementById(buttonId);
        if (!buttonEl) return;

        var parent = buttonEl.parentElement;
        if (!parent) return;

        var fragment = document.createDocumentFragment();
        for (var index = offset; index < end; index++) {
            var link = links[index];
            if (!link) continue;

            var html = '';
            if (store.focused && typeof window.DashboardCategories.buildFocusedLinkHtml === 'function') {
                html = window.DashboardCategories.buildFocusedLinkHtml(link, {
                    taskMode: true,
                    taskEnabled: true
                });
            } else if (typeof window.DashboardCategories.buildLinkHtml === 'function') {
                html = window.DashboardCategories.buildLinkHtml(link, '', '', [], {});
            }

            if (!html) continue;
            var temp = document.createElement('div');
            temp.innerHTML = html;
            while (temp.firstChild) fragment.appendChild(temp.firstChild);
        }

        parent.insertBefore(fragment, buttonEl);
        rememberProgressiveVisibleCount(store.scopeKey, end, links.length, store.categoryName);

        if (end >= links.length) {
            buttonEl.remove();
            delete window._eveProgressiveLinks[buttonId];
        } else {
            store.offset = end;
            var remaining = links.length - end;
            buttonEl.innerHTML = '<button class="eve-show-more-btn"'
                + ' onpointerenter="window._eveLoadMoreLinks(\'' + buttonId + '\')"'
                + ' onmouseenter="window._eveLoadMoreLinks(\'' + buttonId + '\')"'
                + ' onfocus="window._eveLoadMoreLinks(\'' + buttonId + '\')"'
                + ' onclick="window._eveLoadMoreLinks(\'' + buttonId + '\')">'
                + 'Hover to load ' + Math.min(remaining, RENDER_BATCH) + ' bookmarks (' + remaining + ' remaining)'
                + '</button>';
            if (buttonEl.matches(':hover') || parent.matches(':hover')) {
                setTimeout(function () {
                    var stillHovering = document.getElementById(buttonId);
                    if (stillHovering && (stillHovering.matches(':hover') || stillHovering.parentElement?.matches(':hover'))) {
                        window._eveLoadMoreLinks(buttonId);
                    }
                }, 120);
            }
        }
    };

    Object.assign(api, {
        RENDER_BATCH: RENDER_BATCH,
        buildShowMoreButton: buildShowMoreButton,
        getProgressiveVisibleCount: getProgressiveVisibleCount,
        rememberProgressiveVisibleCount: rememberProgressiveVisibleCount
    });

    window.getEveProgressiveVisibleCount = getProgressiveVisibleCount;
    window.rememberEveProgressiveVisibleCount = rememberProgressiveVisibleCount;

    api.cardRenderProgressiveReady = true;
})();
