window.EveSmartViewRegistry = window.EveSmartViewRegistry || {};

(function (api) {
    const h = api._shared || {};
    const {
        text,
        escapeHtml,
        normalizeKey,
        normalizeList,
        getDefinitionsById,
        normalizeReusableCriteria
    } = h;
    const saveCardView = (...args) => api.saveCardView(...args);
    const deleteCardView = (...args) => api.deleteCardView(...args);
    const getBuiltInCatalog = (...args) => api.getBuiltInCatalog(...args);
    const parseCriteriaPrompt = (...args) => api.parseCriteriaPrompt(...args);
    const describeCriteria = (...args) => api.describeCriteria(...args);

    function cleanupCriteria(criteria) {
        const next = {};
        Object.keys(criteria || {}).forEach((key) => {
            const value = criteria[key];
            if (value === undefined || value === null || value === '' || value === false) return;
            if (Array.isArray(value) && !value.length) return;
            next[key] = value;
        });
        return next;
    }

    function buildCriteriaFromBuilder(form) {
        const criteria = parseCriteriaPrompt(form.querySelector('[data-sv-field="tokens"]')?.value || '');
        const query = text(form.querySelector('[data-sv-field="query"]')?.value, '');
        const identifiers = normalizeList(form.querySelector('[data-sv-field="identifiers"]')?.value || '');
        const provider = text(form.querySelector('[data-sv-field="provider"]')?.value, '');
        const status = text(form.querySelector('[data-sv-field="status"]')?.value, '');
        const sourceFreshness = text(form.querySelector('[data-sv-field="sourceFreshness"]')?.value, '');
        const folderHealth = text(form.querySelector('[data-sv-field="folderHealth"]')?.value, '');
        const mergeState = text(form.querySelector('[data-sv-field="mergeState"]')?.value, '');

        if (query) criteria.query = [criteria.query, query].filter(Boolean).join(' ');
        if (identifiers.length) criteria.identifiers = normalizeList([criteria.identifiers, identifiers]);
        if (provider) criteria.provider = provider;
        if (status) criteria.status = status;
        if (sourceFreshness) criteria.sourceFreshness = sourceFreshness;
        if (folderHealth) criteria.folderHealth = folderHealth;
        if (mergeState) criteria.mergeState = mergeState;
        ['hasRelatedUrls', 'pinned', 'hasCover', 'hasAdditionalCovers', 'missingCover'].forEach((key) => {
            if (form.querySelector('[data-sv-bool="' + key + '"]')?.checked) criteria[key] = true;
        });
        return cleanupCriteria(criteria);
    }

    function saveSmartViewFromBuilder(workspaceId, categoryName, form) {
        const label = text(form.querySelector('[data-sv-field="label"]')?.value, '');
        if (!label) return { ok: false, error: 'Smart View name is required.' };
        const criteria = buildCriteriaFromBuilder(form);
        const result = saveCardView(workspaceId, categoryName, {
            label: text(label, 'Smart View'),
            criteria
        });
        if (result.ok) {
            if (typeof showToast === 'function') showToast('Smart View saved: ' + result.view.label, 'success');
            if (typeof renderDashboard === 'function') renderDashboard();
        } else if (typeof showToast === 'function') {
            showToast(result.error || 'Could not save Smart View.', 'warning');
        }
        return result;
    }

    function getIdentifierOptionText() {
        return Array.from(getDefinitionsById().values())
            .map((definition) => definition.label || definition.id)
            .join(', ');
    }

    function buildSmartViewBuilderHtml(workspaceId, categoryName) {
        const identifierHint = getIdentifierOptionText();
        return ''
            + '<div class="smart-view-builder-overlay" data-smart-view-builder>'
            + '<form class="smart-view-builder-modal">'
            + '<div class="smart-view-builder-header">'
            + '<div><div class="smart-view-builder-kicker">Smart View Builder</div><h3>New Smart View</h3></div>'
            + '<button type="button" class="smart-view-builder-close" data-sv-close aria-label="Close">Ã—</button>'
            + '</div>'
            + '<div class="smart-view-builder-scope">' + escapeHtml(text(workspaceId, 'main')) + ' / ' + escapeHtml(text(categoryName, 'Unsorted')) + '</div>'
            + '<label class="smart-view-builder-field"><span>Name</span><input data-sv-field="label" required maxlength="80" placeholder="Reading + MangaDex + Covers"></label>'
            + '<label class="smart-view-builder-field"><span>Search text</span><input data-sv-field="query" placeholder="Title, URL, notes, alias, tag..."></label>'
            + '<label class="smart-view-builder-field"><span>Identifiers / Labels</span><input data-sv-field="identifiers" placeholder="' + escapeHtml(identifierHint || 'Reading, Watching, Listening') + '"></label>'
            + '<div class="smart-view-builder-grid">'
            + '<label class="smart-view-builder-field"><span>Provider</span><input data-sv-field="provider" placeholder="MangaDex, AniList, TVMaze"></label>'
            + '<label class="smart-view-builder-field"><span>Status</span><input data-sv-field="status" placeholder="Reading, Watching, Completed"></label>'
            + '<label class="smart-view-builder-field"><span>Freshness</span><select data-sv-field="sourceFreshness"><option value="">Any</option><option>Fresh Source</option><option>Stale Source</option><option>Cache Only / Unknown</option><option>No Source</option></select></label>'
            + '<label class="smart-view-builder-field"><span>Folder Health</span><select data-sv-field="folderHealth"><option value="">Any</option><option>Healthy Folder Path</option><option>Broken Parent Chain</option><option>Hidden Parent</option><option>Orphaned Bookmark Folder</option><option>Detached Chain</option></select></label>'
            + '<label class="smart-view-builder-field"><span>Merge State</span><select data-sv-field="mergeState"><option value="">Any</option><option>Merge History</option><option>Duplicate Suspect</option><option>Injected Library Merge</option><option>Notes-Only Merge</option><option>No Merge History</option></select></label>'
            + '</div>'
            + '<div class="smart-view-builder-checks">'
            + '<label><input type="checkbox" data-sv-bool="hasRelatedUrls"> Related URLs</label>'
            + '<label><input type="checkbox" data-sv-bool="pinned"> Pinned</label>'
            + '<label><input type="checkbox" data-sv-bool="hasCover"> Has cover</label>'
            + '<label><input type="checkbox" data-sv-bool="hasAdditionalCovers"> Additional covers</label>'
            + '<label><input type="checkbox" data-sv-bool="missingCover"> Missing cover</label>'
            + '</div>'
            + '<details class="smart-view-builder-advanced"><summary>Token criteria</summary><textarea data-sv-field="tokens" rows="3" placeholder="label:Reading provider:MangaDex missing:cover has:related merge:Merge_History"></textarea></details>'
            + '<div class="smart-view-builder-preview" data-sv-preview>Criteria: all card bookmarks</div>'
            + '<div class="smart-view-builder-actions"><button type="button" data-sv-close>Cancel</button><button type="submit">Save Smart View</button></div>'
            + '</form></div>';
    }

    function showSmartViewBuilder(workspaceId, categoryName) {
        if (!document?.body) return null;
        document.querySelectorAll('[data-smart-view-builder]').forEach((node) => node.remove());
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildSmartViewBuilderHtml(workspaceId, categoryName);
        const overlay = wrapper.firstElementChild;
        const form = overlay.querySelector('form');
        const preview = overlay.querySelector('[data-sv-preview]');
        function close() {
            overlay.remove();
            document.removeEventListener('keydown', onKeyDown);
        }
        function onKeyDown(event) {
            if (event.key === 'Escape') close();
        }
        function refreshPreview() {
            const criteria = buildCriteriaFromBuilder(form);
            if (preview) preview.textContent = 'Criteria: ' + describeCriteria(criteria);
        }
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-sv-close]')) {
                event.preventDefault();
                close();
            }
        });
        form.addEventListener('input', refreshPreview);
        form.addEventListener('change', refreshPreview);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const result = saveSmartViewFromBuilder(workspaceId, categoryName, form);
            if (result.ok) close();
            else if (typeof showToast === 'function') showToast(result.error || 'Could not save Smart View.', 'warning');
        });
        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(overlay);
        window.setTimeout(() => form.querySelector('[data-sv-field="label"]')?.focus(), 0);
        refreshPreview();
        return overlay;
    }

    function promptCreateSmartView(workspaceId, categoryName) {
        return showSmartViewBuilder(workspaceId, categoryName);
    }

    function openSmartView(workspaceId, categoryName, smartViewId) {
        const ws = text(workspaceId, 'main');
        const card = text(categoryName, 'Unsorted');
        const id = text(smartViewId, '');
        if (!id) return false;
        if (typeof switchWorkspace === 'function') switchWorkspace(ws);
        if (typeof setFocus === 'function') setFocus(card);
        if (typeof renderDashboard === 'function') renderDashboard();
        window.setTimeout(() => {
            if (window.EveFolderViewV2?.enterFolder) {
                window.EveFolderViewV2.enterFolder(null, card, id, ws);
            }
        }, 80);
        return true;
    }

    function openSmartViewRecord(record) {
        return openSmartView(
            record?.workspaceId || record?.path?.workspaceId,
            record?.categoryName || record?.path?.categoryName,
            record?.provenance?.smartViewFolderId || record?.path?.folderId || record?.provenance?.smartViewId
        );
    }

    async function deleteSmartViewFromTile(event, workspaceId, categoryName, viewId, label) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const name = text(label, 'Smart View');
        const message = 'Delete Smart View "' + name + '"? Matching bookmarks stay untouched.';
        const confirmed = typeof showConfirm === 'function'
            ? await showConfirm(message)
            : false;
        if (!confirmed) return false;
        deleteCardView(workspaceId, categoryName, viewId);
        if (typeof showToast === 'function') showToast('Deleted Smart View: ' + name, 'success');
        if (typeof renderDashboard === 'function') renderDashboard();
        return true;
    }

    Object.assign(api, {
        cleanupCriteria,
        buildCriteriaFromBuilder,
        saveSmartViewFromBuilder,
        showSmartViewBuilder,
        promptCreateSmartView,
        openSmartView,
        openSmartViewRecord,
        deleteSmartViewFromTile
    });
})(window.EveSmartViewRegistry);
