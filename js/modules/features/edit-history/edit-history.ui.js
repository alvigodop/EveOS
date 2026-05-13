// --- EveOS Scoped Edit History UI ---
window.EveEditHistory = window.EveEditHistory || {};

(function () {
    const ns = window.EveEditHistory;
    if (ns.uiReady) return;
    if (!ns.coreReady || !ns.restoreReady || !ns._helpers) {
        console.warn('[EditHistory] Core/restore helpers missing; UI not initialized.');
        return;
    }

    const { text } = ns._helpers;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        try {
            return new Date(value).toLocaleString();
        } catch {
            return text(value, 'Unknown time');
        }
    }

    function summarizeEntry(entry) {
        const layer = text(entry?.scope?.layer, 'datapack');
        const kind = text(entry?.mutationKind, 'data');
        const before = entry?.before || {};
        const after = entry?.after || {};
        if (layer === 'bookmark') {
            return `${text(before.link?.title || before.linkId || after.link?.title || after.linkId, 'Bookmark')} (${kind})`;
        }
        if (layer === 'card') {
            return `${text(before.categoryName || after.categoryName, 'Card')} in ${text(before.workspaceId || after.workspaceId, 'main')}`;
        }
        if (layer === 'folder') {
            return `${text(before.folderId || after.folderId, 'Folder')} in ${text(before.categoryName || after.categoryName, 'Card')}`;
        }
        if (layer === 'workspace') {
            return `${text(before.workspaceId || after.workspaceId || before.node?.name || after.node?.name, 'Tab')} (${kind})`;
        }
        return kind === 'config' ? 'Full datapack config' : 'Full datapack data';
    }

    function layerClass(layer) {
        const safe = text(layer, 'datapack').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
        return safe || 'datapack';
    }

    function renderEntry(entry) {
        const layer = text(entry?.scope?.layer, 'datapack');
        return `
            <article class="edit-history-row ${escapeHtml(layerClass(layer))}">
                <div class="edit-history-row-head">
                    <span class="edit-history-layer">${escapeHtml(layer)}</span>
                    <strong>${escapeHtml(entry?.scope?.label || summarizeEntry(entry))}</strong>
                    <span>${escapeHtml(formatDate(entry?.at))}</span>
                </div>
                <div class="edit-history-row-meta">
                    <span>${escapeHtml(summarizeEntry(entry))}</span>
                    <span>Source: ${escapeHtml(entry?.source || 'edit')}</span>
                </div>
                <div class="edit-history-row-actions">
                    <button class="btn-restore" style="border:none;" onclick="window.EveEditHistory.restoreEntry('${escapeHtml(entry.id)}').then(() => window.EveEditHistory.renderPanel())">Restore This Layer</button>
                </div>
            </article>
        `;
    }

    function renderPanel(targetId = 'editHistoryResults') {
        const target = document.getElementById(targetId);
        if (!target) return false;
        const layer = text(document.getElementById('editHistoryLayerFilter')?.value, 'all');
        const entries = ns.getEntries(layer === 'all' ? {} : { layer }).slice(0, 80);
        target.innerHTML = entries.length
            ? `<div class="edit-history-list">${entries.map(renderEntry).join('')}</div>`
            : '<div class="edit-history-empty">No local edit history has been captured yet.</div>';
        return true;
    }

    function clearAndRender() {
        if (typeof showConfirm === 'function') {
            Promise.resolve(showConfirm('Clear local edit history?')).then((ok) => {
                if (!ok) return;
                ns.clearHistory();
                renderPanel();
            });
            return;
        }
        ns.clearHistory();
        renderPanel();
    }

    function countByLayer() {
        const counts = {};
        ns.getEntries().forEach((entry) => {
            const layer = text(entry?.scope?.layer, 'datapack');
            counts[layer] = (counts[layer] || 0) + 1;
        });
        return counts;
    }

    Object.assign(ns, {
        renderPanel,
        clearAndRender,
        countByLayer
    });

    window.renderEditHistoryPanel = renderPanel;
    window.clearEditHistoryPanel = clearAndRender;

    ns.uiReady = true;
})();
