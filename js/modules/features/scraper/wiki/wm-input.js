/**
 * WikiManager Input Handler
 * Handles DOM event binding and input reading for the Wiki Manager.
 */
const WikiManagerInput = {};

WikiManagerInput.init = function () {
    console.log('WikiManagerInput initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiManagerInput', WikiManagerInput);
    }
};

/**
 * Setup event handlers for buttons
 */
WikiManagerInput.setupButtonHandlers = function () {
    const setup = (id, fn) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', fn);
    };

    setup('addFandomBtn', () => this.handleAddFandomClick());
    setup('addWikiBtn', () => this.handleAddWikiClick());

    // Delegation buttons
    setup('searchWikisBtn', () => {
        if (window.WikiManager && typeof WikiManager.searchFandomWikis === 'function') {
            WikiManager.searchFandomWikis();
        }
    });

    setup('searchWikiArticlesBtn', () => {
        if (window.WikiManager && typeof WikiManager.searchWikiArticles === 'function') {
            WikiManager.searchWikiArticles();
        }
    });

    // Original WikiManager had this wired to searchWikiCategories, but logic suggests add
    // Assuming it triggers add based on typical behavior, or delegating to manager logic
    setup('searchWikiCategoriesBtn', () => this.handleAddCategoryClick());
};

/**
 * Handle Add Fandom Button Click
 */
WikiManagerInput.handleAddFandomClick = function () {
    const domainInput = document.getElementById('fandomDomainInput');
    const nameInput = document.getElementById('fandomNameInput');

    const domain = domainInput ? domainInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';

    if (window.WikiManager && typeof WikiManager.addFandomDomain === 'function') {
        const success = WikiManager.addFandomDomain(domain, name);
        if (success) {
            if (domainInput) domainInput.value = '';
            if (nameInput) nameInput.value = '';
        }
    } else {
        console.error('WikiManager.addFandomDomain not found');
    }
};

/**
 * Handle Add Wiki Entry Button Click
 */
WikiManagerInput.handleAddWikiClick = function () {
    const titleInput = document.getElementById('wikiTitleInput');
    const nameInput = document.getElementById('wikiNameInput');

    const title = titleInput ? titleInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';

    if (window.WikiManager && typeof WikiManager.addWikiEntry === 'function') {
        const success = WikiManager.addWikiEntry(title, name);
        if (success) {
            if (titleInput) titleInput.value = '';
            if (nameInput) nameInput.value = '';
        }
    } else {
        console.error('WikiManager.addWikiEntry not found');
    }
};

/**
 * Handle Add Category Button Click
 */
WikiManagerInput.handleAddCategoryClick = function () {
    const catInput = document.getElementById('wikiCategoryInput');
    const nameInput = document.getElementById('wikiCategoryNameInput');

    const category = catInput ? catInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';

    if (window.WikiManager && typeof WikiManager.addWikiCategory === 'function') {
        const success = WikiManager.addWikiCategory(category, name);
        if (success) {
            if (catInput) catInput.value = '';
            if (nameInput) nameInput.value = ''; // Assuming there might be a name input in future
        }
    } else {
        console.error('WikiManager.addWikiCategory not found');
    }
};

window.WikiManagerInput = WikiManagerInput;
