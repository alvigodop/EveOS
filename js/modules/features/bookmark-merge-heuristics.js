window.EveBookmarkMerge = window.EveBookmarkMerge || {};

(function () {
    const api = window.EveBookmarkMerge;
    if (api.ready) return;

function buildMergeNote(details) {
        const {
            sourceLink,
            targetLink,
            sourceLinked,
            targetLinked,
            sourceScope,
            targetScope,
            fieldConflicts,
            mode,
            reason
        } = details;
        const lines = [
            '=== Bookmark Merge ===',
            `Merged At: ${new Date().toISOString()}`,
            `Reason: ${reason || 'Matching title or URL in destination card.'}`,
            `Mode: ${mode}`,
            `Destination Kept: ${String(targetLink?.title || 'Untitled').trim()} <${String(targetLink?.url || '').trim()}>`,
            `Incoming Title: ${String(sourceLink?.title || 'Untitled').trim()}`,
            `Incoming URL: ${String(sourceLink?.url || '').trim()}`
        ];

        if (sourceScope) {
            lines.push(`Incoming Scope: ${sourceScope.workspaceId || ''} / ${sourceScope.categoryName || 'Unsorted'}${sourceScope.folderId ? ` / folder ${sourceScope.folderId}` : ''}`);
        }
        if (targetScope) {
            lines.push(`Destination Scope: ${targetScope.workspaceId || ''} / ${targetScope.categoryName || 'Unsorted'}${targetScope.folderId ? ` / folder ${targetScope.folderId}` : ''}`);
        }

        const sourceNotes = String(sourceLink?.notes || '').trim();
        if (sourceNotes) {
            lines.push('', 'Incoming Bookmark Notes:', truncate(sourceNotes, 3000));
        }

        const libraryLines = formatEntrySnapshot(sourceLinked?.entry);
        if (libraryLines.length > 0) {
            lines.push('', 'Incoming Linked Library Snapshot:', ...libraryLines);
        }

        if (targetLinked?.entry && sourceLinked?.entry) {
            lines.push('', 'Library Rule:', 'Destination already had linked-library data, so incoming linked-library fields were preserved here instead of overwriting it.');
        } else if (!targetLinked?.entry && sourceLinked?.entry) {
            lines.push('', 'Library Rule:', 'Destination had no linked-library data, so incoming linked-library data was injected while destination title and URL were kept.');
        } else if (targetLinked?.entry && !sourceLinked?.entry) {
            lines.push('', 'Library Rule:', 'Destination already had linked-library data, so incoming bookmark identity was preserved here.');
        } else {
            lines.push('', 'Library Rule:', 'Neither bookmark had linked-library data, so the destination was promoted and the incoming bookmark was preserved here.');
        }

        if (Array.isArray(fieldConflicts) && fieldConflicts.length > 0) {
            lines.push('', 'Incoming Non-overwritten Bookmark Fields:', ...fieldConflicts);
        }

        return lines.join('\n').trim();
    }

    function cleanupSourceLibrary(sourceLink, sourceLinked) {
        const connectionsApi = window.EveLibrary?.ConnectionsAPI;
        if (!connectionsApi || !sourceLink?.id) return;
        const sourceId = String(sourceLink.id);
        const sourceEntryId = String(sourceLinked?.connection?.libraryEntryId || '');
        let removeEntry = true;
        if (sourceEntryId && typeof connectionsApi.getAll === 'function') {
            const refCount = (connectionsApi.getAll() || []).filter((connection) => (
                String(connection?.libraryEntryId || '') === sourceEntryId
            )).length;
            removeEntry = refCount <= 1;
        }
        if (typeof connectionsApi.unlinkLink === 'function') {
            connectionsApi.unlinkLink(sourceId, removeEntry);
        } else if (typeof connectionsApi.removeByLinkId === 'function') {
            connectionsApi.removeByLinkId(sourceId, { immediate: true });
        }
    }

    function transferQuickPins(sourceId, targetId) {
        if (!sourceId || !targetId || String(sourceId) === String(targetId)) return 0;
        const pinApi = window.EveQuickPins;
        if (!pinApi?.filterPinsForBookmark || !pinApi?.replacePinsForBookmark) return 0;

        const sourcePins = pinApi.filterPinsForBookmark(sourceId) || [];
        if (!sourcePins.length) return 0;
        const targetPins = pinApi.filterPinsForBookmark(targetId) || [];
        const keys = new Set(targetPins.map((pin) => `${pin.scopeType || ''}::${pin.targetType || ''}::${pin.label || ''}`));
        const remapped = [];
        sourcePins.forEach((pin, index) => {
            const clone = {
                ...pin,
                id: `${pin.id || sourceId}-merged-${targetId}-${Date.now()}-${index}`,
                targetType: 'bookmark',
                targetId: String(targetId)
            };
            const key = `${clone.scopeType || ''}::${clone.targetType || ''}::${clone.label || ''}`;
            if (keys.has(key)) return;
            keys.add(key);
            remapped.push(clone);
        });
        if (remapped.length > 0) {
            pinApi.replacePinsForBookmark(targetId, targetPins.concat(remapped), {
                source: 'bookmark-merge-pin-transfer',
                meta: { sourceId: String(sourceId), targetId: String(targetId) }
            });
        }
        pinApi.replacePinsForBookmark(sourceId, [], {
            source: 'bookmark-merge-pin-source-cleanup',
            meta: { sourceId: String(sourceId), targetId: String(targetId) }
        });
        return remapped.length;
    }

    function removeSourceLink(sourceLink, links) {
        const sourceId = String(sourceLink?.id || '');
        if (!sourceId) return false;
        const targetLinks = Array.isArray(links) ? links : getLiveLinks();
        const index = targetLinks.findIndex((link) => String(link?.id) === sourceId);
        if (index < 0) return false;
        targetLinks.splice(index, 1);
        return true;
    }

    function dispatchMergeEvent(result) {
        if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
        window.dispatchEvent(new CustomEvent('eve:bookmark-merged', { detail: result }));
        window.dispatchEvent(new CustomEvent('eve:state-mutated', {
            detail: {
                source: result.source || 'bookmark-merge',
                meta: result
            }
        }));
    }

    function mergeBookmarkIntoTarget(sourceLink, targetLink, options = {}) {
        if (!sourceLink || !targetLink) return null;
        if (String(sourceLink.id) === String(targetLink.id)) return null;

        const links = Array.isArray(options.links) ? options.links : getLiveLinks();
        const sourceLinked = getLinked(sourceLink.id);
        const targetLinked = getLinked(targetLink.id);
        const fieldConflicts = mergeBookmarkFields(sourceLink, targetLink);
        const preliminaryMode = targetLinked?.entry
            ? (sourceLinked?.entry ? 'both-linked-notes-only' : 'target-linked-notes-only')
            : (sourceLinked?.entry ? 'source-linked-injected' : 'unlinked-promoted');
        const noteText = buildMergeNote({
            sourceLink,
            targetLink,
            sourceLinked,
            targetLinked,
            sourceScope: options.sourceScope,
            targetScope: options.targetScope,
            fieldConflicts,
            mode: preliminaryMode,
            reason: options.reason
        });
        appendNotes(targetLink, noteText);
        const mode = applyLinkedLibraryPolicy(sourceLink, targetLink, sourceLinked, targetLinked, noteText);
        const transferredPins = transferQuickPins(sourceLink.id, targetLink.id);
        cleanupSourceLibrary(sourceLink, sourceLinked);
        const removed = options.removeSource !== false ? removeSourceLink(sourceLink, links) : false;

        const result = {
            merged: true,
            moved: false,
            source: options.source || 'bookmark-merge',
            mode,
            targetId: String(targetLink.id),
            removedIds: removed ? [String(sourceLink.id)] : [],
            transferredPins,
            sourceScope: options.sourceScope || null,
            targetScope: options.targetScope || null
        };
        dispatchMergeEvent(result);
        return result;
    }

    function findDuplicateInCard(sourceLink, targetScope, options = {}) {
        const links = Array.isArray(options.links) ? options.links : getLiveLinks();
        const targetWorkspaceId = normalizeWorkspaceId(targetScope?.workspaceId);
        const targetCategoryName = normalizeCategoryName(targetScope?.categoryName);
        const ignoreIds = new Set((options.ignoreIds || []).map((id) => String(id)));
        ignoreIds.add(String(sourceLink?.id || ''));

        let titleMatch = null;
        for (const candidate of links) {
            if (!candidate || ignoreIds.has(String(candidate.id))) continue;
            if (normalizeWorkspaceId(candidate.workspace) !== targetWorkspaceId) continue;
            if (normalizeCategoryName(candidate.category) !== targetCategoryName) continue;
            if (normalizeUrl(sourceLink?.url) && normalizeUrl(sourceLink?.url) === normalizeUrl(candidate.url)) return candidate;
            if (!titleMatch && normalizeTitle(sourceLink?.title) && normalizeTitle(sourceLink?.title) === normalizeTitle(candidate.title)) {
                titleMatch = candidate;
            }
        }
        return titleMatch;
    }

    function moveOrMergeLinkToScope(sourceLink, targetScope, options = {}) {
        if (!sourceLink) return null;
        const links = Array.isArray(options.links) ? options.links : getLiveLinks();
        const nextScope = {
            workspaceId: normalizeWorkspaceId(targetScope?.workspaceId || sourceLink.workspace),
            categoryName: normalizeCategoryName(targetScope?.categoryName || sourceLink.category),
            folderId: normalizeFolderId(targetScope?.folderId)
        };
        const sourceScope = {
            workspaceId: normalizeWorkspaceId(sourceLink.workspace),
            categoryName: normalizeCategoryName(sourceLink.category),
            folderId: normalizeFolderId(sourceLink.folderId)
        };
        const alreadyAtTarget = sourceScope.workspaceId === nextScope.workspaceId
            && sourceScope.categoryName === nextScope.categoryName
            && sourceScope.folderId === nextScope.folderId;

        const duplicate = findDuplicateInCard(sourceLink, nextScope, { links });
        if (duplicate) {
            return mergeBookmarkIntoTarget(sourceLink, duplicate, {
                ...options,
                links,
                removeSource: true,
                sourceScope,
                targetScope: nextScope,
                reason: options.reason || 'Moving bookmark into a card that already has the same title or URL.'
            });
        }

        if (alreadyAtTarget) return { merged: false, moved: false, skipped: true, sourceScope, targetScope: nextScope };

        sourceLink.workspace = nextScope.workspaceId;
        sourceLink.category = nextScope.categoryName;
        if (nextScope.folderId) sourceLink.folderId = nextScope.folderId;
        else delete sourceLink.folderId;
        if (typeof window.EveLibrary?.ConnectionsAPI?.syncFromLink === 'function') {
            window.EveLibrary.ConnectionsAPI.syncFromLink(sourceLink.id);
        }
        return {
            merged: false,
            moved: true,
            source: options.source || 'bookmark-move',
            targetId: String(sourceLink.id),
            removedIds: [],
            sourceScope,
            targetScope: nextScope
        };
    }

    function chooseGroupTarget(targetLinks) {
        if (!Array.isArray(targetLinks) || !targetLinks.length) return null;
        return targetLinks.slice().sort((a, b) => {
            const aLinked = hasLinkedEntry(a.id) ? 1 : 0;
            const bLinked = hasLinkedEntry(b.id) ? 1 : 0;
            if (aLinked !== bLinked) return bLinked - aLinked;
            const aUrl = normalizeUrl(a.url) && !/\/search[/?]|[?&]q=/.test(normalizeUrl(a.url)) ? String(a.url || '').length : 0;
            const bUrl = normalizeUrl(b.url) && !/\/search[/?]|[?&]q=/.test(normalizeUrl(b.url)) ? String(b.url || '').length : 0;
            if (aUrl !== bUrl) return bUrl - aUrl;
            return String(b.title || '').length - String(a.title || '').length;
        })[0] || null;
    }

    function mergeDuplicateGroup(linkIds, options = {}) {
        const ids = Array.isArray(linkIds) ? linkIds.map((id) => String(id)).filter(Boolean) : [];
        if (ids.length < 2) return null;
        const links = Array.isArray(options.links) ? options.links : getLiveLinks();
        const targetLinks = links.filter((link) => ids.includes(String(link?.id)));
        if (targetLinks.length < 2) return null;

        const baseLink = options.baseLink || chooseGroupTarget(targetLinks);
        if (!baseLink) return null;

        const removedIds = [];
        const mergedModes = [];
        targetLinks.forEach((link) => {
            if (!link || String(link.id) === String(baseLink.id)) return;
            const result = mergeBookmarkIntoTarget(link, baseLink, {
                source: options.source || 'duplicate-sensor-bookmark-merge',
                links,
                removeSource: true,
                sourceScope: {
                    workspaceId: normalizeWorkspaceId(link.workspace),
                    categoryName: normalizeCategoryName(link.category),
                    folderId: normalizeFolderId(link.folderId)
                },
                targetScope: {
                    workspaceId: normalizeWorkspaceId(baseLink.workspace),
                    categoryName: normalizeCategoryName(baseLink.category),
                    folderId: normalizeFolderId(baseLink.folderId)
                },
                reason: options.reason || 'Duplicate sensor merge matched bookmarks by title or URL.'
            });
            if (result?.removedIds?.length) removedIds.push(...result.removedIds);
            if (result?.mode) mergedModes.push(result.mode);
        });

        if (removedIds.length > 0) {
            setLiveLinks(links);
        }
        return {
            mergedId: String(baseLink.id),
            removedIds: Array.from(new Set(removedIds)),
            modes: Array.from(new Set(mergedModes))
        };
    }

    Object.assign(api, {
        normalizeTitle,
        normalizeUrl,
        valuesMatch,
        findDuplicateInCard,
        mergeBookmarkIntoTarget,
        moveOrMergeLinkToScope,
        mergeDuplicateGroup,
        ready: true
    });
})();
