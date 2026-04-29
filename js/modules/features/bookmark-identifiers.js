window.EveBookmarkIdentifiers = window.EveBookmarkIdentifiers || {};

(function (ns) {
    if (ns.ready) return;

    const DEFAULT_IDENTIFIERS = Object.freeze([
        { id: 'reading', label: 'Reading', icon: '', color: '#4f8cff', description: 'Long-form text, books, manga, articles, or written research.' },
        { id: 'watching', label: 'Watching', icon: '', color: '#ff7a59', description: 'Video-first content such as films, shows, clips, or streams.' },
        { id: 'listening', label: 'Listening', icon: '', color: '#9b6bff', description: 'Audio-first content such as podcasts, music, or spoken material.' },
        { id: 'playing', label: 'Playing', icon: '', color: '#2db784', description: 'Games, interactive media, or playable experiences.' },
        { id: 'research', label: 'Research', icon: '', color: '#f2b94b', description: 'Material kept for investigation, study, or later synthesis.' },
        { id: 'reference', label: 'Reference', icon: '', color: '#7a8a99', description: 'Stable reference material worth keeping distinct from active consumption.' }
    ]);

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function slugifyIdentifierId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function normalizeHexColor(value, fallback = '#5b8def') {
        const input = String(value || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(input)) return input.toLowerCase();
        if (/^#[0-9a-f]{3}$/i.test(input)) {
            const normalized = input.slice(1).split('').map((part) => part + part).join('');
            return `#${normalized}`.toLowerCase();
        }
        return fallback.toLowerCase();
    }

    function hexToRgb(hex) {
        const normalized = normalizeHexColor(hex);
        const raw = normalized.slice(1);
        return {
            r: parseInt(raw.slice(0, 2), 16),
            g: parseInt(raw.slice(2, 4), 16),
            b: parseInt(raw.slice(4, 6), 16)
        };
    }

    function toBadgeStyle(color) {
        const rgb = hexToRgb(color);
        return [
            `color:${color}`,
            `border-color:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.38)`,
            `background:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`
        ].join(';');
    }

    function getConfigObject() {
        if (window.eveState?.config && typeof window.eveState.config === 'object') return window.eveState.config;
        if (typeof config !== 'undefined' && config && typeof config === 'object') return config;
        return null;
    }

    function getLinksList() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function createUniqueId(baseId, takenIds) {
        const fallbackBase = baseId || 'identifier';
        if (!takenIds.has(fallbackBase)) return fallbackBase;
        let index = 2;
        while (takenIds.has(`${fallbackBase}-${index}`)) index += 1;
        return `${fallbackBase}-${index}`;
    }

    function normalizeDefinition(raw, takenIds, fallbackIndex) {
        if (!raw || typeof raw !== 'object') return null;
        const label = String(raw.label || '').trim();
        if (!label) return null;
        const requestedId = slugifyIdentifierId(raw.id || label || `identifier-${fallbackIndex}`);
        const id = createUniqueId(requestedId || `identifier-${fallbackIndex}`, takenIds);
        takenIds.add(id);
        return {
            id,
            label,
            icon: String(raw.icon || '').trim(),
            color: normalizeHexColor(raw.color, DEFAULT_IDENTIFIERS[fallbackIndex % DEFAULT_IDENTIFIERS.length]?.color || '#5b8def'),
            description: String(raw.description || '').trim()
        };
    }

    function normalizeRegistry(registry) {
        const source = Array.isArray(registry) ? registry : [];
        const takenIds = new Set();
        return source
            .map((item, index) => normalizeDefinition(item, takenIds, index))
            .filter(Boolean);
    }

    function ensureConfigDefaults() {
        const cfg = getConfigObject();
        if (!cfg) return [];
        const existing = normalizeRegistry(cfg.bookmarkIdentifiers);
        if (existing.length) {
            cfg.bookmarkIdentifiers = existing;
            return existing;
        }
        const defaults = normalizeRegistry(DEFAULT_IDENTIFIERS);
        cfg.bookmarkIdentifiers = defaults;
        return defaults;
    }

    function getDefinitions() {
        return ensureConfigDefaults().map((definition) => ({ ...definition }));
    }

    // Cached definition map — avoids rebuilding a new Map per getBadgeHtmlForLink call
    let _cachedDefMap = null;
    let _cachedDefMapSignature = '';

    function getDefinitionMap() {
        const defs = getDefinitions();
        // Build a cheap signature from count + first/last IDs
        const sig = defs.length + ':' + (defs[0]?.id || '') + ':' + (defs[defs.length - 1]?.id || '');
        if (_cachedDefMap && _cachedDefMapSignature === sig) {
            return _cachedDefMap;
        }
        _cachedDefMap = new Map(defs.map((definition) => [definition.id, definition]));
        _cachedDefMapSignature = sig;
        return _cachedDefMap;
    }

    function normalizeIdentifierIds(value) {
        const validIds = new Set(getDefinitions().map((definition) => definition.id));
        const rawIds = Array.isArray(value) ? value : [];
        const result = [];
        rawIds.forEach((item) => {
            const normalized = String(item || '').trim();
            if (!normalized || !validIds.has(normalized) || result.includes(normalized)) return;
            result.push(normalized);
        });
        return result;
    }

    function getIdentifiersForLink(link) {
        return normalizeIdentifierIds(link?.identifiers);
    }

    function buildBadgeHtml(identifierIds) {
        const definitions = getDefinitionMap();
        return normalizeIdentifierIds(identifierIds).map((id) => {
            const definition = definitions.get(id);
            if (!definition) return '';
            const title = definition.description ? ` title="${escapeHtml(definition.description)}"` : '';
            const iconHtml = definition.icon
                ? `<span class="bookmark-identifier-badge__icon">${escapeHtml(definition.icon)}</span>`
                : '';
            return `<span class="bookmark-identifier-badge" style="${toBadgeStyle(definition.color)}"${title}>${iconHtml}<span class="bookmark-identifier-badge__label">${escapeHtml(definition.label)}</span></span>`;
        }).join('');
    }

    function getBadgeHtmlForLink(link) {
        return buildBadgeHtml(getIdentifiersForLink(link));
    }

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
                </div>
                <div class="bookmark-identifier-settings-actions">
                    <button type="button" onclick="editBookmarkIdentifierDefinition('${escapeHtml(definition.id)}')">Edit</button>
                    <button type="button" onclick="deleteBookmarkIdentifierDefinition('${escapeHtml(definition.id)}')">Delete</button>
                </div>
            </div>
        `).join('');
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
            description: String(document.getElementById('bookmarkIdentifierDescription')?.value || '').trim()
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
                    description: rawDefinition.description
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

    ns.ready = true;
    ns.ensureConfigDefaults = ensureConfigDefaults;
    ns.getDefinitions = getDefinitions;
    ns.getIdentifiersForLink = getIdentifiersForLink;
    ns.getBadgeHtmlForLink = getBadgeHtmlForLink;
    ns.buildBadgeHtml = buildBadgeHtml;
    ns.renderModalEditor = renderModalEditor;
    ns.readModalEditorSelection = readModalEditorSelection;
    ns.renderSettingsManager = renderSettingsManager;

    window.saveBookmarkIdentifierDefinition = saveDefinitionFromSettingsForm;
    window.clearBookmarkIdentifierForm = clearSettingsForm;
    window.editBookmarkIdentifierDefinition = editDefinition;
    window.deleteBookmarkIdentifierDefinition = deleteDefinition;
    window.resetBookmarkIdentifiersToDefaults = resetToDefaults;
    window.quickAddBookmarkIdentifier = quickAddBookmarkIdentifier;

    ensureConfigDefaults();
})(window.EveBookmarkIdentifiers);
