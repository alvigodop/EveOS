/**
 * Fandom Domains API Component
 * Handles API interactions and logo fetching for Fandom domains.
 */
const FandomDomainsAPI = {
    /**
     * Initialize the API component
     */
    init: function () {
        console.log('FandomDomainsAPI initialized');
    },

    /**
     * Fetch generic data (logo) for a Fandom domain
     * @param {string} domain - The domain to update
     * @param {Function} getDomainsCallback - Callback to retrieve current domains
     * @param {Function} saveDomainsCallback - Callback to save updated domains
     */
    updateFandomData: async function (domain, getDomainsCallback, saveDomainsCallback) {
        if (!domain) return;

        console.log(`Fetching data for Fandom: ${domain}`);
        try {
            // Primary: Use Google Favicon Service (Reliable, Stable)
            let logoUrl = window.EveFaviconUtils && typeof window.EveFaviconUtils.getBestEffortSrc === 'function'
                ? window.EveFaviconUtils.getBestEffortSrc(domain, 64)
                : '';
            let siteName = null;
            let logoWorks = true;

            if (!logoWorks) {
                // Special:FilePath failed, try API approach
                console.log(`Special:FilePath failed for ${domain}, trying API...`);
                logoUrl = window.EveFaviconUtils && typeof window.EveFaviconUtils.getBestEffortSrc === 'function'
                    ? window.EveFaviconUtils.getBestEffortSrc(domain, 64)
                    : '';

                try {
                    const apiUrl = `https://${domain}/api.php?action=query&meta=siteinfo&siprop=general&format=json&origin=*`;
                    const response = await fetch(apiUrl);
                    const data = await response.json();

                    if (data && data.query && data.query.general) {
                        // Logic for API logo is preserved but commented out in original file as unreliable
                        // Keeping structure for future enhancement if needed

                        if (data.query.general.sitename) {
                            siteName = data.query.general.sitename.replace(' Wiki', '');
                        }
                    }
                } catch (apiError) {
                    console.warn(`Fandom API fetch failed for ${domain}, using favicon.`, apiError);
                }
            }

            console.log(`Setting logo for ${domain}: ${logoUrl}`);

            // Fetch sitename from API if we don't have it yet
            if (!siteName) {
                try {
                    const apiUrl = `https://${domain}/api.php?action=query&meta=siteinfo&siprop=general&format=json&origin=*`;
                    const response = await fetch(apiUrl);
                    const data = await response.json();
                    if (data?.query?.general?.sitename) {
                        siteName = data.query.general.sitename.replace(' Wiki', '');
                    }
                } catch (e) {
                    // Silent fail
                }
            }

            // Update the entry using callbacks
            if (typeof getDomainsCallback === 'function' && typeof saveDomainsCallback === 'function') {
                const currentDomains = getDomainsCallback();
                const domainEntry = currentDomains.find(d => d.domain === domain);

                if (domainEntry) {
                    domainEntry.imageUrl = logoUrl;
                    if (siteName && (domainEntry.name === domain.split('.')[0] || domainEntry.name === domain)) {
                        domainEntry.name = siteName;
                    }

                    saveDomainsCallback(currentDomains);

                    // Re-render
                    if (window.WikiManager && typeof WikiManager.renderFandomDomainList === 'function') {
                        WikiManager.renderFandomDomainList(true);
                    }
                }
            }

        } catch (error) {
            console.error(`Error updating Fandom data for ${domain}:`, error);
        }
    }
};

window.FandomDomainsAPI = FandomDomainsAPI;
