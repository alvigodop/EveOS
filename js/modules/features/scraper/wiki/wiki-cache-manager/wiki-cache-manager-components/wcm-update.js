/**
 * Wiki Cache Manager Update Component
 * Handles reloading and updating cache status for Fandom domains and Wiki entries.
 */
const WikiCacheManagerUpdate = {};

/**
 * Initialize the module
 */
WikiCacheManagerUpdate.init = function () {
    console.log('WikiCacheManagerUpdate initialized');
};

/**
 * Reload status for a specific Fandom domain
 * @param {string} domain 
 */
WikiCacheManagerUpdate.reloadFandomWikiStatus = async function (domain, btnElement) {
    console.log(`WikiCacheManager: Reloading status for Fandom domain: ${domain}`);

    // Store original button state
    let originalText = 'Reload';
    if (btnElement) {
        originalText = btnElement.textContent;
        btnElement.textContent = '...';
        btnElement.disabled = true;
        btnElement.style.opacity = '0.7';
        btnElement.style.cursor = 'wait';
    }

    try {
        if (window.WikiManager && typeof WikiManager._updateFandomData === 'function') {
            await WikiManager._updateFandomData(domain);
            WikiManager._notify(`Successfully updated cache for ${domain}`, 'success');
            if (WikiManager.renderFandomDomainList) WikiManager.renderFandomDomainList(true);
        } else {
            throw new Error('WikiManager._updateFandomData not found');
        }
    } catch (e) {
        console.error(e);
        if (window.WikiManager) WikiManager._notify('Error reloading status: ' + e.message, 'error');
        // If error, restore button manually
        if (btnElement) {
            btnElement.textContent = originalText;
            btnElement.disabled = false;
            btnElement.style.opacity = '';
            btnElement.style.cursor = '';
        }
    }
};

/**
 * Reload status for all Fandom domains
 */
WikiCacheManagerUpdate.reloadAllFandomWikiStatus = async function () {
    if (window.WikiManager) WikiManager._notify('Reloading all Fandom domains...', 'info');

    if (!window.WikiManager || !WikiManager.fandomDomains) return;

    let successCount = 0;
    for (const wiki of WikiManager.fandomDomains) {
        try {
            if (WikiManager._updateFandomData) {
                await WikiManager._updateFandomData(wiki.domain);
                successCount++;
            }
        } catch (e) {
            console.error(`Failed to update ${wiki.domain}`, e);
        }
    }

    const msg = `Updated ${successCount}/${WikiManager.fandomDomains.length} Fandom domains.`;
    WikiManager._notify(msg, 'success');

    if (WikiManager.renderFandomDomainList) WikiManager.renderFandomDomainList();
};

/**
 * Reload status for a specific Wikipedia entry
 * @param {string} title 
 */
WikiCacheManagerUpdate.reloadWikiEntryStatus = async function (title, btnElement) {
    console.log(`WikiCacheManager: Reloading status for Wikipedia entry: ${title}`);

    let originalText = 'Reload';
    if (btnElement) {
        originalText = btnElement.textContent;
        btnElement.textContent = '...';
        btnElement.disabled = true;
        btnElement.style.opacity = '0.7';
        btnElement.style.cursor = 'wait';
    }

    try {
        if (window.WikiManager && typeof WikiManager._updateWikipediaData === 'function') {
            await WikiManager._updateWikipediaData(title);
            WikiManager._notify(`Successfully updated cache for ${title}`, 'success');
            if (WikiManager.renderWikiEntryList) WikiManager.renderWikiEntryList(true);
        } else {
            throw new Error('WikiManager._updateWikipediaData not found');
        }
    } catch (e) {
        console.error(e);
        if (window.WikiManager) WikiManager._notify('Error reloading status: ' + e.message, 'error');
        if (btnElement) {
            btnElement.textContent = originalText;
            btnElement.disabled = false;
            btnElement.style.opacity = '';
            btnElement.style.cursor = '';
        }
    }
};

/**
 * Reload status for all Wikipedia entries
 */
WikiCacheManagerUpdate.reloadAllWikiStatus = async function () {
    if (window.WikiManager) WikiManager._notify('Reloading all Wikipedia entries...', 'info');

    if (!window.WikiManager || !WikiManager.wikiEntries) return;

    let successCount = 0;
    for (const entry of WikiManager.wikiEntries) {
        try {
            if (WikiManager._updateWikipediaData) {
                await WikiManager._updateWikipediaData(entry.title);
                successCount++;
            }
        } catch (e) {
            console.error(`Failed to update ${entry.title}`, e);
        }
    }

    const msg = `Updated ${successCount}/${WikiManager.wikiEntries.length} Wikipedia entries.`;
    WikiManager._notify(msg, 'success');

    if (WikiManager.renderWikiEntryList) WikiManager.renderWikiEntryList();
};

window.WikiCacheManagerUpdate = WikiCacheManagerUpdate;
