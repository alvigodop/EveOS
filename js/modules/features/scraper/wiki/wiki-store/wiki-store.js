/**
 * Wiki Store Module
 * Handles data persistence for Fandom domains and Wikipedia entries.
 */
const WikiStore = {};

/**
 * Initialize the store
 */
WikiStore.init = function () {
    console.log('WikiStore initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiStore', WikiStore);
    }
};

/**
 * Get all Fandom domains
 * @returns {Promise<Array>} List of domain objects
 */
WikiStore.getFandomDomains = async function () {
    if (!window.StorageManager) return [];
    return await StorageManager.loadDataAsync(StorageManager.KEYS.FANDOM_DOMAINS || 'fandomDomains', []);
};


/**
 * Add a Fandom domain
 * @param {string} domain 
 * @param {string} name 
 * @param {string} imageUrl 
 * @returns {Promise<boolean>} True if added, false if already exists
 */
WikiStore.addFandomDomain = async function (domain, name, imageUrl) {
    const domains = await this.getFandomDomains();

    // Check if exists
    if (domains.some(d => d.domain === domain)) {
        return false;
    }

    domains.push({
        domain: domain,
        name: name || domain,
        imageUrl: imageUrl || null
    });

    if (window.StorageManager) {
        await StorageManager.saveDataAsync(StorageManager.KEYS.FANDOM_DOMAINS || 'fandomDomains', domains);
        return true;
    }
    return false;
};


/**
 * Update a Fandom domain (e.g. logo)
 * @param {string} domain 
 * @param {Object} data 
 */
WikiStore.updateFandomDomain = async function (domain, data) {
    let domains = await this.getFandomDomains();
    const index = domains.findIndex(d => d.domain === domain);

    if (index !== -1) {
        domains[index] = { ...domains[index], ...data };
        if (window.StorageManager) {
            await StorageManager.saveDataAsync(StorageManager.KEYS.FANDOM_DOMAINS || 'fandomDomains', domains);
            return true;
        }
    }
    return false;
};


/**
 * Remove a Fandom domain
 * @param {string} domain 
 */
WikiStore.removeFandomDomain = async function (domain) {
    let domains = await this.getFandomDomains();
    const initialLength = domains.length;
    domains = domains.filter(d => d.domain !== domain);

    if (domains.length !== initialLength) {
        if (window.StorageManager) {
            await StorageManager.saveDataAsync(StorageManager.KEYS.FANDOM_DOMAINS || 'fandomDomains', domains);
            return true;
        }
    }
    return false;
};


/**
 * Get all Wikipedia entries
 * @returns {Promise<Array>} List of entry objects
 */
WikiStore.getWikiEntries = async function () {
    if (!window.StorageManager) return [];
    return await StorageManager.loadDataAsync(StorageManager.KEYS.WIKI_ENTRIES || 'wikiEntries', []);
};


/**
 * Add a Wikipedia entry
 */
WikiStore.addWikiEntry = async function (title, name, imageUrl) {
    const entries = await this.getWikiEntries();

    if (entries.some(e => e.title === title)) {
        return false;
    }

    entries.push({
        title: title,
        name: name || title,
        imageUrl: imageUrl || null
    });

    if (window.StorageManager) {
        await StorageManager.saveDataAsync(StorageManager.KEYS.WIKI_ENTRIES || 'wikiEntries', entries);
        return true;
    }
    return false;
};

/**
 * Remove a Wikipedia entry
 */
WikiStore.removeWikiEntry = async function (title) {
    let entries = await this.getWikiEntries();
    const initialLength = entries.length;
    entries = entries.filter(e => e.title !== title);

    if (entries.length !== initialLength) {
        if (window.StorageManager) {
            await StorageManager.saveDataAsync(StorageManager.KEYS.WIKI_ENTRIES || 'wikiEntries', entries);
            return true;
        }
    }
    return false;
};


/**
 * Get all Wikipedia categories
 * @returns {Promise<Array>} List of category objects
 */
WikiStore.getWikiCategories = async function () {
    if (!window.StorageManager) return [];
    return await StorageManager.loadDataAsync(StorageManager.KEYS.WIKI_CATEGORIES || 'wikiCategories', []);
};


/**
 * Add a Wikipedia category
 */
WikiStore.addWikiCategory = async function (category, name) {
    let categories = await this.getWikiCategories();

    // Clean up category name
    category = category.replace(/^Category:/i, '');

    if (categories.some(c => c.category.toLowerCase() === category.toLowerCase())) {
        return false;
    }

    const defaultName = category
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    categories.push({
        category: category,
        name: name || defaultName,
        url: `https://en.wikipedia.org/wiki/Category:${encodeURIComponent(category)}`,
        addedAt: new Date().toISOString()
    });

    if (window.StorageManager) {
        await StorageManager.saveDataAsync(StorageManager.KEYS.WIKI_CATEGORIES || 'wikiCategories', categories);
        return true;
    }
    return false;
};


/**
 * Remove a Wikipedia category
 */
WikiStore.removeWikiCategory = async function (category) {
    let categories = await this.getWikiCategories();
    const initialLength = categories.length;
    categories = categories.filter(c => c.category !== category);

    if (categories.length !== initialLength) {
        if (window.StorageManager) {
            await StorageManager.saveDataAsync(StorageManager.KEYS.WIKI_CATEGORIES || 'wikiCategories', categories);
            return true;
        }
    }
    return false;
};


window.WikiStore = WikiStore;
