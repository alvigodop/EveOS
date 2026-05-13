window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.DatapackViewMicro) return;

    function create(deps) {
        const {
            MAX_MICRO_BOOKMARKS,
            escapeHtml,
            normalizeWorkspaceId,
            normalizeCategoryName,
            normalizeFolderId,
            getScopedLinks,
            getFolderNodes,
            getFolderPathLabel,
            getIdentifierLabels,
            getLiveLinks,
            setLiveLinks,
            resolveCurrentScope,
            renderGateway
        } = deps;

    function createEntityLink(source) {
        const api = window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
        return api && typeof api.createLink === 'function' ? api.createLink(source) : '';
    }

    function buildCardInternals(workspaceId, categoryName) {
        const scopedLinks = getScopedLinks(workspaceId, categoryName);
        const folders = getFolderNodes(workspaceId, categoryName);
        const bookmarkRows = scopedLinks.slice(0, MAX_MICRO_BOOKMARKS).map(function (link) {
            const folderId = normalizeFolderId(link?.folderId);
            const notes = String(link?.notes || '').trim();
            return {
                id: String(link?.id || ''),
                title: String(link?.title || 'Untitled'),
                url: String(link?.url || ''),
                entityLink: createEntityLink({
                    type: 'bookmark',
                    workspaceId,
                    categoryName,
                    folderId,
                    bookmarkId: String(link?.id || '')
                }),
                folderId,
                folderPath: getFolderPathLabel(workspaceId, categoryName, folderId),
                identifiers: getIdentifierLabels(link),
                notesSummary: notes ? notes.slice(0, 180) : '',
                linkedLibrary: !!window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(String(link?.id || ''))?.entry
            };
        });
        return {
            workspaceId: normalizeWorkspaceId(workspaceId),
            categoryName: normalizeCategoryName(categoryName),
            entityLink: createEntityLink({
                type: 'card',
                workspaceId: normalizeWorkspaceId(workspaceId),
                categoryName: normalizeCategoryName(categoryName)
            }),
            counts: {
                bookmarks: scopedLinks.length,
                bookmarksShown: bookmarkRows.length,
                omittedBookmarks: Math.max(0, scopedLinks.length - bookmarkRows.length),
                folders: folders.length
            },
            folders: folders.map(function (folder) {
                const id = normalizeFolderId(folder?.id);
                return {
                    id,
                    name: String(folder?.name || 'Folder'),
                    entityLink: createEntityLink({
                        type: 'folder',
                        workspaceId,
                        categoryName,
                        folderId: id
                    }),
                    parentId: normalizeFolderId(folder?.parentId),
                    path: getFolderPathLabel(workspaceId, categoryName, id),
                    bookmarks: scopedLinks.filter(function (link) {
                        return normalizeFolderId(link?.folderId) === id;
                    }).length
                };
            }),
            bookmarks: bookmarkRows
        };
    }

    function openCardInternals(workspaceId, categoryName) {
        closeCardInternals();
        const state = buildCardInternals(workspaceId, categoryName);
        const overlay = document.createElement('div');
        overlay.className = 'nx-dv-micro-overlay';
        overlay.innerHTML = ''
            + '<div class="nx-dv-micro" role="dialog" aria-modal="true" aria-label="Card internals">'
            + '<div class="nx-dv-micro-head">'
            + '<div><div class="nx-dv-kicker">Card Internals</div><h3>' + escapeHtml(state.categoryName) + '</h3></div>'
            + '<button type="button" class="nx-dv-close" data-nx-dv-action="close-micro">X</button>'
            + '</div>'
            + '<div class="nx-dv-json-link" title="' + escapeHtml(state.entityLink) + '">JSON Link: ' + escapeHtml(state.entityLink) + '</div>'
            + '<div class="nx-dv-summary">'
            + '<span>' + state.counts.bookmarks + ' bookmarks</span>'
            + '<span>' + state.counts.folders + ' folders</span>'
            + '<span>' + state.counts.omittedBookmarks + ' omitted by safety cap</span>'
            + '</div>'
            + '<div class="nx-dv-micro-body">'
            + renderMicroFolders(state)
            + renderMicroBookmarks(state)
            + '</div>'
            + '<div class="nx-dv-micro-actions">'
            + '<button type="button" class="nx-dv-btn nx-dv-primary" data-nx-dv-action="save-micro" data-workspace-id="' + escapeHtml(state.workspaceId) + '" data-category-name="' + escapeHtml(state.categoryName) + '">Save</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="revert-micro" data-workspace-id="' + escapeHtml(state.workspaceId) + '" data-category-name="' + escapeHtml(state.categoryName) + '">Revert</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="close-micro">Cancel</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
        return state;
    }

    function renderMicroFolders(state) {
        if (!state.folders.length) return '<div class="nx-dv-empty">No folders in this card.</div>';
        return '<section class="nx-dv-micro-section"><div class="nx-dv-section-title">Folders</div><div class="nx-dv-folder-list">'
            + state.folders.map(function (folder) {
                return '<div class="nx-dv-folder-row">'
                    + '<strong>' + escapeHtml(folder.name) + '</strong>'
                    + '<span title="' + escapeHtml(folder.path) + '">' + escapeHtml(folder.path) + '</span>'
                    + '<small title="' + escapeHtml(folder.entityLink) + '">JSON Link: ' + escapeHtml(folder.entityLink) + '</small>'
                    + '<small>' + folder.bookmarks + ' bookmarks</small>'
                    + '</div>';
            }).join('')
            + '</div></section>';
    }

    function renderMicroBookmarks(state) {
        if (!state.bookmarks.length) return '<div class="nx-dv-empty">No bookmarks in this card.</div>';
        return '<section class="nx-dv-micro-section"><div class="nx-dv-section-title">Bookmarks</div><div class="nx-dv-bookmark-list">'
            + state.bookmarks.map(function (bookmark) {
                return '<div class="nx-dv-bookmark-row" data-link-id="' + escapeHtml(bookmark.id) + '">'
                    + '<label><span>Title</span><input type="text" data-nx-dv-field="bookmarkTitle" value="' + escapeHtml(bookmark.title) + '"></label>'
                    + '<div class="nx-dv-bookmark-meta">'
                    + '<span title="' + escapeHtml(bookmark.entityLink) + '">JSON Link: ' + escapeHtml(bookmark.entityLink) + '</span>'
                    + '<span title="' + escapeHtml(bookmark.url) + '">' + escapeHtml(bookmark.url || 'No URL') + '</span>'
                    + '<span title="' + escapeHtml(bookmark.folderPath) + '">Folder: ' + escapeHtml(bookmark.folderPath) + '</span>'
                    + (bookmark.identifiers.length ? '<span>Labels: ' + escapeHtml(bookmark.identifiers.join(', ')) + '</span>' : '')
                    + (bookmark.linkedLibrary ? '<span>Library linked</span>' : '')
                    + (bookmark.notesSummary ? '<small>' + escapeHtml(bookmark.notesSummary) + '</small>' : '')
                    + '</div>'
                    + '</div>';
            }).join('')
            + '</div></section>';
    }

    function closeCardInternals() {
        document.querySelectorAll('.nx-dv-micro-overlay').forEach(function (node) {
            node.remove();
        });
    }

    function saveMicroChanges(overlay) {
        const panel = overlay?.querySelector?.('.nx-dv-micro');
        if (!panel) return false;
        const liveLinks = getLiveLinks();
        let changed = 0;
        panel.querySelectorAll('.nx-dv-bookmark-row[data-link-id]').forEach(function (row) {
            const linkId = String(row.getAttribute('data-link-id') || '').trim();
            const title = String(row.querySelector('[data-nx-dv-field="bookmarkTitle"]')?.value || '').trim();
            const link = liveLinks.find(function (candidate) {
                return String(candidate?.id || '') === linkId;
            });
            if (!link || !title || String(link.title || '') === title) return;
            link.title = title;
            window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
            changed += 1;
        });
        if (!changed) {
            if (typeof showToast === 'function') showToast('No micro changes to save.', 'info');
            return false;
        }
        setLiveLinks(liveLinks);
        if (typeof saveData === 'function') {
            saveData({
                immediate: true,
                forceRender: true,
                source: 'nexus-datapack-view-micro-data',
                meta: { changed }
            });
        }
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof showToast === 'function') showToast('Card internals saved.', 'success');
        closeCardInternals();
        renderGateway(resolveCurrentScope());
        return true;
    }
        return {
            openCardInternals,
            closeCardInternals,
            saveMicroChanges
        };
    }

    ns.DatapackViewMicro = { create };
})();
