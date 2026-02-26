/**
 * DiscoveryDomains Module
 * Handles domain validation, checking, and generation for the Discovery module
 */
const DiscoveryDomains = {};

/**
 * Validates if a domain is a real Fandom community
 * @param {string} domain - The domain to validate
 * @param {string} proxy - The CORS proxy to use
 * @returns {Promise<boolean>} - A promise that resolves to true if the domain is a valid Fandom community
 */
DiscoveryDomains.validateFandomCommunity = async function (domain, proxy) {
    if (window.DomainValidator && typeof DomainValidator.checkDomainExists === 'function') {
        return new Promise(resolve => DomainValidator.checkDomainExists(domain, resolve));
    }
    console.warn('DomainValidator not available');
    return false;
};

/**
 * Check if a domain exists
 * @param {string} domain - The domain to check
 * @param {Function} callback - Callback function(exists) to call when check is complete
 */
DiscoveryDomains.checkDomainExists = function (domain, callback) {
    // Use DomainValidator if available
    if (window.DomainValidator && typeof DomainValidator.checkDomainExists === 'function') {
        DomainValidator.checkDomainExists(domain, callback);
        return;
    }

    if (!domain) {
        callback(false);
        return;
    }

    // Fallback: If DomainValidator is missing, we try to use it if exposed on Discovery,
    // otherwise we just log a warning and return likely true to avoid blocking (or false to be safe).
    // Given the architecture, DomainValidator SHOULD be there.
    // If we absolutely must implement a fallback here without duplicating code:
    console.warn('DomainValidator missing in DiscoveryDomains check. Returning false.');
    callback(false);
};

/**
 * Generates potential Fandom domains based on a search term
 * @param {string} searchTerm - The search term to generate domains for
 * @returns {Array} - An array of potential domains
 */
DiscoveryDomains.generatePotentialDomains = function (searchTerm) {
    // Use DomainGenerator if available
    if (window.DomainGenerator && typeof DomainGenerator.generatePotentialDomains === 'function') {
        return DomainGenerator.generatePotentialDomains(searchTerm);
    }
    return [];
};

/**
 * Formats a search term into a valid Fandom domain
 * @param {string} searchTerm - The search term to format
 * @returns {string} - The formatted domain
 */
DiscoveryDomains.formatFandomDomain = function (searchTerm) {
    // Use DomainGenerator if available
    if (window.DomainGenerator && typeof DomainGenerator.formatFandomDomain === 'function') {
        return DomainGenerator.formatFandomDomain(searchTerm);
    }
    return '';
};

// Check for ModuleRegistry and register this module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DiscoveryDomains', DiscoveryDomains);
} else {
    window.DiscoveryDomains = DiscoveryDomains;
}
