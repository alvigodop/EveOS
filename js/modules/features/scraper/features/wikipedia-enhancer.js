/**
 * Wikipedia Enhancer Module (Facade)
 * 
 * Delegates to:
 * - WESService: Enhancement orchestration
 * - WESProcessor: Result processing (via Service)
 * 
 * @version 1.1.0-facade
 */

window.WikipediaEnhancer = window.WikipediaEnhancer || {};
const WikipediaEnhancer = window.WikipediaEnhancer;

WikipediaEnhancer.init = function () {
    console.log('WikipediaEnhancer initialized');
    if (window.WESService && typeof WESService.init === 'function') {
        WESService.init();
        WESService._initialized = true;
    }
    if (window.WESProcessor && typeof WESProcessor.init === 'function') {
        WESProcessor.init();
        WESProcessor._initialized = true;
    }
    this._initialized = true;
    return this;
};

WikipediaEnhancer.enhanceResultsWithWebData = async function (results, searchTerm) {
    if (window.WESService) {
        return WESService.enhanceResultsWithWebData(results, searchTerm);
    }
    return results;
};

// Deprecated private method exposed just in case (optional, but good for compatibility)
WikipediaEnhancer._processWebResults = function (data, searchTerm, results) {
    if (window.WESProcessor) {
        return WESProcessor.processWebResults(data, searchTerm, results);
    }
    return null;
}

console.log('WikipediaEnhancer module loaded');
if (WikipediaEnhancer.init) WikipediaEnhancer.init();
