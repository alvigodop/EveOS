window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
(function () {
    'use strict';
    const ns = window.EveOS.SearchAdvanced;
    function esc(value, escHtml) {
        return typeof escHtml === 'function'
            ? escHtml(value)
            : String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function renderPerfRows(hydrationMemory, escHtml) {
        if (!hydrationMemory) return '';
        let html = '<tr><td>Adaptive Hydration</td><td>'
            + (hydrationMemory.enabled ? esc(hydrationMemory.mode || 'auto', escHtml) : 'off')
            + ' · hot tabs ' + Number(hydrationMemory.hotWorkspaces?.length || 0)
            + ' · hot cards ' + Number(hydrationMemory.hotCards?.length || 0)
            + '</td></tr>';
        if (hydrationMemory.session) {
            html += '<tr><td>Hydration Budget</td><td>'
                + Number(hydrationMemory.session.usedCards || 0) + ' cards / '
                + Number(hydrationMemory.session.usedLinks || 0) + ' links'
                + ' · ' + Number(hydrationMemory.session.idleHydrationMs || 0).toFixed(1) + ' ms'
                + '</td></tr>';
        }
        return html;
    }
    function renderFrequentPlaces(hydrationMemory, renderMiniList, escHtml) {
        if (!hydrationMemory) return '';
        const hotWorkspaceRows = (hydrationMemory.hotWorkspaces || []).slice(0, 5).map(function (entry) {
            return [entry.name || entry.id || 'tab', Number(entry.score || entry.visits || 0) + ' heat'];
        });
        const hotCardRows = (hydrationMemory.hotCards || []).slice(0, 5).map(function (entry) {
            return [(entry.workspaceId || 'main') + ' / ' + (entry.categoryName || 'Unsorted'), Number(entry.score || entry.interactions || 0) + ' heat'];
        });
        let html = '<div class="nx-debug-section"><div class="nx-debug-section-title">FREQUENT PLACES</div>';
        html += hotWorkspaceRows.length
            ? renderMiniList(hotWorkspaceRows)
            : '<div style="font-size:0.74rem; color:rgba(140,170,205,0.7);">No frequent tabs yet.</div>';
        html += hotCardRows.length ? renderMiniList(hotCardRows) : '';
        if (hydrationMemory.lastDecision) {
            html += '<div style="font-size:0.72rem; color:rgba(140,170,205,0.72); margin-top:8px;">Last decision: '
                + esc(hydrationMemory.lastDecision.reason || 'n/a', escHtml)
                + ' · ' + esc(hydrationMemory.lastDecision.workspaceId || '', escHtml)
                + ' / ' + esc(hydrationMemory.lastDecision.categoryName || '', escHtml)
                + '</div>';
        }
        return html + '</div>';
    }
    ns.DebugHydrationMemory = { renderPerfRows, renderFrequentPlaces };
})();
