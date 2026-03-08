window.EveSettingsDuplicateSensor = window.EveSettingsDuplicateSensor || {};

(function () {
    const ns = window.EveSettingsDuplicateSensor;
    if (ns.ready) return;

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function saveAppConfig() {
        if (typeof saveConfig === 'function') {
            saveConfig();
        }
    }

    function getScopeSelect() {
        return document.getElementById('duplicateSensorScope');
    }

    function getWorkspaceSelect() {
        return document.getElementById('duplicateSensorWorkspaceSelect');
    }

    function getCategorySelect() {
        return document.getElementById('duplicateSensorCategorySelect');
    }

    function getFolderSelect() {
        return document.getElementById('duplicateSensorFolderSelect');
    }

    function getSummaryNode() {
        return document.getElementById('duplicateSensorSummary');
    }

    function getResultsNode() {
        return document.getElementById('duplicateSensorResults');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getWorkspaces() {
        const workspaces = Array.isArray(getConfig().workspaces) ? getConfig().workspaces : [];
        return workspaces.length > 0 ? workspaces : [{ id: 'main', name: 'Main', icon: 'folder' }];
    }

    function getCategoriesForWorkspace(workspaceId) {
        const allLinks = window.EveDataTransfer?.getAppLinks ? window.EveDataTransfer.getAppLinks() : [];
        const categoriesFromLinks = allLinks
            .filter((entry) => String(entry?.workspace || 'main') === String(workspaceId || 'main'))
            .map((entry) => String(entry?.category || 'Unsorted'));
        const categoriesFromFolders = typeof window.EveDataTransfer?.getBookmarkFolderScopedKeys === 'function'
            ? window.EveDataTransfer.getBookmarkFolderScopedKeys()
                .map((key) => String(key || '').split('::'))
                .filter((parts) => String(parts[0] || 'main') === String(workspaceId || 'main'))
                .map((parts) => String(parts.slice(1).join('::') || 'Unsorted'))
            : [];
        return [...new Set([].concat(categoriesFromLinks, categoriesFromFolders))]
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));
    }

    function populateWorkspaceSelect(selectedWorkspaceId) {
        const select = getWorkspaceSelect();
        if (!select) return 'main';
        const workspaces = getWorkspaces();
        const fallback = String(getConfig().activeWorkspace || workspaces[0]?.id || 'main');
        const nextValue = workspaces.some((workspace) => String(workspace.id) === String(selectedWorkspaceId || ''))
            ? String(selectedWorkspaceId)
            : fallback;

        select.innerHTML = '';
        workspaces.forEach((workspace) => {
            const option = document.createElement('option');
            option.value = String(workspace.id);
            option.textContent = String(workspace.name || workspace.id || 'Main');
            select.appendChild(option);
        });
        select.value = nextValue;
        return select.value || fallback;
    }

    function populateCategorySelect(workspaceId, selectedCategoryName) {
        const select = getCategorySelect();
        if (!select) return '';
        const categories = getCategoriesForWorkspace(workspaceId);
        const fallback = categories[0] || 'Unsorted';
        const nextValue = categories.includes(String(selectedCategoryName || ''))
            ? String(selectedCategoryName)
            : fallback;

        select.innerHTML = '';
        categories.forEach((category) => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
        if (categories.length > 0) {
            select.value = nextValue;
        }
        return select.value || nextValue || '';
    }

    function populateFolderSelect(workspaceId, categoryName, selectedFolderId) {
        const select = getFolderSelect();
        if (!select) return '';
        const nodes = typeof window.EveDataTransfer?.getBookmarkFolderNodesForScope === 'function'
            ? window.EveDataTransfer.getBookmarkFolderNodesForScope(workspaceId, categoryName)
            : [];
        const nodeById = new Map(nodes.map((node) => [String(node?.id || '').trim(), node]));
        const labelForNode = (node) => {
            if (typeof window.EveDataTransfer?.buildFolderOptionLabel === 'function') {
                return window.EveDataTransfer.buildFolderOptionLabel(node, nodeById);
            }
            return String(node?.name || node?.title || node?.id || 'Folder').trim() || 'Folder';
        };

        select.innerHTML = '';
        const rootOption = document.createElement('option');
        rootOption.value = '';
        rootOption.textContent = 'Root (No Folder)';
        select.appendChild(rootOption);

        nodes
            .slice()
            .sort((left, right) => labelForNode(left).localeCompare(labelForNode(right)))
            .forEach((node) => {
                const nodeId = String(node?.id || '').trim();
                if (!nodeId) return;
                const option = document.createElement('option');
                option.value = nodeId;
                option.textContent = labelForNode(node);
                select.appendChild(option);
            });

        const normalizedSelectedFolderId = String(selectedFolderId || '').trim();
        const hasSelectedFolder = nodes.some((node) => String(node?.id || '').trim() === normalizedSelectedFolderId);
        select.value = hasSelectedFolder ? normalizedSelectedFolderId : '';
        return select.value || '';
    }

    function updateSelectionVisibility(scope) {
        const workspaceSelect = getWorkspaceSelect();
        const categorySelect = getCategorySelect();
        const folderSelect = getFolderSelect();
        if (!workspaceSelect || !categorySelect || !folderSelect) return;

        const normalizedScope = window.EveDuplicateSensor?.normalizeScope
            ? window.EveDuplicateSensor.normalizeScope(scope)
            : String(scope || 'card').toLowerCase();

        workspaceSelect.style.display = normalizedScope === 'all_tabs' ? 'none' : 'block';
        categorySelect.style.display = normalizedScope === 'card' || normalizedScope === 'folder' ? 'block' : 'none';
        folderSelect.style.display = normalizedScope === 'folder' ? 'block' : 'none';
    }

    function saveDuplicateSensorSelectionState() {
        const appConfig = getConfig();
        const scope = window.EveDuplicateSensor?.normalizeScope
            ? window.EveDuplicateSensor.normalizeScope(getScopeSelect()?.value || appConfig.duplicateSensorScope || 'card')
            : String(getScopeSelect()?.value || appConfig.duplicateSensorScope || 'card').toLowerCase();
        appConfig.duplicateSensorScope = scope;
        appConfig.duplicateSensorWorkspaceId = String(getWorkspaceSelect()?.value || appConfig.activeWorkspace || 'main');
        appConfig.duplicateSensorCategoryName = String(getCategorySelect()?.value || '');
        appConfig.duplicateSensorFolderId = String(getFolderSelect()?.value || '');
        saveAppConfig();
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

    function resetDuplicateSensorResults(message) {
        const summary = getSummaryNode();
        const results = getResultsNode();
        if (summary) {
            summary.textContent = String(message || 'Choose a scope and run a scan.');
        }
        if (results) {
            results.innerHTML = '';
        }
    }

    function renderDuplicateSensorReport(report) {
        const summary = getSummaryNode();
        const results = getResultsNode();
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

        if (!report.duplicateGroups) {
            summary.textContent = `No duplicates found for ${scopeLabel(report.scope)}${contextLabel}. Scanned ${report.scannedUrls} bookmark URLs.`;
            results.innerHTML = '';
            return;
        }

        summary.textContent = `Found ${report.duplicateGroups} duplicate group${report.duplicateGroups === 1 ? '' : 's'} for ${scopeLabel(report.scope)}${contextLabel}. ${report.duplicateBookmarks} extra bookmark${report.duplicateBookmarks === 1 ? '' : 's'} across ${report.scannedUrls} scanned URLs.`;

        results.innerHTML = report.groups.map((group) => `
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
            </details>
        `).join('');
    }

    function refreshDuplicateSensorControls() {
        const scopeSelect = getScopeSelect();
        if (!scopeSelect) return;

        const appConfig = getConfig();
        const workspaceSelect = getWorkspaceSelect();
        const categorySelect = getCategorySelect();
        const folderSelect = getFolderSelect();
        const normalizedScope = window.EveDuplicateSensor?.normalizeScope
            ? window.EveDuplicateSensor.normalizeScope(scopeSelect.value || appConfig.duplicateSensorScope || 'card')
            : String(scopeSelect.value || appConfig.duplicateSensorScope || 'card').toLowerCase();

        scopeSelect.value = normalizedScope;
        const workspaceId = populateWorkspaceSelect(
            workspaceSelect?.value || appConfig.duplicateSensorWorkspaceId || appConfig.activeWorkspace || 'main'
        );
        const categoryName = populateCategorySelect(
            workspaceId,
            categorySelect?.value || appConfig.duplicateSensorCategoryName || ''
        );
        populateFolderSelect(
            workspaceId,
            categoryName,
            folderSelect?.value || appConfig.duplicateSensorFolderId || ''
        );
        updateSelectionVisibility(normalizedScope);
        saveDuplicateSensorSelectionState();
        if (workspaceSelect) {
            workspaceSelect.onchange = function () {
                saveDuplicateSensorSelectionState();
                refreshDuplicateSensorControls();
                resetDuplicateSensorResults('Scope changed. Run a new duplicate scan.');
            };
        }
        if (categorySelect) {
            categorySelect.onchange = function () {
                saveDuplicateSensorSelectionState();
                refreshDuplicateSensorControls();
                resetDuplicateSensorResults('Scope changed. Run a new duplicate scan.');
            };
        }
        if (folderSelect) {
            folderSelect.onchange = function () {
                saveDuplicateSensorSelectionState();
                resetDuplicateSensorResults('Scope changed. Run a new duplicate scan.');
            };
        }

        const summary = getSummaryNode();
        const results = getResultsNode();
        if (summary && !summary.textContent.trim() && results && !results.innerHTML.trim()) {
            resetDuplicateSensorResults();
        }
    }

    function saveSettingsDuplicateSensorScope() {
        saveDuplicateSensorSelectionState();
        refreshDuplicateSensorControls();
        resetDuplicateSensorResults('Scope changed. Run a new duplicate scan.');
    }

    function runDuplicateSensor() {
        if (!window.EveDuplicateSensor?.scan) {
            resetDuplicateSensorResults('Duplicate sensor is unavailable right now.');
            return null;
        }

        refreshDuplicateSensorControls();
        const report = window.EveDuplicateSensor.scan({
            scope: getScopeSelect()?.value || 'card',
            workspaceId: getWorkspaceSelect()?.value || '',
            categoryName: getCategorySelect()?.value || '',
            folderId: getFolderSelect()?.value || ''
        });
        renderDuplicateSensorReport(report);
        return report;
    }

    window.refreshDuplicateSensorControls = refreshDuplicateSensorControls;
    window.saveSettingsDuplicateSensorScope = saveSettingsDuplicateSensorScope;
    window.runDuplicateSensor = runDuplicateSensor;
    window.clearDuplicateSensorResults = resetDuplicateSensorResults;

    Object.assign(ns, {
        refreshDuplicateSensorControls,
        saveSettingsDuplicateSensorScope,
        runDuplicateSensor,
        clearDuplicateSensorResults: resetDuplicateSensorResults
    });

    ns.ready = true;
})();
