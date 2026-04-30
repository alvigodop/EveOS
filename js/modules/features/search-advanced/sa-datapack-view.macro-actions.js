window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.DatapackViewMacroActions) return;

    function create(deps) {
        const {
            normalizeWorkspaceId,
            normalizeCategoryName,
            getConfig,
            getCategoryNamesForWorkspace,
            getLiveLinks,
            setLiveLinks,
            resolveCurrentScope,
            renderGateway
        } = deps;
    function buildFolderScopeKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
    }

    function getFolderStores() {
        const stores = [];
        const pushStore = function (store) {
            if (!store || typeof store !== 'object' || stores.includes(store)) return;
            stores.push(store);
        };
        pushStore(window.bookmarkFolders);
        pushStore(window.eveState?.bookmarkFolders);
        if (typeof bookmarkFolders !== 'undefined') pushStore(bookmarkFolders);
        return stores;
    }

    function renameFolderScopeFallback(workspaceId, oldCategoryName, nextCategoryName) {
        const oldKey = buildFolderScopeKey(workspaceId, oldCategoryName);
        const nextKey = buildFolderScopeKey(workspaceId, nextCategoryName);
        if (!oldKey || !nextKey || oldKey === nextKey) return false;
        let changed = false;
        getFolderStores().forEach(function (store) {
            if (!Object.prototype.hasOwnProperty.call(store, oldKey)) return;
            if (!Object.prototype.hasOwnProperty.call(store, nextKey)) {
                store[nextKey] = store[oldKey];
            }
            delete store[oldKey];
            changed = true;
        });
        return changed;
    }

    function saveMacroChanges() {
        const panel = document.getElementById('nxDatapackViewPanel');
        if (!panel) return false;
        const rows = Array.from(panel.querySelectorAll('.nx-dv-card[data-workspace-id][data-category-name]'));
        const edits = rows.map(function (row) {
            const workspaceId = normalizeWorkspaceId(row.getAttribute('data-workspace-id'));
            const oldCategoryName = normalizeCategoryName(row.getAttribute('data-category-name'));
            const rawCategoryName = String(row.querySelector('[data-nx-dv-field="categoryName"]')?.value || '').trim();
            const order = Math.max(1, Number(row.querySelector('[data-nx-dv-field="order"]')?.value) || 1);
            return {
                workspaceId,
                oldCategoryName,
                nextCategoryName: rawCategoryName ? normalizeCategoryName(rawCategoryName) : '',
                order
            };
        });
        if (edits.some(function (edit) { return !edit.nextCategoryName; })) {
            if (typeof showToast === 'function') showToast('Card names cannot be blank.', 'error');
            return false;
        }
        const validationGroups = new Map();
        edits.forEach(function (edit) {
            if (!validationGroups.has(edit.workspaceId)) validationGroups.set(edit.workspaceId, []);
            validationGroups.get(edit.workspaceId).push(edit);
        });
        let validationError = '';
        validationGroups.forEach(function (items, workspaceId) {
            if (validationError) return;
            const nextNames = new Set();
            const oldNames = new Set(items.map(function (item) {
                return item.oldCategoryName.toLowerCase();
            }));
            items.forEach(function (item) {
                const comparableName = item.nextCategoryName.toLowerCase();
                if (nextNames.has(comparableName)) {
                    validationError = 'Duplicate card name in gateway edit: ' + item.nextCategoryName;
                    return;
                }
                nextNames.add(comparableName);
            });
            if (validationError) return;
            const existingNames = getCategoryNamesForWorkspace(workspaceId).map(function (name) {
                return normalizeCategoryName(name).toLowerCase();
            });
            items.forEach(function (item) {
                const comparableName = item.nextCategoryName.toLowerCase();
                if (existingNames.includes(comparableName) && !oldNames.has(comparableName)) {
                    validationError = 'Card name already exists outside this gateway view: ' + item.nextCategoryName;
                }
            });
        });
        if (validationError) {
            if (typeof showToast === 'function') showToast(validationError, 'error');
            return false;
        }
        const liveLinks = getLiveLinks();
        const orderGroups = new Map();
        let renamed = 0;
        let reordered = 0;

        edits.forEach(function (edit) {
            const workspaceId = edit.workspaceId;
            const oldCategoryName = edit.oldCategoryName;
            const nextCategoryName = edit.nextCategoryName;
            const order = edit.order;
            if (!orderGroups.has(workspaceId)) orderGroups.set(workspaceId, []);
            orderGroups.get(workspaceId).push({ oldCategoryName, nextCategoryName, order });

            if (nextCategoryName && nextCategoryName !== oldCategoryName) {
                liveLinks.forEach(function (link) {
                    if (normalizeWorkspaceId(link?.workspace) !== workspaceId) return;
                    if (normalizeCategoryName(link?.category) !== oldCategoryName) return;
                    link.category = nextCategoryName;
                    window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
                });
                window.EveBookmarkFolders?.renameCategoryScope?.(workspaceId, oldCategoryName, nextCategoryName);
                renameFolderScopeFallback(workspaceId, oldCategoryName, nextCategoryName);
                window.EveCategoryOrder?.renameCategory?.(workspaceId, oldCategoryName, nextCategoryName);
                window.EveBookmarkFolders?.renameCardTaskScope?.(workspaceId, oldCategoryName, nextCategoryName);
                renamed += 1;
            }
        });

        setLiveLinks(liveLinks);
        orderGroups.forEach(function (items, workspaceId) {
            const cfg = getConfig();
            if (!cfg.categoryOrderByWorkspace || typeof cfg.categoryOrderByWorkspace !== 'object') cfg.categoryOrderByWorkspace = {};
            const existing = window.EveCategoryOrder?.getOrder
                ? window.EveCategoryOrder.getOrder(workspaceId, { persist: true })
                : (Array.isArray(cfg.categoryOrderByWorkspace[workspaceId]) ? cfg.categoryOrderByWorkspace[workspaceId] : []);
            const shownNames = new Set(items.map(function (item) { return item.nextCategoryName; }));
            const sortedShown = items.slice().sort(function (left, right) {
                return left.order - right.order || left.nextCategoryName.localeCompare(right.nextCategoryName);
            }).map(function (item) {
                return item.nextCategoryName;
            });
            const rest = existing.map(function (name) {
                const replacement = items.find(function (item) { return item.oldCategoryName === name; });
                return replacement ? replacement.nextCategoryName : name;
            }).filter(function (name) {
                return !shownNames.has(name);
            });
            const nextOrder = Array.from(new Set(sortedShown.concat(rest)));
            if (nextOrder.join('\n') !== existing.join('\n')) reordered += 1;
            cfg.categoryOrderByWorkspace[workspaceId] = nextOrder;
        });

        if (!renamed && !reordered) {
            if (typeof showToast === 'function') showToast('No macro changes to save.', 'info');
            return false;
        }
        if (typeof saveConfig === 'function') {
            saveConfig({
                immediate: true,
                source: 'nexus-datapack-view-macro-config',
                meta: { renamed, reordered }
            });
        }
        if (typeof saveData === 'function') {
            saveData({
                immediate: true,
                forceRender: true,
                source: 'nexus-datapack-view-macro-data',
                meta: { renamed, reordered }
            });
        }
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof renderDashboard === 'function') renderDashboard();
        renderGateway(resolveCurrentScope());
        if (typeof showToast === 'function') showToast('Datapack macro changes saved.', 'success');
        return true;
    }
        return {
            saveMacroChanges
        };
    }

    ns.DatapackViewMacroActions = { create };
})();
