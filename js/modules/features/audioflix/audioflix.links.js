// Canonical Audioflix-to-EveOS references. Tracks and clips remain owned by the Audioflix
// store; tabs, cards, folders, bookmarks, Matrix, and Constellation receive lightweight IDs.
window.EveAudioflixLinks = window.EveAudioflixLinks || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixLinks;
    if (ns.ready) return;

    const store = () => window.EveAudioflixState;
    const state = () => store()?.ensure?.() || {};
    const text = (value, fallback = '') => String(value ?? '').trim() || String(fallback ?? '').trim();
    const lower = (value) => text(value).toLowerCase();
    const keyPart = (value) => lower(value);
    const bindingTypes = new Set(['workspace', 'card', 'folder', 'bookmark']);
    let pendingScope = null;
    let pendingScopeExpiresAt = 0;
    let bindingBatchSequence = 0;

    function getConfig() {
        return window.eveState?.config || window.config || {};
    }

    function findWorkspace(workspaceId) {
        const config = getConfig();
        const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];
        if (window.EveWorkspaceHelpers?.findById) {
            return window.EveWorkspaceHelpers.findById(workspaces, workspaceId);
        }
        const target = lower(workspaceId);
        const queue = workspaces.slice();
        while (queue.length) {
            const workspace = queue.shift();
            if (lower(workspace?.id) === target) return workspace;
            queue.push(...(Array.isArray(workspace?.subTabs) ? workspace.subTabs : []));
        }
        return null;
    }

    function normalizeScope(input) {
        const source = input && typeof input === 'object' ? input : {};
        const rawType = text(source.scopeType || source.scope, 'workspace');
        const scopeType = rawType === 'all' ? 'all' : (bindingTypes.has(rawType) ? rawType : 'workspace');
        const workspaceId = text(source.workspaceId, getConfig().activeWorkspace || 'main');
        return {
            scopeType,
            scope: scopeType,
            workspaceId,
            workspaceIds: Array.isArray(source.workspaceIds)
                ? [...new Set(source.workspaceIds.map((id) => text(id)).filter(Boolean))]
                : [],
            categoryName: text(source.categoryName || source.category),
            folderId: text(source.folderId || source.sourceFolderId),
            bookmarkId: text(source.bookmarkId || source.linkId || source.sourceId),
            label: text(source.label || source.scopeLabel)
        };
    }

    function inferCurrentScope() {
        if (pendingScope && Date.now() < pendingScopeExpiresAt) {
            return normalizeScope(pendingScope);
        }
        pendingScope = null;
        pendingScopeExpiresAt = 0;
        const config = getConfig();
        const workspaceId = text(config.activeWorkspace, 'main');
        const categoryName = typeof focusCategory !== 'undefined' ? text(focusCategory) : '';
        if (!categoryName) return normalizeScope({ scopeType: 'workspace', workspaceId });
        const folderId = text(config.activeManhwaFolders?.[workspaceId + '::' + categoryName]);
        return normalizeScope({
            scopeType: folderId ? 'folder' : 'card',
            workspaceId,
            categoryName,
            folderId
        });
    }

    function setPendingScope(scopeInput, ttlMs = 10 * 60 * 1000) {
        const scope = normalizeScope(scopeInput);
        if (scope.scopeType === 'all') return null;
        pendingScope = scope;
        pendingScopeExpiresAt = Date.now() + Math.max(30_000, Number(ttlMs) || 0);
        return normalizeScope(scope);
    }

    function clearPendingScope() {
        pendingScope = null;
        pendingScopeExpiresAt = 0;
    }

    function getPendingScope() {
        if (!pendingScope || Date.now() >= pendingScopeExpiresAt) {
            clearPendingScope();
            return null;
        }
        return normalizeScope(pendingScope);
    }

    function scopeKey(scopeInput) {
        const scope = normalizeScope(scopeInput);
        return [
            scope.scopeType,
            keyPart(scope.workspaceId),
            keyPart(scope.categoryName),
            text(scope.folderId),
            text(scope.bookmarkId)
        ].join('::');
    }

    function bindingKey(binding) {
        return [
            binding.audioType === 'sound' ? 'sound' : 'music',
            text(binding.audioId),
            scopeKey(binding)
        ].join('::');
    }

    function scopeLabel(scopeInput) {
        const scope = normalizeScope(scopeInput);
        if (scope.scopeType === 'all') return scope.label || 'Whole Datapack';
        const workspaceName = text(findWorkspace(scope.workspaceId)?.name, scope.workspaceId);
        if (scope.scopeType === 'bookmark') return workspaceName + ' / ' + text(scope.categoryName, 'Card') + ' / Bookmark';
        if (scope.scopeType === 'folder') return workspaceName + ' / ' + text(scope.categoryName, 'Card') + ' / Folder';
        if (scope.scopeType === 'card') return workspaceName + ' / ' + text(scope.categoryName, 'Card');
        return workspaceName + ' / Tab';
    }

    function findAudio(audioType, audioId, snapshot) {
        const source = snapshot || state();
        const list = audioType === 'sound' ? source.soundboard : source.music;
        return (Array.isArray(list) ? list : []).find((item) => text(item?.id) === text(audioId)) || null;
    }

    function add(audioIds, scopeInput, audioType = 'music', label = '') {
        const snapshot = state();
        const scope = normalizeScope(scopeInput);
        if (scope.scopeType === 'all') {
            return { ok: false, added: 0, reason: 'Choose a tab, card, folder, or bookmark surface.' };
        }
        const type = audioType === 'sound' ? 'sound' : 'music';
        const ids = [...new Set((Array.isArray(audioIds) ? audioIds : [audioIds]).map((id) => text(id)).filter(Boolean))]
            .filter((id) => !!findAudio(type, id, snapshot));
        if (!ids.length) return { ok: false, added: 0, reason: 'No matching Audioflix items were found.' };

        const existing = Array.isArray(snapshot.scopeBindings) ? snapshot.scopeBindings : [];
        const seen = new Set(existing.map(bindingKey));
        const createdAt = Date.now();
        bindingBatchSequence = (bindingBatchSequence + 1) % Number.MAX_SAFE_INTEGER;
        const batchId = createdAt.toString(36) + '_' + bindingBatchSequence.toString(36);
        const additions = ids.map((audioId, index) => ({
            id: 'audio-link_' + batchId + '_' + index.toString(36),
            audioId,
            audioType: type,
            scopeType: scope.scopeType,
            workspaceId: scope.workspaceId,
            categoryName: scope.categoryName,
            folderId: scope.folderId,
            bookmarkId: scope.bookmarkId,
            label: text(label || scope.label),
            createdAt
        })).filter((binding) => !seen.has(bindingKey(binding)));

        if (!additions.length) return { ok: true, added: 0, reason: 'Those items are already linked to this surface.' };
        store()?.update?.({ scopeBindings: existing.concat(additions) }, 'audioflix-link-scope');
        return { ok: true, added: additions.length, scope, label: scopeLabel(scope) };
    }

    function remove(audioIds, scopeInput, audioType = 'music') {
        const snapshot = state();
        const scope = normalizeScope(scopeInput);
        const type = audioType === 'sound' ? 'sound' : 'music';
        const ids = new Set((Array.isArray(audioIds) ? audioIds : [audioIds]).map((id) => text(id)).filter(Boolean));
        const targetScope = scopeKey(scope);
        const bindings = Array.isArray(snapshot.scopeBindings) ? snapshot.scopeBindings : [];
        const next = bindings.filter((binding) => !(
            (binding.audioType === 'sound' ? 'sound' : 'music') === type
            && ids.has(text(binding.audioId))
            && scopeKey(binding) === targetScope
        ));
        const removed = bindings.length - next.length;
        if (removed) store()?.update?.({ scopeBindings: next }, 'audioflix-unlink-scope');
        return { ok: true, removed, scope, label: scopeLabel(scope) };
    }

    function buildContextSets(context) {
        const source = context && typeof context === 'object' ? context : {};
        const workspaces = new Set((source.workspaces || []).map((item) => keyPart(item?.id)).filter(Boolean));
        const cards = new Set((source.cards || []).map((item) => [
            keyPart(item?.workspaceId),
            keyPart(item?.name || item?.category)
        ].join('::')));
        const folders = new Set((source.folders || []).flatMap((item) => {
            const prefix = [keyPart(item?.workspaceId), keyPart(item?.category || item?.categoryName)];
            return [item?.sourceId, item?.id].map((id) => prefix.concat(text(id)).join('::'));
        }));
        const bookmarks = new Set((source.bookmarks || []).flatMap((item) => [item?.sourceId, item?.id].map(text).filter(Boolean)));
        return { workspaces, cards, folders, bookmarks };
    }

    function matchesScope(binding, scopeInput, context) {
        const scope = normalizeScope(scopeInput);
        if (context?.directOnly) return scopeKey(binding) === scopeKey(scope);
        const sets = buildContextSets(context);
        const bindingWorkspace = keyPart(binding.workspaceId);
        const allowedWorkspaceIds = new Set(scope.workspaceIds.map(keyPart));
        sets.workspaces.forEach((id) => allowedWorkspaceIds.add(id));

        if (scope.scopeType === 'all') {
            return !allowedWorkspaceIds.size || allowedWorkspaceIds.has(bindingWorkspace);
        }
        if (allowedWorkspaceIds.size && !allowedWorkspaceIds.has(bindingWorkspace)) return false;
        if (!allowedWorkspaceIds.size && bindingWorkspace !== keyPart(scope.workspaceId)) return false;

        const bindingCardKey = [bindingWorkspace, keyPart(binding.categoryName)].join('::');
        const bindingFolderKey = [bindingWorkspace, keyPart(binding.categoryName), text(binding.folderId)].join('::');
        if (sets.cards.size || sets.folders.size || sets.bookmarks.size) {
            if (binding.scopeType === 'workspace') return true;
            if (binding.scopeType === 'card') return sets.cards.has(bindingCardKey);
            if (binding.scopeType === 'folder') return sets.folders.has(bindingFolderKey);
            return sets.bookmarks.has(text(binding.bookmarkId));
        }

        if (scope.scopeType === 'workspace') return true;
        if (binding.scopeType === 'workspace') return true;
        if (keyPart(binding.categoryName) !== keyPart(scope.categoryName)) return false;
        if (scope.scopeType === 'card') return binding.scopeType !== 'workspace';
        if (binding.scopeType === 'card') return true;
        if (scope.scopeType === 'folder') {
            return binding.scopeType === 'folder' && text(binding.folderId) === text(scope.folderId);
        }
        if (binding.scopeType === 'folder') return text(binding.folderId) === text(scope.folderId);
        return binding.scopeType === 'bookmark' && text(binding.bookmarkId) === text(scope.bookmarkId);
    }

    function captureForScope(scopeInput, context) {
        const snapshot = state();
        const scope = normalizeScope(scopeInput);
        const bindings = (snapshot.scopeBindings || []).filter((binding) => matchesScope(binding, scope, context));
        const byAudio = new Map();
        bindings.forEach((binding) => {
            const item = findAudio(binding.audioType, binding.audioId, snapshot);
            if (!item) return;
            const key = (binding.audioType === 'sound' ? 'sound' : 'music') + '::' + item.id;
            if (!byAudio.has(key)) {
                byAudio.set(key, {
                    id: item.id,
                    type: binding.audioType === 'sound' ? 'sound' : 'music',
                    title: text(item.title, 'Untitled Audio'),
                    artist: text(item.artist),
                    duration: Number(item.duration) || 0,
                    localized: !!text(item.localPath),
                    hasSource: !!text(item.url || item.localPath),
                    bindingIds: [],
                    targets: []
                });
            }
            const entry = byAudio.get(key);
            entry.bindingIds.push(binding.id);
            entry.targets.push({
                scopeType: binding.scopeType,
                workspaceId: binding.workspaceId,
                categoryName: binding.categoryName,
                folderId: binding.folderId,
                bookmarkId: binding.bookmarkId,
                label: binding.label
            });
        });
        return {
            scope,
            scopeLabel: scopeLabel(scope),
            bindings: bindings.map((binding) => Object.assign({}, binding)),
            items: Array.from(byAudio.values()),
            count: byAudio.size
        };
    }

    function captureForMatrixSnapshot(matrixSnapshot) {
        const source = matrixSnapshot && typeof matrixSnapshot === 'object' ? matrixSnapshot : {};
        return captureForScope(source.scope || { scope: 'all' }, source);
    }

    async function play(audioType, audioId) {
        const item = findAudio(audioType, audioId);
        if (!item) throw new Error('The linked Audioflix item no longer exists.');
        if (typeof window.EveAudioflixAudio?.playItem !== 'function') {
            throw new Error('Audioflix playback is not ready.');
        }
        return window.EveAudioflixAudio.playItem(item);
    }

    function buildConstellationAnchorIndexes(graphState) {
        const byWorkspace = new Map();
        const byCard = new Map();
        (graphState?.nodes || []).forEach((node) => {
            const workspaceId = keyPart(node?.data?.workspaceId);
            if (!workspaceId) return;
            if (!byWorkspace.has(workspaceId) || node.kind === 'workspace') {
                byWorkspace.set(workspaceId, node);
            }
            const categoryName = keyPart(node?.data?.categoryName);
            if (!categoryName) return;
            const cardKey = workspaceId + '::' + categoryName;
            if (!byCard.has(cardKey) || node.kind === 'category') {
                byCard.set(cardKey, node);
            }
        });
        return { byWorkspace, byCard };
    }

    function findConstellationAnchor(binding, graphState, anchors) {
        const index = graphState?.nodeIndex;
        const directIds = [];
        if (binding.scopeType === 'bookmark') directIds.push('link_' + text(binding.bookmarkId));
        if (binding.scopeType === 'folder') {
            directIds.push('folder_' + binding.workspaceId + '_' + binding.categoryName + '_' + binding.folderId);
        }
        if (binding.scopeType === 'card') directIds.push('category_' + binding.workspaceId + '_' + binding.categoryName);
        directIds.push('workspace_' + binding.workspaceId);
        for (const id of directIds) {
            const node = index?.get?.(id);
            if (node) return node;
        }
        const workspaceId = keyPart(binding.workspaceId);
        if (binding.scopeType !== 'workspace') {
            const cardKey = workspaceId + '::' + keyPart(binding.categoryName);
            if (anchors.byCard.has(cardKey)) return anchors.byCard.get(cardKey);
        }
        return anchors.byWorkspace.get(workspaceId) || null;
    }

    function appendConstellationNodes(args) {
        const graphState = args?.state;
        if (!graphState || typeof args?.createNode !== 'function') return 0;
        const snapshot = state();
        const anchors = buildConstellationAnchorIndexes(graphState);
        const audioByKey = new Map();
        (snapshot.music || []).forEach((item) => audioByKey.set('music::' + text(item?.id), item));
        (snapshot.soundboard || []).forEach((item) => audioByKey.set('sound::' + text(item?.id), item));
        const nodeByAudio = new Map();
        let connected = 0;
        const bindings = Array.isArray(snapshot.scopeBindings) ? snapshot.scopeBindings : [];
        for (let index = 0; index < bindings.length && connected < 250; index += 1) {
            const binding = bindings[index];
            if (!anchors.byWorkspace.has(keyPart(binding.workspaceId))) continue;
            const anchor = findConstellationAnchor(binding, graphState, anchors);
            const itemKey = (binding.audioType === 'sound' ? 'sound' : 'music') + '::' + text(binding.audioId);
            const item = audioByKey.get(itemKey);
            if (!anchor || !item) continue;
            let node = nodeByAudio.get(itemKey);
            if (!node) {
                const angle = ((index % 12) / 12) * Math.PI * 2;
                node = args.addNode(args.createNode({
                    id: 'audioflix_' + (binding.audioType === 'sound' ? 'sound' : 'music') + '_' + item.id,
                    label: text(item.title, 'Audioflix'),
                    color: '#f4c95d',
                    radius: 7,
                    kind: 'link',
                    x: anchor.x + Math.cos(angle) * 46,
                    y: anchor.y + Math.sin(angle) * 46,
                    meta: [text(item.artist), binding.audioType === 'sound' ? 'Soundboard clip' : 'Audioflix track']
                        .filter(Boolean).join(' / '),
                    data: {
                        audioId: item.id,
                        audioType: binding.audioType === 'sound' ? 'sound' : 'music',
                        sourceType: 'audioflix',
                        workspaceId: binding.workspaceId,
                        categoryName: binding.categoryName,
                        folderId: binding.folderId,
                        bookmarkId: binding.bookmarkId
                    }
                }));
                nodeByAudio.set(itemKey, node);
            }
            args.addEdge(node, anchor, 'audioflix');
            connected += 1;
        }
        return connected;
    }

    Object.assign(ns, {
        ready: true,
        normalizeScope,
        inferCurrentScope,
        setPendingScope,
        clearPendingScope,
        getPendingScope,
        scopeKey,
        scopeLabel,
        add,
        remove,
        matchesScope,
        captureForScope,
        captureForMatrixSnapshot,
        play,
        appendConstellationNodes
    });
})();
