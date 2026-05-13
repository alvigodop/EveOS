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
            resolveCurrentScope,
            renderGateway
        } = deps;

    function getPatchApi() {
        return window.EveOS?.NebulaJsonPatch
            || window.EveOS?.SearchAdvanced?.NebulaJsonPatch
            || window.NebulaJsonPatch
            || null;
    }

    function getLinkApi() {
        return window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
    }

    function createCardLink(workspaceId, categoryName) {
        const api = getLinkApi();
        return api?.createLink
            ? api.createLink({ type: 'card', workspaceId, categoryName })
            : '';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderPatchPreview(panel, preview) {
        const target = panel?.querySelector?.('[data-nx-dv-diff="macro"]');
        if (!target) return;
        const rows = Array.isArray(preview?.previews) ? preview.previews : [];
        const errors = Array.isArray(preview?.errors) ? preview.errors : [];
        target.hidden = false;
        target.innerHTML = '<div class="nx-dv-diff-title">Macro Diff Preview</div>'
            + (rows.length
                ? rows.map(function (row) {
                    return '<div class="nx-dv-diff-row">'
                        + '<span>' + escapeHtml(row.op || 'patch') + '</span>'
                        + '<strong>' + escapeHtml(row.before || '') + '</strong>'
                        + '<b>-></b>'
                        + '<strong>' + escapeHtml(row.after || '') + '</strong>'
                        + '</div>';
                }).join('')
                : '<div class="nx-dv-diff-row">No pending macro changes.</div>')
            + (errors.length ? '<div class="nx-dv-diff-errors">' + errors.map(escapeHtml).join('<br>') + '</div>' : '');
    }

    function saveMacroChanges(options) {
        options = options || {};
        const panel = document.getElementById('nxDatapackViewPanel');
        if (!panel) return false;
        const rows = Array.from(panel.querySelectorAll('.nx-dv-card[data-workspace-id][data-category-name]'));
        const edits = rows.map(function (row) {
            const workspaceId = normalizeWorkspaceId(row.getAttribute('data-workspace-id'));
            const oldCategoryName = normalizeCategoryName(row.getAttribute('data-category-name'));
            const rawCategoryName = String(row.querySelector('[data-nx-dv-field="categoryName"]')?.value || '').trim();
            const order = Math.max(1, Number(row.querySelector('[data-nx-dv-field="order"]')?.value) || 1);
            const oldOrder = Math.max(1, Number(row.getAttribute('data-order')) || order);
            return {
                workspaceId,
                oldCategoryName,
                nextCategoryName: rawCategoryName ? normalizeCategoryName(rawCategoryName) : '',
                order,
                oldOrder
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
        const patchApi = getPatchApi();
        if (!patchApi?.buildPatch || !patchApi?.buildTransaction || !patchApi?.applyTransaction) {
            if (typeof showToast === 'function') showToast('Nebula JSON patch system is not loaded.', 'error');
            return false;
        }
        const patches = [];
        let renamed = 0;
        let reordered = 0;
        edits.forEach(function (edit) {
            const workspaceId = edit.workspaceId;
            const oldCategoryName = edit.oldCategoryName;
            const nextCategoryName = edit.nextCategoryName;
            const order = edit.order;
            const cardLink = createCardLink(workspaceId, oldCategoryName);
            if (order !== edit.oldOrder) {
                patches.push(patchApi.buildPatch('reorder-card', cardLink, { order }, {
                    source: 'nexus-datapack-view-macro',
                    reason: 'macro-card-order'
                }));
                reordered += 1;
            }
            if (nextCategoryName && nextCategoryName !== oldCategoryName) {
                patches.push(patchApi.buildPatch('rename-card', cardLink, { name: nextCategoryName }, {
                    source: 'nexus-datapack-view-macro',
                    reason: 'macro-card-rename'
                }));
                renamed += 1;
            }
        });

        if (!patches.length) {
            if (options.previewOnly) {
                renderPatchPreview(panel, { previews: [], errors: [] });
                return true;
            }
            if (typeof showToast === 'function') showToast('No macro changes to save.', 'info');
            return false;
        }
        const transaction = patchApi.buildTransaction(patches, {
            source: 'nexus-datapack-view-macro',
            reason: 'macro gateway save'
        });
        if (options.previewOnly) {
            const preview = patchApi.previewTransaction(transaction);
            renderPatchPreview(panel, preview);
            if (!preview.ok && typeof showToast === 'function') {
                showToast('Macro diff has validation issues.', 'warning');
            }
            return preview.ok;
        }
        const result = patchApi.applyTransaction(transaction, {
            immediate: true,
            forceRender: true,
            source: 'nexus-datapack-view-macro'
        });
        window.EveOS.SearchAdvanced._lastDatapackMacroTransaction = { transaction, result };
        if (!result.ok) {
            if (typeof showToast === 'function') {
                showToast('Macro changes blocked: ' + (result.errors || []).join(', '), 'error');
            }
            return false;
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
