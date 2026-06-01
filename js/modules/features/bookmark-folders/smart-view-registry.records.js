window.EveSmartViewRegistry = window.EveSmartViewRegistry || {};

(function (api) {
    const h = api._shared || {};
    const {
        text,
        normalizeList,
        normalizeKey,
        normalizeReusableCriteria
    } = h;
    const evaluateView = (...args) => api.evaluateView(...args);
    const evaluateViewFromIndex = (...args) => api.evaluateViewFromIndex(...args);
    const saveCardView = (...args) => api.saveCardView(...args);
    const describeCriteria = (...args) => api.describeCriteria(...args);
    const parseCriteriaPrompt = (...args) => api.parseCriteriaPrompt(...args);
    const openSmartViewRecord = (...args) => api.openSmartViewRecord(...args);

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function buildLiveLinkMap(links) {
        const map = new Map();
        (Array.isArray(links) ? links : []).forEach((link) => {
            const id = text(link?.id, '');
            if (id && !map.has(id)) map.set(id, link);
        });
        return map;
    }

    function getDatapackIndex() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function buildIndexedLinkFallback(record, linkId) {
        const relatedUrls = normalizeList(record?.provenance?.relatedUrls)
            .map((url) => ({ url, label: '' }));
        return {
            id: text(linkId || record?.path?.linkId || record?.provenance?.linkId || record?.sourceIdentity?.linkId, ''),
            title: text(record?.title, 'Untitled'),
            url: text(record?.url, ''),
            workspace: text(record?.workspaceId || record?.path?.workspaceId, 'main'),
            category: text(record?.categoryName || record?.path?.categoryName, 'Unsorted'),
            folderId: text(record?.path?.folderId, ''),
            notes: text(record?.description, ''),
            tags: normalizeList(record?.provenance?.tags),
            identifiers: normalizeList(record?.provenance?.identifiers),
            icon: text(record?.provenance?.icon, ''),
            coverImage: text(record?.provenance?.coverImage, ''),
            relatedUrls,
            done: !!record?.provenance?.done
        };
    }

    function buildIndexedEntryFallback(record) {
        const library = record?.library || {};
        return {
            id: text(library.entryId, ''),
            title: text(library.title || record?.title, ''),
            summary: text(library.summary || record?.description, ''),
            notes: text(library.summary, ''),
            author: text(library.author, ''),
            genre: text(library.genre, ''),
            status: text(library.status, ''),
            mediaType: text(library.mediaType, ''),
            altTitles: normalizeList(library.aliases),
            titleAltNames: normalizeList(library.aliases)
        };
    }

    function getIndexedBookmarkRecords(scope) {
        const indexApi = getDatapackIndex();
        if (!indexApi || typeof indexApi.getExactBookmarkLinkIds !== 'function' || typeof indexApi.getIndexedBookmarkRecordByLinkId !== 'function') {
            return null;
        }
        if (typeof indexApi.hasReadableLinkSnapshot === 'function' && !indexApi.hasReadableLinkSnapshot()) {
            return null;
        }
        const linkIds = indexApi.getExactBookmarkLinkIds({
            workspaceId: text(scope?.workspaceId, ''),
            categoryName: text(scope?.categoryName, ''),
            folderId: text(scope?.folderId, '')
        });
        if (!Array.isArray(linkIds)) return null;
        const records = [];
        linkIds.forEach((linkId) => {
            const record = indexApi.getIndexedBookmarkRecordByLinkId(linkId);
            if (record) records.push({ linkId: text(linkId, ''), record });
        });
        return records;
    }

    function getScopedNodes(workspaceId, categoryName) {
        const folderApi = window.EveBookmarkFolders;
        const storeApi = folderApi?._shared || folderApi;
        return typeof storeApi?.getScopedNodes === 'function'
            ? (storeApi.getScopedNodes(workspaceId, categoryName) || [])
            : [];
    }

    function getCachedEntryResolver(workspaceId, categoryName) {
        const shared = window.EveBookmarkFolders?._shared || {};
        return function (link) {
            return typeof shared.getLibraryEntryForLink === 'function'
                ? shared.getLibraryEntryForLink(workspaceId, categoryName, link?.id)
                : null;
        };
    }

    function getRecordScope(record) {
        const workspaceId = text(record?.workspaceId || record?.path?.workspaceId, 'main');
        const categoryName = text(record?.categoryName || record?.path?.categoryName, 'Unsorted');
        const folderId = text(
            record?.provenance?.smartViewFolderId
            || record?.path?.folderId
            || record?.provenance?.smartViewId,
            ''
        );
        return { workspaceId, categoryName, folderId };
    }

    function getRecordCriteria(record) {
        const criteria = record?.provenance?.criteria;
        if (criteria && typeof criteria === 'object' && !Array.isArray(criteria)) {
            return Object.assign({}, criteria);
        }
        if (typeof criteria === 'string' && criteria.trim()) {
            if (record?.provenance?.builtIn) return null;
            const parsed = parseCriteriaPrompt(criteria);
            return Object.keys(parsed).length ? parsed : null;
        }
        return null;
    }

    function getSmartViewRecordLinkIds(record) {
        const scope = getRecordScope(record);
        if (!scope.workspaceId || !scope.categoryName) return [];
        if (scope.folderId && window.EveBulkToolbar?.getScopeLinkIdsForFolder) {
            const ids = window.EveBulkToolbar.getScopeLinkIdsForFolder(scope.categoryName, scope.workspaceId, scope.folderId)
                .map((id) => text(id, ''))
                .filter(Boolean);
            if (ids.length) return ids;
        }
        if (scope.folderId && window.EveFolderViewV2?.getFolderScopedLinkIds) {
            const ids = window.EveFolderViewV2.getFolderScopedLinkIds(scope.workspaceId, scope.categoryName, scope.folderId)
                .map((id) => text(id, ''))
                .filter(Boolean);
            if (ids.length) return ids;
        }

        const criteria = getRecordCriteria(record);
        if (!criteria) return [];
        const activeLinks = getLiveLinks().filter((link) => (
            text(link?.workspace, 'main') === scope.workspaceId
            && text(link?.category, 'Unsorted') === scope.categoryName
        ));
        const evaluationContext = {
            workspaceId: scope.workspaceId,
            categoryName: scope.categoryName,
            folderId: scope.folderId,
            activeLinks,
            scopedNodes: getScopedNodes(scope.workspaceId, scope.categoryName),
            getCachedEntry: getCachedEntryResolver(scope.workspaceId, scope.categoryName)
        };
        const matches = evaluateViewFromIndex({ criteria }, evaluationContext)
            || evaluateView({ criteria }, evaluationContext);
        return matches.map((link) => text(link?.id, '')).filter(Boolean);
    }

    function revealSmartViewRecord(record, options) {
        const scope = getRecordScope(record);
        if (!scope.workspaceId || !scope.categoryName) {
            return { ok: false, error: 'Smart View scope is missing.' };
        }
        const linkIds = getSmartViewRecordLinkIds(record);
        if (!linkIds.length) {
            openSmartViewRecord(record);
            return { ok: false, opened: true, error: 'No matching bookmarks were found for this Smart View.' };
        }

        openSmartViewRecord(record);
        window.setTimeout(() => {
            const bulkApi = window.EveBulkToolbar;
            if (bulkApi?.clearSelection && bulkApi?.addSelectedIds) {
                bulkApi.clearSelection();
                bulkApi.addSelectedIds(linkIds);
                if (bulkApi.setBulkMode) bulkApi.setBulkMode(true);
            } else {
                window.selectedIds = window.selectedIds instanceof Set ? window.selectedIds : new Set();
                window.selectedIds.clear();
                linkIds.forEach((id) => window.selectedIds.add(String(id)));
                window.bulkMode = true;
            }
            document.body?.classList?.add('bulk-active');
            if (bulkApi?.updateBulkUI) bulkApi.updateBulkUI();
            if (typeof showToast === 'function' && options?.toast !== false) {
                showToast('Selected ' + linkIds.length + ' matching bookmark' + (linkIds.length === 1 ? '' : 's') + '.', 'success');
            }
        }, 140);
        return { ok: true, count: linkIds.length, linkIds };
    }

    function buildSavedViewIdFromRecord(record) {
        const scope = getRecordScope(record);
        const raw = [
            'nexus',
            scope.workspaceId,
            scope.categoryName,
            record?.provenance?.category,
            record?.provenance?.smartViewGroup,
            record?.provenance?.smartViewId || record?.title
        ].map((part) => normalizeKey(part)).filter(Boolean).join('_');
        return 'sv_' + raw.slice(0, 96);
    }

    function saveSmartViewRecordAsCardView(record, options) {
        const scope = getRecordScope(record);
        const existingId = text(record?.provenance?.smartViewUserId, '');
        if (existingId) {
            return { ok: true, alreadySaved: true, viewId: existingId };
        }
        const criteria = normalizeReusableCriteria(getRecordCriteria(record));
        if (!criteria || !Object.keys(criteria).length) {
            return { ok: false, error: 'This Nexus Smart View does not expose reusable criteria yet.' };
        }
        const label = text(options?.label || record?.title, 'Nexus Smart View').replace(/^\[\s*|\s*\]$/g, '');
        const result = saveCardView(scope.workspaceId, scope.categoryName, {
            id: buildSavedViewIdFromRecord(record),
            label,
            scope: 'card',
            criteria,
            sort: { by: 'title', direction: 'asc' },
            presentation: { layout: 'folder', source: 'nexus' }
        });
        if (result.ok && typeof showToast === 'function' && options?.toast !== false) {
            showToast('Saved Smart View: ' + result.view.label, 'success');
        } else if (!result.ok && typeof showToast === 'function' && options?.toast !== false) {
            showToast(result.error || 'Could not save Smart View.', 'warning');
        }
        if (result.ok && typeof renderDashboard === 'function') renderDashboard();
        return result;
    }

    Object.assign(api, {
        getSmartViewRecordLinkIds,
        revealSmartViewRecord,
        saveSmartViewRecordAsCardView
    });
})(window.EveSmartViewRegistry);
