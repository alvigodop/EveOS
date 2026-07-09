// --- Modular State Sync API: Selective Context Sends (names-level) ---
// Granular alternatives to "Send Selected Context": each send ships ONLY one layer of the
// datapack (tab names, full tab tree, card names, or bookmarks + folder trees), scoped to the
// surface the user is on RIGHT NOW — a normal tab sends its branch, the Unidex overview sends
// the whole datapack, a tab drilled into from Unidex sends just that branch.
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiContextNamesReady) return;
    if (!ns.apiContextReady) {
        console.warn('[ModularStateSync] Context API missing; selective context sends not initialized.');
        return;
    }

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function getConfig() {
        return window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function getLinks() {
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        return [];
    }

    function getFolderTrees() {
        return window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
    }

    function getLibraries() {
        try { return window.EveLibrary?.State?.getAllLibraries?.() || {}; }
        catch { return {}; }
    }

    function findWorkspace(workspaceId, nodes) {
        const helpers = window.EveWorkspaceHelpers;
        if (helpers?.findById) return helpers.findById(nodes, workspaceId);
        const target = text(workspaceId, '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (text(node?.id, '').toLowerCase() === target) return node;
            const nested = findWorkspace(workspaceId, node?.subTabs);
            if (nested) return nested;
        }
        return null;
    }

    function branchIds(node, out) {
        const ids = out || new Set();
        const id = text(node?.id, '');
        if (id) ids.add(id);
        (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach(function (child) { branchIds(child, ids); });
        return ids;
    }

    // The root nodes the current surface covers. Unidex overview / group overview arrive as
    // scope 'all'; normal tabs and Unidex drill-ins arrive as a workspace/card scope.
    function scopeRootNodes(scope) {
        const workspaces = Array.isArray(getConfig().workspaces) ? getConfig().workspaces : [];
        if (scope.scope === 'all') {
            const selected = Array.isArray(scope.workspaceIds) ? scope.workspaceIds.map(function (id) { return text(id, ''); }).filter(Boolean) : [];
            if (!selected.length) return workspaces;
            // Group overview lists every branch id — keep only ROOT nodes so subtrees are not
            // duplicated (a selected sub-tab already ships nested inside its selected ancestor).
            const nodes = selected.map(function (id) { return findWorkspace(id, workspaces); }).filter(Boolean);
            const descendantIds = new Set();
            nodes.forEach(function (node) {
                const ids = branchIds(node);
                ids.delete(text(node?.id, ''));
                ids.forEach(function (id) { descendantIds.add(id); });
            });
            return nodes.filter(function (node) { return !descendantIds.has(text(node?.id, '')); });
        }
        const root = findWorkspace(scope.workspaceId, workspaces);
        return root ? [root] : [];
    }

    function describeSurface(scope) {
        if (scope.scope === 'all') {
            if (text(scope.label, '')) return scope.label;
            return text(scope.source, '').indexOf('group') === 0 ? 'Group overview' : 'Unidex datapack overview';
        }
        const root = findWorkspace(scope.workspaceId, getConfig().workspaces);
        const tabName = text(root?.name, scope.workspaceId);
        if (scope.scope === 'card' && text(scope.categoryName, '')) {
            return 'Card "' + scope.categoryName + '" in tab "' + tabName + '"';
        }
        return 'Tab "' + tabName + '"';
    }

    function tabLine(node, depth) {
        const name = text(node?.name || node?.title, text(node?.id, 'Tab'));
        const shortcut = text(node?.linkedTo, '') ? ' [shortcut]' : '';
        return depth ? '  '.repeat(depth) + '- ' + name + shortcut : name + shortcut;
    }

    function buildTabNames(roots, maxDepth) {
        const lines = [];
        let count = 0;
        function visit(node, depth) {
            if (!node) return;
            lines.push(tabLine(node, depth));
            count += 1;
            if (depth >= maxDepth) return;
            (Array.isArray(node.subTabs) ? node.subTabs : []).forEach(function (child) { visit(child, depth + 1); });
        }
        roots.forEach(function (root) { visit(root, 0); });
        return { body: lines.join('\n'), count: count };
    }

    // Cards can exist through links, library buckets, or folder trees — union all three so empty
    // cards are named too.
    function cardsByWorkspace(workspaceIdSet) {
        const byWorkspace = new Map();
        function add(workspaceId, categoryName) {
            const wsId = text(workspaceId, 'main');
            const card = text(categoryName, 'Unsorted');
            if (!workspaceIdSet.has(wsId)) return;
            if (!byWorkspace.has(wsId)) byWorkspace.set(wsId, new Set());
            byWorkspace.get(wsId).add(card);
        }
        getLinks().forEach(function (link) { add(link?.workspace, link?.category); });
        [getLibraries(), getFolderTrees()].forEach(function (map) {
            Object.keys(map || {}).forEach(function (scopedKey) {
                const pivot = scopedKey.indexOf('::');
                if (pivot > 0) add(scopedKey.slice(0, pivot), scopedKey.slice(pivot + 2));
            });
        });
        return byWorkspace;
    }

    function tabPathLabel(node, prefix) {
        const name = text(node?.name || node?.title, text(node?.id, 'Tab'));
        return prefix ? prefix + ' > ' + name : name;
    }

    function buildCardNames(roots, scope) {
        const idSet = new Set();
        roots.forEach(function (root) { branchIds(root, idSet); });
        const cards = cardsByWorkspace(idSet);
        const lines = [];
        let count = 0;
        function visit(node, prefix) {
            if (!node) return;
            const label = tabPathLabel(node, prefix);
            const wsId = text(node?.id, '');
            let names = Array.from(cards.get(wsId) || []).sort();
            if (scope.scope === 'card' && text(scope.categoryName, '') && wsId === text(scope.workspaceId, '')) {
                names = names.filter(function (name) { return name === scope.categoryName; });
            }
            if (names.length) {
                lines.push(label + ': ' + names.join(', '));
                count += names.length;
            }
            (Array.isArray(node.subTabs) ? node.subTabs : []).forEach(function (child) { visit(child, label); });
        }
        roots.forEach(function (root) { visit(root, ''); });
        return { body: lines.join('\n'), count: count };
    }

    function folderMaps(tree) {
        const nodes = Array.isArray(tree) ? tree : (tree?.nodes || tree?.folders || []);
        const byId = new Map();
        const children = new Map();
        (Array.isArray(nodes) ? nodes : []).forEach(function (node) {
            const id = text(node?.id, '');
            if (id && !byId.has(id)) byId.set(id, { id: id, name: text(node?.name || node?.title, 'Folder'), parentId: text(node?.parentId, '') });
        });
        byId.forEach(function (node) {
            const parent = byId.has(node.parentId) && node.parentId !== node.id ? node.parentId : '';
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(node);
        });
        children.forEach(function (list) { list.sort(function (a, b) { return a.name.localeCompare(b.name); }); });
        return { byId: byId, children: children };
    }

    function buildBookmarksAndFolders(roots, scope) {
        const idSet = new Set();
        roots.forEach(function (root) { branchIds(root, idSet); });
        const folderTrees = getFolderTrees();
        const cards = cardsByWorkspace(idSet);
        const linksByCard = new Map();
        getLinks().forEach(function (link) {
            const wsId = text(link?.workspace, 'main');
            if (!idSet.has(wsId)) return;
            const key = wsId + '::' + text(link?.category, 'Unsorted');
            if (!linksByCard.has(key)) linksByCard.set(key, []);
            linksByCard.get(key).push(link);
        });
        const lines = [];
        let bookmarkCount = 0;
        let folderCount = 0;
        function emitFolder(folderId, maps, byFolder, indent) {
            (maps.children.get(folderId) || []).forEach(function (folder) {
                lines.push(indent + '[folder] ' + folder.name + ':');
                folderCount += 1;
                (byFolder.get(folder.id) || []).forEach(function (link) {
                    lines.push(indent + '  - ' + text(link?.title || link?.url, '(Untitled)'));
                    bookmarkCount += 1;
                });
                emitFolder(folder.id, maps, byFolder, indent + '  ');
            });
        }
        function visit(node, prefix) {
            if (!node) return;
            const label = tabPathLabel(node, prefix);
            const wsId = text(node?.id, '');
            let names = Array.from(cards.get(wsId) || []).sort();
            if (scope.scope === 'card' && text(scope.categoryName, '') && wsId === text(scope.workspaceId, '')) {
                names = names.filter(function (name) { return name === scope.categoryName; });
            }
            names.forEach(function (cardName) {
                const key = wsId + '::' + cardName;
                const cardLinks = linksByCard.get(key) || [];
                const maps = folderMaps(folderTrees[key] || {});
                if (!cardLinks.length && !maps.byId.size) return;
                lines.push(label + ' > ' + cardName + ':');
                const byFolder = new Map();
                cardLinks.forEach(function (link) {
                    const folderId = text(link?.folderId, '');
                    const target = maps.byId.has(folderId) ? folderId : '';
                    if (!byFolder.has(target)) byFolder.set(target, []);
                    byFolder.get(target).push(link);
                });
                (byFolder.get('') || []).forEach(function (link) {
                    lines.push('  - ' + text(link?.title || link?.url, '(Untitled)'));
                    bookmarkCount += 1;
                });
                emitFolder('', maps, byFolder, '  ');
            });
            (Array.isArray(node.subTabs) ? node.subTabs : []).forEach(function (child) { visit(child, label); });
        }
        roots.forEach(function (root) { visit(root, ''); });
        return { body: lines.join('\n'), count: bookmarkCount, folderCount: folderCount };
    }

    const SELECTIVE_KINDS = {
        'tabs': { title: 'tab and sub-tab names', unit: 'tab' },
        'tab-tree': { title: 'full tab tree names (all nesting levels)', unit: 'tab' },
        'cards': { title: 'card names (no bookmarks or folders)', unit: 'card' },
        'bookmarks': { title: 'bookmark titles organized by folder trees', unit: 'bookmark' }
    };

    function buildSelectiveContext(kind) {
        const scope = ns.getCurrentGeminiContextScope?.() || {
            scope: 'workspace',
            workspaceId: text(getConfig().activeWorkspace, 'main'),
            workspaceIds: [text(getConfig().activeWorkspace, 'main')]
        };
        const meta = SELECTIVE_KINDS[kind] || SELECTIVE_KINDS.tabs;
        const roots = scopeRootNodes(scope);
        let built;
        if (kind === 'tab-tree') built = buildTabNames(roots, Infinity);
        else if (kind === 'cards') built = buildCardNames(roots, scope);
        else if (kind === 'bookmarks') built = buildBookmarksAndFolders(roots, scope);
        else built = buildTabNames(roots, 1);
        const surface = describeSurface(scope);
        const header = '[SYSTEM CONTEXT: EveOS selective context — ' + meta.title + ' for ' + surface
            + '. Names only, silent reference — do not acknowledge.]';
        return {
            scope: scope,
            surface: surface,
            kind: kind,
            message: header + '\n' + (built.body || '(nothing in this scope)'),
            count: built.count || 0,
            folderCount: built.folderCount || 0,
            unit: meta.unit
        };
    }

    // Same routing as the Data Stream: Mode 2 hands the text to the brain's update log; live
    // sessions get a silent system-context frame over the socket.
    function sendSelectiveContext(kind) {
        const context = buildSelectiveContext(kind);
        const result = {
            ok: true,
            sent: false,
            kind: context.kind,
            surface: context.surface,
            count: context.count,
            folderCount: context.folderCount,
            unit: context.unit,
            chars: context.message.length
        };
        if (window.EveAudioflixState?.isTextBrainMode?.() === true
            && typeof window.EveGeminiMode2?.appendEveUpdate === 'function') {
            window.EveGeminiMode2.appendEveUpdate(context.message);
            result.sent = true;
            result.route = 'text-brain';
            return result;
        }
        const socket = window.webSocket && window.webSocket.readyState === (window.WebSocket?.OPEN || 1)
            ? window.webSocket
            : null;
        if (!socket) {
            return { ok: false, sent: false, reason: 'socket-offline', surface: context.surface, kind: context.kind };
        }
        socket.send(JSON.stringify({
            source: 'modular_gemini_context',
            silent_response: true,
            silentResponseRequested: true,
            realtime_input: { media_chunks: [{ mime_type: 'text/plain', data: context.message }] },
            is_system_context: true,
            is_modular_context: true,
            context_manifest: {
                schema: 'eveos.gemini-context-manifest.v1',
                label: 'EveOS Selective Context',
                mode: 'selective-' + context.kind,
                scope: context.surface,
                scopeMode: context.scope.scope,
                activeWorkspaceId: context.scope.workspaceId || '',
                workspaceIds: context.scope.workspaceIds || [],
                categoryName: context.scope.categoryName || '',
                messageChars: context.message.length,
                route: 'websocket',
                generatedAt: new Date().toISOString()
            }
        }));
        result.sent = true;
        result.route = 'websocket';
        return result;
    }

    Object.assign(ns, {
        buildSelectiveContext: buildSelectiveContext,
        sendSelectiveContext: sendSelectiveContext
    });

    ns.apiContextNamesReady = true;
})();
