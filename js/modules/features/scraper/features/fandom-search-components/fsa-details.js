/**
 * Fandom Search API - Details Component
 * Handles fetching and processing of page details from Fandom wikis.
 */
(function () {
    'use strict';

    const FSADetails = {
        /**
         * Fetch live page details from a Fandom domain API
         * @param {string} domain - The Fandom domain
         * @param {string} pageTitle - The title of the page
         * @returns {Promise<object|null>} Promise resolving to page details or null
         */
        fetchLiveFandomPageDetails: async function (domain, pageTitle) {
            console.log(`FSADetails: Fetching details for: ${pageTitle} on ${domain}`);

            if (!domain || !pageTitle) return null;

            let apiUrl = `https://${domain}/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts|categories|pageimages&exintro=1&explaintext=1&pithumbsize=200&format=json&origin=*`;

            let extract = '';
            let categories = [];
            let thumbnail = null;

            try {
                let response = await CORSProxyManager.fetch(apiUrl);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

                let data = await response.json();
                if (!data.query || !data.query.pages) throw new Error('Invalid API response format');

                let pageId = Object.keys(data.query.pages)[0];
                if (pageId === "-1") {
                    console.log(`Page "${pageTitle}" not found.`);
                    return null;
                }

                let pageData = data.query.pages[pageId];
                extract = pageData.extract || '';
                categories = pageData.categories ? pageData.categories.map(cat => cat.title.replace(/^Category:/, '')) : [];
                thumbnail = pageData.thumbnail ? pageData.thumbnail.source : null;

                // Sanitize Fandom image URL
                if (thumbnail && (thumbnail.includes('wikia.nocookie.net') || thumbnail.includes('fandom.com'))) {
                    thumbnail = thumbnail.replace(/\/revision\/.*$/, '');
                }

                // STAGE 2: If extract is empty, try raw characters
                if (!extract || extract.length < 50) {
                    apiUrl = `https://${domain}/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts|categories|pageimages&exchars=600&explaintext=1&pithumbsize=200&format=json&origin=*`;
                    response = await CORSProxyManager.fetch(apiUrl);
                    if (response.ok) {
                        data = await response.json();
                        if (data.query && data.query.pages) {
                            pageId = Object.keys(data.query.pages)[0];
                            if (pageId !== "-1") {
                                const fallbackData = data.query.pages[pageId];
                                const fallbackExtract = fallbackData.extract || '';
                                if (fallbackExtract.length > extract.length) {
                                    extract = fallbackExtract;
                                }
                            }
                        }
                    }
                }

                // STAGE 3: Try opensearch API
                if (!extract || extract.length < 50) {
                    apiUrl = `https://${domain}/api.php?action=opensearch&search=${encodeURIComponent(pageTitle)}&limit=1&format=json&origin=*`;
                    response = await CORSProxyManager.fetch(apiUrl);
                    if (response.ok) {
                        const searchData = await response.json();
                        if (Array.isArray(searchData) && searchData.length >= 3 && Array.isArray(searchData[2]) && searchData[2].length > 0) {
                            const opensearchSnippet = searchData[2][0];
                            if (opensearchSnippet && opensearchSnippet.trim().length > 0) {
                                extract = opensearchSnippet;
                            }
                        }
                    }
                }

                // STAGE 4: Parse rendered HTML (nuclear option)
                if (!extract || extract.length < 50) {
                    apiUrl = `https://${domain}/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&section=0&format=json&origin=*&disablepp=1`;
                    response = await CORSProxyManager.fetch(apiUrl);
                    if (response.ok) {
                        data = await response.json();
                        if (data.parse && data.parse.text && data.parse.text['*']) {
                            const rawHtml = data.parse.text['*'];
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = rawHtml;

                            const junkSelectors = ['.mw-empty-elt', 'aside', 'table', '.caption', '.reference', 'style', 'script', 'sup'];
                            junkSelectors.forEach(sel => {
                                tempDiv.querySelectorAll(sel).forEach(el => el.remove());
                            });

                            let cleanText = tempDiv.textContent || tempDiv.innerText || '';
                            cleanText = cleanText.replace(/\s+/g, ' ').trim();

                            if (cleanText.length > 500) cleanText = cleanText.substring(0, 500) + '...';

                            if (cleanText.length > 0) {
                                extract = cleanText;
                            }
                        }
                    }
                }

                const contentType = ModuleUtilities.inferContentTypeFromCategories(categories) ||
                    ModuleUtilities.inferContentTypeFromTitle(pageTitle, domain);

                return {
                    title: pageData.title,
                    extract: extract || 'No snippet available',
                    categories: categories,
                    thumbnail: thumbnail,
                    contentType: contentType
                };

            } catch (error) {
                console.error(`Error fetching details for ${pageTitle} on ${domain}:`, error);
                return null;
            }
        }
    };

    window.FSADetails = FSADetails;
})();
