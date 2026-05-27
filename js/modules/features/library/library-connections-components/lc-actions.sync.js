window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCoreModules = window.EveLibrary.ConnectionsCoreModules || {};

(function () {
    window.EveLibrary.ConnectionsCoreModules.createActionsSync = function createActionsSync(Core) {
        function getRatings() {
            return window.EveLibrary?.Ratings;
        }

        function hasExplicitBookmarkCover(link) {
            if (!link || typeof link !== 'object') return false;
            const coverImage = String(link.coverImage || '').trim();
            if (coverImage) return true;
            if (Array.isArray(link.coverImages)) {
                return link.coverImages.some((value) => String(value || '').trim());
            }
            return false;
        }

        function syncFromLibraryEntry(categoryName, entry, workspaceId) {
            if (!entry) return;
            const normalizedCategory = Core.normalizeCategoryName(categoryName);
            const normalizedEntryId = String(entry.id);
            const normalizedWorkspace = String(workspaceId || '').trim();
            const linked = Core.connections.filter(item => {
                if (Core.normalizeCategoryName(item.categoryName) !== normalizedCategory) return false;
                if (String(item.libraryEntryId) !== normalizedEntryId) return false;
                if (!normalizedWorkspace) return true;
                return Core.normalizeWorkspaceId(item.workspace) === Core.normalizeWorkspaceId(normalizedWorkspace);
            });
            if (linked.length === 0) return;

            const allLinks = Core.getLinks();
            let changed = false;
            linked.forEach(conn => {
                const link = allLinks.find(item => String(item.id) === String(conn.linkId));
                if (!link) return;
                if (link.title !== entry.title) {
                    link.title = entry.title;
                    changed = true;
                }
                const sourceUrl = (entry.sourceUrl || '').trim();
                if (sourceUrl && link.url !== sourceUrl) {
                    link.url = sourceUrl;
                    changed = true;
                }
                const coverImage = String(entry.image || entry.imageUrl || '').trim();
                if (coverImage) {
                    if (link.coverImage !== coverImage) {
                        link.coverImage = coverImage;
                        changed = true;
                    }
                } else if (link.coverImage) {
                    delete link.coverImage;
                    changed = true;
                }
            });
            if (changed) {
                Core.saveLinks();
            }
            linked.forEach(conn => Core.emitLinkedEntryUpdated(conn.linkId, normalizedCategory, entry, conn.workspace));
        }

        function moveLinkedEntryToScope(linkId, nextCategoryName, nextWorkspaceId, options = {}) {
            const conn = Core.findConnectionByLinkId(linkId);
            if (!conn) return false;
            const categoryName = Core.normalizeCategoryName(nextCategoryName);
            const workspaceId = Core.normalizeWorkspaceId(nextWorkspaceId || conn.workspace);
            const currentCategory = Core.normalizeCategoryName(conn.categoryName);
            const currentWorkspace = Core.normalizeWorkspaceId(conn.workspace);
            if (currentCategory === categoryName && currentWorkspace === workspaceId) return true;

            const state = window.EveLibrary.State;
            if (!state) return false;

            const source = state.getCategoryLibrary(currentCategory, currentWorkspace);
            let entry = (source.entries || []).find(item => String(item?.id) === String(conn.libraryEntryId)) || null;
            if (!entry) {
                entry = Core.findEntryAcrossLibraries(conn.libraryEntryId);
            }

            const target = state.getCategoryLibrary(categoryName, workspaceId);
            if (entry) {
                source.entries = (source.entries || []).filter(item => String(item?.id) !== String(entry.id));
                if (!Array.isArray(target.entries)) target.entries = [];
                const alreadyInTarget = target.entries.some(item => String(item?.id) === String(entry.id));
                if (!alreadyInTarget) target.entries.push(entry);
            }

            conn.categoryName = categoryName;
            conn.workspace = workspaceId;
            if (!options.deferPersist) {
                Core.saveConnections();
                if (entry) window.EveLibrary.Storage?.saveLibrary?.();
            }
            return true;
        }

        function syncFromLink(linkId, options = {}) {
            let conn = Core.findConnectionByLinkId(linkId);
            if (!conn) return { ok: false, changed: false, moved: false };
            const link = Core.findLinkById(linkId);
            if (!link) return { ok: false, changed: false, moved: false };

            const currentWorkspace = Core.normalizeWorkspaceId(conn.workspace);
            const currentCategory = Core.normalizeCategoryName(conn.categoryName);
            const nextWorkspace = Core.normalizeWorkspaceId(link.workspace || Core.getConfig().activeWorkspace || currentWorkspace);
            const nextCategory = Core.normalizeCategoryName(link.category || currentCategory);
            let moved = false;
            if (nextCategory !== currentCategory || nextWorkspace !== currentWorkspace) {
                moved = moveLinkedEntryToScope(linkId, nextCategory, nextWorkspace, options) !== false;
                conn = Core.findConnectionByLinkId(linkId);
                if (!conn) return { ok: false, changed: moved, moved };
            }

            const found = Core.findEntryByConnection(conn);
            if (!found?.entry) return { ok: true, changed: moved, moved };
            const entry = found.entry;
            let entryChanged = false;
            if (link.title && entry.title !== link.title) {
                entry.title = link.title;
                entryChanged = true;
            }
            if (link.url && entry.sourceUrl !== link.url) {
                entry.sourceUrl = link.url;
                entryChanged = true;
            }
            const coverImage = String(link.coverImage || '').trim();
            if (coverImage && entry.image !== coverImage) {
                entry.image = coverImage;
                entryChanged = true;
            } else if (!coverImage && !hasExplicitBookmarkCover(link) && !String(entry.image || entry.imageUrl || '').trim() && entry.image) {
                delete entry.image;
                entryChanged = true;
            }
            if (moved || entryChanged) {
                entry.lastEdited = new Date().toISOString();
            }
            const changed = moved || entryChanged;
            if (changed && !options.deferPersist) {
                window.EveLibrary.Storage?.saveLibrary?.();
            }
            if (!options.deferEvents) {
                Core.emitLinkedEntryUpdated(linkId, found.categoryName, entry, conn.workspace);
            }
            return { ok: true, changed, moved };
        }

        function syncFromLinks(linkIds, options = {}) {
            const ids = Array.isArray(linkIds) ? Array.from(new Set(linkIds.map(id => String(id || '')).filter(Boolean))) : [];
            let changedCount = 0;
            let movedCount = 0;

            const syncOne = (linkId) => {
                const result = syncFromLink(linkId, {
                    ...options,
                    deferPersist: true
                });
                if (result?.changed) changedCount += 1;
                if (result?.moved) movedCount += 1;
            };

            const persistChanges = () => {
                if (options.deferPersist || !(changedCount || movedCount)) return;
                if (movedCount) Core.saveConnections();
                window.EveLibrary.Storage?.saveLibrary?.();
            };

            if (options.async && ids.length > 1) {
                const chunkSize = Math.max(1, Number(options.chunkSize || 8) || 8);
                let cursor = 0;
                const schedule = (callback) => {
                    if (typeof window.requestIdleCallback === 'function') {
                        window.requestIdleCallback(callback, { timeout: Math.max(250, Number(options.timeoutMs || 900) || 900) });
                    } else {
                        setTimeout(callback, Math.max(0, Number(options.yieldMs || 16) || 16));
                    }
                };
                const runChunk = () => {
                    const end = Math.min(cursor + chunkSize, ids.length);
                    for (; cursor < end; cursor += 1) {
                        syncOne(ids[cursor]);
                    }
                    if (cursor < ids.length) {
                        schedule(runChunk);
                        return;
                    }
                    persistChanges();
                };
                schedule(runChunk);
                return {
                    ok: true,
                    scheduled: true,
                    checked: ids.length,
                    changed: 0,
                    moved: 0
                };
            }

            ids.forEach(syncOne);
            persistChanges();
            return {
                ok: true,
                checked: ids.length,
                changed: changedCount,
                moved: movedCount
            };
        }

        function getLinkedEntry(linkId) {
            const conn = Core.findConnectionByLinkId(linkId);
            if (!conn) return null;
            const found = Core.findEntryByConnection(conn);
            if (!found?.entry) return null;
            return {
                connection: { ...conn, categoryName: found.categoryName },
                entry: JSON.parse(JSON.stringify(found.entry))
            };
        }

        function updateLinkedEntry(linkId, patch) {
            const conn = Core.findConnectionByLinkId(linkId);
            if (!conn || !patch || typeof patch !== 'object') return false;
            const found = Core.findEntryByConnection(conn);
            if (!found?.entry) return false;
            Object.assign(found.entry, patch);
            const Ratings = getRatings();
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(found.entry);
            }
            found.entry.lastEdited = new Date().toISOString();
            window.EveLibrary.Storage?.saveLibrary?.();
            syncFromLibraryEntry(found.categoryName, found.entry, conn.workspace);
            return true;
        }

        function moveLinkedEntryToCategory(linkId, nextCategoryName) {
            const conn = Core.findConnectionByLinkId(linkId);
            if (!conn) return false;
            return moveLinkedEntryToScope(linkId, nextCategoryName, conn.workspace);
        }

        return {
            syncFromLibraryEntry,
            syncFromLink,
            syncFromLinks,
            getLinkedEntry,
            updateLinkedEntry,
            moveLinkedEntryToScope,
            moveLinkedEntryToCategory
        };
    };
})();
