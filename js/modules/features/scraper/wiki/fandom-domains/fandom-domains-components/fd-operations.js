/**
 * Fandom Domains Operations Component
 * Handles addition and removal of Fandom domains.
 */
const FandomDomainsOperations = {
    /**
     * Initialize the operations component
     */
    init: function () {
        console.log('FandomDomainsOperations initialized');
    },

    /**
     * Add a Fandom domain to the managed list
     * @param {string} domain - The domain to add
     * @param {string} name - Optional custom name for the domain
     * @param {string} imageUrl - Optional image URL to preset
     * @param {Function} getDomainsCallback - Callback to retrieve current domains
     * @param {Function} saveDomainsCallback - Callback to save updated domains
     * @param {Function} updateDataCallback - Callback to trigger background data update
     * @returns {Object|null} The new domain entry or null if failed
     */
    addDomain: function (domain, name, imageUrl, getDomainsCallback, saveDomainsCallback, updateDataCallback) {
        // Validation of callbacks
        if (typeof getDomainsCallback !== 'function' || typeof saveDomainsCallback !== 'function') {
            console.error('FandomDomainsOperations: Storage callbacks required');
            return null;
        }

        // Get current domains
        const currentDomains = getDomainsCallback();

        // If called from event listener, get values from inputs
        if (!domain || typeof domain === 'object') {
            const domainInput = document.getElementById('fandomDomainInput');
            const nameInput = document.getElementById('fandomNameInput');

            if (domainInput) domain = domainInput.value.trim();
            if (nameInput) name = nameInput.value.trim();
        }

        // Validate domain
        if (!domain) {
            alert('Please enter a valid Fandom domain');
            return null;
        }

        // Clean up domain format
        domain = domain.toLowerCase();
        if (domain.startsWith('http://') || domain.startsWith('https://')) {
            try {
                const url = new URL(domain);
                domain = url.hostname;
            } catch (e) {
                alert('Invalid URL format');
                return null;
            }
        }

        // Check if domain already exists
        if (currentDomains.some(wiki => wiki.domain === domain)) {
            alert('This domain is already in your list');
            return null;
        }

        // Add domain to list
        const newDomain = {
            domain: domain,
            name: name || domain.split('.')[0],
            url: `https://${domain}`,
            imageUrl: imageUrl || null, // Store image if provided
            addedAt: new Date().toISOString()
        };

        currentDomains.push(newDomain);
        saveDomainsCallback(currentDomains);

        // Clear inputs
        const domainInput = document.getElementById('fandomDomainInput');
        const nameInput = document.getElementById('fandomNameInput');
        if (domainInput) domainInput.value = '';
        if (nameInput) nameInput.value = '';

        // Update UI
        if (window.WikiManager && typeof WikiManager.renderFandomDomainList === 'function') {
            WikiManager.renderFandomDomainList(true);
        }

        // Always trigger background update to fetch official logo/data
        if (typeof updateDataCallback === 'function') {
            setTimeout(() => updateDataCallback(domain), 500);
        }

        return newDomain;
    },

    /**
     * Remove a Fandom domain from the managed list
     * @param {string} domain - The domain to remove
     * @param {Function} getDomainsCallback - Callback to retrieve current domains
     * @param {Function} saveDomainsCallback - Callback to save updated domains
     */
    removeDomain: function (domain, getDomainsCallback, saveDomainsCallback) {
        // Validation of callbacks
        if (typeof getDomainsCallback !== 'function' || typeof saveDomainsCallback !== 'function') {
            console.error('FandomDomainsOperations: Storage callbacks required');
            return;
        }

        console.log(`[FandomDomains] Removing domain: ${domain}`);
        let currentDomains = getDomainsCallback();
        const initialLength = currentDomains.length;

        // Normalize domain for comparison (just in case)
        const targetDomain = domain.toLowerCase();

        currentDomains = currentDomains.filter(wiki => wiki.domain.toLowerCase() !== targetDomain);

        if (currentDomains.length === initialLength) {
            console.warn(`[FandomDomains] Domain ${domain} not found in list. Available:`, currentDomains.map(d => d.domain));
        } else {
            console.log(`[FandomDomains] Removed ${domain}. New count: ${currentDomains.length}`);
        }

        saveDomainsCallback(currentDomains);

        // Update UI
        if (window.WikiManager && typeof WikiManager.renderFandomDomainList === 'function') {
            WikiManager.renderFandomDomainList(true);
        }

        // Update discovery button state if visible
        if (window.WikiManager && typeof WikiManager.updateDiscoveryButtonStatus === 'function') {
            WikiManager.updateDiscoveryButtonStatus('fandom', domain, false);
        }
    }
};

window.FandomDomainsOperations = FandomDomainsOperations;
