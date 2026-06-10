window.EveMatrixWorkshop = window.EveMatrixWorkshop || {};

(function (ns) {
    'use strict';

    const REQUEST_TYPE = 'eve:matrix-phone:request-snapshot';
    const RESPONSE_TYPE = 'eve:matrix-phone:snapshot';
    const INVALIDATED_TYPE = 'eve:matrix-phone:state-changed';
    let mutationTimer = 0;

    function text(value, fallback) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function list(value) {
        if (Array.isArray(value)) return value;
        if (value == null || value === '') return [];
        return String(value).split(/[,;\n]/).map(function (item) {
            return item.trim();
        }).filter(Boolean);
    }

    function unique(values) {
        const seen = new Set();
        return values.map(function (value) {
            return text(value, '');
        }).filter(Boolean).filter(function (value) {
            const key = value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        return window.eveState?.links || window.links || [];
    }

    function getLibraryEntriesByLink() {
        const entries = new Map();
        const byLink = new Map();
        const state = window.EveLibrary?.State;
        const connections = window.EveLibrary?.ConnectionsAPI?.getAll?.() || [];
        const libraries = state?.getAllLibraries?.() || {};
        Object.values(libraries).forEach(function (library) {
            (Array.isArray(library?.entries) ? library.entries : []).forEach(function (entry) {
                const id = text(entry?.id, '');
                if (id && !entries.has(id)) entries.set(id, entry);
            });
        });
        connections.forEach(function (connection) {
            const linkId = text(connection?.linkId, '');
            const entry = entries.get(text(connection?.libraryEntryId, ''));
            if (linkId && entry) byLink.set(linkId, entry);
        });
        return byLink;
    }

    function getCoverUrls(link, entry) {
        const covers = window.EveBookmarkCovers;
        const fallbackImage = text(
            entry?.image || entry?.imageUrl || entry?.coverImage || entry?.bannerImage,
            ''
        );
        const displayCover = typeof covers?.getDisplayCover === 'function'
            ? covers.getDisplayCover(link, fallbackImage)
            : '';
        const additionalCovers = typeof covers?.getAdditionalCoverImages === 'function'
            ? covers.getAdditionalCoverImages(link)
            : [];
        const values = [
            displayCover,
            link?.fixedCoverImage,
            link?.coverImage,
            link?.image,
            link?.imageUrl,
            link?.thumbnail,
            link?.poster
        ].concat(
            additionalCovers,
            Array.isArray(link?.coverImages) ? link.coverImages : [],
            [fallbackImage],
            Array.isArray(entry?.coverImages) ? entry.coverImages : []
        );
        return unique(values).filter(function (url) {
            if (typeof covers?.isDisplayableCoverUrl === 'function') {
                return covers.isDisplayableCoverUrl(url);
            }
            return /^(?:https?:\/\/|data:image\/|blob:|\/|\.{1,2}\/)/i.test(url);
        });
    }

    function getFolderNames() {
        const map = new Map();
        const store = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
        Object.entries(store).forEach(function ([scope, tree]) {
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            nodes.forEach(function (node) {
                const id = text(node?.id, '');
                if (id) map.set(scope + '::' + id, text(node?.name, 'Folder'));
            });
        });
        return map;
    }

    function buildBookmark(link, index, displayWorkspace, libraryByLink, folderNames) {
        const sourceId = text(link.id, 'bookmark-' + index);
        const sourceWorkspaceId = text(link.workspace, 'main');
        const workspaceId = displayWorkspace.id;
        const projected = sourceWorkspaceId.toLowerCase() !== workspaceId.toLowerCase();
        const category = text(link.category, 'Unsorted');
        const entry = libraryByLink.get(sourceId)
            || window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(sourceId)?.entry
            || null;
        const coverUrls = getCoverUrls(link, entry);
        const tags = unique(list(link.tags).concat(
            list(entry?.tags),
            list(entry?.genre),
            list(entry?.genres)
        ));
        const status = text(
            entry?.status || entry?.libraryStatus?.label || entry?.libraryStatus?.id || link.status,
            ''
        );
        const folderId = text(link.folderId, '');
        const sourceScopeKey = sourceWorkspaceId + '::' + category;
        return {
            id: projected ? sourceId + '::via::' + workspaceId : sourceId,
            sourceId,
            title: text(link.title, 'Untitled Bookmark'),
            url: text(link.url, ''),
            workspaceId,
            sourceWorkspaceId,
            viaShortcutId: projected ? workspaceId : '',
            category,
            folderId,
            folderName: folderNames.get(sourceScopeKey + '::' + folderId) || '',
            icon: text(link.icon, ''),
            tags,
            status,
            coverUrls,
            coverUrl: coverUrls[0] || '',
            hasAdditionalCovers: (Array.isArray(link.coverImages) && link.coverImages.length > 0)
                || coverUrls.length > 1
        };
    }

    function captureDatapackSnapshot(scopeOption) {
        const scope = ns.normalizeScope?.(scopeOption || ns.getScope?.()) || {
            scope: 'workspace',
            workspaceId: text(window.config?.activeWorkspace, 'main')
        };
        const displayWorkspaces = ns.resolveDisplayWorkspaces?.(scope) || [];
        const liveLinks = getLiveLinks();
        const rawLinks = (Array.isArray(liveLinks) ? liveLinks : []).filter(Boolean);
        const libraryByLink = getLibraryEntriesByLink();
        const folderNames = getFolderNames();
        const linksByWorkspace = new Map();
        const cardsByKey = new Map();
        const bookmarks = [];
        const uniqueBookmarkIds = new Set();

        rawLinks.forEach(function (link, index) {
            const workspaceKey = text(link.workspace, 'main').toLowerCase();
            if (!linksByWorkspace.has(workspaceKey)) linksByWorkspace.set(workspaceKey, []);
            linksByWorkspace.get(workspaceKey).push({ link, index });
        });

        displayWorkspaces.forEach(function (workspace) {
            const contentIds = ns.resolveContentWorkspaceIds?.(workspace) || new Set([workspace.id]);
            const seenInWorkspace = new Set();
            Array.from(contentIds).forEach(function (contentWorkspaceId) {
                const entries = linksByWorkspace.get(String(contentWorkspaceId).toLowerCase()) || [];
                entries.forEach(function (record) {
                    const link = record.link;
                    const index = record.index;
                    if (scope.scope === 'card'
                        && text(link.category, 'Unsorted') !== text(scope.categoryName, 'Unsorted')) return;
                    const sourceId = text(link.id, 'bookmark-' + index);
                    if (seenInWorkspace.has(sourceId)) return;
                    seenInWorkspace.add(sourceId);
                    uniqueBookmarkIds.add(sourceId);

                    const bookmark = buildBookmark(
                        link,
                        index,
                        workspace,
                        libraryByLink,
                        folderNames
                    );
                    bookmarks.push(bookmark);
                    const cardKey = workspace.id + '::' + bookmark.category;
                    let card = cardsByKey.get(cardKey);
                    if (!card) {
                        card = {
                            key: cardKey,
                            workspaceId: workspace.id,
                            name: bookmark.category,
                            bookmarkCount: 0,
                            coverCount: 0
                        };
                        cardsByKey.set(cardKey, card);
                    }
                    card.bookmarkCount += 1;
                    if (bookmark.coverUrl) card.coverCount += 1;
                });
            });
        });

        const cards = Array.from(cardsByKey.values()).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
        const workspaces = displayWorkspaces.map(function (workspace) {
            const workspaceCards = cards.filter(function (card) {
                return card.workspaceId === workspace.id;
            });
            return {
                id: workspace.id,
                name: workspace.name,
                icon: workspace.icon,
                parentId: workspace.parentId,
                depth: workspace.depth,
                linkedTo: workspace.linkedTo,
                isShortcut: workspace.isShortcut,
                cardCount: workspaceCards.length,
                bookmarkCount: workspaceCards.reduce(function (sum, card) {
                    return sum + card.bookmarkCount;
                }, 0)
            };
        });

        return {
            connected: true,
            scope,
            scopeLabel: ns.getScopeLabel?.(scope) || 'EveOS',
            activeWorkspaceId: text(window.eveState?.config?.activeWorkspace || window.config?.activeWorkspace, 'main'),
            uniqueBookmarkCount: uniqueBookmarkIds.size,
            workspaces,
            cards,
            bookmarks,
            capturedAt: Date.now()
        };
    }

    function getTrustedClientWindows() {
        const windows = [];
        const frameWindow = document.getElementById('matrix-workshop-frame')?.contentWindow;
        const detachedWindow = ns.getDetachedWindow?.();
        if (frameWindow) windows.push(frameWindow);
        if (detachedWindow && !detachedWindow.closed) windows.push(detachedWindow);
        return windows;
    }

    function isTrustedClient(source) {
        return !!source && getTrustedClientWindows().some(function (candidate) {
            return candidate === source;
        });
    }

    function postToClient(client, payload) {
        if (!client || client.closed) return;
        try {
            client.postMessage(payload, '*');
        } catch (error) {
            console.warn('[MatrixWorkshop] Could not send datapack snapshot.', error);
        }
    }

    function broadcastInvalidated(reason) {
        getTrustedClientWindows().forEach(function (client) {
            postToClient(client, {
                type: INVALIDATED_TYPE,
                reason: text(reason, 'state-mutated'),
                scope: ns.getScope?.() || null
            });
        });
    }

    window.addEventListener('message', function (event) {
        if (event.origin !== 'null' && event.origin !== window.location.origin) return;
        if (event.data?.type !== REQUEST_TYPE || !isTrustedClient(event.source)) return;
        postToClient(event.source, {
            type: RESPONSE_TYPE,
            requestId: text(event.data.requestId, ''),
            snapshot: captureDatapackSnapshot(ns.getScope?.())
        });
    });

    window.addEventListener('eve:state-mutated', function () {
        clearTimeout(mutationTimer);
        mutationTimer = window.setTimeout(function () {
            broadcastInvalidated('state-mutated');
        }, 250);
    });

    Object.assign(ns, {
        captureDatapackSnapshot,
        broadcastDatapackInvalidated: broadcastInvalidated
    });
})(window.EveMatrixWorkshop);
