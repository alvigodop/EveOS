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

    function setLinksList(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    function normalizeWorkspaceId(value) {
        return String(value || '').trim() || 'main';
    }

    function normalizeCategoryName(value) {
        return String(value || '').trim() || 'Unsorted';
    }

    function normalizeFolderId(value) {
        return String(value || '').trim();
    }

    function buildQuickLinkKey(workspaceId, categoryName) {
        return `${encodeURIComponent(normalizeWorkspaceId(workspaceId))}|${encodeURIComponent(normalizeCategoryName(categoryName))}`;
    }

    function parseQuickLinkKey(value) {
        const parts = String(value || '').split('|');
        if (parts.length < 2) return null;
        try {
            return {
                workspaceId: normalizeWorkspaceId(decodeURIComponent(parts[0])),
                categoryName: normalizeCategoryName(decodeURIComponent(parts.slice(1).join('|')))
            };
        } catch (error) {
            return null;
        }
    }

    function normalizeQuickLinks(value) {
        const source = Array.isArray(value) ? value : [];
        const seen = new Set();
        const result = [];
        source.forEach((item) => {
            const workspaceId = normalizeWorkspaceId(item?.workspaceId || item?.workspace || item?.tabId);
            const categoryName = normalizeCategoryName(item?.categoryName || item?.category || item?.cardName);
            if (!workspaceId || !categoryName) return;
            const key = buildQuickLinkKey(workspaceId, categoryName);
            if (seen.has(key)) return;
            seen.add(key);
            result.push({ workspaceId, categoryName });
        });
        return result;
    }

    function getConfigWorkspaces() {
        const cfg = getConfigObject();
        return Array.isArray(cfg?.workspaces) ? cfg.workspaces : [];
    }

    function getWorkspaceById(workspaceId) {
        const targetId = normalizeWorkspaceId(workspaceId);
        if (window.EveWorkspaceHelpers?.findById) {
            return window.EveWorkspaceHelpers.findById(getConfigWorkspaces(), targetId) || null;
        }
        let found = null;
        function visit(items) {
            if (!Array.isArray(items) || found) return;
            items.forEach((item) => {
                if (!item || found) return;
                if (String(item.id || '').trim() === targetId) {
                    found = item;
                    return;
                }
                visit(item.subTabs);
            });
        }
        visit(getConfigWorkspaces());
        return found;
    }

    function getWorkspaceLabel(workspaceId) {
        const targetId = normalizeWorkspaceId(workspaceId);
        const workspaces = getConfigWorkspaces();
        const helpers = window.EveWorkspaceHelpers;
        const parts = [];
        let cursor = helpers?.findById ? helpers.findById(workspaces, targetId) : getWorkspaceById(targetId);
        let guard = 0;
        while (cursor && guard < 64) {
            parts.unshift(String(cursor.name || cursor.id || 'Tab').trim() || 'Tab');
            const parent = helpers?.findParent ? helpers.findParent(workspaces, String(cursor.id || '')) : null;
            cursor = parent || null;
            guard += 1;
        }
        return parts.length ? parts.join(' > ') : targetId;
    }

    function collectWorkspaceIds() {
        const ids = [];
        function visit(items) {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                const id = String(item?.id || '').trim();
                if (id) ids.push(id);
                visit(item?.subTabs);
            });
        }
        visit(getConfigWorkspaces());
        getLinksList().forEach((link) => {
            const workspaceId = normalizeWorkspaceId(link?.workspace);
            if (!ids.includes(workspaceId)) ids.push(workspaceId);
        });
        if (!ids.length) ids.push('main');
        return ids;
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const names = new Set();
        if (window.EveCategoryOrder?.getOrder) {
            window.EveCategoryOrder.getOrder(targetWorkspaceId).forEach((name) => names.add(normalizeCategoryName(name)));
        }
        getLinksList().forEach((link) => {
            if (normalizeWorkspaceId(link?.workspace) !== targetWorkspaceId) return;
            names.add(normalizeCategoryName(link?.category));
        });
        const folderStore = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
        Object.keys(folderStore || {}).forEach((key) => {
            const prefix = `${targetWorkspaceId}::`;
            if (!String(key).startsWith(prefix)) return;
            names.add(normalizeCategoryName(String(key).slice(prefix.length)));
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    function getAllCardTargets() {
        const targets = [];
        const seen = new Set();
        collectWorkspaceIds().forEach((workspaceId) => {
            getCategoryNamesForWorkspace(workspaceId).forEach((categoryName) => {
                const key = buildQuickLinkKey(workspaceId, categoryName);
                if (seen.has(key)) return;
                seen.add(key);
                targets.push({
                    workspaceId: normalizeWorkspaceId(workspaceId),
                    categoryName: normalizeCategoryName(categoryName),
                    workspaceLabel: getWorkspaceLabel(workspaceId),
                    label: `${getWorkspaceLabel(workspaceId)} / ${normalizeCategoryName(categoryName)}`
                });
            });
        });
        return targets;
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
            description: String(raw.description || '').trim(),
            quickLinks: normalizeQuickLinks(raw.quickLinks)
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
        return ensureConfigDefaults().map((definition) => ({
            ...definition,
            quickLinks: normalizeQuickLinks(definition.quickLinks)
        }));
    }

    // Cached definition map — avoids rebuilding a new Map per getBadgeHtmlForLink call
    let _cachedDefMap = null;
    let _cachedDefMapSignature = '';

    function getDefinitionMap() {
        const defs = getDefinitions();
        const sig = JSON.stringify(defs.map((definition) => ({
            id: definition.id,
            label: definition.label,
            icon: definition.icon,
            color: definition.color,
            description: definition.description,
            quickLinks: normalizeQuickLinks(definition.quickLinks)
        })));
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

    function buildBadgeHtml(identifierIds, link) {
        const definitions = getDefinitionMap();
        const linkId = String(link?.id || '').trim();
        return normalizeIdentifierIds(identifierIds).map((id) => {
            const definition = definitions.get(id);
            if (!definition) return '';
            const title = definition.description ? ` title="${escapeHtml(definition.description)}"` : '';
            const linkAttrs = linkId
                ? ` data-bookmark-identifier-id="${escapeHtml(id)}" data-bookmark-id="${escapeHtml(linkId)}" tabindex="0" role="button" aria-label="${escapeHtml(definition.label)} quick label panel"`
                : '';
            const iconHtml = definition.icon
                ? `<span class="bookmark-identifier-badge__icon">${escapeHtml(definition.icon)}</span>`
                : '';
            return `<span class="bookmark-identifier-badge${linkId ? ' has-quick-panel' : ''}" style="${toBadgeStyle(definition.color)}"${title}${linkAttrs}>${iconHtml}<span class="bookmark-identifier-badge__label">${escapeHtml(definition.label)}</span></span>`;
        }).join('');
    }

    function getBadgeHtmlForLink(link) {
        return buildBadgeHtml(getIdentifiersForLink(link), link);
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

    let quickPanelEl = null;
    let quickPanelHideTimer = 0;
    let quickPanelState = null;
    let quickPanelListenersAttached = false;

    function findLinkById(linkId) {
        const targetId = String(linkId || '').trim();
        if (!targetId) return null;
        return getLinksList().find((link) => String(link?.id || '').trim() === targetId) || null;
    }

    function getDefinitionById(identifierId) {
        const targetId = String(identifierId || '').trim();
        if (!targetId) return null;
        return getDefinitions().find((definition) => definition.id === targetId) || null;
    }

    function getPanelElement() {
        if (typeof document === 'undefined') return null;
        if (quickPanelEl && document.body.contains(quickPanelEl)) return quickPanelEl;
        quickPanelEl = document.createElement('div');
        quickPanelEl.id = 'bookmarkIdentifierQuickPanel';
        quickPanelEl.className = 'bookmark-identifier-panel';
        quickPanelEl.addEventListener('mouseenter', cancelQuickPanelHide);
        quickPanelEl.addEventListener('mouseleave', scheduleQuickPanelHide);
        quickPanelEl.addEventListener('mousemove', (event) => {
            event.stopPropagation();
            window.hideBookmarkCoverHover?.();
        });
        quickPanelEl.addEventListener('click', handleQuickPanelClick);
        document.body.appendChild(quickPanelEl);
        return quickPanelEl;
    }

    function cancelQuickPanelHide() {
        if (quickPanelHideTimer) {
            clearTimeout(quickPanelHideTimer);
            quickPanelHideTimer = 0;
        }
    }

    function scheduleQuickPanelHide() {
        cancelQuickPanelHide();
        quickPanelHideTimer = setTimeout(hideQuickPanel, 220);
    }

    function hideQuickPanel() {
        cancelQuickPanelHide();
        if (quickPanelEl) quickPanelEl.classList.remove('is-open');
        quickPanelState = null;
    }

    function positionQuickPanel() {
        const panel = getPanelElement();
        const anchor = quickPanelState?.anchor;
        if (!panel || !anchor || !document.body.contains(anchor)) return;
        const anchorRect = anchor.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const margin = 12;
        const left = Math.max(margin, Math.min(
            window.innerWidth - panelRect.width - margin,
            anchorRect.left + (anchorRect.width / 2) - (panelRect.width / 2)
        ));
        const topCandidate = anchorRect.top - panelRect.height - margin;
        const top = topCandidate > margin
            ? topCandidate
            : Math.min(window.innerHeight - panelRect.height - margin, anchorRect.bottom + margin);
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(Math.max(margin, top))}px`;
    }

    function getIdentifierStats(identifierId) {
        const targetId = String(identifierId || '').trim();
        const matching = getLinksList().filter((link) => getIdentifiersForLink(link).includes(targetId));
        const workspaces = new Set(matching.map((link) => normalizeWorkspaceId(link.workspace)));
        const cards = new Set(matching.map((link) => `${normalizeWorkspaceId(link.workspace)}::${normalizeCategoryName(link.category)}`));
        return {
            bookmarkCount: matching.length,
            workspaceCount: workspaces.size,
            cardCount: cards.size
        };
    }

    function getFolderNodes(workspaceId, categoryName) {
        if (typeof window.EveBookmarkFolders?.getScopedNodes === 'function') {
            return window.EveBookmarkFolders.getScopedNodes(workspaceId, categoryName) || [];
        }
        return [];
    }

    function getChildFolders(workspaceId, categoryName, folderId) {
        const parentId = normalizeFolderId(folderId);
        return getFolderNodes(workspaceId, categoryName)
            .filter((node) => normalizeFolderId(node?.parentId) === parentId)
            .sort((a, b) => {
                const orderDiff = (Number(a?.order) || 0) - (Number(b?.order) || 0);
                if (orderDiff !== 0) return orderDiff;
                return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
            });
    }

    function getParentFolderId(workspaceId, categoryName, folderId) {
        const targetId = normalizeFolderId(folderId);
        if (!targetId) return '';
        const node = getFolderNodes(workspaceId, categoryName).find((entry) => normalizeFolderId(entry?.id) === targetId);
        return normalizeFolderId(node?.parentId);
    }

    function getFolderPathLabel(workspaceId, categoryName, folderId) {
        if (!folderId) return 'Root';
        if (typeof window.EveBookmarkFolders?.buildFolderPathLabel === 'function') {
            return window.EveBookmarkFolders.buildFolderPathLabel(workspaceId, categoryName, folderId) || 'Folder';
        }
        const nodes = getFolderNodes(workspaceId, categoryName);
        const map = new Map(nodes.map((node) => [normalizeFolderId(node?.id), node]));
        const parts = [];
        let cursor = map.get(normalizeFolderId(folderId));
        let guard = 0;
        while (cursor && guard < 64) {
            parts.unshift(String(cursor.name || 'Folder').trim() || 'Folder');
            cursor = map.get(normalizeFolderId(cursor.parentId));
            guard += 1;
        }
        return parts.join(' / ') || 'Folder';
    }

    function getBookmarksForFolder(workspaceId, categoryName, folderId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const targetFolderId = normalizeFolderId(folderId);
        return getLinksList().filter((link) => (
            normalizeWorkspaceId(link?.workspace) === targetWorkspaceId
            && normalizeCategoryName(link?.category) === targetCategoryName
            && normalizeFolderId(link?.folderId) === targetFolderId
        )).sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' }));
    }

    function renderSummaryPanel(definition, link) {
        const stats = getIdentifierStats(definition.id);
        const quickLinks = normalizeQuickLinks(definition.quickLinks);
        const currentCard = `${getWorkspaceLabel(link?.workspace)} / ${normalizeCategoryName(link?.category)}`;
        return `
            <div class="bookmark-identifier-panel__topline">
                <div class="bookmark-identifier-panel__badge">${buildBadgeHtml([definition.id])}</div>
                <div class="bookmark-identifier-panel__top-actions">
                    <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="quick">Quick Links</button>
                    <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="close">Close</button>
                </div>
            </div>
            <div class="bookmark-identifier-panel__title">${escapeHtml(definition.label)}</div>
            <p class="bookmark-identifier-panel__desc">${escapeHtml(definition.description || 'No description set for this label yet.')}</p>
            <div class="bookmark-identifier-panel__stats">
                <div><strong>${stats.bookmarkCount}</strong><span>Bookmarks</span></div>
                <div><strong>${stats.cardCount}</strong><span>Cards</span></div>
                <div><strong>${quickLinks.length}</strong><span>Quick Links</span></div>
            </div>
            <div class="bookmark-identifier-panel__context">Current: ${escapeHtml(currentCard)}</div>
            <button type="button" class="bookmark-identifier-panel__primary" data-bi-action="quick">Open Quick Links</button>
        `;
    }

    function renderCardButtons(definition) {
        const quickLinks = normalizeQuickLinks(definition.quickLinks);
        if (!quickLinks.length) {
            return '<div class="bookmark-identifier-panel__empty">No quick-link cards are attached to this label yet. Add them in Settings.</div>';
        }
        const selectedKey = quickPanelState?.target
            ? buildQuickLinkKey(quickPanelState.target.workspaceId, quickPanelState.target.categoryName)
            : '';
        return quickLinks.map((entry) => {
            const key = buildQuickLinkKey(entry.workspaceId, entry.categoryName);
            const isActive = key === selectedKey ? ' is-active' : '';
            return `
                <button type="button" class="bookmark-identifier-panel__card${isActive}" data-bi-action="card" data-key="${escapeHtml(key)}">
                    <span>${escapeHtml(entry.categoryName)}</span>
                    <small>${escapeHtml(getWorkspaceLabel(entry.workspaceId))}</small>
                </button>
            `;
        }).join('');
    }

    function renderFolderBrowser(target) {
        if (!target?.workspaceId || !target?.categoryName) {
            return '<div class="bookmark-identifier-panel__empty">Pick a quick-link card to inspect it.</div>';
        }
        const folderId = normalizeFolderId(target.folderId);
        const folders = getChildFolders(target.workspaceId, target.categoryName, folderId);
        const bookmarks = getBookmarksForFolder(target.workspaceId, target.categoryName, folderId);
        const pathLabel = getFolderPathLabel(target.workspaceId, target.categoryName, folderId);
        const folderRows = folders.map((folder) => `
            <button type="button" class="bookmark-identifier-panel__folder-row" data-bi-action="folder" data-folder-id="${escapeHtml(folder.id)}">
                <span>${escapeHtml(folder.name || 'Folder')}</span>
                <small>Open folder</small>
            </button>
        `).join('');
        const bookmarkRows = bookmarks.slice(0, 80).map((bookmark) => `
            <div class="bookmark-identifier-panel__bookmark-row">
                <span>${escapeHtml(bookmark.title || 'Untitled')}</span>
                <small>${escapeHtml(String(bookmark.url || '').replace(/^https?:\/\//, '').slice(0, 72))}</small>
            </div>
        `).join('');
        const overflow = bookmarks.length > 80
            ? `<div class="bookmark-identifier-panel__overflow">Showing 80 of ${bookmarks.length} bookmarks.</div>`
            : '';
        return `
            <div class="bookmark-identifier-panel__browser-head">
                <div>
                    <strong>${escapeHtml(target.categoryName)}</strong>
                    <span>${escapeHtml(pathLabel)}</span>
                </div>
                ${folderId ? '<button type="button" data-bi-action="up">Up</button>' : ''}
            </div>
            <button type="button" class="bookmark-identifier-panel__primary" data-bi-action="move">Transfer Bookmark Here</button>
            <div class="bookmark-identifier-panel__browser-list">
                ${folderRows || ''}
                ${bookmarkRows || ''}
                ${(!folderRows && !bookmarkRows) ? '<div class="bookmark-identifier-panel__empty">This location is empty.</div>' : ''}
                ${overflow}
            </div>
        `;
    }

    function renderQuickLinksPanel(definition) {
        const quickLinks = normalizeQuickLinks(definition.quickLinks);
        if (!quickPanelState.target && quickLinks.length) {
            quickPanelState.target = { ...quickLinks[0], folderId: '' };
        }
        return `
            <div class="bookmark-identifier-panel__topline">
                <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="summary">Back</button>
                <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="close">Close</button>
            </div>
            <div class="bookmark-identifier-panel__title">Quick Links</div>
            <div class="bookmark-identifier-panel__cards">${renderCardButtons(definition)}</div>
            ${renderFolderBrowser(quickPanelState.target)}
        `;
    }

    function renderQuickPanel() {
        const panel = getPanelElement();
        if (!panel || !quickPanelState) return;
        const definition = getDefinitionById(quickPanelState.identifierId);
        const link = findLinkById(quickPanelState.linkId);
        if (!definition || !link) {
            hideQuickPanel();
            return;
        }
        panel.innerHTML = quickPanelState.page === 'quick'
            ? renderQuickLinksPanel(definition, link)
            : renderSummaryPanel(definition, link);
        panel.classList.add('is-open');
        requestAnimationFrame(positionQuickPanel);
    }

    function showQuickPanelForBadge(badge) {
        if (!badge) return;
        const identifierId = String(badge.getAttribute('data-bookmark-identifier-id') || '').trim();
        const linkId = String(badge.getAttribute('data-bookmark-id') || '').trim();
        if (!identifierId || !linkId) return;
        cancelQuickPanelHide();
        window.hideBookmarkCoverHover?.();
        quickPanelState = {
            anchor: badge,
            identifierId,
            linkId,
            page: 'summary',
            target: null
        };
        renderQuickPanel();
    }

    function showQuickLinksView() {
        if (!quickPanelState) return;
        quickPanelState.page = 'quick';
        renderQuickPanel();
    }

    function showSummaryView() {
        if (!quickPanelState) return;
        quickPanelState.page = 'summary';
        renderQuickPanel();
    }

    function openQuickLinkCard(key) {
        if (!quickPanelState) return;
        const parsed = parseQuickLinkKey(key);
        if (!parsed) return;
        quickPanelState.page = 'quick';
        quickPanelState.target = { ...parsed, folderId: '' };
        renderQuickPanel();
    }

    function openQuickLinkFolder(folderId) {
        if (!quickPanelState?.target) return;
        quickPanelState.target = {
            ...quickPanelState.target,
            folderId: normalizeFolderId(folderId)
        };
        renderQuickPanel();
    }

    function quickLinkGoUp() {
        if (!quickPanelState?.target) return;
        quickPanelState.target = {
            ...quickPanelState.target,
            folderId: getParentFolderId(
                quickPanelState.target.workspaceId,
                quickPanelState.target.categoryName,
                quickPanelState.target.folderId
            )
        };
        renderQuickPanel();
    }

    function transferActiveBookmarkToQuickLinkTarget() {
        const state = quickPanelState;
        const target = state?.target;
        const link = findLinkById(state?.linkId);
        if (!target?.workspaceId || !target?.categoryName || !link) {
            if (typeof showToast === 'function') showToast('Choose a quick-link destination first.', 'warning');
            return false;
        }

        const linkId = String(link.id);
        let moved = false;
        if (typeof window.EveBookmarkFolders?.moveLinksToFolderTarget === 'function') {
            moved = !!window.EveBookmarkFolders.moveLinksToFolderTarget(
                [linkId],
                target.workspaceId,
                target.categoryName,
                normalizeFolderId(target.folderId),
                { immediate: true }
            );
        } else if (window.EveBookmarkMerge?.moveOrMergeLinkToScope) {
            const result = window.EveBookmarkMerge.moveOrMergeLinkToScope(link, {
                workspaceId: target.workspaceId,
                categoryName: target.categoryName,
                folderId: normalizeFolderId(target.folderId)
            }, {
                source: 'bookmark-identifier-quick-link-move',
                links: getLinksList()
            });
            moved = !!(result?.moved || result?.merged);
            if (moved) {
                setLinksList(getLinksList());
                if (typeof saveData === 'function') {
                    saveData({
                        forceRender: true,
                        immediate: true,
                        source: 'bookmark-identifier-quick-link-move',
                        meta: {
                            linkId,
                            workspaceId: target.workspaceId,
                            categoryName: target.categoryName,
                            folderId: normalizeFolderId(target.folderId),
                            merged: !!result?.merged,
                            removedLinkIds: result?.removedIds || []
                        }
                    });
                }
            }
        }

        if (!moved) {
            if (typeof showToast === 'function') showToast('Bookmark is already at that destination.', 'info');
            return false;
        }
        if (typeof showToast === 'function') {
            const folderLabel = target.folderId ? ` / ${getFolderPathLabel(target.workspaceId, target.categoryName, target.folderId)}` : '';
            showToast(`Bookmark sent to ${target.categoryName}${folderLabel}`, 'success');
        }
        hideQuickPanel();
        if (typeof renderDashboard === 'function') renderDashboard();
        return true;
    }

    function handleQuickPanelClick(event) {
        const target = event.target?.closest?.('[data-bi-action]');
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        const action = target.getAttribute('data-bi-action');
        if (action === 'close') hideQuickPanel();
        else if (action === 'quick') showQuickLinksView();
        else if (action === 'summary') showSummaryView();
        else if (action === 'card') openQuickLinkCard(target.getAttribute('data-key'));
        else if (action === 'folder') openQuickLinkFolder(target.getAttribute('data-folder-id'));
        else if (action === 'up') quickLinkGoUp();
        else if (action === 'move') transferActiveBookmarkToQuickLinkTarget();
    }

    function getBadgeFromEvent(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return null;
        return target.closest('.bookmark-identifier-badge[data-bookmark-id][data-bookmark-identifier-id]');
    }

    function isInsideQuickPanel(target) {
        return !!(quickPanelEl && target && quickPanelEl.contains(target));
    }

    function attachQuickPanelListeners() {
        if (quickPanelListenersAttached || typeof document === 'undefined') return;
        document.addEventListener('mouseover', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge || badge.contains(event.relatedTarget)) return;
            event.stopPropagation();
            showQuickPanelForBadge(badge);
        }, true);
        document.addEventListener('mouseout', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge) return;
            const next = event.relatedTarget;
            if (badge.contains(next) || isInsideQuickPanel(next)) return;
            scheduleQuickPanelHide();
        }, true);
        document.addEventListener('mousemove', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge && !isInsideQuickPanel(event.target)) return;
            event.stopPropagation();
            window.hideBookmarkCoverHover?.();
        }, true);
        document.addEventListener('click', (event) => {
            const badge = getBadgeFromEvent(event);
            if (badge) {
                event.preventDefault();
                event.stopPropagation();
                showQuickPanelForBadge(badge);
                return;
            }
            if (!isInsideQuickPanel(event.target)) hideQuickPanel();
        }, true);
        document.addEventListener('focusin', (event) => {
            const badge = getBadgeFromEvent(event);
            if (badge) showQuickPanelForBadge(badge);
        }, true);
        document.addEventListener('keydown', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showQuickPanelForBadge(badge);
            } else if (event.key === 'Escape') {
                hideQuickPanel();
            }
        }, true);
        window.addEventListener?.('resize', positionQuickPanel);
        quickPanelListenersAttached = true;
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
    ns.getAllCardTargets = getAllCardTargets;
    ns.showQuickPanel = function (eventOrElement) {
        const badge = eventOrElement?.currentTarget || eventOrElement?.target || eventOrElement;
        showQuickPanelForBadge(badge);
    };
    ns.showQuickLinksView = showQuickLinksView;
    ns.showSummaryView = showSummaryView;
    ns.openQuickLinkCard = openQuickLinkCard;
    ns.openQuickLinkFolder = openQuickLinkFolder;
    ns.quickLinkGoUp = quickLinkGoUp;
    ns.transferActiveBookmarkToQuickLinkTarget = transferActiveBookmarkToQuickLinkTarget;

    window.saveBookmarkIdentifierDefinition = saveDefinitionFromSettingsForm;
    window.clearBookmarkIdentifierForm = clearSettingsForm;
    window.editBookmarkIdentifierDefinition = editDefinition;
    window.deleteBookmarkIdentifierDefinition = deleteDefinition;
    window.resetBookmarkIdentifiersToDefaults = resetToDefaults;
    window.quickAddBookmarkIdentifier = quickAddBookmarkIdentifier;
    window.addBookmarkIdentifierQuickLink = addQuickLinkFromSettings;
    window.removeBookmarkIdentifierQuickLink = removeQuickLinkFromSettings;

    ensureConfigDefaults();
    attachQuickPanelListeners();
})(window.EveBookmarkIdentifiers);
