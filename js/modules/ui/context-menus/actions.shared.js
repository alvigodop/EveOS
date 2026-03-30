window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const ns = window.EveContextMenuActions;
    if (ns.sharedReady) return;

    function getCtxLinkId() {
        return String(window.ctxLinkId ?? '');
    }

    function getCtxCategoryName() {
        const fromContext = String(window.ctxCatName ?? '').trim();
        if (fromContext) return fromContext;

        const fromModal = String(window.currentCategoryCtx ?? '').trim();
        if (fromModal) {
            window.ctxCatName = fromModal;
            return fromModal;
        }

        return '';
    }

    function getCtxLink() {
        const targetId = getCtxLinkId();
        if (!targetId) return null;
        return links.find((entry) => String(entry?.id) === targetId) || null;
    }

    function performDuplicateScan(items, modalTitleStr) {
        const modal = document.getElementById('folderOperationsModal');
        const title = document.getElementById('folderOperationsTitle');
        const content = document.getElementById('folderOperationsContent');

        if (!(modal && title && content)) return;

        title.textContent = modalTitleStr;
        content.innerHTML = '<p>Scanning...</p>';
        modal.style.display = 'flex';

        if (!(typeof window.EveDuplicateSensor === 'object' && typeof window.EveDuplicateSensor.scan === 'function')) {
            content.innerHTML = '<p style="color:red;">Duplicate Sensor module not found.</p>';
            return;
        }

        const allItems = window.links || [];
        const fullReport = window.EveDuplicateSensor.scan(allItems);
        const itemIds = new Set(items.map((item) => item.id));
        const filteredGroups = (fullReport.groups || []).filter((group) => (group.links || group.items || []).some((entry) => itemIds.has(entry.id)));
        const report = { groups: filteredGroups };

        if (!report.groups.length) {
            content.innerHTML = `<p style="color:#0f0;">Scan complete. Found 0 library-wide duplicates involving these ${items.length} items.</p>`;
            return;
        }

        window._ctxTempFolderSubScanReport = report;
        const escapeHtml = (unsafe) => String(unsafe || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        let reportHtml = `<p>Found ${report.groups.length} library-wide duplicate groups involving these ${items.length} items.</p>`;
        reportHtml += '<div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid #444; border-radius: 4px; padding: 10px; margin-top: 10px;">';
        report.groups.forEach((group) => {
            const groupItems = group.links || group.items || [];
            reportHtml += '<div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #333;">';
            reportHtml += '<div style="color: #00d4ff; font-weight: bold; margin-bottom: 4px;">Target URL:</div>';
            reportHtml += `<div style="word-break: break-all; font-size: 0.85rem; opacity: 0.8; margin-bottom: 8px;">${escapeHtml(group.url || group.normalizedUrl)}</div>`;
            groupItems.forEach((entry) => {
                reportHtml += `<div style="font-size: 0.85rem;">- ${escapeHtml(entry.title || 'Untitled')} (Folder: ${escapeHtml(entry.folderId || 'Root')})</div>`;
            });
            reportHtml += '</div>';
        });
        reportHtml += '</div>';
        reportHtml += `<div style="margin-top: 15px; display: flex; gap: 10px;">
            <button class="btn-primary" onclick="
                document.getElementById('folderOperationsModal').style.display='none';
                if (typeof openSettingsModal === 'function') {
                    openSettingsModal('backup');
                    setTimeout(() => {
                        const modeSelect = document.getElementById('backupSettingsMode');
                        if (modeSelect) {
                            modeSelect.value = 'duplicates';
                            modeSelect.dispatchEvent(new Event('change'));
                        }
                    }, 100);
                }
            ">Open Advanced Duplicate Manager</button>
        </div>`;
        content.innerHTML = reportHtml;
    }

    Object.assign(ns, {
        getCtxLinkId,
        getCtxCategoryName,
        getCtxLink,
        performDuplicateScan
    });

    ns.sharedReady = true;
})();
