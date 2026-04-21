window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createCoreHelperState = function createCoreHelperState(deps) {
        const state = deps.state;

        function getDatapackIndexApi() {
            return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        }

        function warmDatapackIndex() {
            const indexApi = getDatapackIndexApi();
            if (!indexApi || typeof indexApi.rebuild !== 'function') return;
            if (state.datapackIndexWarmPromise) return;

            state.datapackIndexWarmPromise = Promise.resolve(indexApi.rebuild({ reason: 'unidex-summary' }))
                .catch(function () {
                    // Keep raw-link fallback active if the datapack spine is not ready.
                })
                .finally(function () {
                    state.datapackIndexWarmPromise = null;
                    if (typeof renderDashboard === 'function') renderDashboard();
                });
        }

        function getDatapackStructureSummary() {
            const indexApi = getDatapackIndexApi();
            if (!indexApi || typeof indexApi.getStructureSummary !== 'function') return null;
            const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
            const hasUsableSnapshot = typeof indexApi.hasUsableSnapshot === 'function'
                ? indexApi.hasUsableSnapshot()
                : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
            if (!hasUsableSnapshot) {
                warmDatapackIndex();
                return null;
            }
            const summary = indexApi.getStructureSummary();
            if (summary?.builtAt) return summary;
            warmDatapackIndex();
            return null;
        }

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
            const helpers = window.EveWorkspaceHelpers;
            if (helpers && helpers.findById) {
                return helpers.findById(config.workspaces || [], workspaceId);
            }
            return (config.workspaces || []).find(function (workspace) {
                return String(workspace.id) === String(workspaceId);
            }) || null;
        }

        function getWorkspaceLinks(workspaceId, searchStr) {
            return getAllLinks().filter(function (link) {
                return String(link.workspace) === String(workspaceId) && matchesSearch(link, searchStr);
            });
        }

        function getWorkspaceAndSubTabLinks(workspaceId, searchStr) {
            var helpers = window.EveWorkspaceHelpers;
            var workspace = getWorkspaceById(workspaceId);
            var visibleIds = new Set([String(workspaceId)]);
            var subTabIds = new Set();
            if (workspace && helpers && helpers.getVisibleDescendantIds) {
                helpers.getVisibleDescendantIds(workspace).forEach(function (id) {
                    visibleIds.add(id);
                    subTabIds.add(id);
                });
            }
            var allLinks = getAllLinks().filter(function (link) {
                return visibleIds.has(String(link.workspace)) && matchesSearch(link, searchStr);
            });
            return { links: allLinks, subTabIds: subTabIds };
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

        function getWorkspaceCategoryOrder(workspaceId) {
            return window.EveCategoryOrder?.getOrder
                ? window.EveCategoryOrder.getOrder(workspaceId)
                : (config.categoryOrder || []);
        }

        function sortCategoryNames(categoryNames, workspaceId) {
            const unique = Array.from(new Set((Array.isArray(categoryNames) ? categoryNames : [])
                .map(function (category) { return category || 'Unsorted'; })));
            const order = getWorkspaceCategoryOrder(workspaceId);
            const orderIndex = new Map(order.map(function (category, index) {
                return [String(category || 'Unsorted'), index];
            }));

            return unique.sort(function (left, right) {
                const leftIndex = orderIndex.has(left) ? orderIndex.get(left) : Number.POSITIVE_INFINITY;
                const rightIndex = orderIndex.has(right) ? orderIndex.get(right) : Number.POSITIVE_INFINITY;
                if (leftIndex !== rightIndex) return leftIndex - rightIndex;
                return String(left).localeCompare(String(right));
            });
        }

        function getSortedCategories(workspaceLinks) {
            const workspaceId = String(workspaceLinks[0]?.workspace || config.activeWorkspace || 'main').trim() || 'main';
            return sortCategoryNames(workspaceLinks.map(function (link) {
                return link.category || 'Unsorted';
            }), workspaceId);
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

        function getWorkspaceBookmarkCount(workspaceId, searchStr, workspaceLinks) {
            const search = String(searchStr || '').trim();
            if (Array.isArray(workspaceLinks)) return workspaceLinks.length;

            if (!search) {
                const summary = getDatapackStructureSummary();
                const bucket = summary?.workspaces?.[String(workspaceId || '')];
                if (bucket && Number.isFinite(Number(bucket.bookmarkCount))) {
                    return Number(bucket.bookmarkCount || 0);
                }
            }

            return getWorkspaceLinks(workspaceId, searchStr).length;
        }

        function getCategoryModelsForWorkspace(workspaceId, searchStr, workspaceLinks) {
            const search = String(searchStr || '').trim();
            if (!search) {
                const summary = getDatapackStructureSummary();
                const prefix = String(workspaceId || '') + '::';
                const cardBuckets = summary?.cards
                    ? Object.keys(summary.cards)
                        .filter(function (key) { return key.indexOf(prefix) === 0; })
                        .map(function (key) { return summary.cards[key]; })
                        .filter(function (bucket) { return Number(bucket?.bookmarkCount || 0) > 0; })
                    : null;

                if (cardBuckets) {
                    const bucketsByCategory = new Map(cardBuckets.map(function (bucket) {
                        return [String(bucket.categoryName || 'Unsorted'), bucket];
                    }));
                    return sortCategoryNames(Array.from(bucketsByCategory.keys()), workspaceId).map(function (category) {
                        const bucket = bucketsByCategory.get(String(category || 'Unsorted')) || {};
                        const total = Number(bucket.bookmarkCount || 0);
                        const done = Math.min(Number(bucket.doneBookmarkCount || 0), total);
                        return {
                            category: category,
                            total: total,
                            done: done,
                            pending: Math.max(total - done, 0),
                            taskMode: isTaskModeCategory(category)
                        };
                    });
                }
            }

            const sourceLinks = Array.isArray(workspaceLinks) ? workspaceLinks : getWorkspaceLinks(workspaceId, searchStr);
            return getCategoryModels(sourceLinks);
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
            getWorkspaceAndSubTabLinks,
            getAllWorkspaceLinks,
            getWorkspaceBookmarkCount,
            getWorkspaceLabel,
            getCategoryModels,
            getCategoryModelsForWorkspace,
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
