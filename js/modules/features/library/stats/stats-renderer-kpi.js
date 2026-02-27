/**
 * Library Stats Renderer - KPI Helpers
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    function renderSummaryCards(params) {
        const {
            entriesCount,
            totalCount,
            kpis,
            formatAverage,
            formatPercent,
            escapeHtml
        } = params || {};

        const safeKpis = kpis || {};
        const cards = [
            {
                label: 'Total Series',
                value: String(safeKpis.totalSeries || 0),
                hint: `${entriesCount || 0} shown / ${totalCount || 0} total`
            },
            {
                label: 'Chapters / Episodes Read',
                value: String(safeKpis.totalProgressUnits || 0),
                hint: 'Total progress tracked'
            },
            {
                label: 'Estimated Time',
                value: `${formatAverage?.(safeKpis.estimatedHours, 1) || '0.0'}h`,
                hint: '~5 min per unit'
            },
            {
                label: 'Unified Avg',
                value: `${formatAverage?.(safeKpis.avgUnified10, 2) || 'N/A'} / 10`,
                hint: 'Weighted blend score'
            },
            {
                label: 'Top Author',
                value: safeKpis.topAuthorName ? escapeHtml?.(safeKpis.topAuthorName) : 'N/A',
                hint: safeKpis.topAuthorName ? `${safeKpis.topAuthorCount || 0} entries` : 'No author data'
            },
            {
                label: 'Library Health',
                value: formatPercent?.(safeKpis.averageConfidence) || '0%',
                hint: `${formatPercent?.(safeKpis.highConfidenceShare) || '0%'} high-confidence`
            }
        ];

        return cards.map(card => `
            <div class="lib-kpi-card">
                <div class="lib-kpi-label">${card.label}</div>
                <div class="lib-kpi-value">${card.value}</div>
                <div class="lib-kpi-hint">${card.hint}</div>
            </div>
        `).join('');
    }

    window.EveLibrary.StatsRendererKpi = {
        renderSummaryCards
    };
})();
