window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexInvalidationRuntime) return;

    function create(deps) {
        const shared = deps?.shared || {};
        const INDEX_RELEVANT_CONFIG_KEYS = deps?.INDEX_RELEVANT_CONFIG_KEYS || new Set();
        const buildScopedLocalRecordBundle = deps?.buildScopedLocalRecordBundle;
        const {
            STORAGE_MANAGER_KEY,
            SEARCH_STORAGE_KEYS,
            INCREMENTAL_LOCAL_RECORD_TYPES,
            state,
            text,
            toArray
        } = shared;
    function normalizeMutationMeta(meta) {
        if (!meta || typeof meta !== 'object') return null;
        const categoryName = text(meta.categoryName || meta.targetCategoryName || meta.targetScope?.categoryName, '');
        const sourceKey = text(meta.sourceKey, '');
        const query = text(meta.query, '');
        const workspaceId = text(meta.workspaceId || meta.targetWorkspaceId || meta.targetScope?.workspaceId, '');
        const folderId = text(meta.folderId || meta.targetScope?.folderId, '');
        const linkId = text(meta.linkId || meta.targetId || meta.mergedId, '');
        const kind = text(meta.kind, '');
        const dragType = text(meta.dragType, '');
        const dragId = text(meta.dragId, '');
        const nonIndexing = !!meta.nonIndexing;
        const quickPins = !!meta.quickPins;
        const constellation = !!meta.constellation;
        let dataDelta = meta.dataDelta && typeof meta.dataDelta === 'object' ? meta.dataDelta : null;
        const configDelta = meta.configDelta && typeof meta.configDelta === 'object' ? meta.configDelta : null;
        const flatLinkIds = [];
        const flatRemovedLinkIds = [];
        const flatUpdatedLinkIds = [];
        const flatAddedLinkIds = [];
        const flatAffectedScopes = [];
        function pushText(output, value) {
            const normalized = text(value, '');
            if (!normalized || output.includes(normalized)) return;
            output.push(normalized);
        }
        function pushScope(scope) {
            const scopeWorkspaceId = text(scope?.workspaceId, '');
            const scopeCategoryName = text(scope?.categoryName, '');
            const scopeFolderId = text(scope?.folderId, '');
            if (!scopeWorkspaceId && !scopeCategoryName && !scopeFolderId) return;
            if (flatAffectedScopes.some(function (item) {
                return text(item.workspaceId, '') === scopeWorkspaceId
                    && text(item.categoryName, '') === scopeCategoryName
                    && text(item.folderId, '') === scopeFolderId;
            })) return;
            flatAffectedScopes.push({
                workspaceId: scopeWorkspaceId,
                categoryName: scopeCategoryName,
                folderId: scopeFolderId
            });
        }
        toArray(meta.linkIds).forEach(function (value) { pushText(flatLinkIds, value); });
        toArray(meta.updatedLinkIds).forEach(function (value) {
            pushText(flatUpdatedLinkIds, value);
            pushText(flatLinkIds, value);
        });
        toArray(meta.addedLinkIds).forEach(function (value) {
            pushText(flatAddedLinkIds, value);
            pushText(flatLinkIds, value);
        });
        toArray(meta.removedLinkIds).concat(toArray(meta.removedIds)).forEach(function (value) {
            pushText(flatRemovedLinkIds, value);
            pushText(flatLinkIds, value);
        });
        pushText(flatLinkIds, linkId);
        if (linkId) pushText(flatUpdatedLinkIds, linkId);
        toArray(meta.affectedScopes).forEach(pushScope);
        pushScope(meta.sourceScope);
        pushScope(meta.targetScope);
        if (workspaceId || categoryName || folderId) pushScope({ workspaceId: workspaceId, categoryName: categoryName, folderId: folderId });
        if (!dataDelta && (flatLinkIds.length || flatAffectedScopes.length)) {
            dataDelta = {
                kind: 'core-data-delta',
                complete: true,
                linkIds: flatLinkIds,
                addedLinkIds: flatAddedLinkIds,
                updatedLinkIds: flatUpdatedLinkIds,
                removedLinkIds: flatRemovedLinkIds,
                workspaceIds: Array.from(new Set(flatAffectedScopes.map(function (scope) { return text(scope.workspaceId, ''); }).filter(Boolean))),
                categoryNames: Array.from(new Set(flatAffectedScopes.map(function (scope) { return text(scope.categoryName, ''); }).filter(Boolean))),
                folderIds: Array.from(new Set(flatAffectedScopes.map(function (scope) { return text(scope.folderId, ''); }).filter(Boolean))),
                affectedScopes: flatAffectedScopes,
                hasFolderStoreChanges: false,
                hasQuickPinChanges: !!quickPins,
                hasConstellationChanges: !!constellation
            };
        }
        if (!categoryName && !sourceKey && !query && !workspaceId && !folderId && !linkId && !kind && !dragType && !dragId && !nonIndexing && !quickPins && !constellation && !dataDelta && !configDelta) return null;
        return {
            categoryName: categoryName,
            sourceKey: sourceKey,
            query: query,
            workspaceId: workspaceId,
            folderId: folderId,
            linkId: linkId,
            kind: kind,
            dragType: dragType,
            dragId: dragId,
            nonIndexing: nonIndexing,
            quickPins: quickPins,
            constellation: constellation,
            dataDelta: dataDelta,
            configDelta: configDelta
        };
    }

    function resolveMutationCategoryName(explicitCategoryName, fallbackContext) {
        const explicit = text(explicitCategoryName, '');
        if (explicit) return explicit;
        const currentCategory = text(window.currentCategoryCtx, '');
        if (currentCategory) return currentCategory;
        return text(fallbackContext, '');
    }

    function isReadableOnlyDirtyReason(reason) {
        const normalizedReason = text(reason, '');
        return normalizedReason === 'saveConfig'
            || normalizedReason === 'library-link-updated'
            || isSourceDrivenReason(normalizedReason);
    }

    function shouldPreservePendingDataDirtyReason(nextReason, nextMeta) {
        if (!state.dirty || !state.lastReason) return false;
        if (!isReadableOnlyDirtyReason(nextReason)) return false;
        if (isReadableOnlyDirtyReason(state.lastReason)) return false;
        return !!getMutationDataDelta(state.lastMutationMeta) && !getMutationDataDelta(nextMeta);
    }

    function markDirty(reason, mutationMeta) {
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const invalidationPlan = classifyInvalidationPlan(reason, normalizedMeta);
        const previousPlan = state.lastInvalidationPlan;
        state.lastInvalidationPlan = invalidationPlan;
        if (!invalidationPlan.dirty) return;
        if (shouldPreservePendingDataDirtyReason(reason, normalizedMeta)) {
            state.revision = Number(state.revision || 0) + 1;
            state.lastInvalidationPlan = previousPlan || classifyInvalidationPlan(state.lastReason, state.lastMutationMeta);
            return;
        }
        state.revision = Number(state.revision || 0) + 1;
        state.dirty = true;
        state.lastReason = text(reason, 'state-mutated');
        state.lastMutationMeta = normalizedMeta;
    }

    function isSourceDrivenReason(reason) {
        const normalizedReason = text(reason, '');
        return normalizedReason === 'cache-store-query'
            || normalizedReason === 'cache-store-pool'
            || normalizedReason.startsWith('scoped-storage:')
            || normalizedReason.startsWith('storage-save:');
    }

    function shouldTrackStorageKey(key) {
        const normalized = text(key, '');
        return !!normalized && normalized !== STORAGE_MANAGER_KEY && SEARCH_STORAGE_KEYS.has(normalized);
    }

    function wrapMutationMethod(target, methodName, onSuccess) {
        if (!target || typeof target[methodName] !== 'function') return false;
        const original = target[methodName];
        if (original.__nexusIndexWrapped) return true;

        const wrapped = function () {
            const args = Array.prototype.slice.call(arguments);
            const result = original.apply(this, args);
            if (result && typeof result.then === 'function') {
                return result.then(function (value) {
                    onSuccess(args, value);
                    return value;
                });
            }
            onSuccess(args, result);
            return result;
        };

        wrapped.__nexusIndexWrapped = true;
        wrapped.__nexusIndexOriginal = original;
        target[methodName] = wrapped;
        return true;
    }

    function installMutationHooks() {
        const searchInternals = window.EveOS?.API?.SearchInternals;
        wrapMutationMethod(searchInternals || {}, 'saveScopedStorageValueAsync', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('scoped-storage:' + key, {
                    sourceKey: key,
                    categoryName: resolveMutationCategoryName(
                        args?.[2],
                        window.StorageManager?.categoryContext
                    )
                });
            }
        });

        const cacheApi = window.EveOS?.API?.Cache;
        wrapMutationMethod(cacheApi || {}, 'storeQuery', function (args) {
            markDirty('cache-store-query', {
                sourceKey: 'cache-store-query',
                categoryName: resolveMutationCategoryName(
                    args?.[2],
                    window.StorageManager?.categoryContext
                ),
                query: text(args?.[0], '')
            });
        });
        wrapMutationMethod(cacheApi || {}, 'storePool', function (args) {
            markDirty('cache-store-pool', {
                sourceKey: 'cache-store-pool',
                categoryName: resolveMutationCategoryName(
                    args?.[1],
                    window.StorageManager?.categoryContext
                )
            });
        });

        const storageManager = window.StorageManager;
        wrapMutationMethod(storageManager || {}, 'saveDataAsync', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('storage-save:' + key, {
                    sourceKey: key,
                    categoryName: resolveMutationCategoryName(
                        args?.[2],
                        storageManager?.categoryContext
                    )
                });
            }
        });
        wrapMutationMethod(storageManager || {}, 'saveData', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('storage-save:' + key, {
                    sourceKey: key,
                    categoryName: resolveMutationCategoryName(
                        args?.[2],
                        storageManager?.categoryContext
                    )
                });
            }
        });
    }

    function getMutationDataDelta(mutationMeta) {
        const delta = mutationMeta?.dataDelta;
        return delta && typeof delta === 'object' && text(delta.kind, '') === 'core-data-delta'
            ? delta
            : null;
    }

    function getMutationConfigDelta(mutationMeta) {
        const delta = mutationMeta?.configDelta;
        return delta && typeof delta === 'object' && text(delta.kind, '') === 'core-config-delta'
            ? delta
            : null;
    }

    function isNonIndexingCoreDelta(reason, mutationMeta) {
        const delta = getMutationDataDelta(mutationMeta);
        if (delta) {
            const hasIndexScope = toArray(delta.linkIds).length
                || toArray(delta.affectedScopes).length
                || !!delta.hasFolderStoreChanges;
            if (hasIndexScope) return false;
            if (mutationMeta?.nonIndexing || mutationMeta?.quickPins || mutationMeta?.constellation) return true;
            return text(reason, '') === 'saveData'
                || text(reason, '').indexOf('quick-pins') !== -1
                || text(reason, '').indexOf('constellation-detached') !== -1;
        }

        const configDelta = getMutationConfigDelta(mutationMeta);
        if (!configDelta) {
            return !!(mutationMeta?.nonIndexing || mutationMeta?.quickPins || mutationMeta?.constellation);
        }
        const changedKeys = toArray(configDelta.changedKeys).map(function (key) {
            return text(key, '');
        }).filter(Boolean);
        if (!changedKeys.length) return true;
        return !changedKeys.some(function (key) {
            return INDEX_RELEVANT_CONFIG_KEYS.has(key);
        });
    }

    function pushAffectedScope(output, seen, workspaceId, categoryName) {
        const normalizedWorkspaceId = text(workspaceId, '');
        const normalizedCategoryName = text(categoryName, '');
        if (!normalizedWorkspaceId && !normalizedCategoryName) return;
        const key = normalizedWorkspaceId + '::' + normalizedCategoryName;
        if (seen.has(key)) return;
        seen.add(key);
        output.push({
            workspaceId: normalizedWorkspaceId,
            categoryName: normalizedCategoryName
        });
    }

    function getDeltaAffectedScopes(delta) {
        const scopes = [];
        const seen = new Set();
        toArray(delta?.affectedScopes).forEach(function (scope) {
            pushAffectedScope(scopes, seen, scope?.workspaceId, scope?.categoryName);
        });

        if (scopes.length) return scopes;

        const workspaceIds = toArray(delta?.workspaceIds)
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);
        const categoryNames = toArray(delta?.categoryNames)
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);
        if (workspaceIds.length && categoryNames.length && workspaceIds.length * categoryNames.length <= 80) {
            workspaceIds.forEach(function (workspaceId) {
                categoryNames.forEach(function (categoryName) {
                    pushAffectedScope(scopes, seen, workspaceId, categoryName);
                });
            });
        } else if (workspaceIds.length === 1) {
            pushAffectedScope(scopes, seen, workspaceIds[0], '');
        } else if (categoryNames.length === 1) {
            pushAffectedScope(scopes, seen, '', categoryNames[0]);
        }

        return scopes;
    }

    function getMutationAffectedScopes(mutationMeta) {
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const scopes = [];
        const seen = new Set();
        getDeltaAffectedScopes(getMutationDataDelta(normalizedMeta)).forEach(function (scope) {
            pushAffectedScope(scopes, seen, scope.workspaceId, scope.categoryName);
        });
        pushAffectedScope(scopes, seen, normalizedMeta?.workspaceId, normalizedMeta?.categoryName);
        return scopes;
    }

    function getMutationAffectedLinkIds(mutationMeta) {
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const seen = new Set();
        const linkIds = [];
        function pushLinkId(value) {
            const linkId = text(value, '');
            if (!linkId || seen.has(linkId)) return;
            seen.add(linkId);
            linkIds.push(linkId);
        }

        const delta = getMutationDataDelta(normalizedMeta);
        toArray(delta?.linkIds).forEach(pushLinkId);
        toArray(delta?.addedLinkIds).forEach(pushLinkId);
        toArray(delta?.updatedLinkIds).forEach(pushLinkId);
        toArray(delta?.removedLinkIds).forEach(pushLinkId);
        pushLinkId(normalizedMeta?.linkId);
        return linkIds;
    }

    function canUseScopedLocalIncremental(mutationMeta) {
        const delta = getMutationDataDelta(mutationMeta);
        if (delta && !delta.complete) return false;
        if (typeof buildScopedLocalRecordBundle !== 'function') return false;
        const scopes = getMutationAffectedScopes(mutationMeta);
        const linkIds = getMutationAffectedLinkIds(mutationMeta);
        if (!scopes.length && !linkIds.length) return false;
        if (scopes.length > 80 || linkIds.length > 500) return false;
        return true;
    }

    function classifyInvalidationPlan(reason, mutationMeta) {
        const normalizedReason = text(reason, 'state-mutated');
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const dataDelta = getMutationDataDelta(normalizedMeta);
        const configDelta = getMutationConfigDelta(normalizedMeta);
        const scopes = getMutationAffectedScopes(normalizedMeta);
        const linkIds = getMutationAffectedLinkIds(normalizedMeta);
        const configKeys = toArray(configDelta?.changedKeys)
            .map(function (key) { return text(key, ''); })
            .filter(Boolean);
        const sourceDriven = isSourceDrivenReason(normalizedReason);
        const ignored = isNonIndexingCoreDelta(normalizedReason, normalizedMeta);
        let mode = 'full';

        if (ignored) {
            mode = 'ignore';
        } else if (sourceDriven && text(normalizedMeta?.categoryName, '')) {
            mode = 'source';
        } else if (!sourceDriven && canUseScopedLocalIncremental(normalizedMeta)) {
            mode = 'local-scope';
        } else if (!sourceDriven && state.snapshot) {
            mode = 'local';
        }

        return {
            dirty: !ignored,
            mode: mode,
            reason: normalizedReason,
            sourceDriven: sourceDriven,
            complete: dataDelta ? !!dataDelta.complete : true,
            affectedScopes: scopes,
            linkIds: linkIds,
            folderIds: toArray(dataDelta?.folderIds)
                .concat(text(normalizedMeta?.folderId, '') ? [text(normalizedMeta.folderId, '')] : [])
                .map(function (value) { return text(value, ''); })
                .filter(Boolean),
            configKeys: configKeys
        };
    }
        return {
            normalizeMutationMeta,
            markDirty,
            installMutationHooks,
            classifyInvalidationPlan,
            isSourceDrivenReason,
            getMutationAffectedScopes,
            getMutationAffectedLinkIds,
            canUseScopedLocalIncremental
        };
    }

    ns.IndexInvalidationRuntime = { create };
})();
