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

    function performDuplicateScan(items, modalTitleStr, scopeFolderIds = []) {
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

        const fullReport = window.EveDuplicateSensor.scan({ scope: 'all_tabs' });
        const itemIds = new Set(items.map((item) => item.id));
        const targetFolderIds = new Set(scopeFolderIds);
        
        const filteredGroups = (fullReport.groups || []).filter((group) => 
            (group.links || group.items || []).some((entry) => itemIds.has(entry.linkId))
        );
        
        const filteredFolderGroups = (fullReport.folderGroups || []).filter((group) => 
            (group.items || []).some((entry) => targetFolderIds.has(entry.folderId))
        );

        const report = { 
            groups: filteredGroups,
            folderGroups: filteredFolderGroups
        };

        if (!report.groups.length && !report.folderGroups.length) {
            content.innerHTML = `<p style="color:#0f0;">Scan complete. Found 0 library-wide duplicates involving these ${items.length} items and folders.</p>`;
            return;
        }

        window._ctxTempFolderSubScanReport = report;
        const escapeHtml = (unsafe) => String(unsafe || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        let reportHtml = `<p>Found ${report.groups.length} bookmark group(s) and ${report.folderGroups.length} folder group(s) involving this selection.</p>`;
        reportHtml += '<div style="max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid #444; border-radius: 4px; padding: 10px; margin-top: 10px; display: flex; flex-direction: column; gap: 15px;">';

        if (report.folderGroups.length > 0) {
            reportHtml += '<div><div style="color: #ff9800; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #ff9800;">Duplicate Folders:</div>';
            report.folderGroups.forEach((group) => {
                const groupItems = group.items || [];
                reportHtml += '<div style="margin-bottom: 10px; padding: 8px; background: rgba(255,152,0,0.1); border-radius: 4px;">';
                reportHtml += `<div style="color: #ff9800; font-weight: bold;">Name: ${escapeHtml(group.normalizedName)}</div>`;
                groupItems.forEach((entry) => {
                    reportHtml += `<div style="font-size: 0.85rem; opacity: 0.9;">- Found in: ${escapeHtml(entry.workspaceName)} / ${escapeHtml(entry.categoryName)} / ${escapeHtml(entry.parentLabel || 'Root')}</div>`;
                });
                reportHtml += '</div>';
            });
            reportHtml += '</div>';
        }

        if (report.groups.length > 0) {
            reportHtml += '<div><div style="color: #00d4ff; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #00d4ff;">Duplicate Bookmarks:</div>';
            report.groups.forEach((group) => {
                const groupItems = group.links || group.items || [];
                reportHtml += '<div style="margin-bottom: 10px; padding: 8px; background: rgba(0,212,255,0.05); border-radius: 4px;">';
                reportHtml += `<div style="word-break: break-all; font-size: 0.85rem; color: #00d4ff;">URL: ${escapeHtml(group.url || group.normalizedUrl)}</div>`;
                groupItems.forEach((entry) => {
                    reportHtml += `<div style="font-size: 0.85rem; opacity: 0.9;">- ${escapeHtml(entry.title || 'Untitled')} (${escapeHtml(entry.workspaceName || 'Main')} / ${escapeHtml(entry.categoryName || 'Unsorted')} / ${escapeHtml(entry.folderLabel || 'Root')})</div>`;
                });
                reportHtml += '</div>';
            });
            reportHtml += '</div>';
        }

        reportHtml += '</div>';
        reportHtml += `<div style="margin-top: 15px; display: flex; gap: 10px;">
            <button class="btn-primary" onclick="
                document.getElementById('folderOperationsModal').style.display='none';
                if (typeof openSettings === 'function') {
                    openSettings();
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
