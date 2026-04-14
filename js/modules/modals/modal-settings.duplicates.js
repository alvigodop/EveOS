window.EveSettingsDuplicateSensor = window.EveSettingsDuplicateSensor || {};

(function () {
    const ns = window.EveSettingsDuplicateSensor;
    if (ns.ready) return;

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getPanelNodes(panelKey) {
        const suffixMap = {
            full: 'Full',
            workspace: 'Workspace',
            card: 'Card',
            folder: 'Folder'
        };
        const suffix = suffixMap[String(panelKey || '').toLowerCase()];
        if (!suffix) {
            return { summary: null, results: null };
        }
        return {
            summary: document.getElementById(`duplicateSensorSummary${suffix}`),
            results: document.getElementById(`duplicateSensorResults${suffix}`)
        };
    }

    function getDefaultMessage(panelKey) {
        switch (String(panelKey || '').toLowerCase()) {
            case 'full':
                return 'Run a duplicate scan across all tabs.';
            case 'workspace':
                return 'Run a duplicate scan inside the selected tab.';
            case 'card':
                return 'Run a duplicate scan inside the selected card.';
            case 'folder':
                return 'Run a duplicate scan inside the selected folder subtree.';
            default:
                return 'Run a duplicate scan.';
        }
    }

    function resetDuplicateSensorResults(panelKey, message) {
        const { summary, results } = getPanelNodes(panelKey);
        if (summary) summary.textContent = String(message || getDefaultMessage(panelKey));
        if (results) results.innerHTML = '';
    }

    function clearDuplicateSensorResults(panelKey) {
        if (!panelKey) {
            ['full', 'workspace', 'card', 'folder'].forEach((key) => resetDuplicateSensorResults(key));
            return;
        }
        resetDuplicateSensorResults(panelKey);
    }

    function scopeLabel(scope) {
        switch (String(scope || '').toLowerCase()) {
            case 'folder':
                return 'Same Folder';
            case 'workspace':
                return 'Same Tab';
            case 'all_tabs':
                return 'Across Tabs';
            case 'card':
            default:
                return 'Same Card';
        }
    }

    function renderDuplicateSensorReport(panelKey, report) {
        const { summary, results } = getPanelNodes(panelKey);
        if (!summary || !results) return;

        const contextParts = [];
        if (report.scope === 'workspace' && report.workspaceId) {
            contextParts.push(`tab ${report.workspaceId}`);
        } else if (report.scope === 'card') {
            if (report.workspaceId) contextParts.push(`tab ${report.workspaceId}`);
            if (report.categoryName) contextParts.push(`card ${report.categoryName}`);
        } else if (report.scope === 'folder') {
            if (report.workspaceId) contextParts.push(`tab ${report.workspaceId}`);
            if (report.categoryName) contextParts.push(`card ${report.categoryName}`);
            contextParts.push(report.folderId ? 'selected folder' : 'root bookmarks');
        }
        const contextLabel = contextParts.length > 0 ? ` in ${contextParts.join(' / ')}` : '';

        if (!report.duplicateGroups && !report.duplicateFolderGroups) {
            summary.textContent = `No duplicates found for ${scopeLabel(report.scope)}${contextLabel}. Scanned ${report.scannedUrls} URLs and ${report.totalFolders} Folders.`;
            results.innerHTML = '';
            return;
        }

        let summaryText = `Found ${report.duplicateGroups} duplicate bookmark group(s) (${report.duplicateBookmarks} extra bookmarks).`;
        if (report.duplicateFolderGroups) {
            summaryText += ` Found ${report.duplicateFolderGroups} duplicate folder group(s) (${report.duplicateFolderCount} extra folders).`;
        }
        summaryText += ` Scanned ${report.scannedUrls} URLs and ${report.totalFolders} Folders for ${scopeLabel(report.scope)}${contextLabel}.`;
        summary.textContent = summaryText;

        let html = '';

        if (report.folderGroups && report.folderGroups.length > 0) {
            html += `<h4 style="margin: 15px 0 10px 0; color: #ff9800;">Duplicate Folders</h4>`;
            html += report.folderGroups.map((group) => `
                <details class="duplicate-sensor-group" open style="border:1px solid #ff9800; border-radius:8px; padding:8px 10px; background:rgba(255,152,0,0.05); margin-bottom: 10px;">
                    <summary style="cursor:pointer; font-weight:600;">
                        ${group.count} matches - Folder Name: <code>${escapeHtml(group.normalizedName)}</code>
                    </summary>
                    <div style="font-size:0.78rem; opacity:0.72; margin-top:6px;">${group.duplicateCount} extra folders will be consolidated.</div>
                    <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                        ${group.items.map((item) => `
                            <div style="border-top:1px solid rgba(255,152,0,0.15); padding-top:6px;">
                                <div><strong>${escapeHtml(item.name)}</strong></div>
                                <div style="font-size:0.78rem; opacity:0.75;">${escapeHtml(item.workspaceName)} / ${escapeHtml(item.categoryName)} / ${escapeHtml(item.parentLabel || 'Root')}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top:10px; display:flex; justify-content:flex-end;">
                        <button class="btn-primary" style="background:#ff9800; color:#000; padding:4px 12px; font-size:0.8rem;" onclick="mergeDuplicateSensorFolderGroup('${escapeHtml(JSON.stringify(group.items.map(i => i.folderId)))}', '${panelKey}')">Consolidate Folders</button>
                    </div>
                </details>
            `).join('');
        }

        if (report.groups && report.groups.length > 0) {
            if (html !== '') html += `<h4 style="margin: 15px 0 10px 0; color: #00d4ff;">Duplicate Bookmarks</h4>`;
            html += report.groups.map((group) => `
            <details class="duplicate-sensor-group" open style="border:1px solid #444; border-radius:8px; padding:8px 10px; background:rgba(255,255,255,0.03);">
                <summary style="cursor:pointer; font-weight:600;">
                    ${group.count} matches - <code>${escapeHtml(group.normalizedUrl)}</code>
                </summary>
                <div style="font-size:0.78rem; opacity:0.72; margin-top:6px;">${group.duplicateCount} extra bookmark${group.duplicateCount === 1 ? '' : 's'} in this group.</div>
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                    ${group.items.map((item) => `
                        <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
                            <div><strong>${escapeHtml(item.title)}</strong></div>
                            <div style="font-size:0.78rem; opacity:0.75;">${escapeHtml(item.workspaceName)} / ${escapeHtml(item.categoryName)} / ${escapeHtml(item.folderLabel || 'Root')}</div>
                            <div style="font-size:0.78rem; opacity:0.75; word-break:break-all;">${escapeHtml(item.url)}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:10px; display:flex; justify-content:flex-end;">
                    <button class="btn-primary btn-backup" style="padding:4px 12px; font-size:0.8rem;" onclick="mergeDuplicateSensorGroup('${escapeHtml(JSON.stringify(group.items.map(i => i.linkId)))}', '${panelKey}')">Merge Duplicates</button>
                </div>
            </details>
        `).join('');
        }

        results.innerHTML = html;
    }

    window.mergeDuplicateSensorGroup = function (linkIdsStr, panelKey) {
        try {
            const linkIds = JSON.parse(linkIdsStr.replace(/&quot;/g, '"'));
            if (!window.EveDuplicateSensor?.mergeDuplicateGroup) return;
            const result = window.EveDuplicateSensor.mergeDuplicateGroup(linkIds);
            if (result) {
                if (typeof window.showToast === 'function') window.showToast(`Merged ${result.removedIds.length + 1} bookmarks into 1`, 'success');

                // Re-run the active scan automatically
                const btnMap = {
                    full: runDuplicateSensorForFullBackup,
                    workspace: runDuplicateSensorForWorkspace,
                    card: runDuplicateSensorForCard,
                    folder: runDuplicateSensorForFolder
                };
                if (btnMap[panelKey]) btnMap[panelKey]();

                // Trigger any active UI updates
                if (typeof window.renderSidebar === 'function') window.renderSidebar();
                if (typeof window.renderDashboard === 'function') window.renderDashboard();
            } else {
                if (typeof window.showToast === 'function') window.showToast('Merge failed. Ensure bookmarks still exist.', 'error');
            }
        } catch (error) {
            console.error('Merge failure:', error);
            if (typeof window.showToast === 'function') window.showToast('Failed to merge duplicate group.', 'error');
        }
    };

    window.mergeDuplicateSensorFolderGroup = function (folderIdsStr, panelKey) {
        try {
            const folderIds = JSON.parse(folderIdsStr.replace(/&quot;/g, '"'));
            if (!window.EveDuplicateSensor?.mergeDuplicateFolderGroup) return;
            const result = window.EveDuplicateSensor.mergeDuplicateFolderGroup(folderIds);
            if (result) {
                if (typeof window.showToast === 'function') window.showToast(`Consolidated ${result.removedIds.length + 1} folders into 1`, 'success');

                const btnMap = {
                    full: runDuplicateSensorForFullBackup,
                    workspace: runDuplicateSensorForWorkspace,
                    card: runDuplicateSensorForCard,
                    folder: runDuplicateSensorForFolder
                };
                if (btnMap[panelKey]) btnMap[panelKey]();
            } else {
                if (typeof window.showToast === 'function') window.showToast('Consolidation failed.', 'error');
            }
        } catch (error) {
            console.error('Folder Merge failure:', error);
            if (typeof window.showToast === 'function') window.showToast('Failed to consolidate duplicate folder group.', 'error');
        }
    };

    function scanAndRender(panelKey, options, unavailableMessage) {
        if (!window.EveDuplicateSensor?.scan) {
            resetDuplicateSensorResults(panelKey, unavailableMessage || 'Duplicate sensor is unavailable right now.');
            return null;
        }
        const report = window.EveDuplicateSensor.scan(options);
        renderDuplicateSensorReport(panelKey, report);
        return report;
    }

    function runDuplicateSensorForFullBackup() {
        return scanAndRender('full', { scope: 'all_tabs' });
    }

    function runDuplicateSensorForWorkspace() {
        const workspaceId = String(document.getElementById('tabBackupSelect')?.value || getConfig().activeWorkspace || 'main').trim();
        if (!workspaceId) {
            resetDuplicateSensorResults('workspace', 'Select a tab first.');
            return null;
        }
        return scanAndRender('workspace', {
            scope: 'workspace',
            workspaceId
        });
    }

    function runDuplicateSensorForCard() {
        const appConfig = getConfig();
        const workspaceId = String(document.getElementById('cardBackupWorkspaceSelect')?.value || appConfig.activeWorkspace || 'main').trim();
        const categoryName = String(document.getElementById('cardBackupCategorySelect')?.value || '').trim();
        if (!workspaceId || !categoryName) {
            resetDuplicateSensorResults('card', 'Select a tab and card first.');
            return null;
        }
        return scanAndRender('card', {
            scope: 'card',
            workspaceId,
            categoryName
        });
    }

    function runDuplicateSensorForFolder() {
        const appConfig = getConfig();
        const workspaceId = String(document.getElementById('folderBackupWorkspaceSelect')?.value || appConfig.activeWorkspace || 'main').trim();
        const categoryName = String(document.getElementById('folderBackupCategorySelect')?.value || '').trim();
        const folderId = String(document.getElementById('folderBackupFolderSelect')?.value || '').trim();
        if (!workspaceId || !categoryName) {
            resetDuplicateSensorResults('folder', 'Select a tab and card first.');
            return null;
        }
        if (!folderId) {
            resetDuplicateSensorResults('folder', 'Select a folder first.');
            return null;
        }
        return scanAndRender('folder', {
            scope: 'folder',
            workspaceId,
            categoryName,
            folderId
        });
    }

    function bindResetOnChange(elementId, panelKey, message) {
        const element = document.getElementById(elementId);
        if (!element || element.dataset.duplicateSensorBound === '1') return;
        element.dataset.duplicateSensorBound = '1';
        element.addEventListener('change', () => {
            resetDuplicateSensorResults(panelKey, message || `Selection changed. ${getDefaultMessage(panelKey)}`);
        });
    }

    function refreshIntegratedDuplicateSensorControls() {
        bindResetOnChange('tabBackupSelect', 'workspace', 'Selection changed. Run a new tab duplicate scan.');
        bindResetOnChange('cardBackupWorkspaceSelect', 'card', 'Selection changed. Run a new card duplicate scan.');
        bindResetOnChange('cardBackupCategorySelect', 'card', 'Selection changed. Run a new card duplicate scan.');
        bindResetOnChange('folderBackupWorkspaceSelect', 'folder', 'Selection changed. Run a new folder duplicate scan.');
        bindResetOnChange('folderBackupCategorySelect', 'folder', 'Selection changed. Run a new folder duplicate scan.');
        bindResetOnChange('folderBackupFolderSelect', 'folder', 'Selection changed. Run a new folder duplicate scan.');

        ['full', 'workspace', 'card', 'folder'].forEach((panelKey) => {
            const { summary, results } = getPanelNodes(panelKey);
            if (summary && !summary.textContent.trim() && results && !results.innerHTML.trim()) {
                resetDuplicateSensorResults(panelKey);
            }
        });
    }

    window.refreshIntegratedDuplicateSensorControls = refreshIntegratedDuplicateSensorControls;
    window.runDuplicateSensorForFullBackup = runDuplicateSensorForFullBackup;
    window.runDuplicateSensorForWorkspace = runDuplicateSensorForWorkspace;
    window.runDuplicateSensorForCard = runDuplicateSensorForCard;
    window.runDuplicateSensorForFolder = runDuplicateSensorForFolder;
    window.clearDuplicateSensorResults = clearDuplicateSensorResults;

    Object.assign(ns, {
        refreshIntegratedDuplicateSensorControls,
        runDuplicateSensorForFullBackup,
        runDuplicateSensorForWorkspace,
        runDuplicateSensorForCard,
        runDuplicateSensorForFolder,
        clearDuplicateSensorResults
    });

    ns.ready = true;
})();
