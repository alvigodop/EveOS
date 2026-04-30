window.EveBookmarkIdentifiers = window.EveBookmarkIdentifiers || {};

(function (ns) {
    const h = ns._helpers || {};
    if (!h.getDefinitions) return;
    const {
        DEFAULT_IDENTIFIERS,
        escapeHtml,
        normalizeHexColor,
        buildQuickLinkKey,
        parseQuickLinkKey,
        normalizeQuickLinks,
        getConfigObject,
        getLinksList,
        getWorkspaceLabel,
        getAllCardTargets,
        normalizeDefinition,
        normalizeRegistry,
        normalizeIdentifierIds,
        getDefinitions,
        getIdentifiersForLink,
        buildBadgeHtml
    } = h;
    function getModalEditorContainer(containerId = 'newBookmarkIdentifiers') {
        return document.getElementById(containerId);
    }

    function renderModalEditor(containerId = 'newBookmarkIdentifiers', selectedIds) {
        const container = getModalEditorContainer(containerId);
        if (!container) return;

        const definitions = getDefinitions();
        const activeIds = new Set(normalizeIdentifierIds(Array.isArray(selectedIds) ? selectedIds : []));
        if (!definitions.length) {
            container.innerHTML = '<div class="bookmark-identifier-editor-empty">No identifiers configured yet. Add them in Settings.</div>';
            return;
        }

        container.innerHTML = `
            <div class="bookmark-identifier-editor-grid">
                ${definitions.map((definition) => {
                    const checked = activeIds.has(definition.id) ? 'checked' : '';
                    const title = definition.description ? ` title="${escapeHtml(definition.description)}"` : '';
                    return `
                        <label class="bookmark-identifier-editor-option"${title}>
                            <input type="checkbox" class="bookmark-identifier-editor-checkbox" value="${escapeHtml(definition.id)}" ${checked}>
                            ${buildBadgeHtml([definition.id])}
                        </label>
                    `;
                }).join('')}
                <button type="button" class="bookmark-identifier-add-btn" onclick="quickAddBookmarkIdentifier()" title="Add custom identifier">Custom</button>
            </div>
        `;
    }

    function readModalEditorSelection(containerId = 'newBookmarkIdentifiers') {
        const container = getModalEditorContainer(containerId);
        if (!container) return [];
        const checkedValues = Array.from(container.querySelectorAll('.bookmark-identifier-editor-checkbox:checked'))
            .map((checkbox) => checkbox.value);
        return normalizeIdentifierIds(checkedValues);
    }

    function rerenderActiveModalEditor() {
        const modal = document.getElementById('addModal');
        if (!modal || modal.style.display !== 'flex') return;
        renderModalEditor('newBookmarkIdentifiers', readModalEditorSelection());
    }

    function renderSettingsManager() {
        const list = document.getElementById('bookmarkIdentifiersSettingsList');
        if (!list) return;

        const definitions = getDefinitions();
        if (!definitions.length) {
            list.innerHTML = '<div class="bookmark-identifier-settings-empty">No bookmark identifiers configured.</div>';
            return;
        }

        list.innerHTML = definitions.map((definition) => `
            <div class="bookmark-identifier-settings-row">
                <div class="bookmark-identifier-settings-meta">
                    <div class="bookmark-identifier-settings-preview">${buildBadgeHtml([definition.id])}</div>
                    ${definition.description ? `<div class="bookmark-identifier-settings-description">${escapeHtml(definition.description)}</div>` : ''}
                    <div class="bookmark-identifier-settings-quicklinks">${normalizeQuickLinks(definition.quickLinks).length} quick link card${normalizeQuickLinks(definition.quickLinks).length === 1 ? '' : 's'}</div>
                </div>
                <div class="bookmark-identifier-settings-actions">
                    <button type="button" onclick="editBookmarkIdentifierDefinition('${escapeHtml(definition.id)}')">Edit</button>
                    <button type="button" onclick="deleteBookmarkIdentifierDefinition('${escapeHtml(definition.id)}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    function readSettingsQuickLinks() {
        return normalizeQuickLinks(Array.from(document.querySelectorAll('#bookmarkIdentifierQuickLinksList [data-quicklink-workspace]')).map((node) => ({
            workspaceId: node.getAttribute('data-quicklink-workspace'),
            categoryName: node.getAttribute('data-quicklink-category')
        })));
    }

    function renderQuickLinkTargetSelect(selectedQuickLinks) {
        const select = document.getElementById('bookmarkIdentifierQuickLinkTarget');
        if (!select) return;
        const selectedKeys = new Set(normalizeQuickLinks(selectedQuickLinks).map((entry) => buildQuickLinkKey(entry.workspaceId, entry.categoryName)));
        const targets = getAllCardTargets().filter((target) => !selectedKeys.has(buildQuickLinkKey(target.workspaceId, target.categoryName)));
        select.innerHTML = targets.length
            ? targets.map((target) => `<option value="${escapeHtml(buildQuickLinkKey(target.workspaceId, target.categoryName))}">${escapeHtml(target.label)}</option>`).join('')
            : '<option value="">No available cards</option>';
    }

    function renderSettingsQuickLinks(quickLinks) {
        const list = document.getElementById('bookmarkIdentifierQuickLinksList');
        if (!list) return;
        const normalized = normalizeQuickLinks(quickLinks);
        const targets = new Map(getAllCardTargets().map((target) => [buildQuickLinkKey(target.workspaceId, target.categoryName), target]));
        list.innerHTML = normalized.length
            ? normalized.map((entry) => {
                const key = buildQuickLinkKey(entry.workspaceId, entry.categoryName);
                const target = targets.get(key);
                const label = target?.label || `${getWorkspaceLabel(entry.workspaceId)} / ${entry.categoryName}`;
                return `
                    <div class="bookmark-identifier-quicklink-chip" data-quicklink-workspace="${escapeHtml(entry.workspaceId)}" data-quicklink-category="${escapeHtml(entry.categoryName)}">
                        <span>${escapeHtml(label)}</span>
                        <button type="button" onclick="removeBookmarkIdentifierQuickLink('${escapeHtml(key)}')" aria-label="Remove quick link">Remove</button>
                    </div>
                `;
            }).join('')
            : '<div class="bookmark-identifier-quicklink-empty">No linked cards yet.</div>';
        renderQuickLinkTargetSelect(normalized);
    }

    function addQuickLinkFromSettings() {
        const select = document.getElementById('bookmarkIdentifierQuickLinkTarget');
        const parsed = parseQuickLinkKey(select?.value);
        if (!parsed) return;
        renderSettingsQuickLinks(readSettingsQuickLinks().concat(parsed));
    }

    function removeQuickLinkFromSettings(key) {
        const targetKey = String(key || '').trim();
        const next = readSettingsQuickLinks().filter((entry) => buildQuickLinkKey(entry.workspaceId, entry.categoryName) !== targetKey);
        renderSettingsQuickLinks(next);
    }

    function fillSettingsForm(definition) {
        const editId = document.getElementById('bookmarkIdentifierEditId');
        const label = document.getElementById('bookmarkIdentifierLabel');
        const icon = document.getElementById('bookmarkIdentifierIcon');
        const color = document.getElementById('bookmarkIdentifierColor');
        const description = document.getElementById('bookmarkIdentifierDescription');
        const saveButton = document.getElementById('bookmarkIdentifierSaveBtn');
        if (!editId || !label || !icon || !color || !description || !saveButton) return;

        editId.value = definition?.id || '';
        label.value = definition?.label || '';
        icon.value = definition?.icon || '';
        color.value = normalizeHexColor(definition?.color || '#5b8def');
        description.value = definition?.description || '';
        saveButton.textContent = definition ? 'Save Identifier' : 'Add Identifier';
        renderSettingsQuickLinks(definition?.quickLinks || []);
    }

    function clearSettingsForm() {
        fillSettingsForm(null);
    }

    function collectSettingsFormDefinition() {
        const label = String(document.getElementById('bookmarkIdentifierLabel')?.value || '').trim();
        if (!label) return null;
        return {
            id: String(document.getElementById('bookmarkIdentifierEditId')?.value || '').trim(),
            label,
            icon: String(document.getElementById('bookmarkIdentifierIcon')?.value || '').trim(),
            color: String(document.getElementById('bookmarkIdentifierColor')?.value || '').trim(),
            description: String(document.getElementById('bookmarkIdentifierDescription')?.value || '').trim(),
            quickLinks: readSettingsQuickLinks()
        };
    }

    function persistConfigAndRefresh() {
        if (typeof saveConfig === 'function') saveConfig({ immediate: true });
        renderSettingsManager();
        rerenderActiveModalEditor();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function saveDefinitionFromSettingsForm() {
        const cfg = getConfigObject();
        if (!cfg) return;
        const rawDefinition = collectSettingsFormDefinition();
        if (!rawDefinition) {
            if (typeof showToast === 'function') showToast('Identifier label is required.', 'warning');
            return;
        }

        const current = getDefinitions();
        const editingId = rawDefinition.id;
        const next = [];
        let updated = false;

        current.forEach((definition) => {
            if (editingId && definition.id === editingId) {
                next.push({
                    id: definition.id,
                    label: rawDefinition.label,
                    icon: rawDefinition.icon,
                    color: normalizeHexColor(rawDefinition.color, definition.color),
                    description: rawDefinition.description,
                    quickLinks: normalizeQuickLinks(rawDefinition.quickLinks)
                });
                updated = true;
                return;
            }
            next.push({ ...definition });
        });

        if (!updated) {
            const takenIds = new Set(next.map((definition) => definition.id));
            const normalized = normalizeDefinition(rawDefinition, takenIds, next.length);
            if (!normalized) {
                if (typeof showToast === 'function') showToast('Identifier label is required.', 'warning');
                return;
            }
            next.push(normalized);
        }

        cfg.bookmarkIdentifiers = next;
        clearSettingsForm();
        persistConfigAndRefresh();
    }

    function editDefinition(identifierId) {
        const definition = getDefinitions().find((entry) => entry.id === String(identifierId || '').trim());
        if (!definition) return;
        fillSettingsForm(definition);
    }

    async function deleteDefinition(identifierId) {
        const targetId = String(identifierId || '').trim();
        if (!targetId) return;
        const definitions = getDefinitions();
        const definition = definitions.find((entry) => entry.id === targetId);
        if (!definition) return;

        const confirmed = typeof showConfirm === 'function'
            ? await showConfirm(`Delete bookmark identifier "${definition.label}"?`)
            : window.confirm(`Delete bookmark identifier "${definition.label}"?`);
        if (!confirmed) return;

        const cfg = getConfigObject();
        if (!cfg) return;
        cfg.bookmarkIdentifiers = definitions.filter((entry) => entry.id !== targetId);

        getLinksList().forEach((link) => {
            const nextIds = getIdentifiersForLink(link).filter((id) => id !== targetId);
            if (nextIds.length) link.identifiers = nextIds;
            else delete link.identifiers;
        });

        if (typeof saveData === 'function') saveData({
            skipSuggestions: true,
            immediate: true,
            source: 'bookmark-identifier-deleted',
            meta: { identifierId: targetId }
        });
        if (typeof saveConfig === 'function') saveConfig({
            immediate: true,
            source: 'bookmark-identifier-deleted',
            meta: { identifierId: targetId }
        });
        clearSettingsForm();
        renderSettingsManager();
        rerenderActiveModalEditor();
    }

    async function quickAddBookmarkIdentifier() {
        const promptFn = typeof showPrompt === 'function' ? showPrompt : window.prompt;
        const result = promptFn('Enter a label for the new custom identifier:');
        
        const label = (result instanceof Promise) ? await result : result;
        if (!label || !label.trim()) return;

        const cfg = getConfigObject();
        if (!cfg) return;

        const rawDefinition = {
            id: '',
            label: label.trim(),
            icon: '',
            color: '#5b8def',
            description: ''
        };

        const current = getDefinitions();
        const takenIds = new Set(current.map((definition) => definition.id));
        const normalized = normalizeDefinition(rawDefinition, takenIds, current.length);
        if (!normalized) return;

        // Capture current checkbox state before re-rendering
        const currentSelection = readModalEditorSelection('newBookmarkIdentifiers');

        // Update config
        cfg.bookmarkIdentifiers = [...current, normalized];
        
        // Persist only the config (no dashboard re-render)
        if (typeof saveConfig === 'function') saveConfig({ immediate: true });
        renderSettingsManager();
        
        // Add new ID to selection and re-render the specific editor container
        currentSelection.push(normalized.id);
        const modal = document.getElementById('addModal');
        if (modal && modal.style.display === 'flex') {
            renderModalEditor('newBookmarkIdentifiers', currentSelection);
        }
    }

    async function resetToDefaults() {
        const confirmed = typeof showConfirm === 'function'
            ? await showConfirm('Restore default bookmark identifiers? This replaces the identifier registry but keeps matching bookmark assignments where IDs still exist.')
            : window.confirm('Restore default bookmark identifiers?');
        if (!confirmed) return;
        const cfg = getConfigObject();
        if (!cfg) return;
        cfg.bookmarkIdentifiers = normalizeRegistry(DEFAULT_IDENTIFIERS);
        clearSettingsForm();
        persistConfigAndRefresh();
    }

    ns.renderModalEditor = renderModalEditor;
    ns.readModalEditorSelection = readModalEditorSelection;
    ns.renderSettingsManager = renderSettingsManager;

    window.saveBookmarkIdentifierDefinition = saveDefinitionFromSettingsForm;
    window.clearBookmarkIdentifierForm = clearSettingsForm;
    window.editBookmarkIdentifierDefinition = editDefinition;
    window.deleteBookmarkIdentifierDefinition = deleteDefinition;
    window.resetBookmarkIdentifiersToDefaults = resetToDefaults;
    window.quickAddBookmarkIdentifier = quickAddBookmarkIdentifier;
    window.addBookmarkIdentifierQuickLink = addQuickLinkFromSettings;
    window.removeBookmarkIdentifierQuickLink = removeQuickLinkFromSettings;
})(window.EveBookmarkIdentifiers);
