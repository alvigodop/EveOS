window.EveBookmarkIdentifiers = window.EveBookmarkIdentifiers || {};

(function (ns) {
    if (ns.QuickPanelActions) return;

    function create(deps) {
        const {
            normalizeWorkspaceId,
            normalizeCategoryName,
            normalizeFolderId,
            rememberQuickLinkDestination,
            getLinksList,
            setLinksList,
            getQuickPanelState,
            findLinkById,
            getFolderPathLabel,
            renderQuickPanel,
            hideQuickPanel
        } = deps;
    function getCandidateLinkLists() {
        const lists = [];
        const pushList = (candidate) => {
            if (!Array.isArray(candidate) || lists.includes(candidate)) return;
            lists.push(candidate);
        };
        pushList(getLinksList());
        pushList(window.links);
        if (typeof links !== 'undefined') pushList(links);
        pushList(window.eveState?.links);
        return lists;
    }

    function resolveLinkContext(linkId) {
        const targetId = String(linkId || '').trim();
        if (!targetId) return { link: null, links: getLinksList() };
        for (const list of getCandidateLinkLists()) {
            const link = list.find((candidate) => String(candidate?.id || '').trim() === targetId);
            if (link) return { link, links: list };
        }
        return { link: null, links: getLinksList() };
    }

    function syncActionLinks(actionLinks) {
        const linksToSync = Array.isArray(actionLinks) ? actionLinks : getLinksList();
        setLinksList(linksToSync);
        return linksToSync;
    }

    function buildNormalizedTarget(target) {
        if (!target?.workspaceId || !target?.categoryName) return null;
        return {
            workspaceId: normalizeWorkspaceId(target.workspaceId),
            categoryName: normalizeCategoryName(target.categoryName),
            folderId: normalizeFolderId(target.folderId)
        };
    }

    function cloneBookmarkForDestination(link, target) {
        if (!link || !target) return null;
        const clone = typeof structuredClone === 'function'
            ? structuredClone(link)
            : JSON.parse(JSON.stringify(link));
        clone.id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        clone.workspace = normalizeWorkspaceId(target.workspaceId);
        clone.category = normalizeCategoryName(target.categoryName);
        const folderId = normalizeFolderId(target.folderId);
        if (folderId) clone.folderId = folderId;
        else delete clone.folderId;
        return clone;
    }

    function copyLinkedLibraryState(sourceLink, clonedLink) {
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry || !api?.promoteLinkWithData || !sourceLink?.id || !clonedLink?.id) return;
        const linked = api.getLinkedEntry(String(sourceLink.id));
        if (!linked?.entry) return;
        const patch = { ...linked.entry };
        delete patch.id;
        patch.title = clonedLink.title || patch.title || 'Untitled';
        patch.sourceUrl = clonedLink.url || patch.sourceUrl || '';
        api.promoteLinkWithData(String(clonedLink.id), patch, { silent: true });
    }

    function saveQuickLinkBookmarkChange(source, meta, actionLinks) {
        syncActionLinks(actionLinks || getLinksList());
        if (typeof saveData === 'function') {
            saveData({
                forceRender: true,
                immediate: true,
                source,
                meta
            });
        }
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function transferActiveBookmarkToQuickLinkTarget() {
        const state = getQuickPanelState();
        const target = buildNormalizedTarget(state?.target);
        const context = resolveLinkContext(state?.linkId);
        const link = context.link || findLinkById(state?.linkId);
        if (!target?.workspaceId || !target?.categoryName || !link) {
            if (typeof showToast === 'function') showToast('Choose a quick-link destination first.', 'warning');
            return false;
        }

        const linkId = String(link.id);
        let moved = false;
        if (typeof window.EveBookmarkFolders?.moveLinksToFolderTarget === 'function') {
            moved = !!window.EveBookmarkFolders.moveLinksToFolderTarget(
                [linkId],
                target.workspaceId,
                target.categoryName,
                target.folderId,
                { immediate: true }
            );
            if (moved) syncActionLinks(getLinksList());
        } else if (window.EveBookmarkMerge?.moveOrMergeLinkToScope) {
            const result = window.EveBookmarkMerge.moveOrMergeLinkToScope(link, {
                workspaceId: target.workspaceId,
                categoryName: target.categoryName,
                folderId: target.folderId
            }, {
                source: 'bookmark-identifier-quick-link-move',
                links: context.links
            });
            moved = !!(result?.moved || result?.merged);
            if (moved) {
                syncActionLinks(context.links);
                if (typeof saveData === 'function') {
                    saveData({
                        forceRender: true,
                        immediate: true,
                        source: 'bookmark-identifier-quick-link-move',
                        meta: {
                            linkId,
                            workspaceId: target.workspaceId,
                            categoryName: target.categoryName,
                            folderId: target.folderId,
                            merged: !!result?.merged,
                            removedLinkIds: result?.removedIds || []
                        }
                    });
                }
            }
        }
        if (!moved && context.link) {
            const sourceWorkspaceId = normalizeWorkspaceId(context.link.workspace);
            const sourceCategoryName = normalizeCategoryName(context.link.category);
            const sourceFolderId = normalizeFolderId(context.link.folderId);
            const alreadyAtTarget = sourceWorkspaceId === target.workspaceId
                && sourceCategoryName === target.categoryName
                && sourceFolderId === target.folderId;
            if (!alreadyAtTarget) {
                context.link.workspace = target.workspaceId;
                context.link.category = target.categoryName;
                if (target.folderId) context.link.folderId = target.folderId;
                else delete context.link.folderId;
                syncActionLinks(context.links);
                moved = true;
                if (typeof saveData === 'function') {
                    saveData({
                        forceRender: true,
                        immediate: true,
                        source: 'bookmark-identifier-quick-link-move',
                        meta: {
                            linkId,
                            workspaceId: target.workspaceId,
                            categoryName: target.categoryName,
                            folderId: target.folderId,
                            fallbackSynced: true
                        }
                    });
                }
            }
        }

        if (!moved) {
            if (typeof showToast === 'function') showToast('Bookmark is already at that destination.', 'info');
            return false;
        }
        if (typeof showToast === 'function') {
            const folderLabel = target.folderId
                ? ` / ${getFolderPathLabel(target.workspaceId, target.categoryName, target.folderId)}`
                : '';
            showToast(`Bookmark sent to ${target.categoryName}${folderLabel}`, 'success');
        }
        rememberQuickLinkDestination(target);
        hideQuickPanel();
        if (typeof renderDashboard === 'function') renderDashboard();
        return true;
    }

    function copyActiveBookmarkToQuickLinkTarget() {
        const state = getQuickPanelState();
        const target = buildNormalizedTarget(state?.target);
        const context = resolveLinkContext(state?.linkId);
        const link = context.link || findLinkById(state?.linkId);
        if (!target?.workspaceId || !target?.categoryName || !link) {
            if (typeof showToast === 'function') showToast('Choose a quick-link destination first.', 'warning');
            return false;
        }

        const links = Array.isArray(context.links) ? context.links : getLinksList();
        const clone = cloneBookmarkForDestination(link, target);
        if (!clone) return false;
        links.push(clone);
        copyLinkedLibraryState(link, clone);

        let merged = false;
        let removedIds = [];
        const mergeApi = window.EveBookmarkMerge;
        if (mergeApi?.findDuplicateInCard && mergeApi?.mergeBookmarkIntoTarget) {
            const duplicate = mergeApi.findDuplicateInCard(clone, {
                workspaceId: target.workspaceId,
                categoryName: target.categoryName,
                folderId: target.folderId
            }, {
                links,
                ignoreIds: [link.id]
            });
            if (duplicate) {
                const result = mergeApi.mergeBookmarkIntoTarget(clone, duplicate, {
                    links,
                    removeSource: true,
                    source: 'bookmark-identifier-quick-link-copy-merge',
                    sourceScope: {
                        workspaceId: normalizeWorkspaceId(link.workspace),
                        categoryName: normalizeCategoryName(link.category),
                        folderId: normalizeFolderId(link.folderId)
                    },
                    targetScope: {
                        workspaceId: target.workspaceId,
                        categoryName: target.categoryName,
                        folderId: target.folderId
                    },
                    reason: 'Copying a labeled bookmark into a card that already has the same title or URL.'
                });
                merged = !!result?.merged;
                removedIds = result?.removedIds || [];
            }
        }

        saveQuickLinkBookmarkChange('bookmark-identifier-quick-link-copy', {
            sourceLinkId: String(link.id),
            clonedLinkId: String(clone.id),
            workspaceId: target.workspaceId,
            categoryName: target.categoryName,
            folderId: target.folderId,
            merged,
            removedLinkIds: removedIds
        }, links);
        rememberQuickLinkDestination(target);
        if (typeof showToast === 'function') {
            const folderLabel = target.folderId ? ` / ${getFolderPathLabel(target.workspaceId, target.categoryName, target.folderId)}` : '';
            showToast(merged
                ? `Bookmark copied and merged into ${target.categoryName}${folderLabel}`
                : `Bookmark copied to ${target.categoryName}${folderLabel}`, 'success');
        }
        renderQuickPanel();
        return true;
    }


        return {
            transferActiveBookmarkToQuickLinkTarget,
            copyActiveBookmarkToQuickLinkTarget
        };
    }

    ns.QuickPanelActions = { create };
})(window.EveBookmarkIdentifiers);
