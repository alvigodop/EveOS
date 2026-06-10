window.EveMatrixDatapackPhoneBridge = (function () {
    'use strict';

    function text(value, fallback) {
        var result = String(value == null ? '' : value).trim();
        return result || String(fallback || '').trim();
    }

    function list(value) {
        if (Array.isArray(value)) return value;
        if (value == null || value === '') return [];
        return String(value).split(/[,;\n]/).map(function (item) {
            return item.trim();
        }).filter(Boolean);
    }

    function unique(values) {
        var seen = new Set();
        return values.map(function (value) {
            return text(value, '');
        }).filter(Boolean).filter(function (value) {
            var key = value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function canRead(candidate) {
        if (!candidate || candidate.closed) return false;
        try {
            return candidate.location.origin === window.location.origin;
        } catch (error) {
            return false;
        }
    }

    function getHost() {
        if (window.parent !== window && canRead(window.parent)) return window.parent;
        if (canRead(window.opener)) return window.opener;
        return null;
    }

    function flattenWorkspaces(nodes, parentId, depth, output) {
        var result = output || [];
        (Array.isArray(nodes) ? nodes : []).forEach(function (workspace) {
            if (!workspace) return;
            result.push({
                id: text(workspace.id, 'main'),
                name: text(workspace.name, workspace.id || 'Untitled Tab'),
                icon: text(workspace.icon, 'TAB'),
                parentId: text(parentId, ''),
                depth: Number(depth) || 0
            });
            flattenWorkspaces(workspace.subTabs, workspace.id, (Number(depth) || 0) + 1, result);
        });
        return result;
    }

    function getLibraryEntriesByLink(host) {
        var entries = new Map();
        var byLink = new Map();
        var state = host.EveLibrary?.State;
        var connections = host.EveLibrary?.ConnectionsAPI?.getAll?.() || [];
        var libraries = state?.getAllLibraries?.() || {};

        Object.values(libraries).forEach(function (library) {
            (Array.isArray(library?.entries) ? library.entries : []).forEach(function (entry) {
                var id = text(entry?.id, '');
                if (id && !entries.has(id)) entries.set(id, entry);
            });
        });
        connections.forEach(function (connection) {
            var linkId = text(connection?.linkId, '');
            var entry = entries.get(text(connection?.libraryEntryId, ''));
            if (linkId && entry) byLink.set(linkId, entry);
        });
        return byLink;
    }

    function getCoverUrls(host, link, entry) {
        var covers = host.EveBookmarkCovers;
        var values = [
            link?.fixedCoverImage,
            link?.coverImage
        ].concat(
            Array.isArray(link?.coverImages) ? link.coverImages : [],
            [entry?.image, entry?.imageUrl, entry?.coverImage],
            Array.isArray(entry?.coverImages) ? entry.coverImages : []
        );
        return unique(values).filter(function (url) {
            if (typeof covers?.isDisplayableCoverUrl === 'function') {
                return covers.isDisplayableCoverUrl(url);
            }
            return /^(?:https?:\/\/|data:image\/|blob:|\/|\.{1,2}\/)/i.test(url);
        });
    }

    function getFolderNames(host) {
        var map = new Map();
        var store = host.eveState?.bookmarkFolders || host.bookmarkFolders || {};
        Object.entries(store).forEach(function (pair) {
            var scope = pair[0];
            var tree = pair[1];
            var nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            nodes.forEach(function (node) {
                var id = text(node?.id, '');
                if (id) map.set(scope + '::' + id, text(node?.name, 'Folder'));
            });
        });
        return map;
    }

    function capture() {
        var host = getHost();
        if (!host) {
            return {
                connected: false,
                workspaces: [],
                cards: [],
                bookmarks: [],
                capturedAt: Date.now()
            };
        }

        var config = host.eveState?.config || host.config || {};
        var rawLinks = typeof host.getLiveLinks === 'function'
            ? host.getLiveLinks()
            : (host.eveState?.links || host.links || []);
        var workspaces = flattenWorkspaces(config.workspaces || [], '', 0, []);
        var workspaceIds = new Set(workspaces.map(function (workspace) { return workspace.id; }));
        var libraryByLink = getLibraryEntriesByLink(host);
        var folderNames = getFolderNames(host);
        var cardsByKey = new Map();
        var workspaceBookmarkCounts = new Map();
        var workspaceCardCounts = new Map();

        var bookmarks = (Array.isArray(rawLinks) ? rawLinks : []).filter(Boolean).map(function (link, index) {
            var id = text(link.id, 'bookmark-' + index);
            var workspaceId = text(link.workspace, 'main');
            var category = text(link.category, 'Unsorted');
            var entry = libraryByLink.get(id) || null;
            var coverUrls = getCoverUrls(host, link, entry);
            var tags = unique(
                list(link.tags)
                    .concat(list(entry?.tags), list(entry?.genre), list(entry?.genres))
            );
            var status = text(
                entry?.status || entry?.libraryStatus?.label || entry?.libraryStatus?.id || link.status,
                ''
            );
            var folderId = text(link.folderId, '');
            var scopeKey = workspaceId + '::' + category;
            var bookmark = {
                id: id,
                title: text(link.title, 'Untitled Bookmark'),
                url: text(link.url, ''),
                workspaceId: workspaceId,
                category: category,
                folderId: folderId,
                folderName: folderNames.get(scopeKey + '::' + folderId) || '',
                icon: text(link.icon, ''),
                tags: tags,
                status: status,
                coverUrls: coverUrls,
                coverUrl: coverUrls[0] || '',
                hasAdditionalCovers: (Array.isArray(link.coverImages) && link.coverImages.length > 0)
                    || coverUrls.length > 1
            };
            var cardKey = workspaceId + '::' + category;
            var card = cardsByKey.get(cardKey);
            if (!card) {
                card = {
                    key: cardKey,
                    workspaceId: workspaceId,
                    name: category,
                    bookmarkCount: 0,
                    coverCount: 0
                };
                cardsByKey.set(cardKey, card);
                workspaceCardCounts.set(
                    workspaceId,
                    (workspaceCardCounts.get(workspaceId) || 0) + 1
                );
            }
            card.bookmarkCount += 1;
            if (coverUrls.length) card.coverCount += 1;
            workspaceBookmarkCounts.set(
                workspaceId,
                (workspaceBookmarkCounts.get(workspaceId) || 0) + 1
            );
            if (!workspaceIds.has(workspaceId)) {
                workspaces.push({
                    id: workspaceId,
                    name: workspaceId,
                    icon: 'TAB',
                    parentId: '',
                    depth: 0
                });
                workspaceIds.add(workspaceId);
            }
            return bookmark;
        });

        var cards = Array.from(cardsByKey.values()).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
        workspaces.forEach(function (workspace) {
            workspace.bookmarkCount = workspaceBookmarkCounts.get(workspace.id) || 0;
            workspace.cardCount = workspaceCardCounts.get(workspace.id) || 0;
        });

        return {
            connected: true,
            activeWorkspaceId: text(config.activeWorkspace, 'main'),
            workspaces: workspaces,
            cards: cards,
            bookmarks: bookmarks,
            capturedAt: Date.now()
        };
    }

    function subscribe(callback) {
        var host = getHost();
        if (!host || typeof callback !== 'function') return function () {};
        var timer = 0;
        var handler = function () {
            clearTimeout(timer);
            timer = setTimeout(callback, 350);
        };
        host.addEventListener('eve:state-mutated', handler);
        return function () {
            clearTimeout(timer);
            host.removeEventListener('eve:state-mutated', handler);
        };
    }

    return {
        capture: capture,
        getHost: getHost,
        subscribe: subscribe
    };
})();
