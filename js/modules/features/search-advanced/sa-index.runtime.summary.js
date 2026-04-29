window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRuntimeSummary) return;

    const shared = ns.IndexShared;
    const runtimeIntegrity = ns.IndexRuntimeIntegrity;
    if (!shared || !runtimeIntegrity) return;

    const {
        toArray,
        text,
        computeFreshness
    } = shared;
    const {
        computeVisibility,
        computeHealth
    } = runtimeIntegrity;

    let cache = null;

    function createStructureBucket(seed) {
        return Object.assign({
            recordCount: 0,
            cardCount: 0,
            folderCount: 0,
            bookmarkCount: 0,
            doneBookmarkCount: 0,
            libraryCount: 0,
            knowledgeCount: 0,
            cachedCount: 0,
            hiddenCount: 0,
            brokenCount: 0,
            warningCount: 0,
            staleCount: 0,
            orphanedCount: 0,
            missingParentCount: 0,
            sourceOnlyCount: 0,
            localIssueCount: 0,
            doneCount: 0
        }, seed || {});
    }

    function accumulateStructureBucket(bucket, record, visibility, health, freshness) {
        bucket.recordCount += 1;
        if (record?.type === 'card') bucket.cardCount += 1;
        if (record?.type === 'folder') bucket.folderCount += 1;
        if (record?.type === 'bookmark') bucket.bookmarkCount += 1;
        if (record?.type === 'bookmark' && record?.provenance?.done) bucket.doneBookmarkCount += 1;
        if (record?.type === 'library') bucket.libraryCount += 1;
        if (record?.type === 'knowledge') bucket.knowledgeCount += 1;
        if (record?.type === 'cached') bucket.cachedCount += 1;

        if (visibility?.state === 'hidden' || visibility?.state === 'indirect-hidden') bucket.hiddenCount += 1;
        if (health?.state === 'broken' || visibility?.state === 'broken') bucket.brokenCount += 1;
        else if (health?.state === 'warning') bucket.warningCount += 1;
        if (freshness?.state === 'stale') bucket.staleCount += 1;
        if (record?.provenance?.orphaned) bucket.orphanedCount += 1;
        if (record?.provenance?.missingFolder || record?.provenance?.missingParent) bucket.missingParentCount += 1;
        if (record?.provenance?.sourceOnly) bucket.sourceOnlyCount += 1;
        if ((record?.type === 'card' || record?.type === 'folder' || record?.type === 'bookmark' || record?.type === 'library')
            && (health?.state === 'broken' || visibility?.state === 'broken' || record?.provenance?.orphaned)) {
            bucket.localIssueCount += 1;
        }
        if (record?.provenance?.done) bucket.doneCount += 1;
    }

    function buildStructureSummary(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.records)) {
            return {
                builtAt: 0,
                totals: createStructureBucket(),
                workspaces: {},
                groups: {},
                cards: {}
            };
        }

        const builtAt = Number(snapshot.builtAt || 0);
        if (cache && cache.snapshot === snapshot) return cache.summary;

        const summary = {
            builtAt: builtAt,
            totals: createStructureBucket(),
            workspaces: {},
            groups: {},
            cards: {}
        };

        toArray(snapshot.records).forEach(function (record) {
            const visibility = computeVisibility(record, null);
            const health = computeHealth(record, visibility);
            const freshness = computeFreshness(record?.updatedAt);
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            const groupId = text(record?.groupId, '');
            const groupName = text(record?.groupName, '');

            accumulateStructureBucket(summary.totals, record, visibility, health, freshness);

            if (workspaceId) {
                if (!summary.workspaces[workspaceId]) {
                    summary.workspaces[workspaceId] = createStructureBucket({
                        workspaceId: workspaceId,
                        label: text(record?.path?.workspaceLabel, workspaceId)
                    });
                }
                accumulateStructureBucket(summary.workspaces[workspaceId], record, visibility, health, freshness);
            }

            if (workspaceId && categoryName) {
                const cardKey = workspaceId + '::' + categoryName;
                if (!summary.cards[cardKey]) {
                    summary.cards[cardKey] = createStructureBucket({
                        key: cardKey,
                        workspaceId: workspaceId,
                        categoryName: categoryName,
                        label: categoryName
                    });
                }
                accumulateStructureBucket(summary.cards[cardKey], record, visibility, health, freshness);
            }

            if (groupId) {
                if (!summary.groups[groupId]) {
                    summary.groups[groupId] = createStructureBucket({
                        groupId: groupId,
                        label: text(groupName, groupId),
                        workspaceIds: []
                    });
                }
                const groupBucket = summary.groups[groupId];
                if (workspaceId && groupBucket.workspaceIds.indexOf(workspaceId) === -1) {
                    groupBucket.workspaceIds.push(workspaceId);
                }
                accumulateStructureBucket(groupBucket, record, visibility, health, freshness);
            }
        });

        Object.keys(summary.groups).forEach(function (groupId) {
            summary.groups[groupId].workspaceCount = summary.groups[groupId].workspaceIds.length;
        });

        cache = {
            snapshot: snapshot,
            builtAt: builtAt,
            summary: summary
        };
        return summary;
    }

    ns.IndexRuntimeSummary = {
        buildStructureSummary
    };
})();
