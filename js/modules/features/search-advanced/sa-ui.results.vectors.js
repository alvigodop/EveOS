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
            case 'google': return '<span class="nx-badge nx-badge-google">🔍 Google</span>';
            case 'cached': return '<span class="nx-badge nx-badge-cache">🔮 Cache</span>';
            case 'bookmark': return '<span class="nx-badge nx-badge-bookmark">🔖 Bookmark</span>';
            default: return '<span class="nx-badge nx-badge-default">📄 Result</span>';
        }
    }

    function getProviderBadge(provider) {
        if (!provider || provider === 'google' || provider === 'bookmark') return '';
        const labels = window.EveOS?.API?.SearchInternals?.PROVIDER_LABELS || {};
        const label = labels[provider] || provider;
        return '<span class="nx-provider-tag">' + escapeHtml(label) + '</span>';
    }

    function renderVectorResults(searchResult, container) {
        if (!container) return;
        const results = searchResult?.results || [];
        const stats = searchResult?.stats || {};

        if (results.length === 0) {
            container.innerHTML = '<div class="nx-empty">No results found across any vector.</div>';
            return;
        }

        // Stats bar
        const statParts = [];
        if (stats.google) statParts.push('🔍 Google: ' + stats.google);
        if (stats.cached) statParts.push('🔮 Cache: ' + stats.cached);
        if (stats.bookmarks) statParts.push('🔖 Bookmarks: ' + stats.bookmarks);
        const statsHtml = statParts.length
            ? '<div class="nx-results-stats">' + statParts.join(' &middot; ') + ' &mdash; ' + results.length + ' total</div>'
            : '';

        // Group by type
        const groups = { google: [], cached: [], bookmark: [] };
        results.forEach(function (r) {
            const key = r.type || 'cached';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });

        let html = statsHtml;

        // Render each group
        const groupOrder = [
            { key: 'google', label: '🔍 Google CSE', icon: 'google' },
            { key: 'cached', label: '🔮 Cached API Results', icon: 'cache' },
            { key: 'bookmark', label: '🔖 Bookmarks', icon: 'bookmark' }
        ];

        groupOrder.forEach(function (group) {
            const items = groups[group.key];
            if (!items || !items.length) return;

            html += '<div class="nx-result-group">';
            html += '<div class="nx-group-header">'
                + '<span class="nx-group-title">' + group.label + '</span>'
                + '<span class="nx-group-count">' + items.length + '</span>'
                + '</div>';

            items.forEach(function (item) {
                const safeUrl = escapeHtml(item.url || '#');
                const safeTitle = escapeHtml(item.title || 'Untitled');
                const safeDesc = escapeHtml(item.description || '');
                const safeDisplayUrl = escapeHtml(item.displayUrl || item.url || '');
                const cardBadge = item.sourceCard
                    ? '<span class="nx-card-tag">📋 ' + escapeHtml(item.sourceCard) + '</span>'
                    : '';
                const provBadge = getProviderBadge(item.provider);

                html += '<article class="nx-result-item nx-result-' + escapeHtml(item.type || 'default') + '">'
                    + '<div class="nx-result-header">'
                    + getVectorBadge(item.type) + provBadge + cardBadge
                    + '</div>'
                    + '<h4 class="nx-result-title"><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + safeTitle + '</a></h4>'
                    + (safeDisplayUrl ? '<div class="nx-result-url">' + safeDisplayUrl + '</div>' : '')
                    + (safeDesc ? '<p class="nx-result-snippet">' + safeDesc + '</p>' : '')
                    + '<div class="nx-result-actions">'
                    + '<button class="nx-action-btn" onclick="window.open(\'' + safeUrl.replace(/'/g, "\\'") + '\', \'_blank\')">↗ New Tab</button>'
                    + '<button class="nx-action-btn" onclick="window.open(\'' + safeUrl.replace(/'/g, "\\'") + '\', \'nexus_popup\', \'width=900,height=700\')">⧉ Popup</button>'
                    + '</div>'
                    + '</article>';
            });

            html += '</div>';
        });

        container.innerHTML = html;
    }

    window.EveOS.SearchAdvanced.Modules.renderVectorResults = renderVectorResults;
})();
