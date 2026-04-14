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

        title.innerHTML = `<span style="display:flex; align-items:center; gap:10px;">💾 ${modalTitleStr}</span>`;
        content.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; padding: 20px 0; color: var(--accent);">
                <div class="spinner" style="width:40px; height:40px; border:3px solid rgba(255,255,255,0.1); border-top-color:var(--accent); border-radius:50%; animation: spin 1s linear infinite;"></div>
                <p style="margin-top:15px; font-size:0.95rem; font-weight:500;">Analyzing your library...</p>
            </div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;
        modal.style.display = 'flex';

        if (!(typeof window.EveDuplicateSensor === 'object' && typeof window.EveDuplicateSensor.scan === 'function')) {
            content.innerHTML = '<p style="color:var(--danger); padding:10px; background:rgba(255,0,0,0.1); border-radius:4px;">Duplicate Sensor module not found.</p>';
            return;
        }

        // Run the scan
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

        const escapeHtml = (unsafe) => String(unsafe || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Empty Result View
        if (!report.groups.length && !report.folderGroups.length) {
            content.innerHTML = `
                <div style="text-align:center; padding: 40px 20px; background:rgba(255,255,255,0.02); border-radius:12px; border: 1px dashed rgba(255,255,255,0.1);">
                    <div style="font-size:3rem; margin-bottom:15px;">✨</div>
                    <h3 style="color:var(--success); margin:0 0 10px 0;">Library Clean</h3>
                    <p style="opacity:0.8; font-size:0.9rem; max-width:280px; margin:0 auto;">
                        Found 0 library-wide duplicates involving these <b>${items.length}</b> items and folders.
                    </p>
                    <button class="btn-primary" style="margin-top:25px; padding: 8px 20px; border-radius:20px;" onclick="document.getElementById('folderOperationsModal').style.display='none'">Fantastic!</button>
                </div>
            `;
            return;
        }

        // Populated Result View
        let reportHtml = `
            <div style="margin-bottom:15px; padding:0 5px;">
                <p style="margin:0; opacity:0.8; font-size:0.9rem;">
                    Detected <b>${report.groups.length}</b> bookmark group(s) and <b>${report.folderGroups.length}</b> folder group(s) involving this selection.
                </p>
            </div>
            <div style="max-height: 400px; overflow-y: auto; padding-right:8px; display: flex; flex-direction: column; gap: 15px;">
        `;

        if (report.folderGroups.length > 0) {
            reportHtml += `<div>
                <div style="color: #ff9800; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; font-weight: 700; margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                    📂 Duplicate Folders
                </div>`;
            report.folderGroups.forEach((group) => {
                const groupItems = group.items || [];
                reportHtml += `
                    <div style="margin-bottom: 12px; padding: 12px; background: rgba(30, 30, 30, 0.6); border: 1px solid rgba(255,152,0,0.3); border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                        <div style="color: #eee; font-weight: 600; margin-bottom:8px; font-size:1rem;">${escapeHtml(group.normalizedName)}</div>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            ${groupItems.map(entry => `
                                <div style="font-size: 0.78rem; opacity: 0.8; padding-left:12px; border-left:2px solid rgba(255,152,0,0.4);">
                                    ${escapeHtml(entry.workspaceName)} <span style="opacity:0.5;">/</span> ${escapeHtml(entry.categoryName)} <span style="opacity:0.5;">/</span> ${escapeHtml(entry.parentLabel || 'Root')}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
            reportHtml += '</div>';
        }

        if (report.groups.length > 0) {
            reportHtml += `<div>
                <div style="color: var(--accent); font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; font-weight: 700; margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                    🔗 Duplicate Bookmarks
                </div>`;
            report.groups.forEach((group) => {
                const groupItems = group.links || group.items || [];
                reportHtml += `
                    <div style="margin-bottom: 12px; padding: 12px; background: rgba(30, 30, 30, 0.6); border: 1px solid rgba(0, 212, 255, 0.2); border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                        <div style="word-break: break-all; font-size: 0.85rem; color: var(--accent); font-family: monospace; opacity:0.9; margin-bottom:8px;">${escapeHtml(group.url || group.normalizedUrl)}</div>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            ${groupItems.map(entry => `
                                <div style="font-size: 0.82rem; color:#fff; display:flex; flex-direction:column; padding-left:12px; border-left:2px solid rgba(0, 212, 255, 0.3);">
                                    <span style="font-weight:500;">${escapeHtml(entry.title || 'Untitled')}</span>
                                    <span style="font-size:0.72rem; opacity:0.6;">${escapeHtml(entry.workspaceName || 'Main')} / ${escapeHtml(entry.categoryName || 'Unsorted')} / ${escapeHtml(entry.folderLabel || 'Root')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
            reportHtml += '</div>';
        }

        reportHtml += '</div>'; // End Scroll Container
        reportHtml += `
            <div style="margin-top: 20px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1); display: flex; flex-direction:column; gap: 10px;">
                <button class="btn-primary" style="width:100%; justify-content:center; height:45px; border-radius:8px;" onclick="
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
                ">⚡ Open Advanced Duplicate Manager</button>
                <button class="btn-secondary" style="width:100%; border:none; background:transparent; opacity:0.6; font-size:0.8rem; cursor:pointer;" onclick="document.getElementById('folderOperationsModal').style.display='none'">Dismiss Sub-Scan</button>
            </div>
        `;
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
