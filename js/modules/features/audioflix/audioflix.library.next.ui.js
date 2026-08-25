window.EveAudioflixLibraryNextUi = window.EveAudioflixLibraryNextUi || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixLibraryNextUi;
    if (ns.ready) return;

    function pruneGroupMap() {
        const s = window.EveAudioflixState?.ensure?.();
        if (!s) return;
        const liveIds = new Set((s.music || []).map((item) => item.id));
        const current = s.musicGroupMap || {};
        const next = Object.fromEntries(Object.entries(current).filter(([id]) => liveIds.has(id)));
        if (Object.keys(next).length !== Object.keys(current).length) {
            window.EveAudioflixState?.update?.({ musicGroupMap: next }, 'audioflix-prune-orphan-group-memberships');
        }
    }

    function syncQueueRebase() {
        const q = window.__eveAudioflixQueueRebase;
        if (!q) return;
        const name = String(q.groupName || '');
        if (!name) return;
        const grid = [...document.querySelectorAll('.audioflix-item-grid[data-af-active-group]')]
            .find((node) => node.dataset.afActiveGroup === name);
        if (grid) q.group = grid;
    }

    function injectMarkers() {
        const next = window.EveAudioflixLibraryNext;
        if (!next?.health || !next?.prefs) return;
        document.querySelectorAll('.audioflix-item-card').forEach((card) => {
            const play = card.querySelector('[data-af-action="play"][data-af-type="music"]');
            const row = card.querySelector('.audioflix-item-title-row');
            if (!play || !row) return;
            const id = play.dataset.afId;
            if (!id || row.querySelector('.eve-url-health-badge')) return;
            const item = next.health(id);
            if (!item?.status) return;
            const pref = next.prefs(id);
            if (item.status === 'down' && !pref.hideDown) {
                const marker = document.createElement('span');
                marker.className = 'eve-url-health-badge is-down';
                marker.title = 'URL checked when played and is currently unavailable';
                marker.textContent = '● URL Down';
                row.insertBefore(marker, row.querySelector('strong') || null);
            } else if (item.status === 'live' && pref.showLive) {
                const marker = document.createElement('span');
                marker.className = 'eve-url-health-badge is-live';
                marker.title = 'URL checked when played and is currently live';
                marker.textContent = '● Live URL';
                row.insertBefore(marker, row.querySelector('strong') || null);
            }
        });
    }

    function boot() {
        if (ns.booted || !document.body) return;
        ns.booted = true;
        const observe = () => { pruneGroupMap(); injectMarkers(); syncQueueRebase(); };
        const observer = new MutationObserver(observe);
        observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', (event) => {
            const play = event.target?.closest?.('[data-af-action="play"][data-af-type="music"]');
            if (!play) return;
            const badge = play.closest('.audioflix-item-card')?.querySelector('.audioflix-queue-badge');
            const match = badge?.textContent?.match(/#(\d+)/);
            if (!match) return;
            const grid = play.closest('.audioflix-item-grid');
            window.__eveAudioflixQueueRebase = {
                position: Number(match[1]),
                groupName: grid?.dataset?.afActiveGroup || '',
                group: grid || null
            };
            setTimeout(syncQueueRebase, 0);
        }, true);
        observe();
    }

    Object.assign(ns, { ready: true, boot, pruneGroupMap });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
