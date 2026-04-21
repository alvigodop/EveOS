window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const shared = ns.IndexShared;
    if (!shared) return;

    const {
        text,
        toArray,
        readConfig,
        getScopedKey,
        getWorkspaceIdsInScope,
        getCurrentFocusCategory,
        computeFreshness
    } = shared;

    function matchesScope(record, scope) {
        if (!record) return false;
        if (!scope || (!scope.workspaceId && !scope.categoryName)) return true;
        const workspaceIds = getWorkspaceIdsInScope(scope);
        const recordWorkspaceIds = toArray(record.workspaceIds).length
            ? toArray(record.workspaceIds).map(function (value) { return text(value, ''); })
            : [text(record.workspaceId, '')];

        if (workspaceIds && !recordWorkspaceIds.some(function (workspaceId) { return workspaceIds.has(workspaceId); })) {
            return false;
        }
        if (scope.categoryName && text(record.categoryName, 'Unsorted') !== text(scope.categoryName, 'Unsorted')) {
            return false;
        }
        return true;
    }

    function isCollapsedCategory(configRef, workspaceId, categoryName, key) {
        const items = toArray(configRef?.[key]);
        const scopedKey = getScopedKey(workspaceId, categoryName);
        return items.includes(scopedKey) || items.includes(categoryName);
    }

    function computeVisibility(record) {
        const cfg = readConfig();
        const reasons = [];
        let stateLabel = 'visible';
        const recordWorkspaceIds = toArray(record?.workspaceIds).length
            ? toArray(record.workspaceIds).map(function (value) { return text(value, ''); })
            : [text(record?.workspaceId, 'main')];
        const activeWorkspace = text(cfg.activeWorkspace, 'main');
        const focus = getCurrentFocusCategory();
        const inUnidex = text(cfg.viewMode, 'grid') === 'unidex';

        if (record?.baseHealth?.state === 'broken') {
            stateLabel = 'broken';
            reasons.push.apply(reasons, toArray(record.baseHealth.reasons));
        }

        if (!inUnidex && !recordWorkspaceIds.includes(activeWorkspace)) {
            stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
            reasons.push('Lives in another tab: ' + text(record?.path?.workspaceLabel, record?.workspaceId));
            if (!cfg.showInactiveTabs) reasons.push('Inactive tabs are hidden in the sidebar.');
        }

        if (record?.groupHidden && !cfg.showHiddenSidebarGroups) {
            stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
            reasons.push('Workspace belongs to hidden group "' + text(record.groupName, 'Unnamed Group') + '".');
        }

        if (!inUnidex && focus && record?.categoryName && text(record.categoryName, '') !== focus) {
            if (stateLabel === 'visible') stateLabel = 'indirect';
            reasons.push('Current card focus is "' + focus + '".');
        }

        if (record?.type === 'bookmark' || record?.type === 'card' || record?.type === 'folder' || record?.type === 'library') {
            if (isCollapsedCategory(cfg, text(record.workspaceId, 'main'), text(record.categoryName, 'Unsorted'), 'collapsed')) {
                stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
                reasons.push('Card is collapsed.');
            }
        }

        if (record?.type === 'bookmark' || record?.type === 'folder') {
            if (isCollapsedCategory(cfg, text(record.workspaceId, 'main'), text(record.categoryName, 'Unsorted'), 'linksCollapsed')) {
                stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
                reasons.push('Bookmark list is collapsed for this card.');
            }
        }

        if (!reasons.length) reasons.push('Visible in the current dashboard state.');

        return {
            state: stateLabel,
            label: stateLabel === 'broken'
                ? 'Broken'
                : stateLabel === 'hidden'
                    ? 'Hidden'
                    : stateLabel === 'indirect'
                        ? 'Indirect'
                        : 'Visible',
            reasons: reasons
        };
    }

    function computeHealth(record) {
        const freshness = computeFreshness(record?.updatedAt);
        const reasons = toArray(record?.baseHealth?.reasons).slice();
        let stateLabel = text(record?.baseHealth?.state, 'healthy') || 'healthy';

        if ((record?.type === 'cached' || record?.type === 'knowledge' || record?.type === 'library') && freshness.state === 'stale' && stateLabel !== 'broken') {
            stateLabel = 'warning';
            reasons.push('Source data is stale.');
        }
        if ((record?.type === 'cached' || record?.type === 'knowledge' || record?.type === 'library') && freshness.state === 'unknown' && stateLabel !== 'broken') {
            stateLabel = 'warning';
            reasons.push('No freshness timestamp is available.');
        }

        return {
            state: stateLabel,
            label: stateLabel === 'broken' ? 'Broken' : stateLabel === 'warning' ? 'Warning' : 'Healthy',
            reasons: reasons
        };
    }

    function buildIntegrityReportSync(snapshot, scope) {
        const report = {
            totalRecords: 0,
            hiddenRecords: 0,
            indirectRecords: 0,
            brokenRecords: 0,
            orphanedRecords: 0,
            staleRecords: 0,
            agingRecords: 0,
            linkedLibraryRecords: 0,
            doneRecords: 0,
            byType: {},
            byWorkspace: {}
        };

        toArray(snapshot?.records).forEach(function (record) {
            if (!matchesScope(record, scope)) return;
            report.totalRecords += 1;
            const typeKey = text(record?.type, 'result');
            const workspaceKey = text(record?.path?.workspaceLabel, record?.workspaceId || 'main');
            const visibility = computeVisibility(record);
            const health = computeHealth(record);
            const freshness = computeFreshness(record?.updatedAt);

            report.byType[typeKey] = (report.byType[typeKey] || 0) + 1;
            report.byWorkspace[workspaceKey] = (report.byWorkspace[workspaceKey] || 0) + 1;

            if (visibility.state === 'hidden') report.hiddenRecords += 1;
            if (visibility.state === 'indirect') report.indirectRecords += 1;
            if (visibility.state === 'broken' || health.state === 'broken') report.brokenRecords += 1;
            if (record?.provenance?.orphaned) report.orphanedRecords += 1;
            if (freshness.state === 'stale') report.staleRecords += 1;
            if (freshness.state === 'aging') report.agingRecords += 1;
            if (record?.library?.linked) report.linkedLibraryRecords += 1;
            if (record?.provenance?.done) report.doneRecords += 1;
        });

        return report;
    }

    ns.IndexRuntimeIntegrity = {
        matchesScope,
        computeVisibility,
        computeHealth,
        buildIntegrityReportSync
    };
})();
