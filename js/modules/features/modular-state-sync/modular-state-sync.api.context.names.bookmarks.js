// --- Selective Gemini context: bookmark and folder tree formatter ---
(function () {
    if (window.EveGeminiSelectiveBookmarks) return;

    function create(deps) {
        const {
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
        } = deps;

        function compactUrl(value, max = 120) {
            const raw = text(value, '');
            if (!raw) return '';
            let normalized = raw;
            try {
                const parsed = new URL(raw);
                ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref'].forEach((key) => {
                    parsed.searchParams.delete(key);
                });
                parsed.hash = '';
                normalized = parsed.toString();
            } catch { /* retain non-standard local/custom URLs */ }
            return normalized.length > max ? normalized.slice(0, max - 3) + '...' : normalized;
        }

        function firstValue(source, keys) {
            for (const key of keys) {
                const value = source?.[key];
                if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
            }
            return '';
        }

        function identifierLabels(link) {
            const ids = []
                .concat(Array.isArray(link?.identifiers) ? link.identifiers : [])
                .concat(Array.isArray(link?.identifierIds) ? link.identifierIds : [])
                .concat(Array.isArray(link?.bookmarkIdentifiers) ? link.bookmarkIdentifiers : [])
                .map((item) => text(item, ''))
                .filter(Boolean);
            const definitions = Array.isArray(getConfig()?.bookmarkIdentifiers)
                ? getConfig().bookmarkIdentifiers
                : [];
            const labels = new Map(definitions.map((item) => [
                text(item?.id, '').toLowerCase(),
                text(item?.label || item?.name, item?.id)
            ]));
            return Array.from(new Set(ids.map((id) => labels.get(id.toLowerCase()) || id))).slice(0, 8);
        }

        function relatedUrls(link) {
            return []
                .concat(Array.isArray(link?.relatedUrls) ? link.relatedUrls : [])
                .concat(Array.isArray(link?.additionalUrls) ? link.additionalUrls : [])
                .map((item) => compactUrl(typeof item === 'string' ? item : item?.url, 100))
                .filter(Boolean)
                .slice(0, 3);
        }

        // The "Add to Library" data of a linked bookmark lives on the LIBRARY ENTRY, not the
        // link — without this lookup the contents layer shipped url/identifier info but lost
        // the library side (status, chapters, ratings, author, summary) entirely.
        function linkedLibraryEntry(link) {
            try {
                const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(text(link?.id, ''));
                return linked && linked.entry ? linked.entry : null;
            } catch { return null; }
        }

        function compactQuote(value, max) {
            const normalized = text(value, '').replace(/\s+/g, ' ');
            if (!normalized) return '';
            return '"' + (normalized.length > max ? normalized.slice(0, max - 3) + '...' : normalized) + '"';
        }

        function bookmarkDetailLine(link) {
            const entry = linkedLibraryEntry(link);
            const parts = [text(link?.title || link?.url, '(Untitled)')];
            const url = compactUrl(link?.url || link?.href, 120);
            if (url) parts.push(url);
            const identifiers = identifierLabels(link);
            if (identifiers.length) parts.push('labels: ' + identifiers.join(', '));
            const status = text(link?.status || link?.readingStatus || link?.mediaStatus, '')
                || (entry ? text(entry.status, '') : '');
            if (status) parts.push('status: ' + status);
            const progressValue = (keys) => firstValue(link, keys) || (entry ? firstValue(entry, keys) : '');
            const progress = [
                ['chapter', progressValue(['chapter', 'graphicChapter'])],
                ['novel chapter', progressValue(['novelChapter'])],
                ['volume', progressValue(['volume'])],
                ['season', progressValue(['season'])],
                ['episode', progressValue(['episode'])],
                ['progress', progressValue(['progress', 'progressUnits'])]
            ].filter((item) => item[1]);
            progress.forEach((item) => parts.push(item[0] + ': ' + item[1]));
            if (link?.done) parts.push('done');
            if (text(link?.priority, '')) parts.push('priority: ' + link.priority);
            const rating = firstValue(link, ['rating', 'personalRating'])
                || (entry ? firstValue(entry, ['rating', 'personalRating']) : '');
            if (rating) parts.push('rating: ' + rating);
            const notes = compactQuote(link?.personalNotes || link?.notes, 140);
            if (notes) parts.push('notes: ' + notes);
            if (entry) {
                parts.push('library-linked');
                const author = text(entry.author || entry.artist, '');
                if (author) parts.push('author: ' + author);
                const genres = (Array.isArray(entry.genres) ? entry.genres : (Array.isArray(entry.genre) ? entry.genre : [text(entry.genre, '')]))
                    .map((genre) => text(genre, ''))
                    .filter(Boolean);
                if (genres.length) parts.push('genres: ' + genres.slice(0, 5).join(', '));
                const librarySummary = compactQuote(entry.summary || entry.description || entry.notes, 140);
                if (librarySummary) parts.push('library summary: ' + librarySummary);
            }
            const tagSet = []
                .concat(Array.isArray(link?.tags) ? link.tags : [])
                .concat(entry && Array.isArray(entry.tags) ? entry.tags : [])
                .map((tag) => text(tag, ''))
                .filter(Boolean);
            const tags = Array.from(new Set(tagSet));
            if (tags.length) parts.push('tags: ' + tags.slice(0, 6).join(', '));
            const mirrors = relatedUrls(link);
            if (mirrors.length) parts.push('related: ' + mirrors.join(', '));
            const updated = firstValue(link, ['updatedAt', 'lastEdited', 'dateModified']);
            if (updated) parts.push('updated: ' + updated);
            return parts.join(' | ');
        }

        function folderMaps(tree) {
            const nodes = Array.isArray(tree) ? tree : (tree?.nodes || tree?.folders || []);
            const byId = new Map();
            const children = new Map();
            (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                const id = text(node?.id, '');
                if (id && !byId.has(id)) {
                    byId.set(id, {
                        id,
                        name: text(node?.name || node?.title, 'Folder'),
                        parentId: text(node?.parentId, '')
                    });
                }
            });
            byId.forEach((node) => {
                const parent = byId.has(node.parentId) && node.parentId !== node.id ? node.parentId : '';
                if (!children.has(parent)) children.set(parent, []);
                children.get(parent).push(node);
            });
            children.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
            return { byId, children };
        }

        // maxSubDepth: how many sub-tab levels to descend (0 = the scope tab only,
        // Infinity = the whole sub^N chain).
        function buildBookmarksAndFolders(roots, scope, lineFor, maxSubDepth) {
            const depthLimit = typeof maxSubDepth === 'number' ? maxSubDepth : Infinity;
            const renderLine = typeof lineFor === 'function'
                ? lineFor
                : (link) => text(link?.title || link?.url, '(Untitled)');
            const idSet = new Set();
            roots.forEach((root) => branchIds(root, idSet));
            const folderTrees = getFolderTrees();
            const cards = cardsByWorkspace(idSet);
            const linksByCard = new Map();
            getLinks().forEach((link) => {
                const workspaceId = text(link?.workspace, 'main');
                if (!idSet.has(workspaceId)) return;
                const key = workspaceId + '::' + text(link?.category, 'Unsorted');
                if (!linksByCard.has(key)) linksByCard.set(key, []);
                linksByCard.get(key).push(link);
            });
            const lines = [];
            let bookmarkCount = 0;
            let folderCount = 0;

            function emitFolder(folderId, maps, byFolder, indent) {
                (maps.children.get(folderId) || []).forEach((folder) => {
                    lines.push(indent + '[folder] ' + folder.name + ':');
                    folderCount += 1;
                    (byFolder.get(folder.id) || []).forEach((link) => {
                        lines.push(indent + '  - ' + renderLine(link));
                        bookmarkCount += 1;
                    });
                    emitFolder(folder.id, maps, byFolder, indent + '  ');
                });
            }

            function visit(node, parentPath, depth) {
                if (!isNodeActive(node)) return;
                const name = tabName(node);
                if (text(node?.linkedTo, '')) {
                    lines.push(tabContextLabel(node, parentPath) + ' is a shortcut to tab "'
                        + shortcutTargetName(node) + '" - its bookmarks are listed under that tab.');
                    return;
                }
                const workspaceId = text(node?.id, '');
                let names = Array.from(cards.get(workspaceId) || []).sort();
                if (scope.scope === 'card'
                    && text(scope.categoryName, '')
                    && workspaceId === text(scope.workspaceId, '')) {
                    names = names.filter((cardName) => cardName === scope.categoryName);
                }
                let printedAny = false;
                names.forEach((cardName) => {
                    const key = workspaceId + '::' + cardName;
                    const cardLinks = linksByCard.get(key) || [];
                    const maps = folderMaps(folderTrees[key] || {});
                    if (!cardLinks.length && !maps.byId.size) return;
                    printedAny = true;
                    lines.push(tabContextLabel(node, parentPath) + ' > card "' + cardName + '":');
                    const byFolder = new Map();
                    cardLinks.forEach((link) => {
                        const folderId = text(link?.folderId, '');
                        const target = maps.byId.has(folderId) ? folderId : '';
                        if (!byFolder.has(target)) byFolder.set(target, []);
                        byFolder.get(target).push(link);
                    });
                    (byFolder.get('') || []).forEach((link) => {
                        lines.push('  - ' + renderLine(link));
                        bookmarkCount += 1;
                    });
                    emitFolder('', maps, byFolder, '  ');
                });
                if (!printedAny) {
                    lines.push(tabContextLabel(node, parentPath) + ' has no bookmarks');
                }
                if (depth >= depthLimit) return;
                const childPath = parentPath ? parentPath + ' > ' + name : name;
                (Array.isArray(node.subTabs) ? node.subTabs : []).forEach((child) => visit(child, childPath, depth + 1));
            }

            roots.forEach((root) => visit(root, '', 0));
            return { body: lines.join('\n'), count: bookmarkCount, folderCount };
        }

        return { bookmarkDetailLine, buildBookmarksAndFolders };
    }

    window.EveGeminiSelectiveBookmarks = { create };
})();
