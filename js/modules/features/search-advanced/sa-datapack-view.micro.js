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

    function getPatchApi() {
        return window.EveOS?.NebulaJsonPatch
            || window.EveOS?.SearchAdvanced?.NebulaJsonPatch
            || window.NebulaJsonPatch
            || null;
    }

    function getLibraryMicroApi() {
        return window.EveOS?.SearchAdvanced?.DatapackViewMicroLibrary || null;
    }

    function normalizeIdentifierList(value) {
        const source = Array.isArray(value)
            ? value
            : String(value == null ? '' : value).split(',');
        const seen = new Set();
        return source.map(function (entry) {
            return String(entry == null ? '' : entry).trim();
        }).filter(function (entry) {
            if (!entry || seen.has(entry)) return false;
            seen.add(entry);
            return true;
        });
    }

    function normalizeTextList(value) {
        const source = Array.isArray(value)
            ? value
            : String(value == null ? '' : value).split(/[|,;]/);
        const seen = new Set();
        return source.map(function (entry) {
            return String(entry == null ? '' : entry).trim();
        }).filter(function (entry) {
            const key = entry.toLowerCase();
            if (!entry || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function formatOptionalScore(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(2).replace(/\.?0+$/, '');
    }

    function formatOptionalDate(value) {
        if (!value) return '';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function getMediaTypeLabel(mediaType) {
        const state = window.EveLibrary?.State;
        const normalized = state?.normalizeMediaType?.(mediaType) || String(mediaType || '').trim();
        return state?.getDataType?.(normalized)?.label || normalized || '';
    }

    function getLinkedLibrarySummary(link, workspaceId, categoryName) {
        const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(String(link?.id || ''));
        if (!linked?.entry) return null;
        const entry = linked.entry;
        const connection = linked.connection || {};
        const state = window.EveLibrary?.State;
        const fallbackType = state?.getCategoryDataType?.(connection.categoryName || categoryName, connection.workspace || workspaceId) || 'graphicNovels';
        const mediaTypes = state?.normalizeMediaTypes
            ? state.normalizeMediaTypes(entry.mediaTypes || entry.mediaType, fallbackType)
            : normalizeTextList(entry.mediaTypes || entry.mediaType || fallbackType);
        const progress = [];
        const graphicChapter = entry.graphicChapter ?? entry.chapter;
        const novelChapter = entry.novelChapter;
        if (Number(graphicChapter || 0) > 0) progress.push('Chapter ' + Number(graphicChapter || 0));
        if (Number(novelChapter || 0) > 0 && Number(novelChapter || 0) !== Number(graphicChapter || 0)) {
            progress.push('Novel Ch ' + Number(novelChapter || 0));
        }
        if (Number(entry.season || 0) > 0) progress.push('Season ' + Number(entry.season || 0));
        if (Number(entry.episode || 0) > 0) progress.push('Episode ' + Number(entry.episode || 0));
        const derived = entry.derivedRatings || {};
        return {
            linked: true,
            entryId: String(entry.id || ''),
            title: String(entry.title || link?.title || 'Library Entry'),
            workspaceId: String(connection.workspace || workspaceId || ''),
            categoryName: String(connection.categoryName || categoryName || ''),
            mediaTypes: mediaTypes.map(getMediaTypeLabel).filter(Boolean),
            mediaTypeIds: mediaTypes,
            status: String(entry.status || ''),
            sourceStatus: String(entry.sourceStatus || ''),
            progress,
            chapter: entry.chapter ?? '',
            graphicChapter: entry.graphicChapter ?? entry.chapter ?? '',
            novelChapter: entry.novelChapter ?? '',
            season: entry.season ?? '',
            episode: entry.episode ?? '',
            rating: String(entry.rating || ''),
            apiAverage: formatOptionalScore(derived.apiAverage10),
            apiWeighted: formatOptionalScore(derived.apiWeighted10),
            unified: formatOptionalScore(derived.hybrid10),
            confidence: formatOptionalScore(derived.confidence),
            sourceUrl: String(entry.sourceUrl || ''),
            imageUrl: String(entry.imageUrl || ''),
            author: normalizeTextList(entry.author),
            authorAltNames: normalizeTextList(entry.authorAltNames),
            artist: normalizeTextList(entry.artist),
            genre: normalizeTextList(entry.genre).slice(0, 5),
            tags: normalizeTextList(entry.tags).slice(0, 5),
            summary: String(entry.summary || ''),
            language: String(entry.language || ''),
            lastEdited: formatOptionalDate(entry.lastEdited || entry.dateAdded)
        };
    }

    function renderPatchPreview(panel, preview) {
        const target = panel?.querySelector?.('[data-nx-dv-diff="micro"]');
        if (!target) return;
        const rows = Array.isArray(preview?.previews) ? preview.previews : [];
        const errors = Array.isArray(preview?.errors) ? preview.errors : [];
        target.hidden = false;
        target.innerHTML = '<div class="nx-dv-diff-title">Card Internals Diff Preview</div>'
            + (rows.length
                ? rows.map(function (row) {
                    return '<div class="nx-dv-diff-row">'
                        + '<span>' + escapeHtml(row.op || 'patch') + '</span>'
                        + '<strong>' + escapeHtml(String(row.before || '').slice(0, 140)) + '</strong>'
                        + '<b>-></b>'
                        + '<strong>' + escapeHtml(String(row.after || '').slice(0, 140)) + '</strong>'
                        + '</div>';
                }).join('')
                : '<div class="nx-dv-diff-row">No pending micro changes.</div>')
            + (errors.length ? '<div class="nx-dv-diff-errors">' + errors.map(escapeHtml).join('<br>') + '</div>' : '');
    }

    function buildCardInternals(workspaceId, categoryName) {
        const scopedLinks = getScopedLinks(workspaceId, categoryName);
        const folders = getFolderNodes(workspaceId, categoryName);
        const bookmarkRows = scopedLinks.slice(0, MAX_MICRO_BOOKMARKS).map(function (link) {
            const folderId = normalizeFolderId(link?.folderId);
            const notes = String(link?.notes || '').trim();
            const identifierIds = normalizeIdentifierList(link?.identifiers);
            const library = getLinkedLibrarySummary(link, workspaceId, categoryName);
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
                identifierIds,
                notes,
                notesSummary: notes ? notes.slice(0, 180) : '',
                linkedLibrary: !!library,
                library
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
            + '<div class="nx-dv-diff" data-nx-dv-diff="micro" hidden></div>'
            + '<div class="nx-dv-micro-body">'
            + renderMicroFolders(state)
            + renderMicroBookmarks(state)
            + '</div>'
            + '<div class="nx-dv-micro-actions">'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="preview-micro" data-workspace-id="' + escapeHtml(state.workspaceId) + '" data-category-name="' + escapeHtml(state.categoryName) + '">Preview Diff</button>'
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
        const folderOptions = '<option value="">Root</option>' + state.folders.map(function (folder) {
            return '<option value="' + escapeHtml(folder.id) + '">' + escapeHtml(folder.path || folder.name) + '</option>';
        }).join('');
        return '<section class="nx-dv-micro-section"><div class="nx-dv-section-title">Bookmarks</div><div class="nx-dv-bookmark-list">'
            + state.bookmarks.map(function (bookmark) {
                return '<div class="nx-dv-bookmark-row" data-link-id="' + escapeHtml(bookmark.id) + '" data-entity-link="' + escapeHtml(bookmark.entityLink) + '">'
                    + '<label><span>Title</span><input type="text" data-nx-dv-field="bookmarkTitle" value="' + escapeHtml(bookmark.title) + '"></label>'
                    + '<label><span>URL</span><input type="url" data-nx-dv-field="bookmarkUrl" value="' + escapeHtml(bookmark.url) + '"></label>'
                    + '<label><span>Folder</span><select data-nx-dv-field="bookmarkFolderId" data-current-folder-id="' + escapeHtml(bookmark.folderId) + '">' + folderOptions.replace('value="' + escapeHtml(bookmark.folderId) + '"', 'value="' + escapeHtml(bookmark.folderId) + '" selected') + '</select></label>'
                    + '<label><span>Identifier IDs</span><input type="text" data-nx-dv-field="bookmarkIdentifiers" value="' + escapeHtml(bookmark.identifierIds.join(', ')) + '" placeholder="comma,separated,ids"></label>'
                    + (bookmark.linkedLibrary
                        ? '<label><span>Bookmark Notes</span><textarea data-nx-dv-field="bookmarkNotes" rows="3">' + escapeHtml(bookmark.notes) + '</textarea></label>'
                        : '<div class="nx-dv-bookmark-readonly-note">Bookmark notes are only exposed here when this bookmark is linked to Library.</div>')
                    + '<div class="nx-dv-bookmark-meta">'
                    + '<span title="' + escapeHtml(bookmark.entityLink) + '">JSON Link: ' + escapeHtml(bookmark.entityLink) + '</span>'
                    + '<span title="' + escapeHtml(bookmark.url) + '">' + escapeHtml(bookmark.url || 'No URL') + '</span>'
                    + '<span title="' + escapeHtml(bookmark.folderPath) + '">Folder: ' + escapeHtml(bookmark.folderPath) + '</span>'
                    + (bookmark.identifiers.length ? '<span>Labels: ' + escapeHtml(bookmark.identifiers.join(', ')) + '</span>' : '')
                    + (bookmark.linkedLibrary ? '<span>Library linked</span>' : '')
                    + (bookmark.notesSummary ? '<small>' + escapeHtml(bookmark.notesSummary) + '</small>' : '')
                    + '</div>'
                    + (getLibraryMicroApi()?.renderLibraryEditor
                        ? getLibraryMicroApi().renderLibraryEditor(bookmark.library, escapeHtml)
                        : '')
                    + '</div>';
            }).join('')
            + '</div></section>';
    }

    function closeCardInternals() {
        document.querySelectorAll('.nx-dv-micro-overlay').forEach(function (node) {
            node.remove();
        });
    }

    function saveMicroChanges(overlay, options) {
        options = options || {};
        const panel = overlay?.querySelector?.('.nx-dv-micro');
        if (!panel) return false;
        const patchApi = getPatchApi();
        if (!patchApi?.buildPatch || !patchApi?.buildTransaction || !patchApi?.applyTransaction) {
            if (typeof showToast === 'function') showToast('Nebula JSON patch system is not loaded.', 'error');
            return false;
        }
        const liveLinks = getLiveLinks();
        const patches = [];
        panel.querySelectorAll('.nx-dv-bookmark-row[data-link-id]').forEach(function (row) {
            const linkId = String(row.getAttribute('data-link-id') || '').trim();
            const title = String(row.querySelector('[data-nx-dv-field="bookmarkTitle"]')?.value || '').trim();
            const url = String(row.querySelector('[data-nx-dv-field="bookmarkUrl"]')?.value || '').trim();
            const notesField = row.querySelector('[data-nx-dv-field="bookmarkNotes"]');
            const notes = String(notesField?.value || '');
            const folderId = normalizeFolderId(row.querySelector('[data-nx-dv-field="bookmarkFolderId"]')?.value || '');
            const identifiers = normalizeIdentifierList(row.querySelector('[data-nx-dv-field="bookmarkIdentifiers"]')?.value || '');
            const link = liveLinks.find(function (candidate) {
                return String(candidate?.id || '') === linkId;
            });
            if (!link || !title) return;
            const target = row.getAttribute('data-entity-link') || createEntityLink({
                type: 'bookmark',
                workspaceId: link.workspace,
                categoryName: link.category,
                folderId: link.folderId,
                bookmarkId: link.id
            });
            if (String(link.title || '') !== title) {
                patches.push(patchApi.buildPatch('rename-bookmark', target, { title }, {
                    source: 'nexus-datapack-view-micro',
                    reason: 'micro-bookmark-title'
                }));
            }
            if (String(link.url || '') !== url) {
                patches.push(patchApi.buildPatch('set-bookmark-url', target, { url }, {
                    source: 'nexus-datapack-view-micro',
                    reason: 'micro-bookmark-url'
                }));
            }
            if (notesField && String(link.notes || '') !== notes) {
                patches.push(patchApi.buildPatch('set-bookmark-notes', target, { notes }, {
                    source: 'nexus-datapack-view-micro',
                    reason: 'micro-bookmark-notes'
                }));
            }
            if (normalizeIdentifierList(link.identifiers).join('\n') !== identifiers.join('\n')) {
                patches.push(patchApi.buildPatch('set-bookmark-identifiers', target, { identifiers }, {
                    source: 'nexus-datapack-view-micro',
                    reason: 'micro-bookmark-identifiers'
                }));
            }
            if (normalizeFolderId(link.folderId) !== folderId) {
                patches.push(patchApi.buildPatch('set-bookmark-folder', target, { folderId }, {
                    source: 'nexus-datapack-view-micro',
                    reason: 'micro-bookmark-folder'
                }));
            }
            const libraryPatch = getLibraryMicroApi()?.collectLibraryPatch?.(row, patchApi, target);
            if (libraryPatch) patches.push(libraryPatch);
        });
        if (!patches.length) {
            if (options.previewOnly) {
                renderPatchPreview(panel, { previews: [], errors: [] });
                return true;
            }
            if (typeof showToast === 'function') showToast('No micro changes to save.', 'info');
            return false;
        }
        const transaction = patchApi.buildTransaction(patches, {
            source: 'nexus-datapack-view-micro',
            reason: 'card internals save'
        });
        if (options.previewOnly) {
            const preview = patchApi.previewTransaction(transaction);
            renderPatchPreview(panel, preview);
            if (!preview.ok && typeof showToast === 'function') {
                showToast('Micro diff has validation issues.', 'warning');
            }
            return preview.ok;
        }
        const result = patchApi.applyTransaction(transaction, {
            immediate: true,
            forceRender: true,
            source: 'nexus-datapack-view-micro'
        });
        window.EveOS.SearchAdvanced._lastDatapackMicroTransaction = { transaction, result };
        if (!result.ok) {
            if (typeof showToast === 'function') {
                showToast('Micro changes blocked: ' + (result.errors || []).join(', '), 'error');
            }
            return false;
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
