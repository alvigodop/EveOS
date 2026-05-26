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
        if (!scope || (!scope.workspaceId && !scope.categoryName && !toArray(scope?.workspaceIds).length)) return true;
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

    function getRecordFolderId(record) {
        return text(record?.path?.folderId || record?.parentFolderId || record?.provenance?.parentFolderId, '');
    }

    function getRecordLinkId(record) {
        return text(record?.path?.linkId || record?.provenance?.linkId, '');
    }

    function buildFolderHierarchy(records) {
        const childrenByFolderId = new Map();
        const parentByFolderId = new Map();

        toArray(records).forEach(function (record) {
            if (text(record?.type, '') !== 'folder') return;
            const folderId = text(record?.path?.folderId, '');
            if (!folderId) return;
            const parentFolderId = text(record?.parentFolderId || record?.provenance?.parentFolderId, '');
            parentByFolderId.set(folderId, parentFolderId);
            if (!childrenByFolderId.has(parentFolderId)) childrenByFolderId.set(parentFolderId, []);
            childrenByFolderId.get(parentFolderId).push(folderId);
        });

        return {
            childrenByFolderId: childrenByFolderId,
            parentByFolderId: parentByFolderId
        };
    }

    function collectFolderSubtree(folderId, hierarchy) {
        const targetId = text(folderId, '');
        const subtree = new Set();
        if (!targetId) return subtree;
        const queue = [targetId];
        while (queue.length) {
            const currentId = queue.shift();
            if (!currentId || subtree.has(currentId)) continue;
            subtree.add(currentId);
            toArray(hierarchy?.childrenByFolderId?.get(currentId)).forEach(function (childId) {
                if (!subtree.has(childId)) queue.push(childId);
            });
        }
        return subtree;
    }

    function collectFolderAncestors(folderId, hierarchy) {
        const ancestors = new Set();
        let currentId = text(folderId, '');
        while (currentId) {
            ancestors.add(currentId);
            currentId = text(hierarchy?.parentByFolderId?.get(currentId), '');
        }
        return ancestors;
    }

    function buildScopeRecordMatcher(snapshot, scope) {
        const records = toArray(snapshot?.records);
        if (!scope || (!scope.workspaceId && !scope.categoryName && !scope.folderId && !toArray(scope.linkIds).length && !toArray(scope.workspaceIds).length)) {
            return function (record) { return matchesScope(record, scope); };
        }

        const scopedCategoryRecords = records.filter(function (record) {
            return matchesScope(record, {
                workspaceId: scope.workspaceId,
                categoryName: scope.categoryName
            });
        });

        if (text(scope?.scope, '') === 'folder' && text(scope?.folderId, '')) {
            const hierarchy = buildFolderHierarchy(scopedCategoryRecords);
            const subtreeIds = collectFolderSubtree(scope.folderId, hierarchy);
            return function (record) {
                if (!matchesScope(record, { workspaceId: scope.workspaceId, categoryName: scope.categoryName })) return false;
                if (text(record?.type, '') === 'card') return true;
                const folderId = getRecordFolderId(record);
                return !!folderId && subtreeIds.has(folderId);
            };
        }

        if (text(scope?.scope, '') === 'derived' && toArray(scope?.linkIds).length) {
            const selectedLinkIds = new Set(toArray(scope.linkIds).map(function (value) { return text(value, ''); }).filter(Boolean));
            const hierarchy = buildFolderHierarchy(scopedCategoryRecords);
            const selectedFolderIds = new Set();
            scopedCategoryRecords.forEach(function (record) {
                if (text(record?.type, '') !== 'bookmark') return;
                if (!selectedLinkIds.has(getRecordLinkId(record))) return;
                const folderId = getRecordFolderId(record);
                if (folderId) {
                    collectFolderAncestors(folderId, hierarchy).forEach(function (ancestorId) {
                        selectedFolderIds.add(ancestorId);
                    });
                }
            });

            return function (record) {
                if (!matchesScope(record, { workspaceId: scope.workspaceId, categoryName: scope.categoryName })) return false;
                const recordType = text(record?.type, '');
                if (recordType === 'card') return true;
                if (recordType === 'folder') return selectedFolderIds.has(text(record?.path?.folderId, ''));
                if (recordType === 'bookmark') return selectedLinkIds.has(getRecordLinkId(record));
                return false;
            };
        }

        return function (record) {
            return matchesScope(record, scope);
        };
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

        if (record?.type === 'bookmark' || record?.type === 'card' || record?.type === 'folder' || record?.type === 'smartView' || record?.type === 'library') {
            if (isCollapsedCategory(cfg, text(record.workspaceId, 'main'), text(record.categoryName, 'Unsorted'), 'collapsed')) {
                stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
                reasons.push('Card is collapsed.');
            }
        }

        if (record?.type === 'bookmark' || record?.type === 'folder' || record?.type === 'smartView') {
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

    function incrementBucket(bucket, key) {
        const normalizedKey = text(key, 'unknown');
        bucket[normalizedKey] = (bucket[normalizedKey] || 0) + 1;
    }

    function getRecordIssueSeverity(record, visibility, health, freshness) {
        if (visibility?.state === 'broken' || health?.state === 'broken' || record?.provenance?.orphaned) return 'error';
        if (health?.state === 'warning' || freshness?.state === 'stale') return 'warning';
        if (visibility?.state === 'hidden' || visibility?.state === 'indirect') return 'info';
        return '';
    }

    function getRecordIssueReasons(record, visibility, health, freshness) {
        const visibilityReasons = visibility?.state && visibility.state !== 'visible'
            ? toArray(visibility?.reasons)
            : [];
        const healthReasons = health?.state && health.state !== 'healthy'
            ? toArray(health?.reasons)
            : [];
        const reasons = []
            .concat(visibilityReasons)
            .concat(healthReasons)
            .map(function (reason) { return text(reason, ''); })
            .filter(Boolean);
        if (record?.provenance?.orphaned) reasons.push('Record is orphaned from its expected parent path.');
        if (record?.provenance?.missingFolder) reasons.push('Bookmark points at a folder that no longer exists.');
        if (record?.provenance?.folderUnreachable) reasons.push('Folder branch is unreachable from the card root.');
        if (record?.provenance?.folderParentBroken) reasons.push('Folder parent chain is broken.');
        toArray(record?.provenance?.folderIssueReasons).forEach(function (reason) {
            const normalizedReason = text(reason, '');
            if (normalizedReason) reasons.push(normalizedReason);
        });
        if (record?.provenance?.missingParent) reasons.push('Record parent path is missing.');
        if (record?.provenance?.sourceOnly) reasons.push('Record exists in saved source/cache data, not as a live bookmark.');
        if (freshness?.state === 'stale') reasons.push('Record freshness is stale.');
        return Array.from(new Set(reasons));
    }

    function buildRecordIssue(record, visibility, health, freshness) {
        const severity = getRecordIssueSeverity(record, visibility, health, freshness);
        if (!severity) return null;

        const reasons = getRecordIssueReasons(record, visibility, health, freshness);
        const sourceIdentity = record?.sourceIdentity || {};
        return {
            id: text(record?.id, ''),
            type: text(record?.type, 'result'),
            title: text(record?.title, 'Untitled'),
            workspaceId: text(record?.workspaceId || record?.path?.workspaceId, ''),
            workspaceLabel: text(record?.path?.workspaceLabel, record?.workspaceId),
            categoryName: text(record?.categoryName || record?.path?.categoryName, ''),
            folderId: getRecordFolderId(record),
            linkId: getRecordLinkId(record),
            provider: text(record?.provider, ''),
            sourceKind: text(sourceIdentity?.kind || record?.provenance?.kind, ''),
            pathLabel: text(record?.path?.pathLabel, ''),
            severity: severity,
            visibilityState: text(visibility?.state, ''),
            visibilityLabel: text(visibility?.label, ''),
            healthState: text(health?.state, ''),
            healthLabel: text(health?.label, ''),
            freshnessState: text(freshness?.state, ''),
            freshnessLabel: text(freshness?.label, ''),
            reasons: reasons
        };
    }

    function diagnoseRecord(record) {
        const visibility = computeVisibility(record);
        const health = computeHealth(record);
        const freshness = computeFreshness(record?.updatedAt);
        const issue = buildRecordIssue(record, visibility, health, freshness);
        return {
            visibility: visibility,
            health: health,
            freshness: freshness,
            issue: issue,
            severity: issue?.severity || 'ok',
            reasons: issue?.reasons || []
        };
    }

    function buildIntegrityReportSync(snapshot, scope) {
        const report = {
            totalRecords: 0,
            hiddenRecords: 0,
            indirectRecords: 0,
            brokenRecords: 0,
            orphanedRecords: 0,
            missingParentRecords: 0,
            sourceOnlyRecords: 0,
            staleRecords: 0,
            agingRecords: 0,
            linkedLibraryRecords: 0,
            doneRecords: 0,
            byType: {},
            byWorkspace: {},
            byVisibility: {},
            byHealth: {},
            byFreshness: {},
            byReason: {},
            issues: [],
            issueCap: 250,
            truncatedIssueCount: 0
        };
        const inScope = buildScopeRecordMatcher(snapshot, scope);

        toArray(snapshot?.records).forEach(function (record) {
            if (!inScope(record)) return;
            report.totalRecords += 1;
            const typeKey = text(record?.type, 'result');
            const workspaceKey = text(record?.path?.workspaceLabel, record?.workspaceId || 'main');
            const visibility = computeVisibility(record);
            const health = computeHealth(record);
            const freshness = computeFreshness(record?.updatedAt);

            report.byType[typeKey] = (report.byType[typeKey] || 0) + 1;
            report.byWorkspace[workspaceKey] = (report.byWorkspace[workspaceKey] || 0) + 1;
            incrementBucket(report.byVisibility, visibility.label || visibility.state || 'Visible');
            incrementBucket(report.byHealth, health.label || health.state || 'Healthy');
            incrementBucket(report.byFreshness, freshness.label || freshness.state || 'Unknown');

            if (visibility.state === 'hidden') report.hiddenRecords += 1;
            if (visibility.state === 'indirect') report.indirectRecords += 1;
            if (visibility.state === 'broken' || health.state === 'broken') report.brokenRecords += 1;
            if (record?.provenance?.orphaned) report.orphanedRecords += 1;
            if (record?.provenance?.missingFolder || record?.provenance?.missingParent) report.missingParentRecords += 1;
            if (record?.provenance?.sourceOnly) report.sourceOnlyRecords += 1;
            if (freshness.state === 'stale') report.staleRecords += 1;
            if (freshness.state === 'aging') report.agingRecords += 1;
            if (record?.library?.linked) report.linkedLibraryRecords += 1;
            if (record?.provenance?.done) report.doneRecords += 1;

            const issue = buildRecordIssue(record, visibility, health, freshness);
            if (!issue) return;
            issue.reasons.forEach(function (reason) {
                incrementBucket(report.byReason, reason);
            });
            if (report.issues.length < report.issueCap) {
                report.issues.push(issue);
            } else {
                report.truncatedIssueCount += 1;
            }
        });

        report.issueCount = report.issues.length + report.truncatedIssueCount;

        return report;
    }

    ns.IndexRuntimeIntegrity = {
        matchesScope,
        buildScopeRecordMatcher,
        computeVisibility,
        computeHealth,
        diagnoseRecord,
        buildIntegrityReportSync
    };
})();
