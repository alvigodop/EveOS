function text(value, fallback) {
    const raw = String(value == null ? '' : value).trim();
    return raw || String(fallback || '').trim();
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
    return text(value, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const contexts = new Map();

function scopedKey(workspaceId, categoryName) {
    return text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
}

function buildWorkspacePathMap(workspaces) {
    const map = {};
    function visit(items, trail) {
        toArray(items).forEach(function (workspace) {
            const id = text(workspace && workspace.id, '');
            if (!id) return;
            const segment = {
                id: id,
                name: text(workspace.name || id, id),
                icon: text(workspace.icon, 'Tab')
            };
            const nextTrail = trail.concat([segment]);
            map[id] = nextTrail;
            visit(workspace.subTabs, nextTrail);
        });
    }
    visit(workspaces, []);
    return map;
}

function prepareContext(rawContext) {
    const context = rawContext && typeof rawContext === 'object' ? rawContext : {};
    const prepared = Object.assign({}, context, {
        knownWorkspaceIdsSet: new Set(toArray(context.knownWorkspaceIds).map(function (value) { return text(value, ''); })),
        workspacePathMap: buildWorkspacePathMap(context.workspaces),
        identifierMap: {},
        folderCache: {}
    });
    toArray(context.identifierDefinitions).forEach(function (definition) {
        const id = text(definition && definition.id, '');
        if (!id) return;
        prepared.identifierMap[id] = {
            id: id,
            label: text(definition.label || id, ''),
            description: text(definition.description, ''),
            quickLinks: toArray(definition.quickLinks)
        };
    });
    prepared.knownWorkspaceIdsSet.add('main');
    return prepared;
}

function getWorkspaceTrail(context, workspaceId) {
    const wsId = text(workspaceId, 'main');
    return toArray(context.workspacePathMap && context.workspacePathMap[wsId]).length
        ? context.workspacePathMap[wsId]
        : [{ id: wsId, name: wsId, icon: 'Tab' }];
}

function getWorkspaceLabel(context, workspaceId) {
    return getWorkspaceTrail(context, workspaceId).map(function (segment) {
        return text(segment.name || segment.id, '');
    }).filter(Boolean).join(' > ');
}

function getFolderNodes(context, workspaceId, categoryName) {
    const key = scopedKey(workspaceId, categoryName);
    const tree = context.bookmarkFolders && context.bookmarkFolders[key];
    return Array.isArray(tree && tree.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
}

function getFolderCache(context, workspaceId, categoryName) {
    const key = scopedKey(workspaceId, categoryName);
    if (context.folderCache[key]) return context.folderCache[key];
    const byId = {};
    getFolderNodes(context, workspaceId, categoryName).forEach(function (folder) {
        const id = text(folder && folder.id, '');
        if (id) byId[id] = folder;
    });
    context.folderCache[key] = byId;
    return byId;
}

function buildFolderPathLabel(context, workspaceId, categoryName, folderId) {
    const targetId = text(folderId, '');
    if (!targetId) return '';
    const byId = getFolderCache(context, workspaceId, categoryName);
    const parts = [];
    const seen = new Set();
    let cursorId = targetId;
    while (cursorId) {
        if (seen.has(cursorId)) break;
        seen.add(cursorId);
        const folder = byId[cursorId];
        if (!folder) break;
        parts.unshift(text(folder.name, folder.id));
        cursorId = text(folder.parentId, '');
    }
    return parts.length ? parts.join(' / ') : targetId;
}

function diagnoseFolder(context, workspaceId, categoryName, folderId) {
    const targetId = text(folderId, '');
    if (!targetId) {
        return {
            missingFolder: false,
            missingParent: false,
            folderUnreachable: false,
            folderParentBroken: false,
            folderIssueTypes: [],
            folderIssueReasons: []
        };
    }
    const byId = getFolderCache(context, workspaceId, categoryName);
    const issueTypes = [];
    const issueReasons = [];
    let cursorId = targetId;
    const seen = new Set();
    let missingFolder = false;
    let parentBroken = false;
    while (cursorId) {
        if (seen.has(cursorId)) {
            parentBroken = true;
            issueTypes.push('folder_parent_cycle');
            issueReasons.push('Folder parent chain contains a cycle.');
            break;
        }
        seen.add(cursorId);
        const folder = byId[cursorId];
        if (!folder) {
            missingFolder = cursorId === targetId;
            parentBroken = cursorId !== targetId;
            issueTypes.push(missingFolder ? 'missing_folder' : 'missing_parent_folder');
            issueReasons.push(missingFolder ? 'Folder parent no longer exists.' : 'Folder parent chain is broken.');
            break;
        }
        if (text(folder.parentId, '') === cursorId) {
            parentBroken = true;
            issueTypes.push('self_parent');
            issueReasons.push('Folder parent points to itself.');
            break;
        }
        cursorId = text(folder.parentId, '');
    }
    return {
        missingFolder: missingFolder,
        missingParent: missingFolder || parentBroken,
        folderUnreachable: parentBroken,
        folderParentBroken: parentBroken,
        folderIssueTypes: Array.from(new Set(issueTypes)),
        folderIssueReasons: Array.from(new Set(issueReasons))
    };
}

function buildBookmarkPath(context, link) {
    const workspaceId = text(link && link.workspace, 'main');
    const categoryName = text(link && link.category, 'Unsorted');
    const folderId = text(link && link.folderId, '');
    const folderLabel = buildFolderPathLabel(context, workspaceId, categoryName, folderId);
    const workspaceLabel = getWorkspaceLabel(context, workspaceId);
    const pathLabel = [workspaceLabel, categoryName, folderLabel].filter(Boolean).join(' > ');
    return {
        workspaceId: workspaceId,
        workspaceIds: [workspaceId],
        workspaceLabel: workspaceLabel,
        workspaceTrail: getWorkspaceTrail(context, workspaceId),
        categoryName: categoryName,
        folderId: folderId,
        folderLabel: folderLabel,
        linkId: text(link && link.id, ''),
        ambiguousWorkspace: false,
        pathLabel: pathLabel
    };
}

function createEntityLink(path, bookmarkId) {
    const workspaceId = encodeURIComponent(text(path && path.workspaceId, 'main'));
    const categoryName = encodeURIComponent(text(path && path.categoryName, 'Unsorted'));
    const folderId = text(path && path.folderId, '');
    const linkId = encodeURIComponent(text(bookmarkId, ''));
    if (!linkId) return '';
    return 'eve://workspace/' + workspaceId
        + '/card/' + categoryName
        + (folderId ? '/folder/' + encodeURIComponent(folderId) : '')
        + '/bookmark/' + linkId;
}

function buildIdentifierMeta(context, identifierIds) {
    const ids = toArray(identifierIds).map(function (value) { return text(value, ''); }).filter(Boolean);
    const labels = [];
    const descriptions = [];
    const quickLinkTargets = [];
    ids.forEach(function (id) {
        const definition = context.identifierMap && context.identifierMap[id];
        if (!definition) return;
        if (definition.label) labels.push(definition.label);
        if (definition.description) descriptions.push(definition.description);
        toArray(definition.quickLinks).forEach(function (target) {
            quickLinkTargets.push(text(target.categoryName, '') + ' ' + text(target.workspaceId, ''));
        });
    });
    return { ids: ids, labels: labels, descriptions: descriptions, quickLinkTargets: quickLinkTargets };
}

function defaultLibraryMeta() {
    return {
        linked: false,
        entryId: '',
        categoryName: '',
        workspaceId: '',
        title: '',
        summary: '',
        status: '',
        mediaType: '',
        author: '',
        genre: '',
        aliases: []
    };
}

function buildPayloadFromRawLink(context, link) {
    const path = buildBookmarkPath(context, link);
    const folderId = text(path.folderId || link.folderId, '');
    return {
        link: {
            id: text(link && link.id, ''),
            title: text(link && link.title, ''),
            name: text(link && link.name, ''),
            url: text(link && link.url, ''),
            notes: text(link && link.notes, ''),
            category: text(link && link.category, 'Unsorted'),
            done: !!(link && link.done),
            icon: text(link && link.icon, ''),
            coverImage: text(link && link.coverImage, ''),
            priority: text(link && link.priority, '')
        },
        recordId: 'bookmark::' + text(link && link.id, ''),
        path: path,
        library: (context.libraryByLinkId && context.libraryByLinkId[text(link && link.id, '')]) || defaultLibraryMeta(),
        groupMeta: (context.groupMetaByWorkspace && context.groupMetaByWorkspace[path.workspaceId]) || {},
        tags: toArray(link && link.tags).map(function (tag) { return text(tag, ''); }).filter(Boolean),
        folderId: folderId,
        folderDiagnostic: diagnoseFolder(context, path.workspaceId, path.categoryName, folderId),
        identifierMeta: buildIdentifierMeta(context, link && link.identifiers),
        relatedUrls: toArray(link && link.relatedUrls).map(function (entry) {
            return text(entry && typeof entry === 'object' ? entry.url : entry, '');
        }).filter(Boolean),
        entityLink: createEntityLink(path, text(link && link.id, '')),
        orphaned: !context.knownWorkspaceIdsSet.has(path.workspaceId)
    };
}

function deriveBookmarkBaseHealth(record) {
    const reasons = [];
    let stateLabel = 'healthy';
    const provenance = record && record.provenance ? record.provenance : {};
    if (provenance.orphaned) {
        stateLabel = 'broken';
        reasons.push('Workspace reference no longer exists.');
    }
    if (provenance.missingFolder) {
        stateLabel = 'broken';
        reasons.push('Folder parent no longer exists.');
    }
    if (provenance.folderUnreachable) {
        stateLabel = 'broken';
        reasons.push('Folder branch is unreachable from the card root.');
    }
    if (provenance.folderParentBroken) {
        stateLabel = 'broken';
        reasons.push('Folder parent chain is broken.');
    }
    toArray(provenance.folderIssueReasons).forEach(function (reason) {
        const normalizedReason = text(reason, '');
        if (normalizedReason) reasons.push(normalizedReason);
    });
    if (provenance.missingParent) {
        stateLabel = 'broken';
        reasons.push('Parent path is missing.');
    }
    if (!record.url) {
        if (stateLabel !== 'broken') stateLabel = 'warning';
        reasons.push('Bookmark is missing a URL.');
    }
    if (!record.path?.workspaceId || !record.path?.categoryName) {
        stateLabel = 'broken';
        reasons.push('Path metadata is incomplete.');
    }
    return { state: stateLabel, reasons: reasons };
}

function buildBookmarkRecordFromPayload(payload) {
    const link = payload && payload.link ? payload.link : {};
    const path = payload && payload.path ? payload.path : {};
    const library = payload && payload.library ? payload.library : {};
    const groupMeta = payload && payload.groupMeta ? payload.groupMeta : {};
    const folderDiagnostic = payload && payload.folderDiagnostic ? payload.folderDiagnostic : {};
    const identifierMeta = payload && payload.identifierMeta ? payload.identifierMeta : {};
    const relatedUrls = toArray(payload && payload.relatedUrls).map(function (value) { return text(value, ''); }).filter(Boolean);
    const tags = toArray(payload && payload.tags).map(function (value) { return text(value, ''); }).filter(Boolean);
    const record = {
        id: text(payload && payload.recordId, '') || ('bookmark::' + text(link.id, '')),
        type: 'bookmark',
        entityLink: text(payload && payload.entityLink, ''),
        title: text(link.title || link.name || link.url, 'Untitled'),
        url: text(link.url, ''),
        displayUrl: text(link.url, ''),
        description: text(link.notes || library.summary, ''),
        provider: 'bookmark',
        sourceCard: text(link.category || path.categoryName, 'Unsorted'),
        sourceIdentity: {
            kind: 'bookmark',
            linkId: text(link.id, '')
        },
        workspaceId: text(path.workspaceId, 'main'),
        workspaceIds: [text(path.workspaceId, 'main')],
        categoryName: text(path.categoryName, 'Unsorted'),
        path: path,
        updatedAt: 0,
        groupId: text(groupMeta.groupId, ''),
        groupName: text(groupMeta.groupName, ''),
        groupHidden: !!groupMeta.hidden,
        provenance: {
            kind: 'bookmark',
            linkId: text(link.id, ''),
            entityLink: text(payload && payload.entityLink, ''),
            done: !!link.done,
            orphaned: !!(payload && payload.orphaned),
            missingFolder: !!folderDiagnostic.missingFolder,
            missingParent: !!folderDiagnostic.missingParent,
            folderUnreachable: !!folderDiagnostic.folderUnreachable,
            folderParentBroken: !!folderDiagnostic.folderParentBroken,
            folderIssueTypes: toArray(folderDiagnostic.folderIssueTypes),
            folderIssueReasons: toArray(folderDiagnostic.folderIssueReasons),
            tags: tags,
            identifiers: toArray(identifierMeta.ids),
            identifierLabels: toArray(identifierMeta.labels),
            identifierDescriptions: toArray(identifierMeta.descriptions),
            identifierQuickLinkTargets: toArray(identifierMeta.quickLinkTargets),
            icon: text(link.icon, ''),
            coverImage: text(link.coverImage, ''),
            relatedUrls: relatedUrls,
            priority: text(link.priority, ''),
            libraryLinked: !!library.linked,
            libraryEntryId: text(library.entryId, '')
        },
        library: library
    };
    record.baseHealth = deriveBookmarkBaseHealth(record);
    record.searchableText = normalizeText([
        record.title,
        record.url,
        relatedUrls.join(' '),
        record.description,
        tags.join(' '),
        toArray(identifierMeta.ids).join(' '),
        toArray(identifierMeta.labels).join(' '),
        toArray(identifierMeta.descriptions).join(' '),
        toArray(identifierMeta.quickLinkTargets).join(' '),
        library.title,
        library.summary,
        library.author,
        library.genre,
        library.status,
        library.mediaType,
        toArray(library.aliases).join(' '),
        path.pathLabel
    ].join(' '));
    return record;
}

self.onmessage = function (event) {
    const data = event && event.data ? event.data : {};
    try {
        if (data.type === 'setBookmarkContext') {
            contexts.set(data.contextId, prepareContext(data.context));
            self.postMessage({ type: 'bookmarkContextReady', requestId: data.requestId, contextId: data.contextId });
            return;
        }
        if (data.type === 'buildBookmarkRecordsFromRaw') {
            const context = contexts.get(data.contextId);
            if (!context) throw new Error('Bookmark worker context missing');
            const records = toArray(data.links).map(function (link) {
                return buildBookmarkRecordFromPayload(buildPayloadFromRawLink(context, link));
            });
            self.postMessage({ type: 'bookmarkRecords', requestId: data.requestId, records: records });
            return;
        }
        if (data.type !== 'buildBookmarkRecords') return;
        self.postMessage({
            type: 'bookmarkRecords',
            requestId: data.requestId,
            records: toArray(data.items).map(buildBookmarkRecordFromPayload)
        });
    } catch (error) {
        self.postMessage({
            type: 'bookmarkRecordsError',
            requestId: data.requestId,
            message: error && error.message ? error.message : String(error)
        });
    }
};
