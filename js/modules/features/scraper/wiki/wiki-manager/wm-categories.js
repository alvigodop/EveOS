/**
 * WikiManager Categories Component
 * Handles management of Wiki categories.
 */
const WikiManagerCategories = {};

/**
 * Initialize the module
 */
WikiManagerCategories.init = function () {
    console.log('WikiManagerCategories initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiManagerCategories', WikiManagerCategories);
    }
};

/**
 * Add a Wiki Category
 */
WikiManagerCategories.addWikiCategory = function (category, name) {
    if (!category) {
        alert('Please enter a valid category');
        return;
    }

    if (window.WikiStore) {
        const success = WikiStore.addWikiCategory(category, name);
        if (!success) {
            alert('This category already exists!');
            return;
        }

        this.renderWikiCategoryList(true);
        return success;
    }
};

/**
 * Remove a Wiki Category
 */
WikiManagerCategories.removeWikiCategory = function (category) {
    if (confirm(`Remove category ${category}?`)) {
        if (window.WikiStore) {
            WikiStore.removeWikiCategory(category);
            this.renderWikiCategoryList(true);
        }
    }
};

/**
 * Render Wiki Category list
 */
WikiManagerCategories.renderWikiCategoryList = async function (force) {
    const listElement = document.getElementById('wikiCategoryList');
    if (!listElement) return;

    // Use WikiManager facade for callbacks
    const wm = window.WikiManager || {};

    // Always reload cache stores from storage before rendering to pick up writes from orchestrators
    if (wm.refreshCacheStores && typeof wm.refreshCacheStores === 'function') {
        await wm.refreshCacheStores();
    }

    // Helper for cache store
    let cacheStore = {};
    if (wm.wikiCacheStore) {
        cacheStore = wm.wikiCacheStore;
    } else if (window.StorageManager) {
        cacheStore = await StorageManager.loadFromCacheStore() || {};
    }


    if (window.WikiUIRenderer && window.WikiStore) {
        WikiUIRenderer.renderWikiCategoryList(
            await WikiStore.getWikiCategories(),
            listElement,
            cacheStore,
            {
                onVisit: (url, name) => {
                    if (wm._handleVisit) wm._handleVisit(url, name);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.handleVisit(url, name);
                },
                onItemClick: (e, cat) => {
                    if (wm._handleItemClick) wm._handleItemClick(e, cat.url, cat.name);
                    // Fallback handled in facade or via delegates if needed, but categories usually have explicit URLs
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.handleItemClick(e, cat.url, cat.name);
                },
                onViewCache: (cat, name) => console.log('View cache for category', cat),
                onRemove: (category) => this.removeWikiCategory(category)
            }
        );
    }
};

window.WikiManagerCategories = WikiManagerCategories;
