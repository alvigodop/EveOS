/**
 * Domain Generator Module (Facade) - Generates potential domain names for Fandom wikis
 * 
 * Delegates to:
 * - DGFormatter: Domain formatting and path utilities
 * 
 * @version 1.1.0-facade
 */

const DomainGenerator = {};

DomainGenerator.init = function () {
    console.log('Initializing DomainGenerator module');
    if (window.DGFormatter && typeof DGFormatter.init === 'function') {
        DGFormatter.init();
        DGFormatter._initialized = true;
    }
    this._initialized = true;
    return this;
};

DomainGenerator.formatFandomDomain = function (searchTerm) {
    if (window.DGFormatter) {
        return DGFormatter.formatFandomDomain(searchTerm);
    }
    // Fallback
    if (!searchTerm) return '';
    return searchTerm.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
};

DomainGenerator.generatePotentialDomains = function (searchTerm) {
    if (!searchTerm) return [];

    const domains = [];
    const formattedTerm = this.formatFandomDomain(searchTerm);

    domains.push(`${formattedTerm}.fandom.com`);

    const prefixes = ['the', 'official'];
    prefixes.forEach(prefix => domains.push(`${prefix}-${formattedTerm}.fandom.com`));

    const commonSuffixes = ['wiki', 'official', 'fan', 'community'];
    commonSuffixes.forEach(suffix => domains.push(`${formattedTerm}-${suffix}.fandom.com`));

    if (searchTerm.includes(' ')) {
        const words = searchTerm.split(' ');
        domains.push(`${words.join('-')}.fandom.com`);

        if (words.length === 2) {
            domains.push(`${this.formatFandomDomain(words[0])}.fandom.com`);
            domains.push(`${this.formatFandomDomain(words[1])}.fandom.com`);
        } else {
            domains.push(`${this.formatFandomDomain(words[0])}.fandom.com`);
        }
    }

    if (/\d+$/.test(searchTerm)) {
        const baseTermMatch = searchTerm.match(/(.*?)\s*\d+$/);
        if (baseTermMatch && baseTermMatch[1]) {
            const baseTerm = this.formatFandomDomain(baseTermMatch[1]);
            domains.push(`${baseTerm}.fandom.com`);
        }
    }

    return [...new Set(domains)];
};

DomainGenerator.generateDomainVariations = function (domain) {
    if (window.DGFormatter) {
        return DGFormatter.generateDomainVariations(domain);
    }
    // Fallback
    if (!domain) return [];
    const variations = [domain];
    if (domain.endsWith('fandom.com')) {
        variations.push(domain.replace('fandom.com', 'wikia.org'));
        variations.push(domain.replace('fandom.com', 'wikia.com'));
    }
    return [...new Set(variations)];
};

DomainGenerator.getCommonWikiPaths = function () {
    if (window.DGFormatter) {
        return DGFormatter.getCommonWikiPaths();
    }
    return ['/', '/wiki/Main_Page', '/api.php'];
};

window.DomainGenerator = DomainGenerator;

if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DomainGenerator', DomainGenerator);
}

console.log('Domain Generator module loaded');

// Auto-init
if (window.DomainGenerator && typeof DomainGenerator.init === 'function') {
    DomainGenerator.init();
}