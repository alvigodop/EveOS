/**
 * Library Stats Renderer - Widget Helpers
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    function renderTagCloud(params) {
        const { prefix, entries, StatsCalc, escapeHtml } = params || {};
        const cloudEl = document.getElementById(`${prefix}tagCloud`);
        if (!cloudEl) return;

        const cloud = StatsCalc?.calcTagCloud ? StatsCalc.calcTagCloud(entries, 36) : [];
        if (!cloud.length) {
            cloudEl.innerHTML = '<span class="lib-tag-empty">No tag data.</span>';
            return;
        }

        cloudEl.innerHTML = cloud.map(item => {
            const weight = Math.max(0, Math.min(1, Number(item.weight) || 0));
            const size = (0.72 + (weight * 1.05)).toFixed(2);
            const opacity = (0.62 + (weight * 0.38)).toFixed(2);
            const label = escapeHtml ? escapeHtml(item.tag) : String(item.tag || '');
            return `<span class="lib-tag-pill" style="font-size:${size}rem;opacity:${opacity}">${label} <small>${item.count}</small></span>`;
        }).join('');
    }

    function renderHotTakeList(params) {
        const { items, emptyLabel, escapeHtml, formatSigned } = params || {};
        const safeItems = Array.isArray(items) ? items : [];

        if (!safeItems.length) {
            return `<li class="lib-stat-empty">${escapeHtml ? escapeHtml(emptyLabel || 'No data yet.') : String(emptyLabel || 'No data yet.')}</li>`;
        }

        return safeItems.map(item => `
            <li class="lib-stat-list-item">
                <span class="lib-stat-list-title">${escapeHtml ? escapeHtml(item.title) : String(item.title || '')}</span>
                <span class="lib-stat-delta is-positive">${formatSigned ? formatSigned(item.delta) : String(item.delta ?? '0')}</span>
            </li>
        `).join('');
    }

    window.EveLibrary.StatsRendererWidgets = {
        renderTagCloud,
        renderHotTakeList
    };
})();
