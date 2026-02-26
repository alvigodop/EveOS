/**
 * Domain Generator - Formatter
 * Domain name formatting and variation generation
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DGFormatter = {
        version: '1.0.0',

        init: function () {
            console.log('DGFormatter initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Formats a search term into a valid Fandom domain
         */
        formatFandomDomain: function (searchTerm) {
            if (!searchTerm) return '';

            return searchTerm
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-');
        },

        /**
         * Generate common wiki subpaths for domain verification
         */
        getCommonWikiPaths: function () {
            return [
                '/',
                '/wiki/Main_Page',
                '/wiki/Special:RecentChanges',
                '/api.php',
                '/load.php',
                '/index.php'
            ];
        },

        /**
         * Generate variations of a domain name
         */
        generateDomainVariations: function (domain) {
            if (!domain) return [];

            const variations = [];
            variations.push(domain);

            if (domain.endsWith('fandom.com')) {
                variations.push(domain.replace('fandom.com', 'wikia.org'));
                variations.push(domain.replace('fandom.com', 'wikia.com'));
            }

            const baseDomain = domain.split('.')[0];
            variations.push(`${baseDomain}.fandom.com`);

            return [...new Set(variations)];
        }
    };

    // Expose globally
    window.DGFormatter = DGFormatter;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('DGFormatter', DGFormatter);
    }
})();
