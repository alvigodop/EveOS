window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCoreModules = window.EveLibrary.ConnectionsCoreModules || {};

(function () {
    window.EveLibrary.ConnectionsCoreModules.createActionsSync = function createActionsSync(Core) {
        function getRatings() {
            return window.EveLibrary?.Ratings;
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
            });
            if (changed) {
                Core.saveLinks();
            }
            linked.forEach(conn => Core.emitLinkedEntryUpdated(conn.linkId, normalizedCategory, entry, conn.workspace));
        }

        function moveLinkedEntryToScope(linkId, nextCategoryName, nextWorkspaceId) {
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
            Core.saveConnections();
            if (entry) window.EveLibrary.Storage?.saveLibrary?.();
            return true;
        }

        function syncFromLink(linkId) {
            let conn = Core.findConnectionByLinkId(linkId);
            if (!conn) return;
            const link = Core.findLinkById(linkId);
            if (!link) return;

            const currentWorkspace = Core.normalizeWorkspaceId(conn.workspace);
            const currentCategory = Core.normalizeCategoryName(conn.categoryName);
            const nextWorkspace = Core.normalizeWorkspaceId(link.workspace || Core.getConfig().activeWorkspace || currentWorkspace);
            const nextCategory = Core.normalizeCategoryName(link.category || currentCategory);
            if (nextCategory !== currentCategory || nextWorkspace !== currentWorkspace) {
                moveLinkedEntryToScope(linkId, nextCategory, nextWorkspace);
                conn = Core.findConnectionByLinkId(linkId);
                if (!conn) return;
            }

            const found = Core.findEntryByConnection(conn);
            if (!found?.entry) return;
            const entry = found.entry;
            entry.title = link.title || entry.title;
            if (link.url) entry.sourceUrl = link.url;
            entry.lastEdited = new Date().toISOString();
            window.EveLibrary.Storage?.saveLibrary?.();
            Core.emitLinkedEntryUpdated(linkId, found.categoryName, entry, conn.workspace);
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
            getLinkedEntry,
            updateLinkedEntry,
            moveLinkedEntryToScope,
            moveLinkedEntryToCategory
        };
    };
})();
