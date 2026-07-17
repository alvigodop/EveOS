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

    // Inactive tabs are hidden state on the site — never eligible as context, at any depth.
    function isNodeActive(node) {
        return !!node && node.inactive !== true;
    }

    function isRootEligible(rootNode) {
        if (typeof ns.isWorkspaceContextEligible === 'function') {
            return ns.isWorkspaceContextEligible(rootNode, getConfig());
        }
        return isNodeActive(rootNode);
    }

    function branchIds(node, out) {
        const ids = out || new Set();
        if (!isNodeActive(node)) return ids;
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
            if (!selected.length) return workspaces.filter(isRootEligible);
            // Group overview lists every branch id — keep only ROOT nodes so subtrees are not
            // duplicated (a selected sub-tab already ships nested inside its selected ancestor).
            const nodes = selected.map(function (id) { return findWorkspace(id, workspaces); }).filter(Boolean);
            const descendantIds = new Set();
            nodes.forEach(function (node) {
                const ids = branchIds(node);
                ids.delete(text(node?.id, ''));
                ids.forEach(function (id) { descendantIds.add(id); });
            });
            return nodes.filter(function (node) { return !descendantIds.has(text(node?.id, '')); })
                .filter(isRootEligible);
        }
        const root = findWorkspace(scope.workspaceId, workspaces);
        return root ? [root] : [];
    }

    // Depth-aware surface description: root/sub/sub^N tab classification with the full parent
    // path, via the canonical describer in the context API.
    function describeTabSurface(workspaceId) {
        if (typeof ns.describeWorkspaceTabPath === 'function') {
            return ns.describeWorkspaceTabPath(workspaceId);
        }
        const root = findWorkspace(workspaceId, getConfig().workspaces);
        return 'tab "' + text(root?.name, workspaceId) + '"';
    }

    function capitalize(value) {
        const normalized = text(value, '');
        return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : normalized;
    }

    function describeSurface(scope) {
        if (scope.scope === 'all') {
            // Group overviews must never read as a normal tab: the classified label from the
            // scope builder wins, and the fallback stays classified too.
            if (text(scope.label, '')) return scope.label;
            return text(scope.source, '').indexOf('group') === 0
                ? 'Group tab (a group of tabs, not a single tab)'
                : 'Unidex datapack overview';
        }
        const surface = describeTabSurface(scope.workspaceId);
        if (scope.scope === 'card' && text(scope.categoryName, '')) {
            return 'Card "' + scope.categoryName + '" in ' + surface;
        }
        return capitalize(surface);
    }

    function tabName(node) {
        return text(node?.name || node?.title, text(node?.id, 'Tab'));
    }

    // Shortcut tabs must never read as the tab they point at: name the TARGET explicitly so the
    // model can say "X is a shortcut to Y" instead of conflating them.
    function shortcutTargetName(node) {
        const linkedTo = text(node?.linkedTo, '');
        if (!linkedTo) return '';
        const target = findWorkspace(linkedTo, getConfig().workspaces);
        return tabName(target || { id: linkedTo });
    }

    function shortcutSuffix(node) {
        const targetName = shortcutTargetName(node);
        return targetName ? ' [shortcut to tab "' + targetName + '"]' : '';
    }

    function tabLine(node, depth) {
        const label = tabName(node) + shortcutSuffix(node);
        return depth ? '  '.repeat(depth) + '- ' + label : label;
    }

    // "Tab \"test\"" for roots, "Sub-tab \"1Tester\" (under \"test\")" for children — spoken-model
    // proof: a sub-tab's cards can't be misread as its parent's.
    function tabContextLabel(node, parentPath) {
        if (!parentPath) return 'Tab "' + tabName(node) + '"';
        return 'Sub-tab "' + tabName(node) + '" (under "' + parentPath + '")';
    }

    function buildTabNames(roots, maxDepth) {
        const lines = [];
        let count = 0;
        function visit(node, depth) {
            if (!isNodeActive(node)) return;
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

    // maxSubDepth: how many sub-tab levels to descend (0 = the scope tab only,
    // Infinity = the whole sub^N chain). Both are real user choices in Selective Send.
    function buildCardNames(roots, scope, maxSubDepth) {
        const depthLimit = typeof maxSubDepth === 'number' ? maxSubDepth : Infinity;
        const idSet = new Set();
        roots.forEach(function (root) { branchIds(root, idSet); });
        const cards = cardsByWorkspace(idSet);
        const lines = [];
        let count = 0;
        function visit(node, parentPath, depth) {
            if (!isNodeActive(node)) return;
            const name = tabName(node);
            // Shortcuts own no content — emit a pointer so the model never attributes the
            // TARGET tab's cards to the shortcut (or vice versa).
            if (text(node?.linkedTo, '')) {
                lines.push(tabContextLabel(node, parentPath) + ' is a shortcut to tab "' + shortcutTargetName(node) + '" — its cards are listed under that tab.');
                return;
            }
            const wsId = text(node?.id, '');
            let names = Array.from(cards.get(wsId) || []).sort();
            if (scope.scope === 'card' && text(scope.categoryName, '') && wsId === text(scope.workspaceId, '')) {
                names = names.filter(function (cardName) { return cardName === scope.categoryName; });
            }
            if (names.length) {
                lines.push(tabContextLabel(node, parentPath) + ' has cards: ' + names.join(', '));
                count += names.length;
            } else {
                lines.push(tabContextLabel(node, parentPath) + ' has no cards');
            }
            if (depth >= depthLimit) return;
            const childPath = parentPath ? parentPath + ' > ' + name : name;
            (Array.isArray(node.subTabs) ? node.subTabs : []).forEach(function (child) { visit(child, childPath, depth + 1); });
        }
        roots.forEach(function (root) { visit(root, '', 0); });
        return { body: lines.join('\n'), count: count };
    }

    const bookmarkLayer = window.EveGeminiSelectiveBookmarks?.create?.({
        text,
        getConfig,
        getLinks,
        getFolderTrees,
        cardsByWorkspace,
        branchIds,
        isNodeActive,
        tabName,
        tabContextLabel,
        shortcutTargetName
    });
    if (!bookmarkLayer) {
        console.warn('[ModularStateSync] Selective bookmark helper missing; selective context not initialized.');
        return;
    }

    const SELECTIVE_KINDS = {
        'tabs': { title: 'tab and sub-tab names', unit: 'tab' },
        'tab-tree': { title: 'full tab tree names (all nesting levels)', unit: 'tab' },
        'cards-current': { title: 'card names for this tab only (sub-tabs excluded)', unit: 'card' },
        'cards': { title: 'card names for this tab and its whole sub^N chain (no bookmarks or folders)', unit: 'card' },
        'bookmarks-current': { title: 'bookmark titles organized by folder trees for this tab only (sub-tabs excluded)', unit: 'bookmark' },
        'bookmarks': { title: 'bookmark titles organized by folder trees for this tab and its whole sub^N chain', unit: 'bookmark' },
        'bookmark-contents-current': {
            title: 'bookmark contents (titles, links, identifiers, status, library info, notes, tags) for this tab only (sub-tabs excluded)',
            unit: 'bookmark',
            note: 'Full bookmark details'
        },
        'bookmark-contents': {
            title: 'bookmark contents (titles, links, identifiers, status, library info, notes, tags) for this tab and its whole sub^N chain',
            unit: 'bookmark',
            note: 'Full bookmark details'
        }
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
        else if (kind === 'cards') built = buildCardNames(roots, scope, Infinity);
        else if (kind === 'cards-current') built = buildCardNames(roots, scope, 0);
        else if (kind === 'bookmarks') built = bookmarkLayer.buildBookmarksAndFolders(roots, scope, null, Infinity);
        else if (kind === 'bookmarks-current') built = bookmarkLayer.buildBookmarksAndFolders(roots, scope, null, 0);
        else if (kind === 'bookmark-contents') built = bookmarkLayer.buildBookmarksAndFolders(roots, scope, bookmarkLayer.bookmarkDetailLine, Infinity);
        else if (kind === 'bookmark-contents-current') built = bookmarkLayer.buildBookmarksAndFolders(roots, scope, bookmarkLayer.bookmarkDetailLine, 0);
        else built = buildTabNames(roots, 1);
        const surface = describeSurface(scope);
        const header = '[SYSTEM CONTEXT: EveOS selective context — ' + meta.title + ' for ' + surface
            + '. ' + text(meta.note, 'Names only') + ', silent reference — do not acknowledge.]';
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
    // Each selective send is stamped into the Data Stream insight timeline so scoped layer
    // sends are visible in the Agent Space viewer, not just their config side-effects.
    function recordSelectiveInsight(context, result) {
        ns.recordDataStreamEvent?.({
            type: 'relay',
            outcome: result.sent ? 'sent' : 'skipped',
            reason: result.sent ? '' : String(result.reason || 'not sent'),
            route: result.route || '',
            relayMode: 'selective: ' + String(context.kind || 'tabs'),
            scope: { label: context.surface || '', scope: context.scope?.scope || '' },
            counts: { [context.unit || 'items']: context.count || 0, folders: context.folderCount || 0 },
            messageChars: context.message.length,
            payload: { preview: context.message.slice(0, 1200) }
        });
    }

    function sendSelectiveContext(kind) {
        const meta = SELECTIVE_KINDS[kind] || SELECTIVE_KINDS.tabs;
        if (getConfig().geminiLiveLinkEnabled !== true) {
            const scope = ns.getCurrentGeminiContextScope?.() || {
                scope: 'workspace',
                workspaceId: text(getConfig().activeWorkspace, 'main'),
                workspaceIds: [text(getConfig().activeWorkspace, 'main')]
            };
            const context = {
                kind,
                scope,
                surface: describeSurface(scope),
                count: 0,
                folderCount: 0,
                unit: meta.unit,
                message: ''
            };
            const disabled = { ok: true, sent: false, skipped: true, reason: 'relay-disabled', kind };
            recordSelectiveInsight(context, disabled);
            return disabled;
        }
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
            recordSelectiveInsight(context, result);
            return result;
        }
        const socket = window.webSocket && window.webSocket.readyState === (window.WebSocket?.OPEN || 1)
            ? window.webSocket
            : null;
        if (!socket) {
            const offline = { ok: false, sent: false, reason: 'socket-offline', surface: context.surface, kind: context.kind };
            recordSelectiveInsight(context, offline);
            return offline;
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
        recordSelectiveInsight(context, result);
        return result;
    }

    Object.assign(ns, {
        buildSelectiveContext: buildSelectiveContext,
        sendSelectiveContext: sendSelectiveContext
    });

    ns.apiContextNamesReady = true;
})();
