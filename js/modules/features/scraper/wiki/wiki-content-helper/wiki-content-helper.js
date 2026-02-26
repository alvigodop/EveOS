/**
 * Wiki Content Helper Module (Facade)
 * 
 * Delegates to:
 * - WCHApi: API interaction
 * - WCHProcessors: Content processing
 * 
 * @version 1.1.0-facade
 */

window.WikiContentHelper = window.WikiContentHelper || {};
const WikiContentHelper = window.WikiContentHelper;

WikiContentHelper.init = function () {
    console.log('WikiContentHelper initialized');
    if (window.WCHApi && typeof WCHApi.init === 'function') {
        WCHApi.init();
        WCHApi._initialized = true;
    }
    if (window.WCHProcessors && typeof WCHProcessors.init === 'function') {
        WCHProcessors.init();
        WCHProcessors._initialized = true;
    }
    this._initialized = true;
    return this;
};

WikiContentHelper.getAllWikiPages = async function (domain) {
    if (window.WCHApi) {
        return WCHApi.getAllWikiPages(domain);
    }
    return [];
};

WikiContentHelper.getPageContent = async function (domain, title) {
    if (window.WCHApi) {
        return WCHApi.getPageContent(domain, title);
    }
    return { content: '', categories: [], contentType: 'other', aliases: [] };
};

WikiContentHelper.getCharacterAliases = async function (wiki, title, preFetchedContent = null) {
    if (window.WCHProcessors) {
        return WCHProcessors.getCharacterAliases(wiki, title, preFetchedContent);
    }
    return [title.toLowerCase()];
};

console.log('WikiContentHelper module loaded');
if (WikiContentHelper.init) WikiContentHelper.init();
