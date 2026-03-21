window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createCoreHelperState = function createCoreHelperState(deps) {
        const state = deps.state;

        function getAllLinks() {
            if (window.eveState?.links) return window.eveState.links;
            if (typeof links !== 'undefined' && Array.isArray(links)) return links;
            return [];
        }

        function matchesSearch(link, search) {
            if (!search) return true;
            const query = search.toLowerCase();
            const title = String(link.title || '').toLowerCase();
            const url = String(link.url || '').toLowerCase();
            const category = String(link.category || '').toLowerCase();
            return title.includes(query) || url.includes(query) || category.includes(query);
        }

        function getWorkspaceById(workspaceId) {
            return (config.workspaces || []).find(function (workspace) {
                return String(workspace.id) === String(workspaceId);
            }) || null;
        }

        function getWorkspaceLinks(workspaceId, searchStr) {
            return getAllLinks().filter(function (link) {
                return String(link.workspace) === String(workspaceId) && matchesSearch(link, searchStr);
            });
        }

        function getAllWorkspaceLinks(searchStr) {
            return getAllLinks().filter(function (link) {
                const hasWorkspace = getWorkspaceById(link.workspace);
                return !!hasWorkspace && matchesSearch(link, searchStr);
            });
        }

        function getWorkspaceLabel(workspaceId) {
            const workspace = getWorkspaceById(workspaceId);
            if (!workspace) return 'Unknown Tab';
            return String(workspace.name || 'Unnamed Tab');
        }

        function isTaskModeCategory(categoryName) {
            const hidden = Array.isArray(config.hideStats) ? config.hideStats : [];
            return !hidden.includes(categoryName);
        }

        function getSortedCategories(workspaceLinks) {
            const workspaceId = String(workspaceLinks[0]?.workspace || config.activeWorkspace || 'main').trim() || 'main';
            const workspaceCategoryOrder = window.EveCategoryOrder?.getOrder
                ? window.EveCategoryOrder.getOrder(workspaceId)
                : (config.categoryOrder || []);
            if (window.DashboardCategories && typeof window.DashboardCategories.sort === 'function') {
                return window.DashboardCategories.sort(workspaceLinks, workspaceCategoryOrder);
            }
            const unique = new Set(workspaceLinks.map(function (link) {
                return link.category || 'Unsorted';
            }));
            return Array.from(unique).sort();
        }

        function getCategoryModels(workspaceLinks) {
            return getSortedCategories(workspaceLinks).map(function (category) {
                const categoryLinks = workspaceLinks.filter(function (link) {
                    return (link.category || 'Unsorted') === category;
                });
                const doneCount = categoryLinks.filter(function (link) { return !!link.done; }).length;

                return {
                    category: category,
                    total: categoryLinks.length,
                    done: doneCount,
                    pending: Math.max(categoryLinks.length - doneCount, 0),
                    taskMode: isTaskModeCategory(category)
                };
            });
        }

        function getLinkedRecord(linkId) {
            const api = window.EveLibrary?.ConnectionsAPI;
            if (!api?.getLinkedEntry) return null;
            return api.getLinkedEntry(linkId);
        }

        function getLinkedLibraryEntry(linkId) {
            return getLinkedRecord(linkId)?.entry || null;
        }

        function getEntryConfidence(entry) {
            if (!entry || typeof entry !== 'object') return null;
            const ratingsApi = window.EveLibrary?.Ratings;
            if (ratingsApi?.applyDerivedRatings) {
                ratingsApi.applyDerivedRatings(entry);
            }
            const value = Number(entry?.derivedRatings?.confidence);
            if (!Number.isFinite(value)) return null;
            return Math.max(0, Math.min(1, value));
        }

        function clearEntriesRetryTimer() {
            if (!state.entriesRetryTimer) return;
            clearTimeout(state.entriesRetryTimer);
            state.entriesRetryTimer = null;
        }

        function scheduleEntriesRetry() {
            if (state.entriesRetryTimer) return;
            state.entriesRetryTimer = setTimeout(function () {
                state.entriesRetryTimer = null;
                if (state.stage !== 'entries') return;
                if (typeof renderDashboard === 'function') renderDashboard();
            }, state.LIBRARY_READY_RETRY_MS);
        }

        function resetLibraryReadyWait() {
            state.libraryReadyWaitStartedAt = 0;
            clearEntriesRetryTimer();
        }

        function ensureLibraryReadyForEntries() {
            const lib = window.EveLibrary;
            const api = lib?.ConnectionsAPI;
            const stateApi = lib?.State;

            if (api?.loadConnections && !Array.isArray(lib?.Connections)) {
                try {
                    api.loadConnections();
                } catch (error) {
                    // best-effort; retry shortly
                }
            }

            const ready = !!(api?.getLinkedEntry && stateApi && Array.isArray(lib?.Connections));

            if (ready) {
                resetLibraryReadyWait();
                return true;
            }

            if (!state.libraryReadyWaitStartedAt) {
                state.libraryReadyWaitStartedAt = Date.now();
            }

            const elapsed = Date.now() - state.libraryReadyWaitStartedAt;
            return elapsed >= state.LIBRARY_READY_MAX_WAIT_MS;
        }

        function shouldShowLibraryLoadingHint() {
            if (!state.libraryReadyWaitStartedAt) return false;
            return (Date.now() - state.libraryReadyWaitStartedAt) >= state.LIBRARY_READY_HINT_DELAY_MS;
        }

        return {
            getAllLinks,
            getWorkspaceById,
            getWorkspaceLinks,
            getAllWorkspaceLinks,
            getWorkspaceLabel,
            getCategoryModels,
            isTaskModeCategory,
            getLinkedLibraryEntry,
            getEntryConfidence,
            scheduleEntriesRetry,
            resetLibraryReadyWait,
            ensureLibraryReadyForEntries,
            shouldShowLibraryLoadingHint
        };
    };
})();
