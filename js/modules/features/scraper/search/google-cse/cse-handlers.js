/**
 * Google CSE Handlers Module
 * 
 * Manages event listeners, navigation prevention, and user interactions.
 * 
 * @version 1.0.0
 */

const CSEHandlers = (function () {
    return {
        /**
         * Set up interceptors to prevent navigation away from the page
         * @param {Object} config - CSE Configuration
         */
        setupNavigationPreventers: function (config) {
            try {
                if (!config.preventNavigation) return;

                console.log('CSEHandlers: Setting up navigation preventers');

                // 1. Prevent Form Submissions
                // Define the handler globally so we can remove it if needed, or check its existence
                window.preventCseNavigation = function (e) {
                    if (e && e.target) {
                        const isSearchForm = e.target.classList.contains('gsc-search-box') ||
                            e.target.closest('.gsc-search-box') ||
                            e.target.classList.contains('fallback-search-form');

                        if (isSearchForm) {

                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }
                    }
                    return true;
                };

                document.addEventListener('submit', window.preventCseNavigation, true);

                // 2. Intercept Result Link Clicks
                document.addEventListener('click', function (e) {
                    let target = e.target;
                    while (target && target.tagName !== 'BODY') {
                        if (target.tagName === 'A') {
                            const isGoogleResult = (target.closest('#' + config.containerIds.resultsContainerId) ||
                                target.closest('.gsc-results-wrapper-overlay'));

                            if (isGoogleResult && target.getAttribute('target') === '_blank') {

                                console.log('CSEHandlers: Intercepting result click');
                                e.preventDefault();

                                const href = target.getAttribute('href');
                                if (href && !href.startsWith('javascript:')) {
                                    // mimic navigation or just log
                                    console.log(`CSEHandlers: Would navigate to: ${href}`);

                                    // Custom Event for app-level handling (e.g. opening in custom tab/iframe)
                                    const event = new CustomEvent('googleCseResultClick', {
                                        detail: {
                                            url: href,
                                            title: target.textContent,
                                            element: target
                                        }
                                    });
                                    document.dispatchEvent(event);
                                }
                                return false;
                            }
                        }
                        target = target.parentNode;
                    }
                }, true);

                console.log('CSEHandlers: Navigation preventers active');

            } catch (error) {
                console.error('CSEHandlers: Error setting up preventers:', error);
            }
        }
    };
})();

if (typeof ModuleRegistry !== 'undefined') {
    ModuleRegistry.register('CSEHandlers', CSEHandlers);
}
window.CSEHandlers = CSEHandlers;
