/**
 * WikiManager Delegates
 * Handles delegation of tasks to integration modules (Discovery, CacheManager, Navigation).
 */
const WikiManagerDelegates = {};

WikiManagerDelegates.init = function () {
    console.log('WikiManagerDelegates initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiManagerDelegates', WikiManagerDelegates);
    }
};

// ==========================================
// Discovery Integration Delegates
// ==========================================

WikiManagerDelegates.searchFandomWikis = function () {
    if (window.WikiDiscoveryIntegration) WikiDiscoveryIntegration.searchFandomWikis();
};

WikiManagerDelegates.searchWikiArticles = function () {
    if (window.WikiDiscoveryIntegration) WikiDiscoveryIntegration.searchWikiArticles();
};

WikiManagerDelegates.addFandomDomainFromDiscovery = function (url, name, imageUrl) {
    if (window.WikiDiscoveryIntegration) return WikiDiscoveryIntegration.addFandomDomainFromDiscovery(url, name, imageUrl);
};

WikiManagerDelegates.addWikiEntryFromDiscovery = function (title, imageUrl) {
    if (window.WikiDiscoveryIntegration) return WikiDiscoveryIntegration.addWikiEntryFromDiscovery(title, imageUrl);
};

WikiManagerDelegates.updateDiscoveryButtonStatus = function (type, id, isAdded) {
    if (window.WikiDiscoveryIntegration) WikiDiscoveryIntegration.updateDiscoveryButtonStatus(type, id, isAdded);
};

WikiManagerDelegates.resetWikiDiscovery = function () {
    if (window.WikiDiscoveryIntegration) WikiDiscoveryIntegration.resetWikiDiscovery();
};

// ==========================================
// Cache Manager Delegates
// ==========================================

WikiManagerDelegates.viewFandomCachedData = function (domain) {
    if (window.WikiCacheManager) WikiCacheManager.viewFandomCachedData(domain);
};

WikiManagerDelegates.viewWikiCachedData = function (title) {
    if (window.WikiCacheManager) WikiCacheManager.viewWikiCachedData(title);
};

WikiManagerDelegates.clearFandomCache = function (domain) {
    if (window.WikiCacheManager) WikiCacheManager.clearFandomCache(domain);
};

WikiManagerDelegates.clearWikiCache = function (title) {
    if (window.WikiCacheManager) WikiCacheManager.clearWikiCache(title);
};

WikiManagerDelegates.clearAllFandomCaches = function () {
    if (window.WikiCacheManager) WikiCacheManager.clearAllFandomCaches();
};

WikiManagerDelegates.clearAllWikiCaches = function () {
    if (window.WikiCacheManager) WikiCacheManager.clearAllWikiCaches();
};

WikiManagerDelegates.reloadFandomWikiStatus = function (domain, btn) {
    if (window.WikiCacheManager) WikiCacheManager.reloadFandomWikiStatus(domain, btn);
};

WikiManagerDelegates.reloadAllFandomWikiStatus = function () {
    if (window.WikiCacheManager) WikiCacheManager.reloadAllFandomWikiStatus();
};

WikiManagerDelegates.reloadWikiEntryStatus = function (title, btn) {
    if (window.WikiCacheManager) WikiCacheManager.reloadWikiEntryStatus(title, btn);
};

WikiManagerDelegates.reloadAllWikiStatus = function () {
    if (window.WikiCacheManager) WikiCacheManager.reloadAllWikiStatus();
};

// ==========================================
// Navigation & UI Delegates
// ==========================================

WikiManagerDelegates.notify = function (message, type = 'info') {
    if (window.ToastNotification && typeof ToastNotification.show === 'function') {
        ToastNotification.show(message, type);
    } else {
        console.log(`[WikiManager] ${type}: ${message}`);
    }
};

WikiManagerDelegates.handleVisit = function (url, name) {
    if (window.WikiNavigation && typeof WikiNavigation.handleWikiResultClick === 'function') {
        WikiNavigation.handleWikiResultClick({ preventDefault: () => { } }, url);
    } else {
        window.open(url, '_blank');
    }
};

WikiManagerDelegates.handleItemClick = function (e, url, name) {
    if (window.WikiNavigation && typeof WikiNavigation.handleWikiResultClick === 'function') {
        WikiNavigation.handleWikiResultClick(e, url);
    }
};

WikiManagerDelegates.setWikiOpenMode = function (mode) {
    if (window.WikiNavigation && typeof WikiNavigation.setWikiOpenMode === 'function') {
        WikiNavigation.setWikiOpenMode(mode);
    }
};

// ==========================================
// Data Update Delegates (Legacy Support)
// ==========================================

WikiManagerDelegates.updateFandomData = function (domain) {
    if (window.FandomDomains && typeof FandomDomains.updateFandomData === 'function') {
        FandomDomains.updateFandomData(domain);
    }
};

WikiManagerDelegates.updateWikipediaData = function (title) {
    if (window.WikiEntries && typeof WikiEntries.updateWikipediaData === 'function') {
        WikiEntries.updateWikipediaData(title);
    }
};

window.WikiManagerDelegates = WikiManagerDelegates;
