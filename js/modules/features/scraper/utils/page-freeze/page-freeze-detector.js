/**
 * PageFreezeDetector Module v1.0.0 (Facade)
 * 
 * Detects and resolves page freeze conditions by monitoring UI responsiveness
 * and JavaScript execution. Provides automatic recovery for Google CSE and
 * other common causes of page hangs.
 * 
 * REFACTORED: Logic moved to modules/utils/page-freeze-detector-components/
 */

(function () {
    'use strict';

    console.log('PageFreezeDetector (Facade): Loading...');

    const PageFreezeDetectorFacade = {
        _isFacade: true
    };

    /**
     * Aggregate functionality from sub-modules
     */
    function aggregateComponents() {
        const components = [
            window.PageFreezeDetectorCore,
            window.PageFreezeWatchdog,
            window.PageFreezeUIMonitor,
            window.PageFreezeNotifications,
            window.PageFreezeRecovery,
            window.PageFreezeCSE
        ];

        let loadedCount = 0;

        components.forEach(component => {
            if (component) {
                Object.assign(PageFreezeDetectorFacade, component);
                loadedCount++;
            }
        });

        return loadedCount;
    }

    // Initial aggregation
    aggregateComponents();

    // Wrap init to ensure sub-components are marked
    const originalInit = PageFreezeDetectorFacade.init;
    PageFreezeDetectorFacade.init = function () {
        console.log('PageFreezeDetector (Facade): Initializing components...');

        // Mark sub-components
        [
            window.PageFreezeDetectorCore,
            window.PageFreezeWatchdog,
            window.PageFreezeUIMonitor,
            window.PageFreezeNotifications,
            window.PageFreezeRecovery,
            window.PageFreezeCSE
        ].forEach(comp => {
            if (comp) comp._initialized = true;
        });

        if (typeof originalInit === 'function') {
            originalInit.apply(this, arguments);
        }
        this._initialized = true;
        return this;
    };

    // Re-aggregate on load to ensure we catch everything
    window.addEventListener('load', () => {
        const count = aggregateComponents();
        console.log(`PageFreezeDetector: Aggregated ${count} components`);

        // Initialize if possible
        if (PageFreezeDetectorFacade.init && !PageFreezeDetectorFacade._initialized) {
            PageFreezeDetectorFacade.init();
        }
    });

    // Expose module globally
    window.PageFreezeDetector = PageFreezeDetectorFacade;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('PageFreezeDetector', PageFreezeDetectorFacade);
    }

    // Auto-initialize if ready and core is loaded
    if (document.readyState === 'complete' && PageFreezeDetectorFacade.init) {
        PageFreezeDetectorFacade.init();
    }

    console.log('PageFreezeDetector (Facade) loaded');
})();