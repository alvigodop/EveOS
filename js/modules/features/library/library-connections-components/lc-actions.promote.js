window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCoreModules = window.EveLibrary.ConnectionsCoreModules || {};

(function () {
    window.EveLibrary.ConnectionsCoreModules.createActionsPromote = function createActionsPromote(Core) {
        function getRatings() {
            return window.EveLibrary?.Ratings;
        }

        function promoteLink(linkId) {
            return promoteLinkWithData(linkId, {});
        }

        function promoteLinkWithData(linkId, entryData) {
            const link = Core.findLinkById(linkId);
            if (!link) {
                showToast?.('Link not found', 'error');
                return null;
            }

            const existing = Core.findConnectionByLinkId(linkId);
            if (existing) {
                if (Object.keys(entryData || {}).length === 0) {
                    showToast?.('This bookmark is already linked to library', 'info');
                }
                return existing;
            }

            const categoryName = link.category || 'Unsorted';
            const workspaceId = Core.normalizeWorkspaceId(link.workspace);
            const state = window.EveLibrary.State;
            const storage = window.EveLibrary.Storage;
            if (!state || !storage) return null;

            const lib = state.getCategoryLibrary(categoryName, workspaceId);
            const Ratings = getRatings();
            const safeData = entryData || {};

            const newEntry = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                title: safeData.title || link.title || 'Untitled',
                mediaTypes: safeData.mediaTypes || ['graphicNovels'],
                author: '',
                authorAltNames: [],
                artist: '',
                genre: '',
                status: safeData.status || Core.getDefaultStatus(categoryName, workspaceId),
                chapter: safeData.chapter || 0,
                season: safeData.season || (safeData.mediaTypes && safeData.mediaTypes.includes('films') ? 1 : 0),
                episode: safeData.episode || 0,
                sourceUrl: safeData.sourceUrl || link.url || '',
                summary: safeData.summary || '',
                rating: '',
                apiRatings: {
                    anilist: null,
                    myanimelist: null,
                    mangadex: null
                },
                sourceStatus: '',
                sourceSignals: Ratings?.createEmptySourceSignals
                    ? Ratings.createEmptySourceSignals()
                    : null,
                derivedRatings: null,
                language: '',
                tags: [],
                dateAdded: new Date().toISOString(),
                lastEdited: new Date().toISOString(),
                favorite: false,
                image: safeData.image || ''
            };
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(newEntry);
            }

            lib.entries.push(newEntry);
            storage.saveLibrary();

            const connection = {
                id: Core.generateId(),
                linkId: String(link.id),
                libraryEntryId: newEntry.id,
                categoryName,
                workspace: workspaceId,
                createdAt: new Date().toISOString()
            };

            Core.connections.push(connection);
            Core.saveConnections();

            if (Object.keys(safeData).length === 0) {
                showToast?.('Bookmark added to library', 'success');
            }
            return connection;
        }

        function unlinkLink(linkId, removeEntry) {
            const conn = Core.findConnectionByLinkId(linkId);
            if (!conn) return false;

            if (removeEntry) {
                const found = Core.findEntryByConnection(conn);
                if (found?.entry) {
                    const state = window.EveLibrary.State;
                    const lib = state.getCategoryLibrary(found.categoryName, found.workspaceId || conn.workspace);
                    lib.entries = (lib.entries || []).filter(item => item.id !== found.entry.id);
                    window.EveLibrary.Storage?.saveLibrary?.();
                }
            }

            Core.connections = Core.connections.filter(item => String(item.linkId) !== String(linkId));   
            Core.saveConnections();
            return true;
        }

        function removeByLinkId(linkId) {
            const before = Core.connections.length;
            Core.connections = Core.connections.filter(item => String(item.linkId) !== String(linkId));   
            if (Core.connections.length !== before) {
                Core.saveConnections();
            }
        }

        function removeByLibraryEntry(categoryName, entryId, workspaceId) {
            const before = Core.connections.length;
            const normalizedCategory = Core.normalizeCategoryName(categoryName);
            const normalizedEntryId = String(entryId);
            const normalizedWorkspace = String(workspaceId || '').trim();
            Core.connections = Core.connections.filter(item => {
                if (Core.normalizeCategoryName(item.categoryName) !== normalizedCategory) return true;    
                if (String(item.libraryEntryId) !== normalizedEntryId) return true;
                if (!normalizedWorkspace) return false;
                return Core.normalizeWorkspaceId(item.workspace) !== Core.normalizeWorkspaceId(normalizedWorkspace);
            });
            if (Core.connections.length !== before) {
                Core.saveConnections();
            }
        }

        return {
            promoteLink,
            promoteLinkWithData,
            unlinkLink,
            removeByLinkId,
            removeByLibraryEntry
        };
    };
})();
