function getModalLinks() {
    if (window.eveState?.links) return window.eveState.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function toSafeText(value) {
    return String(value ?? '').trim();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getAllCategoryNames() {
    return [...new Set(
        getModalLinks()
            .map(link => toSafeText(link?.category) || 'Unsorted')
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
}

function getEditorWorkspaceId() {
    const editId = toSafeText(document.getElementById('editId')?.value);
    if (editId) {
        const link = getModalLinks().find(item => String(item?.id) === editId);
        if (link?.workspace) return String(link.workspace);
    }
    if (window.eveState?.config?.activeWorkspace) return String(window.eveState.config.activeWorkspace);
    if (typeof config !== 'undefined' && config?.activeWorkspace) return String(config.activeWorkspace);
    return '';
}

function getEditorCategoryNames() {
    const workspaceId = getEditorWorkspaceId();
    const scopedLinks = workspaceId
        ? getModalLinks().filter(link => String(link?.workspace || '') === workspaceId)
        : getModalLinks();

    return [...new Set(
        scopedLinks
            .map(link => toSafeText(link?.category) || 'Unsorted')
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
}

function getCategoryNamesByScope(scope) {
    return scope === 'editor' ? getEditorCategoryNames() : getAllCategoryNames();
}

function renderCategoryQuickPicker(filterText) {
    const picker = document.getElementById('newCategoryQuickPicker');
    if (!picker) return;

    const categories = getAllCategoryNames();
    const query = toSafeText(filterText).toLowerCase();
    const filtered = query
        ? categories.filter(name => name.toLowerCase().includes(query))
        : categories;

    if (filtered.length === 0) {
        picker.innerHTML = '<div style="padding:8px 10px; font-size:0.82rem; opacity:0.75;">No matching cards</div>';
        return;
    }

    picker.innerHTML = filtered.map(name => {
        const safeLabel = escapeHtml(name);
        const encoded = encodeURIComponent(name);
        return `
            <button type="button"
                style="display:block; width:100%; text-align:left; background:transparent; border:0; border-bottom:1px solid rgba(255,255,255,0.08); padding:8px 10px; color:var(--text-main); cursor:pointer;"
                onmousedown="selectCategoryQuickPicker('${encoded}')"
                title="${safeLabel}">
                ${safeLabel}
            </button>
        `;
    }).join('');
}

window.refreshCategoryDatalist = function (options = {}) {
    const dataList = document.getElementById('availableCategories');
    if (!dataList) return;

    const scope = options?.scope === 'editor' ? 'editor' : 'all';
    const categories = getCategoryNamesByScope(scope);
    dataList.innerHTML = '';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        dataList.appendChild(option);
    });

    renderCategoryQuickPicker(document.getElementById('newCategory')?.value || '');
};

window.showCategoryQuickPicker = function () {
    const picker = document.getElementById('newCategoryQuickPicker');
    if (!picker) return;
    // On open, always show the full card list so users don't have to clear current value first.
    renderCategoryQuickPicker('');
    picker.style.display = 'block';
};

window.filterCategoryQuickPicker = function (value) {
    const picker = document.getElementById('newCategoryQuickPicker');
    if (!picker) return;
    renderCategoryQuickPicker(value || '');
    picker.style.display = 'block';
};

window.hideCategoryQuickPicker = function () {
    const picker = document.getElementById('newCategoryQuickPicker');
    if (picker) picker.style.display = 'none';
};

window.handleCategoryQuickPickerBlur = function () {
    window.setTimeout(() => {
        window.hideCategoryQuickPicker();
    }, 120);
};

window.selectCategoryQuickPicker = function (encodedCategory) {
    let decoded = '';
    try {
        decoded = decodeURIComponent(String(encodedCategory || ''));
    } catch (error) {
        decoded = String(encodedCategory || '');
    }

    const input = document.getElementById('newCategory');
    if (input) {
        input.value = decoded;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    }
    window.hideCategoryQuickPicker();
};

if (!window.__eveCategoryQuickPickerOutsideCloseBound) {
    window.__eveCategoryQuickPickerOutsideCloseBound = true;
    document.addEventListener('mousedown', (event) => {
        const picker = document.getElementById('newCategoryQuickPicker');
        const input = document.getElementById('newCategory');
        if (!picker || picker.style.display !== 'block') return;

        const clickedInput = !!input && (event.target === input || input.contains(event.target));
        const clickedPicker = picker.contains(event.target);
        if (!clickedInput && !clickedPicker) {
            window.hideCategoryQuickPicker();
        }
    });
}
