window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getVectorBadge(type) {
        switch (type) {
            case 'google': return '<span class="nx-badge nx-badge-google">Google</span>';
            case 'knowledge': return '<span class="nx-badge nx-badge-knowledge">Source Graph</span>';
            case 'cached': return '<span class="nx-badge nx-badge-cache">API Cache</span>';
            case 'bookmark': return '<span class="nx-badge nx-badge-bookmark">Bookmark</span>';
            default: return '<span class="nx-badge nx-badge-default">Result</span>';
        }
    }

    function getProviderBadge(provider) {
        if (!provider || provider === 'google' || provider === 'bookmark' || provider === 'knowledge') return '';
        const labels = window.EveOS?.API?.SearchInternals?.PROVIDER_LABELS || {};
        const label = labels[provider] || provider;
        return '<span class="nx-provider-tag">' + escapeHtml(label) + '</span>';
    }

    function renderStats(searchResult) {
        const stats = searchResult?.stats || {};
        const parts = [];
        if (stats.bookmarks) parts.push('Bookmarks: ' + stats.bookmarks);
        if (stats.knowledge) parts.push('Source Graph: ' + stats.knowledge);
        if (stats.cached) parts.push('API Cache: ' + stats.cached);
        if (stats.google) parts.push('Google: ' + stats.google);
        return parts.length
            ? '<div class="nx-results-stats">' + parts.join(' &middot; ') + ' &mdash; ' + (searchResult?.results?.length || 0) + ' total</div>'
            : '';
    }

    function renderPathMeta(item) {
        const navigation = window.EveOS?.SearchAdvanced?.Navigation;
        const pathLabel = navigation?.describePath
            ? navigation.describePath(item?.path)
            : String(item?.path?.pathLabel || '').trim();
        if (!pathLabel && !item?.provenance?.orphaned && !item?.provenance?.done) return '';

        let tags = '';
        if (item?.path?.folderLabel) tags += '<span class="nx-path-tag">Folder</span>';
        if (item?.path?.ambiguousWorkspace) tags += '<span class="nx-path-tag">Multi-tab</span>';
        if (item?.provenance?.done) tags += '<span class="nx-path-tag">Done</span>';
        if (item?.provenance?.orphaned) tags += '<span class="nx-path-tag nx-path-tag-warn">Orphan</span>';

        return '<div class="nx-result-path-wrap">'
            + (pathLabel ? '<div class="nx-result-path">Path: ' + escapeHtml(pathLabel) + '</div>' : '')
            + (tags ? '<div class="nx-result-path-tags">' + tags + '</div>' : '')
            + '</div>';
    }

    function renderProvenance(item, resultId) {
        const navigation = window.EveOS?.SearchAdvanced?.Navigation;
        const lines = navigation?.describeProvenance
            ? navigation.describeProvenance(item)
            : [];
        if (!Array.isArray(lines) || !lines.length) return '';
        return '<div class="nx-result-provenance" hidden data-nx-provenance="' + escapeHtml(resultId) + '">'
            + lines.map(function (line) {
                return '<div class="nx-result-provenance-row">' + escapeHtml(line) + '</div>';
            }).join('')
            + '</div>';
    }

    function renderActions(item, resultId) {
        const actions = [];
        if (item?.url) {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="newtab" data-nx-id="' + escapeHtml(resultId) + '">Open</button>');
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="popup" data-nx-id="' + escapeHtml(resultId) + '">Popup</button>');
        }
        if (item?.path?.workspaceId && item?.path?.categoryName) {
            actions.push('<button type="button" class="nx-action-btn nx-action-btn-primary" data-nx-action="path" data-nx-id="' + escapeHtml(resultId) + '">Go To Path</button>');
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="unidex" data-nx-id="' + escapeHtml(resultId) + '">Unidex</button>');
        }
        if (item?.type === 'bookmark' && item?.path?.linkId) {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="focus" data-nx-id="' + escapeHtml(resultId) + '">Focus</button>');
        }
        if (item?.provenance) {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="provenance" data-nx-id="' + escapeHtml(resultId) + '">Provenance</button>');
        }
        return actions.length ? '<div class="nx-result-actions">' + actions.join('') + '</div>' : '';
    }

    function renderTitle(item) {
        const safeTitle = escapeHtml(item?.title || 'Untitled');
        if (!item?.url) return '<h4 class="nx-result-title">' + safeTitle + '</h4>';
        return '<h4 class="nx-result-title"><a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">' + safeTitle + '</a></h4>';
    }

    function bindResultActions(container) {
        if (!container) return;
        if (container._nxVectorHandler) {
            container.removeEventListener('click', container._nxVectorHandler);
        }

        container._nxVectorHandler = function (event) {
            const actionButton = event.target.closest('[data-nx-action]');
            if (actionButton && container.contains(actionButton)) {
                event.preventDefault();
                event.stopPropagation();

                const resultId = String(actionButton.getAttribute('data-nx-id') || '').trim();
                const action = String(actionButton.getAttribute('data-nx-action') || '').trim();
                const result = container._nxResultMap?.get(resultId);
                if (!result) return;

                const navigation = window.EveOS?.SearchAdvanced?.Navigation;
                if (action === 'newtab' && result.url) {
                    window.open(result.url, '_blank', 'noopener,noreferrer');
                    return;
                }
                if (action === 'popup' && result.url) {
                    window.open(result.url, 'nexus_popup', 'width=1100,height=780');
                    return;
                }
                if (action === 'path' && navigation?.goToPath) {
                    navigation.goToPath(result);
                    return;
                }
                if (action === 'unidex' && navigation?.openInUnidex) {
                    navigation.openInUnidex(result);
                    return;
                }
                if (action === 'focus' && navigation?.focusBookmark) {
                    navigation.focusBookmark(result);
                    return;
                }
                if (action === 'provenance') {
                    const article = actionButton.closest('.nx-result-item');
                    const provenance = article?.querySelector('[data-nx-provenance="' + resultId + '"]');
                    if (provenance) provenance.hidden = !provenance.hidden;
                }
                return;
            }

            const header = event.target.closest('[data-nx-collapse-group]');
            if (header && container.contains(header)) {
                const group = header.closest('.nx-result-group');
                if (group) group.classList.toggle('collapsed');
            }
        };

        container.addEventListener('click', container._nxVectorHandler);
    }

    function renderVectorResults(searchResult, container) {
        if (!container) return;
        const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
        if (!results.length) {
            container.innerHTML = '<div class="nx-empty">No results found across any vector.</div>';
            container._nxResultMap = new Map();
            bindResultActions(container);
            return;
        }

        const groups = { bookmark: [], knowledge: [], cached: [], google: [] };
        results.forEach(function (result) {
            const key = String(result?.type || 'cached').trim() || 'cached';
            if (!groups[key]) groups[key] = [];
            groups[key].push(result);
        });

        const orderedGroups = [
            { key: 'bookmark', label: 'Bookmarks' },
            { key: 'knowledge', label: 'Knowledge & Source Graph' },
            { key: 'cached', label: 'Cached API Results' },
            { key: 'google', label: 'Google CSE' }
        ];

        const resultMap = new Map();
        let html = renderStats(searchResult);

        orderedGroups.forEach(function (group) {
            const items = groups[group.key];
            if (!items?.length) return;

            html += '<div class="nx-result-group">';
            html += '<div class="nx-group-header nx-group-toggle" data-nx-collapse-group>'
                + '<span class="nx-group-arrow">▾</span>'
                + '<span class="nx-group-title">' + escapeHtml(group.label) + '</span>'
                + '<span class="nx-group-count">' + items.length + '</span>'
                + '</div>';
            html += '<div class="nx-group-body">';

            items.forEach(function (item, index) {
                const resultId = group.key + '_' + index + '_' + Math.random().toString(36).slice(2, 8);
                resultMap.set(resultId, item);
                const cardBadge = item?.sourceCard
                    ? '<span class="nx-card-tag">Card: ' + escapeHtml(item.sourceCard) + '</span>'
                    : '';

                html += '<article class="nx-result-item nx-result-' + escapeHtml(item?.type || 'default') + '">'
                    + '<div class="nx-result-header">'
                    + getVectorBadge(item?.type)
                    + getProviderBadge(item?.provider)
                    + cardBadge
                    + '</div>'
                    + renderTitle(item)
                    + (item?.displayUrl ? '<div class="nx-result-url">' + escapeHtml(item.displayUrl) + '</div>' : '')
                    + (item?.description ? '<p class="nx-result-snippet">' + escapeHtml(item.description) + '</p>' : '')
                    + renderPathMeta(item)
                    + renderActions(item, resultId)
                    + renderProvenance(item, resultId)
                    + '</article>';
            });

            html += '</div></div>';
        });

        container.innerHTML = html;
        container._nxResultMap = resultMap;
        bindResultActions(container);
    }

    window.EveOS.SearchAdvanced.Modules.renderVectorResults = renderVectorResults;
})();
