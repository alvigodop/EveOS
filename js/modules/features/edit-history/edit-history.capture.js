/* Scoped snapshot capture helpers for EveOS edit history. */
window.EveEditHistory = window.EveEditHistory || {};

(function () {
    function text(value, fallback = '') {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function clone(value) {
        try {
            return JSON.parse(JSON.stringify(value == null ? null : value));
        } catch {
            return value == null ? null : value;
        }
    }

    function scopedKey(workspaceId, categoryName) {
        return `${text(workspaceId, 'main')}::${text(categoryName, 'Unsorted')}`;
    }

    function pinKey(pin) {
        return `${text(pin?.targetType, 'bookmark')}::${text(pin?.targetId, '')}`;
    }

    function splitScopedKey(key) {
        const parts = String(key || '').split('::');
        return {
            workspaceId: text(parts.shift(), 'main'),
            categoryName: text(parts.join('::'), 'Unsorted')
        };
    }

    function parseCardTargetId(value) {
        const parts = text(value, '').split('::');
        return parts.length >= 2
            ? { workspaceId: text(parts[0], 'main'), categoryName: text(parts.slice(1).join('::'), 'Unsorted') }
            : { workspaceId: 'main', categoryName: text(value, 'Unsorted') };
    }

    function parseFolderTargetId(value) {
        const parts = text(value, '').split('::');
        return parts.length >= 3
            ? {
                workspaceId: text(parts[0], 'main'),
                categoryName: text(parts[1], 'Unsorted'),
                folderId: text(parts.slice(2).join('::'), '')
            }
            : { workspaceId: 'main', categoryName: 'Unsorted', folderId: '' };
    }

    function buildLinkMap(snapshot) {
        const map = new Map();
        (Array.isArray(snapshot?.links) ? snapshot.links : []).forEach((link) => {
            const id = text(link?.id, '');
            if (id) map.set(id, link);
        });
        return map;
    }

    function getPinContext(pin, linkMap) {
        const type = text(pin?.targetType, 'bookmark').toLowerCase();
        if (type === 'bookmark') {
            const link = linkMap.get(text(pin?.targetId, ''));
            return link ? {
                workspaceId: text(link.workspace, 'main'),
                categoryName: text(link.category, 'Unsorted'),
                folderId: text(link.folderId, '')
            } : null;
        }
        if (type === 'card') return parseCardTargetId(pin.targetId);
        if (type === 'folder') return parseFolderTargetId(pin.targetId);
        return null;
    }

    function filterPins(snapshot, predicate) {
        const linkMap = buildLinkMap(snapshot);
        return (Array.isArray(snapshot?.quickPins) ? snapshot.quickPins : [])
            .filter((pin) => predicate(pin, getPinContext(pin, linkMap)))
            .map(clone);
    }

    function getFolderNodes(snapshot, workspaceId, categoryName) {
        const tree = snapshot?.bookmarkFolders?.[scopedKey(workspaceId, categoryName)];
        if (Array.isArray(tree?.nodes)) return tree.nodes;
        if (Array.isArray(tree)) return tree;
        return [];
    }

    function collectFolderSubtreeIds(snapshot, workspaceId, categoryName, folderId) {
        const target = text(folderId, '');
        const nodes = getFolderNodes(snapshot, workspaceId, categoryName);
        const children = new Map();
        nodes.forEach((node) => {
            const parent = text(node?.parentId, '');
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(node);
        });
        const ids = new Set();
        const pending = target ? [target] : [];
        while (pending.length) {
            const id = pending.shift();
            if (!id || ids.has(id)) continue;
            ids.add(id);
            (children.get(id) || []).forEach((node) => pending.push(text(node?.id, '')));
        }
        return ids;
    }

    function captureWorkspaceData(snapshot, workspaceId) {
        const ws = text(workspaceId, 'main');
        const folderTrees = {};
        Object.entries(snapshot?.bookmarkFolders || {}).forEach(([key, value]) => {
            if (splitScopedKey(key).workspaceId === ws) folderTrees[key] = clone(value);
        });
        return {
            workspaceId: ws,
            links: clone((snapshot?.links || []).filter((link) => text(link?.workspace, 'main') === ws)),
            bookmarkFolders: folderTrees,
            quickPins: filterPins(snapshot, (_pin, context) => context?.workspaceId === ws)
        };
    }

    function captureCardData(snapshot, workspaceId, categoryName) {
        const ws = text(workspaceId, 'main');
        const cat = text(categoryName, 'Unsorted');
        const key = scopedKey(ws, cat);
        return {
            workspaceId: ws,
            categoryName: cat,
            scopedKey: key,
            links: clone((snapshot?.links || []).filter((link) => (
                text(link?.workspace, 'main') === ws && text(link?.category, 'Unsorted') === cat
            ))),
            folderTree: clone(snapshot?.bookmarkFolders?.[key] || null),
            quickPins: filterPins(snapshot, (_pin, context) => (
                context?.workspaceId === ws && context?.categoryName === cat
            ))
        };
    }

    function captureBookmarkData(snapshot, linkId) {
        const id = text(linkId, '');
        const link = (snapshot?.links || []).find((entry) => text(entry?.id, '') === id) || null;
        return {
            linkId: id,
            link: clone(link),
            quickPins: filterPins(snapshot, (pin) => (
                text(pin?.targetType, 'bookmark').toLowerCase() === 'bookmark'
                && text(pin?.targetId, '') === id
            ))
        };
    }

    function captureFolderData(snapshot, workspaceId, categoryName, folderId) {
        const ws = text(workspaceId, 'main');
        const cat = text(categoryName, 'Unsorted');
        const id = text(folderId, '');
        const ids = collectFolderSubtreeIds(snapshot, ws, cat, id);
        const nodes = getFolderNodes(snapshot, ws, cat)
            .filter((node) => ids.has(text(node?.id, '')))
            .map(clone);
        return {
            workspaceId: ws,
            categoryName: cat,
            folderId: id,
            scopedKey: scopedKey(ws, cat),
            folderIds: Array.from(ids),
            nodes,
            links: clone((snapshot?.links || []).filter((link) => (
                text(link?.workspace, 'main') === ws
                && text(link?.category, 'Unsorted') === cat
                && ids.has(text(link?.folderId, ''))
            ))),
            quickPins: filterPins(snapshot, (_pin, context) => (
                context?.workspaceId === ws
                && context?.categoryName === cat
                && ids.has(text(context?.folderId, ''))
            ))
        };
    }

    function findWorkspaceNode(workspaces, workspaceId) {
        const target = text(workspaceId, '');
        for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
            if (text(workspace?.id, '') === target) return workspace;
            const found = findWorkspaceNode(workspace?.subTabs, target);
            if (found) return found;
        }
        return null;
    }

    function captureWorkspaceConfig(sourceConfig, workspaceId) {
        return {
            workspaceId: text(workspaceId, 'main'),
            node: clone(findWorkspaceNode(sourceConfig?.workspaces, workspaceId))
        };
    }

    window.EveEditHistory.Capture = {
        scopedKey,
        splitScopedKey,
        pinKey,
        parseFolderTargetId,
        captureWorkspaceData,
        captureCardData,
        captureBookmarkData,
        captureFolderData,
        captureWorkspaceConfig
    };
})();
