/* EveOS script-loader bootstrap recovery helpers. */
(function () {
    const MAX_BOOTSTRAP_RELOADS = 1;
    const RELOAD_ATTEMPT_KEY = 'eveos.scriptLoader.reloadAttempts';

    function getReloadAttempts() {
        try {
            const raw = Number(sessionStorage.getItem(RELOAD_ATTEMPT_KEY) || '0');
            return Number.isFinite(raw) && raw > 0 ? raw : 0;
        } catch {
            return 0;
        }
    }

    function setReloadAttempts(value) {
        try {
            sessionStorage.setItem(RELOAD_ATTEMPT_KEY, String(Math.max(0, Number(value) || 0)));
        } catch {}
    }

    function clearReloadAttempts() {
        try {
            sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
        } catch {}
    }

    function getRenderedBootContentCounts() {
        try {
            const grid = document.getElementById('dashboard-grid')
                || document.getElementById('categoryGrid')
                || document.querySelector('.dashboard-grid, .categories-grid, [data-dashboard-grid]');
            if (!grid) return { cards: 0, links: 0 };
            return {
                cards: grid.querySelectorAll('.category-card, [data-category-name], [data-card-id]').length,
                links: grid.querySelectorAll('[data-link-id], .bookmark-item, .bookmark-card').length
            };
        } catch {
            return { cards: 0, links: 0 };
        }
    }

    function getLiveBootLinkCount() {
        try {
            if (typeof window.getLiveLinks === 'function') {
                const links = window.getLiveLinks();
                return Array.isArray(links) ? links.length : 0;
            }
            if (Array.isArray(window.eveState?.links)) return window.eveState.links.length;
        } catch {
            // Ignore live-state read errors while handling bootstrap failures.
        }
        return 0;
    }

    function hasRecoverableBootContent() {
        const rendered = getRenderedBootContentCounts();
        if (rendered.cards > 0 || rendered.links > 0) return true;
        if (window.__eveCoreDataLoaded && getLiveBootLinkCount() > 0) return true;
        const summary = window.__eveLastCoreDataLoadSummary;
        return !!summary && Number(summary.realLinkCount || summary.linkCount || 0) > 0;
    }

    function preserveVisibleBootstrapState(err, failedSrc) {
        const warning = {
            failedSrc,
            reason: err?.reason || 'error',
            recordedAt: new Date().toISOString(),
            rendered: getRenderedBootContentCounts(),
            liveLinks: getLiveBootLinkCount()
        };
        window.__eveBootstrapLoadWarning = warning;
        clearReloadAttempts();
        try {
            window.dispatchEvent(new CustomEvent('eve:bootstrap-warning', {
                detail: warning
            }));
        } catch {
            // Event dispatch is best effort only.
        }
        console.warn('[ScriptLoader] Preserved visible EveOS state after bootstrap warning.', warning);
    }

    window.EveScriptLoaderBootstrap = {
        MAX_BOOTSTRAP_RELOADS,
        getReloadAttempts,
        setReloadAttempts,
        clearReloadAttempts,
        hasRecoverableBootContent,
        preserveVisibleBootstrapState
    };
})();
