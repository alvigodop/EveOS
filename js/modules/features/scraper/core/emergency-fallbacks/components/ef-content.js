/**
 * Emergency Fallbacks Content Component
 * Handles critical functionality checks for content-related systems (Search, WikiManager).
 */
const EmergencyFallbacksContent = {};

/**
 * Initialize the module
 */
EmergencyFallbacksContent.init = function () {
    console.log('EmergencyFallbacksContent initialized');
};

/**
 * Ensure searchContent function is available
 */
EmergencyFallbacksContent._ensureSearchCoordinator = function () {
    if (typeof window.searchContent !== 'function') {
        window.searchContent = function (query) {
            // Publish an event instead of calling directly
            if (window.EventBus && typeof EventBus.publish === 'function') {
                console.log('ModuleUtilities: Search button click publishing ui:searchRequested');
                EventBus.publish('ui:searchRequested', { query: query });
            } else {
                console.error('ModuleUtilities: EventBus not available for search button click.');
                alert('Cannot initiate search. EventBus missing.');
            }
        };
    }
};

/**
 * Ensure directAddWikiEntry function is available
 */
EmergencyFallbacksContent._ensureDirectAddWikiEntry = function () {
    if (typeof window.directAddWikiEntry !== 'function') {
        console.log('Creating emergency directAddWikiEntry function');
        window.directAddWikiEntry = function (title, url) {
            console.log(`Emergency directAddWikiEntry called with title: ${title}`);

            // Try to use WikiManager
            if (window.WikiManager && typeof WikiManager.addWikiEntry === 'function') {
                WikiManager.addWikiEntry(title, url);
            } else {
                // Direct implementation
                try {
                    const entries = JSON.parse(localStorage.getItem('wikiEntries') || '[]');

                    // Format the entry
                    const entry = {
                        title: title || 'Unnamed Entry',
                        url: url || `https://en.wikipedia.org/wiki/${encodeURIComponent(title || '')}`
                    };

                    // Check if entry already exists
                    const exists = entries.some(e => e.title === entry.title);
                    if (!exists) {
                        entries.push(entry);
                        localStorage.setItem('wikiEntries', JSON.stringify(entries));

                        // Notify WikiManager if it exists but wasn't ready
                        if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                            WikiManager.renderWikiEntryList(true);
                        }

                        alert(`Added ${entry.title} to your collection!`);
                    } else {
                        alert(`${entry.title} is already in your collection.`);
                    }
                } catch (error) {
                    console.error('Error in emergency directAddWikiEntry:', error);
                    alert('Error adding entry to collection. Please try again.');
                }
            }
        };
    }
};

/**
 * Ensure directAddFandomDomain function is available
 */
EmergencyFallbacksContent._ensureDirectAddFandomDomain = function () {
    if (typeof window.directAddFandomDomain !== 'function') {
        console.log('Creating emergency directAddFandomDomain function');
        window.directAddFandomDomain = function (domain, name) {
            console.log(`Emergency directAddFandomDomain called with domain: ${domain}`);

            // Try to use WikiManager
            if (window.WikiManager && typeof WikiManager.addFandomDomain === 'function') {
                WikiManager.addFandomDomain(domain, name);
            } else {
                // Direct implementation
                try {
                    const domains = JSON.parse(localStorage.getItem('fandomDomains') || '[]');

                    // Format the domain
                    const domainObj = {
                        domain: domain || '',
                        name: name || domain.split('.')[0],
                        url: `https://${domain}`
                    };

                    // Check if domain already exists
                    const exists = domains.some(d => d.domain === domainObj.domain);
                    if (!exists) {
                        domains.push(domainObj);
                        localStorage.setItem('fandomDomains', JSON.stringify(domains));

                        // Notify WikiManager if it exists but wasn't ready
                        if (window.WikiManager && typeof WikiManager.renderFandomDomainList === 'function') {
                            WikiManager.renderFandomDomainList(true);
                        }

                        alert(`Added ${domainObj.name} to your collection!`);
                    } else {
                        alert(`${domainObj.name} is already in your collection.`);
                    }
                } catch (error) {
                    console.error('Error in emergency directAddFandomDomain:', error);
                    alert('Error adding domain to collection. Please try again.');
                }
            }
        };
    }
};

window.EmergencyFallbacksContent = EmergencyFallbacksContent;
