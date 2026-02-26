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
 * @returns {Array} List of domain objects
 */
WikiStore.getFandomDomains = function () {
    return window.StorageManager ? StorageManager.loadData('fandomDomains', []) : [];
};

/**
 * Add a Fandom domain
 * @param {string} domain 
 * @param {string} name 
 * @param {string} imageUrl 
 * @returns {boolean} True if added, false if already exists
 */
WikiStore.addFandomDomain = function (domain, name, imageUrl) {
    const domains = this.getFandomDomains();

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
        StorageManager.saveData('fandomDomains', domains);
    } else {
        localStorage.setItem('fandomDomains', JSON.stringify(domains));
    }
    return true;
};

/**
 * Update a Fandom domain (e.g. logo)
 * @param {string} domain 
 * @param {Object} data 
 */
WikiStore.updateFandomDomain = function (domain, data) {
    let domains = this.getFandomDomains();
    const index = domains.findIndex(d => d.domain === domain);

    if (index !== -1) {
        domains[index] = { ...domains[index], ...data };
        if (window.StorageManager) {
            StorageManager.saveData('fandomDomains', domains);
        } else {
            localStorage.setItem('fandomDomains', JSON.stringify(domains));
        }
        return true;
    }
    return false;
};

/**
 * Remove a Fandom domain
 * @param {string} domain 
 */
WikiStore.removeFandomDomain = function (domain) {
    let domains = this.getFandomDomains();
    const initialLength = domains.length;
    domains = domains.filter(d => d.domain !== domain);

    if (domains.length !== initialLength) {
        if (window.StorageManager) {
            StorageManager.saveData('fandomDomains', domains);
        } else {
            localStorage.setItem('fandomDomains', JSON.stringify(domains));
        }
        return true;
    }
    return false;
};

/**
 * Get all Wikipedia entries
 * @returns {Array} List of entry objects
 */
WikiStore.getWikiEntries = function () {
    return window.StorageManager ? StorageManager.loadData('wikiEntries', []) : [];
};

/**
 * Add a Wikipedia entry
 * @param {string} title 
 * @param {string} name 
 * @param {string} imageUrl 
 * @returns {boolean} True if added, false if exists
 */
WikiStore.addWikiEntry = function (title, name, imageUrl) {
    const entries = this.getWikiEntries();

    if (entries.some(e => e.title === title)) {
        return false;
    }

    entries.push({
        title: title,
        name: name || title,
        imageUrl: imageUrl || null
    });

    if (window.StorageManager) {
        StorageManager.saveData('wikiEntries', entries);
    } else {
        localStorage.setItem('wikiEntries', JSON.stringify(entries));
    }
    return true;
};

/**
 * Remove a Wikipedia entry
 * @param {string} title 
 */
WikiStore.removeWikiEntry = function (title) {
    let entries = this.getWikiEntries();
    const initialLength = entries.length;
    entries = entries.filter(e => e.title !== title);

    if (entries.length !== initialLength) {
        if (window.StorageManager) {
            StorageManager.saveData('wikiEntries', entries);
        } else {
            localStorage.setItem('wikiEntries', JSON.stringify(entries));
        }
        return true;
    }
    return false;
};

/**
 * Get all Wikipedia categories
 * @returns {Array} List of category objects
 */
WikiStore.getWikiCategories = function () {
    return window.StorageManager ? StorageManager.loadData('wikiCategories', []) : [];
};

/**
 * Add a Wikipedia category
 * @param {string} category 
 * @param {string} name 
 * @returns {boolean} True if added, false if exists
 */
WikiStore.addWikiCategory = function (category, name) {
    let categories = this.getWikiCategories();

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
        StorageManager.saveData('wikiCategories', categories);
    } else {
        localStorage.setItem('wikiCategories', JSON.stringify(categories));
    }
    return true;
};

/**
 * Remove a Wikipedia category
 * @param {string} category 
 */
WikiStore.removeWikiCategory = function (category) {
    let categories = this.getWikiCategories();
    const initialLength = categories.length;
    categories = categories.filter(c => c.category !== category);

    if (categories.length !== initialLength) {
        if (window.StorageManager) {
            StorageManager.saveData('wikiCategories', categories);
        } else {
            localStorage.setItem('wikiCategories', JSON.stringify(categories));
        }
        return true;
    }
    return false;
};

window.WikiStore = WikiStore;
