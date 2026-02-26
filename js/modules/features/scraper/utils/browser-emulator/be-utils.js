/**
 * BrowserEmulator Utils Module
 * 
 * Helper functions for validation, parsing, and domain checks.
 */

(function () {
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before utils module');
        return;
    }

    Object.assign(window.BrowserEmulator, {
        /**
         * Check if a URL belongs to a disabled domain
         * @private
         * @param {string} url - The URL to check
         * @returns {boolean} - Whether the URL belongs to a disabled domain
         */
        _isDisabledDomain: function (url) {
            if (!url || typeof url !== 'string') {
                return false;
            }

            try {
                // Parse the URL to get the hostname
                let hostname;

                if (url.includes('://')) {
                    // Full URL with protocol
                    hostname = new URL(url).hostname.toLowerCase();
                } else {
                    // Just a domain or path
                    hostname = url.split('/')[0].toLowerCase();
                }

                // Check if the hostname exactly matches any of the disabled domains
                if (this._config.disabledDomains && Array.isArray(this._config.disabledDomains)) {
                    for (const domain of this._config.disabledDomains) {
                        const testDomain = domain.toLowerCase();

                        // Check for exact match or subdomain match
                        if (hostname === testDomain ||
                            hostname.endsWith(`.${testDomain}`) ||
                            // Special case for google domains (cse.google.com, etc)
                            (testDomain === 'google.com' && hostname.includes('google'))) {

                            console.log(`BrowserEmulator: Domain ${hostname} matches disabled domain ${domain}`);
                            return true;
                        }
                    }
                }

                // Special handling for Google CSE
                if (url.includes('cse.google.com') ||
                    url.includes('www.google.com/cse') ||
                    url.includes('googleapis.com') ||
                    url.includes('gstatic.com')) {
                    console.log(`BrowserEmulator: URL ${url} contains Google CSE patterns, disabling`);
                    return true;
                }

                return false;
            } catch (error) {
                console.warn(`BrowserEmulator: Error checking if domain is disabled: ${error.message}`);
                return false; // Default to allowing in case of error
            }
        },

        /**
         * Add a domain to the disabled list
         * @param {string} domain - Domain to disable (e.g., 'google.com')
         */
        disableForDomain: function (domain) {
            if (!domain) return;

            // Normalize domain (remove protocols, paths, etc.)
            const normalizedDomain = domain.toLowerCase()
                .replace(/^https?:\/\//, '')  // Remove protocol
                .replace(/\/.*$/, '');        // Remove path

            // Add to disabled domains if not already there
            if (!this._config.disabledDomains.includes(normalizedDomain)) {
                this._config.disabledDomains.push(normalizedDomain);
                console.log(`BrowserEmulator: Disabled for domain: ${normalizedDomain}`);
            }
        },

        /**
         * Remove a domain from the disabled list
         * @param {string} domain - Domain to enable
         */
        enableForDomain: function (domain) {
            if (!domain) return;

            // Normalize domain
            const normalizedDomain = domain.toLowerCase()
                .replace(/^https?:\/\//, '')
                .replace(/\/.*$/, '');

            // Remove from disabled domains
            const index = this._config.disabledDomains.indexOf(normalizedDomain);
            if (index !== -1) {
                this._config.disabledDomains.splice(index, 1);
                console.log(`BrowserEmulator: Enabled for domain: ${normalizedDomain}`);
            }
        },

        /**
         * Validate the rendered content is valid and complete
         * @private
         * @param {string} content - Rendered content to validate
         * @returns {boolean} - Whether the content is valid
         */
        _validateRenderedContent: function (content) {
            // Check if content is a string
            if (typeof content !== 'string') {
                console.warn('BrowserEmulator: Rendered content is not a string');
                return false;
            }

            // Check if content is too short
            if (content.length < 100) {
                console.warn('BrowserEmulator: Rendered content is too short');
                return false;
            }

            // Check if content has HTML structure
            if (!content.includes('<html') || !content.includes('</html>')) {
                console.warn('BrowserEmulator: Rendered content does not have HTML structure');
                return false;
            }

            // Check if content has a body
            if (!content.includes('<body') || !content.includes('</body>')) {
                console.warn('BrowserEmulator: Rendered content does not have a body');
                return false;
            }

            // If signature is required, check for it
            if (this._config.requireRenderSignature && !content.includes('data-render-signature')) {
                console.warn('BrowserEmulator: Rendered content does not have required signature');
                return false;
            }

            return true;
        },

        /**
         * Parse Google search results from HTML
         * @param {string} html - HTML content of Google search results page
         * @returns {Array<Object>} - Array of parsed result objects {title, url, domain, description}
         */
        parseGoogleResults: function (html) {
            if (!html) return [];

            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const results = [];

                // Selectors for Google results (various layouts)
                // .g is the standard container for a result
                const resultElements = doc.querySelectorAll('.g');

                resultElements.forEach(el => {
                    // Extract Title and URL
                    const linkEl = el.querySelector('a');
                    if (!linkEl) return;

                    const url = linkEl.href;
                    if (!url || !url.startsWith('http')) return;

                    const titleEl = el.querySelector('h3');
                    const title = titleEl ? titleEl.textContent : '';

                    // Extract Description
                    // Google descriptions are often in .VwiC3b or generally in the text block
                    let description = '';
                    const descEl = el.querySelector('.VwiC3b') || el.querySelector('.IsZvec') || el.querySelector('.st');
                    if (descEl) {
                        description = descEl.textContent;
                    } else {
                        // Fallback: try to find the text content excluding the title and url
                        const clone = el.cloneNode(true);
                        const cloneTitle = clone.querySelector('h3');
                        const cloneLink = clone.querySelector('a');
                        if (cloneTitle) cloneTitle.remove();
                        // if (cloneLink) cloneLink.remove(); // Keep link might remove domain text
                        description = clone.textContent.replace(/\s+/g, ' ').trim();
                    }

                    // Extract Domain
                    let domain = '';
                    try {
                        const urlObj = new URL(url);
                        domain = urlObj.hostname;
                    } catch (e) {
                        // Fallback extraction
                        const match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
                        if (match && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) {
                            domain = match[2];
                        }
                    }

                    if (title && url) {
                        results.push({
                            title: title,
                            url: url,
                            domain: domain,
                            description: description
                        });
                    }
                });

                console.log(`BrowserEmulator: Parsed ${results.length} Google results`);
                return results;
            } catch (error) {
                console.error('BrowserEmulator: Error parsing Google results:', error);
                return [];
            }
        }
    });

    console.log('BrowserEmulator: Utils module loaded');
})();
