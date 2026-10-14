// Presentation-only music pages. Canonical scopes/queues remain in their existing owners.
(function () {
    'use strict';
    const ns = window.EveAudioflixUiWindow = window.EveAudioflixUiWindow || {};
    if (ns.ready) return;
    // Keep every live music surface under a small DOM bound. Forty complex cards keeps expansion
    // comfortably interactive while the full canonical scope remains available to queues/search;
    // only presentation is paged.
    const PAGE_SIZE = 40, THRESHOLD = 40, MAX_SCOPES = 32;
    let nextOwner = 0;
    function create({ esc, renderCard, itemsForKey, afterMount }) {
        const owner = String(++nextOwner), pages = new Map();
        function remember(key, page) {
            pages.delete(key); pages.set(key, page);
            if (pages.size > MAX_SCOPES) pages.delete(pages.keys().next().value);
        }
        const enabled = (items, type) => type === 'music' && items.length > THRESHOLD;
        function pageFor(items, key) {
            const page = Math.max(0, Math.min(pages.get(key) || 0, Math.ceil(items.length / PAGE_SIZE) - 1));
            remember(key, page); return page;
        }
        function attrs(items, key, type) {
            return enabled(items, type) ? ` data-af-window-owner="${owner}" data-af-window-key="${esc(key)}" data-af-window-page="${pageFor(items, key)}"` : '';
        }
        function render(items, key, type) {
            if (!enabled(items, type)) return items.map(item => renderCard(item, type)).join('');
            const page = pageFor(items, key), first = page * PAGE_SIZE, totalPages = Math.ceil(items.length / PAGE_SIZE);
            const controls = `<nav class="audioflix-card-pages" style="grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap" aria-label="Music card pages"><button type="button" data-af-window-step="-1" ${page === 0 ? 'disabled' : ''}>Previous page</button><span aria-live="polite">Showing ${first + 1}–${Math.min(first + PAGE_SIZE, items.length)} of ${items.length} tracks · Page ${page + 1}/${totalPages}</span><button type="button" data-af-window-step="1" ${page + 1 === totalPages ? 'disabled' : ''}>Next page</button></nav>`;
            return controls + items.slice(first, first + PAGE_SIZE).map(item => renderCard(item, type)).join('');
        }
        function configure(grid, items, key, type) {
            if (enabled(items, type)) {
                grid.dataset.afWindowOwner = owner; grid.dataset.afWindowKey = key; grid.dataset.afWindowPage = String(pageFor(items, key));
            } else { delete grid.dataset.afWindowOwner; delete grid.dataset.afWindowKey; delete grid.dataset.afWindowPage; }
        }
        function mount(grid, items, key, type) {
            configure(grid, items, key, type);
            grid.innerHTML = render(items, key, type);
            afterMount?.(grid);
        }
        function showIndex(grid, items, key, type, index) {
            if (!grid || !enabled(items, type) || index < 0 || index >= items.length) return false;
            const page = Math.floor(index / PAGE_SIZE);
            const targetId = String(items[index]?.id ?? '');
            const targetMounted = [...grid.querySelectorAll('.audioflix-item-card [data-af-action="play"]')]
                .some(button => button.dataset.afType === type && button.dataset.afId === targetId);
            if (pageFor(items, key) !== page || grid.dataset.afWindowOwner !== owner
                || grid.dataset.afWindowKey !== key || Number(grid.dataset.afWindowPage) !== page
                || !targetMounted) {
                remember(key, page); mount(grid, items, key, type);
            }
            return true;
        }
        document.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-af-window-step]');
            const grid = button?.closest?.('[data-af-window-owner]');
            if (!grid || grid.dataset.afWindowOwner !== owner || button.disabled) return;
            event.preventDefault(); event.stopPropagation();
            const source = itemsForKey(grid.dataset.afWindowKey), key = source?.key || grid.dataset.afWindowKey;
            if (!source || !enabled(source.items, source.type)) return;
            const step = Number(button.dataset.afWindowStep);
            if (step !== -1 && step !== 1) return;
            const next = pageFor(source.items, key) + step;
            remember(key, Math.max(0, Math.min(Math.ceil(source.items.length / PAGE_SIZE) - 1, next)));
            mount(grid, source.items, key, source.type);
            const target = grid.querySelector(`[data-af-window-step="${button.dataset.afWindowStep}"]:not([disabled])`)
                || grid.querySelector('[data-af-window-step]:not([disabled])');
            target?.focus({ preventScroll: true });
            grid.scrollIntoView({ block: 'start', behavior: 'auto' });
        }, true);
        return { attrs, render, configure, showIndex,
            diagnostics: () => ({ pageSize: PAGE_SIZE, threshold: THRESHOLD, cachedScopes: pages.size, maxScopes: MAX_SCOPES }) };
    }
    Object.assign(ns, { ready: true, create });
})();
