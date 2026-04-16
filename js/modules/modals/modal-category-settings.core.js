window.currentCategoryCtx = null;

window.categoryFolderCreateDraft = window.categoryFolderCreateDraft || {
    mode: 'create',
    categoryName: '',
    parentId: '',
    folderId: '',
    initialName: ''
};

window.categoryFolderActionExpansion = window.categoryFolderActionExpansion || {};

(function () {


    function escapeCategorySettingsHtml(value) {

        return String(value ?? '')

            .replace(/&/g, '&amp;')

            .replace(/</g, '&lt;')

            .replace(/>/g, '&gt;')

            .replace(/"/g, '&quot;')

            .replace(/'/g, '&#39;');

    }



    function escapeCategorySettingsJs(value) {

        return String(value ?? '')

            .replace(/\\/g, '\\\\')

            .replace(/'/g, "\\'");

    }



    function getCategorySettingsWorkspaceId() {

        let explicitWsId = null;
        try { explicitWsId = localStorage.getItem('eve_current_category_workspace'); } catch (e) {}

        return String(explicitWsId || window.eveState?.config?.activeWorkspace || (typeof config !== 'undefined' ? config?.activeWorkspace : '') || 'main').trim() || 'main';

    }



    function getFolderApi() {

        return window.EveBookmarkFolders || null;

    }



    function getFolderActionExpansionStore() {

        if (!window.categoryFolderActionExpansion || typeof window.categoryFolderActionExpansion !== 'object') {

            window.categoryFolderActionExpansion = {};

        }

        return window.categoryFolderActionExpansion;

    }



    function folderActionExpansionKey(workspaceId, categoryName, folderId) {

        return [

            String(workspaceId || 'main').trim() || 'main',

            String(categoryName || 'Unsorted').trim() || 'Unsorted',

            String(folderId || '').trim()

        ].join('::');

    }



    function isFolderActionExpanded(workspaceId, categoryName, folderId) {

        return !!getFolderActionExpansionStore()[folderActionExpansionKey(workspaceId, categoryName, folderId)];

    }



    const HEADER_BUTTON_OPTIONS = [

        { id: 'add', label: '➕ Add Bookmark' },

        { id: 'folders', label: '📁 Folders' },

        { id: 'library', label: '📚 Library' },

        { id: 'focus', label: '🎯 Focus' },

        { id: 'launch', label: '🚀 Launch' },

        { id: 'constellation', label: '🌌 Constellation Map' }

    ];



    function getFolderDraft() {

        if (!window.categoryFolderCreateDraft || typeof window.categoryFolderCreateDraft !== 'object') {

            window.categoryFolderCreateDraft = {

                mode: 'create',

                categoryName: '',

                parentId: '',

                folderId: '',

                initialName: ''

            };

        }

        return window.categoryFolderCreateDraft;

    }



    function setFolderDraft(nextDraft) {

        window.categoryFolderCreateDraft = {

            mode: String(nextDraft?.mode || 'create').trim() || 'create',

            categoryName: String(nextDraft?.categoryName || '').trim(),

            parentId: String(nextDraft?.parentId || '').trim(),

            folderId: String(nextDraft?.folderId || '').trim(),

            initialName: String(nextDraft?.initialName || '').trim()

        };

    }



    function getFolderDraftCategoryName() {

        return String(getFolderDraft().categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';

    }



    function getFolderDraftMode() {

        return getFolderDraft().mode === 'rename' ? 'rename' : 'create';

    }



    function getHeaderButtonApi() {

        return window.DashboardCategories || null;

    }



    function getClickBehaviorApi() {

        return window.EveBookmarkClickBehavior || null;

    }



    function getPinApi() {

        return window.EveQuickPins || null;

    }



    function isCategorySettingsVisibleFor(categoryName) {

        const modal = document.getElementById('categorySettingsModal');

        return !!modal

            && modal.style.display === 'flex'

            && String(window.currentCategoryCtx || '').trim() === String(categoryName || '').trim();

    }



    function renderCategoryHeaderButtonSettings() {

        const container = document.getElementById('categoryHeaderButtonSettings');

        if (!container) return;

        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';

        const workspaceId = getCategorySettingsWorkspaceId();

        const headerButtonApi = getHeaderButtonApi();

        const visibleButtons = new Set(headerButtonApi?.getCardHeaderButtonsForCategory?.(workspaceId, categoryName) || []);



        container.innerHTML = HEADER_BUTTON_OPTIONS.map((option) => {

            const checked = visibleButtons.has(option.id) ? ' checked' : '';

            return ''

                + '<label style="display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid rgba(255,255,255,0.08); border-radius:8px; cursor:pointer;">'

                    + `<input type="checkbox" data-header-button-id="${escapeCategorySettingsHtml(option.id)}"${checked} onchange="toggleCategoryHeaderButtonSetting('${escapeCategorySettingsJs(option.id)}', this.checked)">`

                    + `<span>${escapeCategorySettingsHtml(option.label)}</span>`

                + '</label>';

        }).join('');

    }



    function renderCategoryClickBehaviorSettings() {

        const select = document.getElementById('categoryClickBehaviorSelect');

        const hint = document.getElementById('categoryClickBehaviorHint');

        const clickApi = getClickBehaviorApi();

        if (!select || !clickApi?.getModeOptions) return;



        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';

        const workspaceId = getCategorySettingsWorkspaceId();

        const selectedMode = clickApi.getCardMode(workspaceId, categoryName);

        select.innerHTML = clickApi.getModeOptions().map((option) => {

            const selected = option.value === selectedMode ? ' selected' : '';

            return `<option value="${escapeCategorySettingsHtml(option.value)}"${selected}>${escapeCategorySettingsHtml(option.label)}</option>`;

        }).join('');

        if (hint) hint.textContent = clickApi.describeMode(selectedMode);

    }



    function renderCategoryPinSettings() {

        const pinBtn = document.getElementById('categoryPinCardBtn');

        const scopeWrap = document.getElementById('categoryPinCardScopeWrap');

        const scopeSelect = document.getElementById('categoryPinCardScopeSelect');

        const scopeHint = document.getElementById('categoryPinCardScopeHint');

        const pinApi = getPinApi();

        if (!pinBtn || !pinApi?.isCardPinned) return;

        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';

        const workspaceId = getCategorySettingsWorkspaceId();

        const isPinned = !!pinApi.isCardPinned(workspaceId, categoryName);

        pinBtn.innerText = isPinned ? '📌 Unpin Card' : '📌 Pin Card';

        if (!scopeWrap || !scopeSelect) return;

        if (!isPinned) {

            scopeWrap.style.display = 'none';

            scopeSelect.innerHTML = '';

            if (scopeHint) scopeHint.textContent = '';

            return;

        }

        const selectedScope = pinApi.getCardScopeType?.(workspaceId, categoryName) || 'tab';

        const options = pinApi.getTargetVisibilityScopeOptions?.() || [];

        scopeSelect.innerHTML = options.map((option) => {

            const selected = option.value === selectedScope ? ' selected' : '';

            return `<option value="${escapeCategorySettingsHtml(option.value)}"${selected}>${escapeCategorySettingsHtml(option.label)}</option>`;

        }).join('');

        if (scopeHint) scopeHint.textContent = pinApi.describeTargetVisibilityScope?.(selectedScope) || '';

        scopeWrap.style.display = 'flex';

    }



    function refreshCategoryPinViews(categoryName) {

        if (!isCategorySettingsVisibleFor(categoryName)) return;

        renderCategoryPinSettings();

        renderCategoryHeaderButtonSettings();

        renderCategoryFolderManager();

    }

    window.EveCategorySettingsModalCore = Object.assign(window.EveCategorySettingsModalCore || {}, {
        escapeCategorySettingsHtml,
        escapeCategorySettingsJs,
        getCategorySettingsWorkspaceId,
        getFolderApi,
        getFolderActionExpansionStore,
        folderActionExpansionKey,
        isFolderActionExpanded,
        HEADER_BUTTON_OPTIONS,
        getFolderDraft,
        setFolderDraft,
        getFolderDraftCategoryName,
        getFolderDraftMode,
        getHeaderButtonApi,
        getClickBehaviorApi,
        getPinApi,
        isCategorySettingsVisibleFor,
        renderCategoryHeaderButtonSettings,
        renderCategoryClickBehaviorSettings,
        renderCategoryPinSettings,
        refreshCategoryPinViews
    });
})();
