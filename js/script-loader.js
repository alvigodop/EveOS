/* Script Loader for EveOS */
(function () {
    const scripts = window.EveModuleManifest ? window.EveModuleManifest.scripts : [];

    if (!window.EveModuleManifest) {
        console.error("EveOS Manifest not found! Scripts will not load.");
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = false; // Key for parallel download + sequential execution
            s.onload = resolve;
            s.onerror = reject;
            document.h.appendChild(s);
        });
    }

    async function init() {
        // Optimize: Create head alias
        document.h = document.head || document.getElementsByTagName('head')[0];

        try {
            console.log('Starting parallel script loading...');

            // Create all script tags immediately to trigger parallel downloads
            const promises = scripts.map(src => loadScript(src));

            // Wait for all to complete
            await Promise.all(promises);
            console.log('All scripts loaded. Initializing...');

            // Initialize Modals
            if (typeof initModals === 'function') initModals();

            // Initialize UI Components
            if (typeof initContextMenus === 'function') initContextMenus();
            if (typeof initScratchpad === 'function') initScratchpad();
            if (typeof initBulkToolbar === 'function') initBulkToolbar();

            // Initialize Scraper Feature
            if (window.ScraperInit && typeof ScraperInit.init === 'function') ScraperInit.init();

            // Initialize Data
            if (typeof loadData === 'function') loadData();

            // Attach global listeners that were on body
            document.body.onclick = (e) => {
                if (typeof closeAllMenus === 'function') closeAllMenus();
            };

        } catch (err) {
            console.warn('Initialization warning:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
