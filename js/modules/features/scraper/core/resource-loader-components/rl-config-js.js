/**
 * Resource Loader Configuration - JS
 * 
 * Contains the configuration for JS files to be loaded by the Resource Loader.
 * Extracted from rl-config.js to reduce file size.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    console.log('[rl-config-js.js] Initializing JS configuration...');

    const JS_FILES = {
        // Error formatter and error suppression utilities (load first)
        errorHandling: [
            // Module Error Interceptor Components
            'js/modules/utils/error-handling/interceptor/components/core.js',
            'js/modules/utils/error-handling/interceptor/components/native-overrides.js',
            'js/modules/utils/error-handling/interceptor/components/global-handler.js',
            'js/modules/utils/error-handling/interceptor/components/dom-observer.js',
            'js/modules/utils/error-handling/interceptor/components/styles.js',
            'js/modules/utils/error-handling/interceptor/components/ui-monitor.js',

            'js/modules/utils/error-handling/interceptor/module-error-display-interceptor.js',
            // ErrorFormatter Sub-modules
            'js/modules/utils/error-handling/formatter/error-formatter/ef-formatters.js',
            'js/modules/utils/error-handling/formatter/error-formatter/ef-overrides.js',
            'js/modules/utils/error-handling/formatter/error-formatter/ef-dom.js',
            'js/modules/utils/error-handling/formatter/error-formatter.js',
            'js/modules/utils/error-handling/notifier/components/en-styles.js',
            'js/modules/utils/error-handling/notifier/components/en-ui-renderer.js',
            'js/modules/utils/error-handling/notifier/components/en-ui.js',
            'js/modules/utils/error-handling/notifier/components/en-core.js',
            'js/modules/utils/error-handling/notifier/error-notifier.js', // [MODIFIED] Facade
            'js/modules/ui/debug-panel/components/dp-logger.js',
            // Error Suppressor
            'js/modules/utils/error-handling/suppressor/components/es-config.js',
            'js/modules/utils/error-handling/suppressor/components/es-logger.js',
            'js/modules/utils/error-handling/suppressor/components/es-handlers.js',
            'js/modules/utils/error-handling/suppressor/error-suppressor.js', // Facade
            // Utils
            // DOM Utils - loaded once here
            'js/modules/ui/core/dom-utils.js',
            'js/modules/utils/event-bus.js', // EventBus - loaded once here
            'js/modules/utils/helpers/html-utils.js', // [NEW] HTML Utilities

            // CORS Proxy Components (Modularized)
            'js/modules/utils/cors-proxy/components/cpm-core.js',
            'js/modules/utils/cors-proxy/components/cpm-utils.js',
            'js/modules/utils/cors-proxy/components/cpm-state.js',
            'js/modules/utils/cors-proxy/components/cpm-fetch.js',
            'js/modules/utils/cors-proxy-tester-components/cpt-common.js',
            'js/modules/utils/cors-proxy-tester-components/cpt-tester.js',
            'js/modules/utils/cors-proxy-tester-components/cpt-manager.js',
            'js/modules/utils/cors-proxy/cors-proxy-tester.js', // [MODIFIED] Facade
            'js/modules/utils/cors-proxy/components/cpm-testing.js',
            'js/modules/utils/cors-proxy/cors-proxy-manager.js', // Facade

            // Search Modulesar BrowserEmulator
            'js/modules/utils/browser-emulator/core.js',
            'js/modules/utils/browser-emulator/be-config.js',
            'js/modules/utils/browser-emulator/be-utils.js',
            'js/modules/utils/browser-emulator/be-proxy-manager.js',
            'js/modules/utils/browser-emulator/be-render-orchestrator.js',
            'js/modules/utils/browser-emulator/be-init.js',
            'js/modules/utils/browser-emulator/proxy-strategy.js',
            'js/modules/utils/browser-emulator/iframe-strategy.js',
            'js/modules/utils/browser-emulator/local-strategy.js',
            'js/modules/search/google-cse/cse-recovery.js'
        ],

        // Core modules
        core: [
            'js/modules/core/module-fix-components/registry-shim.js',
            'js/modules/core/module-fix-components/cors-fix.js',
            'js/modules/core/module-fix-components/error-fix.js',
            'js/modules/core/module-fix-components/auto-recovery.js',
            'js/modules/core/fixes/module-fix.js',
            // [NEW] RegistryGuard Sub-modules
            'js/modules/core/registry-guard-components/rg-safe-register.js',
            // Module Registry Protection and Fixes
            'js/modules/core/fixes/registry-guard.js', // [MODIFIED] Facade
            'js/modules/core/module-registry-fix/mrf-core.js',
            'js/modules/core/module-registry-fix/mrf-registry.js',
            'js/modules/core/module-registry-fix/mrf-registration.js',
            'js/modules/core/module-registry-fix/mrf-ui.js',
            'js/modules/core/module-registry-fix.js',
            // Registry Protection Components
            'js/modules/core/registry-protection-components/rp-state.js',
            'js/modules/core/registry-protection-components/rp-safe.js',
            'js/modules/core/registry-protection-components/rp-proxy.js',
            'js/modules/core/registry-protection-components/rp-monitor.js',
            'js/modules/core/module-registry-protection.js',
            'js/modules/core/content-inferrer/components/utils.js',
            'js/modules/core/content-inferrer/components/filters.js',
            'js/modules/core/content-inferrer/components/title-inference.js',
            'js/modules/core/content-inferrer/components/text-inference.js',
            // [NEW] Category Inference Sub-modules
            'js/modules/core/content-inferrer/components/ci-analysis.js',
            'js/modules/core/content-inferrer/components/ci-domains.js',
            'js/modules/core/content-inferrer/components/category-inference.js', // [MODIFIED] Facade
            'js/modules/core/content-inferrer/content-inferrer.js', // Facade
            // [NEW] Emergency Fallbacks Sub-modules
            'js/modules/core/emergency-fallbacks/components/ef-core.js',
            'js/modules/core/emergency-fallbacks/components/ef-content.js',
            'js/modules/core/emergency-fallbacks/components/ef-repair.js',
            'js/modules/core/emergency-fallbacks/emergency-fallbacks.js', // [MODIFIED] Facade
            'js/modules/utils/helpers/module-tester.js',
            'js/modules/core/module-system/module-utilities.js',
            'js/modules/utils/helpers/module-conflict-resolver.js',
            'js/modules/core/html-loader-components/load-core.js',
            'js/modules/core/html-loader-components/load-ui.js',
            'js/modules/core/html-loader-components/load-data.js',
            'js/modules/core/html-loader-components/load-monitor.js',
            'js/modules/core/module-system/html-script-loader.js',
            // [NEW] ModuleHelper Sub-modules
            'js/modules/core/module-helper/components/mh-ajax.js',
            'js/modules/core/module-helper/components/mh-registry.js',
            'js/modules/core/module-helper/module-helper.js', // [MODIFIED] Facade
            'js/modules/core/module-system/module-loader.js',
            'js/modules/core/fixes/global-fix.js', // [MODIFIED] Facade - Must be loaded before initializer
            'js/modules/core/module-system/module-initializer.js',
            'js/modules/core/initialization/debug-diagnostics.js'
        ],

        // Event and Storage modules (use scraper storage - matches ScraperFeature working layout)
        storage: [
            // [NEW] StorageManager Sub-modules
            'js/modules/features/scraper/storage/storage-manager-components/sm-wiki.js',
            'js/modules/features/scraper/storage/storage-manager.js', // [MODIFIED] Facade
            // [NEW] CacheCore Sub-modules
            'js/modules/features/scraper/storage/cache-core-components/cc-maintenance.js',
            'js/modules/features/scraper/storage/cache-core.js', // [MODIFIED] Facade
            // [NEW] Cache UI Sub-modules
            'js/modules/features/scraper/storage/cache-ui-components/cui-utils.js',
            'js/modules/features/scraper/storage/cache-ui-components/cui-stats.js',
            'js/modules/features/scraper/storage/cache-ui-components/cui-list.js',
            'js/modules/features/scraper/storage/cache-ui-components/cui-popup.js',
            'js/modules/features/scraper/storage/cache-ui-components/cui-summary.js',
            'js/modules/features/scraper/storage/cache-ui.js', // [MODIFIED] Facade
            'js/modules/features/scraper/storage/cache-fandom.js',
            'js/modules/features/scraper/storage/cache-wikipedia-components/cw-storage.js',
            'js/modules/features/scraper/storage/cache-wikipedia-components/cw-view.js',
            'js/modules/features/scraper/storage/cache-wikipedia-components/cw-sync.js',
            'js/modules/features/scraper/storage/cache-wikipedia.js', // [MODIFIED] Facade
            'js/modules/features/scraper/storage/cache-manager.js'
        ],

        // UI modules
        ui: [
            'js/modules/ui/modals/cm-styles.js',
            'js/modules/ui/modals/confirm-modal.js',
            // [NEW] ToastNotification Sub-modules
            'js/modules/ui/toast-notification/components/tn-styles.js',
            'js/modules/ui/toast-notification/toast-notification.js', // [MODIFIED] Facade
            // dom-utils.js already loaded in errorHandling
            // [NEW] LoadingIndicator Sub-modules
            'js/modules/ui/loading-indicator/components/li-stats.js',
            'js/modules/ui/loading-indicator/loading-indicator.js', // [MODIFIED] Facade
            // [NEW] Status Data Sub-modules
            'js/modules/ui/module-status/status-data-components/sd-collector.js',
            'js/modules/ui/module-status/status-data-components/sd-formatting.js',
            'js/modules/ui/module-status/status-data-components/sd-preferences.js',
            'js/modules/ui/module-status/status-data.js', // [MODIFIED] Facade
            'js/modules/ui/module-status/status-error-manager.js',
            'js/modules/ui/module-status/status-templates.js',
            'js/modules/ui/module-status/status-html-generator.js',
            'js/modules/ui/module-status/status-view.js', // [MOVED] View generation
            'js/modules/ui/module-status/status-ui.js',   // [NEW] UI handling
            // [NEW] DirectRenderer Sub-modules
            'js/modules/ui/direct-renderer/components/dr-events.js',
            'js/modules/ui/direct-renderer/components/dr-tabs.js',
            'js/modules/ui/direct-renderer/direct-renderer.js', // DirectRenderer loaded once
            'js/modules/ui/core/ui-core.js',
            // Result Display Components
            'js/modules/ui/result-display/components/rd-core.js',
            'js/modules/ui/result-display/components/rd-utils.js',
            'js/modules/ui/result-display/components/rd-data.js',
            'js/modules/ui/result-display/components/rd-renderer.js',
            'js/modules/ui/result-display/components/rd-filter.js',
            'js/modules/ui/result-display/components/rd-manager.js',
            'js/modules/ui/result-display/result-display.js',
            // [NEW] ViewGrid Sub-modules
            'js/modules/ui/view-grid/components/vg-header.js',
            'js/modules/ui/view-grid/components/vgc-title.js',
            'js/modules/ui/view-grid/components/vgc-details.js',
            'js/modules/ui/view-grid/components/vg-content.js', // [MODIFIED] Facade
            'js/modules/ui/view-grid/components/vg-footer.js',
            'js/modules/ui/view-grid/view-grid.js',
            // [NEW] ViewList Sub-modules
            'js/modules/ui/view-list/components/vl-media.js',
            'js/modules/ui/view-list/components/vl-content.js',
            'js/modules/ui/view-list/components/vl-actions.js',
            'js/modules/ui/view-list/view-list.js',
            'js/modules/ui/tab-manager/components/tm-state.js', // [NEW] State management
            'js/modules/ui/tab-manager/components/tm-utils.js', // [NEW] Utilities
            'js/modules/ui/tab-manager/components/tm-ui.js',    // [NEW] UI logic
            'js/modules/ui/tab-manager/tab-manager.js',   // [MODIFIED] Facade
            'js/modules/ui/popup-manager/components/popup-history.js',
            'js/modules/ui/popup-manager/components/popup-confirmation.js',
            // [NEW] Popup Viewer Sub-modules
            'js/modules/ui/popup-manager/components/viewer/pv-ui.js',
            'js/modules/ui/popup-manager/components/viewer/pv-loader.js',
            'js/modules/ui/popup-manager/components/viewer/pv-state.js',
            'js/modules/ui/popup-manager/components/popup-viewer.js',
            'js/modules/ui/popup-manager/popup-manager.js',
            'js/modules/ui/module-status/ui-module-status.js',
            'js/modules/search/shared/search-display.js',
            // UI Result Display
            'js/modules/ui/ui-result-display/components/urd-core.js',
            'js/modules/ui/ui-result-display/components/urd-grid.js',
            'js/modules/ui/ui-result-display/components/urd-list.js',
            'js/modules/ui/ui-result-display/ui-result-display.js',
            // search-ui-handler.js loaded in features section with its sub-modules
            'js/modules/ui/search-controls/search-controls.js',
            'js/modules/ui/dropdown-handler/dropdown-handler.js',
            // Debug Panel Components
            'js/modules/ui/debug-panel/components/dp-core.js',
            'js/modules/ui/debug-panel/components/dp-logger.js',
            'js/modules/ui/debug-panel/components/dp-panel.js',
            'js/modules/ui/debug-panel/debug-panel.js' // Facade
        ],

        // Search and Discovery modules
        searchDiscovery: [
            'js/modules/api/fandom-api.js',
            'js/modules/search/shared/search-options.js',
            'js/modules/search/direct-search/ds-core.js',
            'js/modules/search/direct-search/wikipedia-core.js',
            'js/modules/search/direct-search/wikipedia-logic.js',
            'js/modules/search/direct-search/wikipedia-fallbacks.js',
            'js/modules/search/direct-search/wikipedia-api.js',
            'js/modules/search/direct-search/fandom-core.js',
            'js/modules/search/direct-search/fandom-fallbacks.js',
            'js/modules/search/direct-search/fandom-logic.js',
            'js/modules/search/direct-search.js',
            // [NEW] Direct Search Test Sub-modules
            'js/modules/search/direct-search-test-components/dst-runner.js',
            'js/modules/search/direct-search-test-components/dst-fixes.js',
            'js/modules/search/direct-search-test.js', // [MODIFIED] Facade
            'js/modules/search/config.js',
            // [NEW] RelevanceScorer Sub-modules
            'js/modules/search/relevance-scoring-components/rs-scorer.js',
            'js/modules/search/relevance-scoring-components/relevance-scoring.js', // [MOVED] Facade
            // Google CSE Sub-modules
            'js/modules/search/google-cse/cse-config.js',
            'js/modules/search/cse-utils-components/cu-dom.js',
            'js/modules/search/cse-utils-components/cu-fallback.js',
            'js/modules/search/google-cse/cse-utils.js',
            'js/modules/search/google-cse/cse-handlers.js',
            'js/modules/search/google-cse/cse-results.js',
            'js/modules/search/google-cse/google-cse-embedded.js',
            'js/modules/search/cse-handler-components/cth-ui.js',
            'js/modules/search/cse-handler-components/cth-interceptor.js',
            'js/modules/search/google-cse/cse-toggle-handler.js',
            'js/modules/search/fandom-community/fandom-cs-core.js',
            // [NEW] FandomCSUI Sub-modules
            'js/modules/search/fandom-community/fandom-cs-ui-components/ui-elements.js',
            'js/modules/search/fandom-community/fandom-cs-ui-components/ui-pagination.js',
            'js/modules/search/fandom-community/fandom-cs-ui-components/ui-renderer.js',
            'js/modules/search/fandom-community/fandom-cs-ui-components/ui-events.js',
            'js/modules/search/fandom-community/fandom-cs-ui.js',
            'js/modules/search/fandom-community/fandom-cs-api-components/fcsa-fetch.js',
            'js/modules/search/fandom-community/fandom-cs-api-components/fcsa-process.js',
            'js/modules/search/fandom-community/fandom-cs-api.js', // [MODIFIED] Facade
            'js/modules/search/fandom-community/fandom-cs-scraper-components/scraper-domain.js',
            'js/modules/search/fandom-community/fandom-cs-scraper-components/scraper-yahoo.js',
            'js/modules/search/fandom-community/fandom-cs-scraper-components/scraper-brave.js',
            'js/modules/search/fandom-community/fandom-cs-scraper.js',
            'js/modules/search/fandom-community/fandom-community-search.js?v=1.1.3',
            // Discovery Modules (Modularized)
            'js/modules/discovery/discovery-components/discovery-logic.js',
            'js/modules/discovery/discovery-components/discovery-domains.js',
            'js/modules/discovery/discovery-components/discovery-search-ui.js',
            'js/modules/discovery/discovery-components/discovery-search-orchestrator.js',
            // [NEW] Discovery UI Sub-modules
            'js/modules/discovery/discovery-ui-components/dui-utils.js',
            'js/modules/discovery/discovery-ui-components/dui-interface.js',
            'js/modules/discovery/discovery-ui-components/dui-results.js',
            'js/modules/discovery/system/discovery-ui.js', // [MODIFIED] Facade
            'js/modules/discovery/system/discovery.js',
            // [NEW] DomainValidator Sub-modules
            'js/modules/discovery/domain-validator/domain-validator-components/dv-fetch.js',
            'js/modules/discovery/domain-validator/domain-validator.js', // [MODIFIED] Facade
            // [NEW] DomainGenerator Sub-modules
            'js/modules/discovery/domain-generator/domain-generator-components/dg-formatter.js',
            'js/modules/discovery/domain-generator/domain-generator.js', // [MODIFIED] Facade
            // Wikipedia Discovery Modules
            'js/modules/discovery/wikipedia-internal/wd-core.js',
            'js/modules/discovery/wikipedia-internal/wd-mode-direct.js',
            'js/modules/discovery/wikipedia-internal/wd-mode-server.js',
            'js/modules/discovery/wikipedia-internal/wd-search.js', // [MODIFIED] Facade
            'js/modules/discovery/wikipedia-internal/wd-media.js',
            'js/modules/discovery/wikipedia-internal/wd-enhancer.js',
            'js/modules/discovery/wikipedia-internal/wikipedia-discovery.js',
            'js/modules/discovery/fandom-search-components/utils.js',
            'js/modules/discovery/fandom-search-components/api.js',
            'js/modules/discovery/fandom-search-components/ui.js',
            // [NEW] Fandom Search Logic components
            'js/modules/discovery/fandom-search-components/logic/score.js',
            'js/modules/discovery/fandom-search-components/logic/match.js',
            'js/modules/discovery/fandom-search-components/logic/workflow.js',
            'js/modules/discovery/fandom-search-components/logic/strategy.js',
            'js/modules/discovery/fandom-search-components/logic.js', // [MODIFIED] Facade
            'js/modules/discovery/fandom-search/fandom-search.js',
            'js/modules/discovery/fandom-discovery/core.js',
            'js/modules/discovery/fandom-discovery/google-integration.js',
            'js/modules/discovery/fandom-discovery/direct-search.js',
            // [NEW] Discovery Strategies
            'js/modules/discovery/fandom-discovery/discovery-strategy-google.js',
            'js/modules/discovery/fandom-discovery/discovery-strategy-fandom.js',
            'js/modules/discovery/fandom-discovery/search-coordinator.js', // [MODIFIED] Facade
            // [NEW] GoogleScraperCore Sub-modules
            'js/modules/discovery/google-scraper-core-components/gsc-emulator.js',
            'js/modules/discovery/google-scraper-core-components/gsc-connectivity.js',
            'js/modules/discovery/google-scraper-core-components/gsc-scraping.js',
            'js/modules/discovery/google-components/google-scraper-core.js', // [MODIFIED] Facade
            // [NEW] GoogleScraperUI Sub-modules
            'js/modules/discovery/google-scraper-ui-components/gsu-toggles.js',
            'js/modules/discovery/google-scraper-ui-components/gsu-rendering.js',
            'js/modules/discovery/google-scraper-ui-components/gsu-display.js',
            'js/modules/discovery/google-components/google-scraper-ui.js', // [MODIFIED] Facade
            'js/modules/discovery/google-components/google-search-mock-data.js',
            // [NEW] Google Search Scraper Sub-modules (config and connectivity only, core/ui in facade)
            'js/modules/discovery/google-search-scraper-components/gss-config.js',
            // Note: gss-core.js and gss-ui.js removed - they define the same globals as the facades above
            'js/modules/discovery/google-search-scraper-components/gss-connectivity.js',
            'js/modules/discovery/google-components/google-search-scraper.js', // [MODIFIED] Facade
            'js/modules/search/discovery-broker/sdb-core.js',
            'js/modules/search/discovery-broker/sdb-ui.js',
            'js/modules/search/discovery-broker/sdb-fandom.js',
            'js/modules/search/discovery-broker/sdb-wikipedia.js',
            'js/modules/search/search-discovery-broker.js',
            'js/modules/wiki/wiki-discovery-integration/wiki-discovery-components/wdi-ui.js',        // [NEW] WDI UI
            'js/modules/wiki/wiki-discovery-integration/wiki-discovery-components/wdi-fandom.js',    // [NEW] WDI Fandom
            // [NEW] WDI Wikipedia
            'js/modules/wiki/wiki-discovery-integration/wiki-discovery-components/wdi-wikipedia.js',
            'js/modules/wiki/wiki-discovery-integration/wiki-discovery-integration.js', // [MODIFIED] Facade

            // CSE Facade - Loads last in this group to assume submodules are ready
            'js/modules/core/initialization/google-cse-initializer.js'
        ],

        // Feature modules
        features: [
            // [NEW] Search UI Renderer Sub-modules
            'js/modules/features/search-ui-renderer-components/sur-loading.js',
            'js/modules/features/search-ui-renderer-components/sur-error.js',
            'js/modules/features/search-ui-renderer-components/sur-wiki.js',
            'js/modules/features/search-ui-renderer-components/sur-fandom.js',
            'js/modules/features/search-ui-renderer.js', // [MODIFIED] Facade
            // [NEW] ResultEnricher Sub-modules
            'js/modules/features/result-processor/result-enricher-components/re-fandom.js',
            'js/modules/features/result-processor/result-enricher.js', // [MODIFIED] Facade
            'js/modules/features/result-processor/result-filter.js',
            // [NEW] ResultDeduplicator Sub-modules
            'js/modules/features/result-processor/result-deduplicator-components/rd-similarity.js',
            'js/modules/features/result-processor/result-deduplicator.js', // [MODIFIED] Facade
            'js/modules/features/result-processor/result-processor.js',
            // [NEW] WikipediaEnhancer Sub-modules
            'js/modules/features/wikipedia-enhancer-components/we-service.js',
            'js/modules/features/wikipedia-enhancer-components/we-processor.js',
            'js/modules/features/wikipedia-enhancer.js', // [MODIFIED] Facade
            // Wikipedia Sub-modules
            // [NEW] WikipediaAPI Sub-modules
            'js/modules/features/wikipedia-search/components/wa-fetch.js',
            'js/modules/features/wikipedia-search/components/wa-enrich.js',
            'js/modules/features/wikipedia-search/wikipedia-api.js', // [MODIFIED] Facade
            'js/modules/features/wikipedia-search/wikipedia-cache.js',
            'js/modules/features/wikipedia-search/wikipedia-processor.js',
            // [NEW] SearchWikipedia Sub-modules
            'js/modules/features/wikipedia-search/components/sw-orchestrator.js',
            'js/modules/features/wikipedia-search/search-wikipedia.js', // [MODIFIED] Facade
            'js/modules/features/fandom-search/fandom-search-core.js',
            'js/modules/features/fandom-search-components/fsa-search.js',
            'js/modules/features/fandom-search-components/fsa-details.js',
            'js/modules/features/fandom-search/fandom-search-api.js', // [MODIFIED] Facade
            // [NEW] FandomSearchLogic Sub-modules
            'js/modules/features/fandom-search-components/fsl-cache.js',
            'js/modules/features/fandom-search-components/fsl-live.js',
            'js/modules/features/fandom-search-components/fsl-core.js',
            'js/modules/features/fandom-search/fandom-search-logic.js', // [MODIFIED] Facade
            // Search Manager Sub-modules
            // [NEW] Search Coordinator Sub-modules
            'js/modules/features/search-manager/search-coordinator-components/sc-flow.js',
            'js/modules/features/search-manager/search-coordinator-components/sc-managed.js',
            'js/modules/features/search-manager/search-coordinator-components/sc-cache.js',
            'js/modules/features/search-manager/search-coordinator.js', // [MODIFIED] Facade
            // [NEW] Search Handlers Sub-modules
            'js/modules/features/search-manager/search-handlers-components/sh-input.js',
            'js/modules/features/search-manager/search-handlers-components/sh-tabs.js',
            'js/modules/features/search-manager/search-handlers.js', // [MODIFIED] Facade
            // [NEW] Search Enhancer Sub-modules
            'js/modules/features/search-manager/search-enhancer-components/se-google.js',
            'js/modules/features/search-manager/search-enhancer-components/se-wiki-enhance.js',
            'js/modules/features/search-manager/search-enhancer.js', // [MODIFIED] Facade
            // [NEW] Search UI Handler
            'js/modules/search/search-ui-handler-components/suh-options.js',
            'js/modules/search/search-ui-handler-components/suh-search-control.js',
            'js/modules/search/search-ui-handler.js', // [MODIFIED] Facade
            'js/modules/features/search-manager/search-manager.js',
            'js/modules/search/shared/thumbnail-loader.js',
            // [NEW] Data Manager Sub-modules
            'js/modules/data/data-manager-components/dm-utils.js',
            'js/modules/data/data-manager-components/dm-export.js',
            'js/modules/data/data-manager-components/dm-import.js',
            'js/modules/data/data-manager-components/dm-reset.js',
            'js/modules/data/data-manager.js', // [MODIFIED] Facade
            'js/modules/wiki/fandom-domains/fandom-domains-components/fd-storage.js',
            'js/modules/wiki/fandom-domains/fandom-domains-components/fd-api.js',
            'js/modules/wiki/fandom-domains/fandom-domains-components/fd-operations.js',
            'js/modules/wiki/fandom-domains/fandom-domains.js', // [MODIFIED] Facade?v=1.1.2',
            // [NEW] WikiEntries Sub-modules
            'js/modules/wiki/wiki-entries/wiki-entries-components/we-fetcher.js',
            'js/modules/wiki/wiki-entries/wiki-entries.js', // [MODIFIED] Facade
            'js/modules/wiki/wiki-store/wiki-store.js',
            // WikiUIRenderer Sub-modules
            'js/modules/wiki/wiki-ui-renderer/wur-status.js',
            'js/modules/wiki/wiki-ui-renderer/wur-fandom.js',
            'js/modules/wiki/wiki-ui-renderer/wur-entries.js',
            'js/modules/wiki/wiki-ui-renderer/wur-categories.js',
            'js/modules/wiki/wiki-ui-renderer/wiki-ui-renderer.js?v=1.1.2',
            // [NEW] Wiki Cache Manager Sub-modules
            'js/modules/wiki/wiki-cache-manager/wiki-cache-manager-components/wcm-view.js',
            'js/modules/wiki/wiki-cache-manager/wiki-cache-manager-components/wcm-storage.js',
            'js/modules/wiki/wiki-cache-manager/wiki-cache-manager-components/wcm-update.js',
            'js/modules/wiki/wiki-cache-manager/wiki-cache-manager.js', // [MODIFIED] Facade
            // [NEW] WikiContentHelper Sub-modules
            'js/modules/wiki/wiki-content-helper/wiki-content-helper-components/wch-api.js',
            'js/modules/wiki/wiki-content-helper/wiki-content-helper-components/wch-processors.js',
            'js/modules/wiki/wiki-content-helper/wiki-content-helper.js', // [MODIFIED] Facade
            'js/modules/wiki/wiki-navigation/wiki-navigation.js',
            // WikiManager Sub-modules
            'js/modules/wiki/wiki-manager/wm-delegates.js',
            'js/modules/wiki/wiki-manager/wm-input.js',
            // [NEW] Wiki Manager Sub-modules
            'js/modules/wiki/wiki-manager/wm-fandom.js',
            'js/modules/wiki/wiki-manager/wm-entries.js',
            'js/modules/wiki/wiki-manager/wm-categories.js',
            'js/modules/wiki/wiki-manager/wiki-manager.js',
            'js/modules/features/popular-wikis.js'
        ],

        // Utility and Event Handling modules
        utilities: [
            // Utility Scripts
            // [NEW] API Test Sub-modules
            'js/modules/utils/api-test-components/at-connectivity.js',
            'js/modules/utils/api-test-components/at-diagnostics.js',
            'js/modules/utils/api-test-components/at-info.js',
            'js/modules/utils/api-test.js', // [MODIFIED] Facade
            // Connectivity
            'js/modules/utils/connectivity/connectivity-core.js',
            'js/modules/utils/connectivity/connectivity-diagnostics.js',
            'js/modules/utils/connectivity/connectivity-status-updater.js',
            'js/modules/utils/connectivity/components/cg-core.js',
            'js/modules/utils/connectivity/components/cg-api.js',
            'js/modules/utils/connectivity/components/cg-ui.js',
            'js/modules/utils/connectivity/connectivity-google.js',
            'js/modules/utils/connectivity/connectivity-test.js',
            'js/modules/utils/page-freeze/components/pfn-styles.js',
            'js/modules/utils/page-freeze/components/pfn-ui.js',
            'js/modules/utils/page-freeze/page-freeze-notifications.js',
            // [NEW] PageFreezeCSE Sub-modules
            'js/modules/utils/page-freeze/detector-components/pfd-cse-detection.js',
            'js/modules/utils/page-freeze/detector-components/pfd-cse-monitoring.js',
            'js/modules/utils/page-freeze/detector-components/pfd-cse-handlers.js',
            'js/modules/utils/page-freeze/pfd-google-cse.js', // [MODIFIED] Facade
            'js/modules/utils/page-freeze/components/pfr-cse.js',
            'js/modules/utils/page-freeze/components/pfr-ops.js',
            'js/modules/utils/page-freeze/page-freeze-recovery.js',
            // Event Manager Sub-modules
            'js/modules/utils/event-manager/em-tabs.js',
            'js/modules/utils/event-manager/em-discovery.js',
            'js/modules/utils/event-manager/em-wiki.js',
            'js/modules/utils/event-manager/em-popups.js',
            'js/modules/utils/event-manager/em-input.js',
            // event-bus.js already loaded in errorHandling section
            'js/modules/utils/event-manager/event-manager.js',
            // Force Reload Components
            'js/modules/utils/force-reload/fr-error.js',
            'js/modules/utils/force-reload/fr-compat.js',
            'js/modules/utils/force-reload/fr-config.js',
            'js/modules/utils/force-reload/fr-modules-registry.js',
            'js/modules/utils/force-reload/fr-modules-init.js',
            'js/modules/utils/force-reload/fr-modules.js',
            'js/modules/utils/force-reload/fr-ui.js',
            'js/modules/utils/force-reload/force-reload.js',
            'js/modules/ui/force-reload-handler/force-reload-handler.js',
            'js/modules/utils/emergency-status.js',
            'js/modules/core/global-fix-components/core.js',
            'js/modules/core/global-fix-components/stub-factory.js',
            'js/modules/core/global-fix-components/smart-cache-stub.js',
            'js/modules/core/global-fix-components/fix-direct-search.js',

        ],

        // Debug and helper modules
        debug: [
            'js/modules/helpers/debug-helper.js',
            'js/modules/helpers/module-debugger.js',
            // [NEW] StartupHelper Sub-modules
            'js/modules/core/initialization/startup-components/startup-core.js',
            'js/modules/core/initialization/startup-components/startup-ui.js',
            'js/modules/core/initialization/startup-components/startup-checks.js',
            'js/modules/core/initialization/startup-helper.js', // [MODIFIED] Facade
            // [NEW] AppInitializer Sub-modules
            'js/modules/core/app-initializer/components/ai-error.js',
            'js/modules/core/app-initializer/app-initializer.js' // [MODIFIED] Facade
        ],

        // Main initialization
        startup: [
            // [NEW] Startup Loader Sub-modules
            'js/modules/ui/startup-loader/components/startup-ui.js',
            'js/modules/ui/startup-loader/components/startup-status.js',
            'js/modules/ui/startup-loader/components/startup-init.js',
            'js/modules/ui/startup-loader/startup-loader.js', // [MODIFIED] Facade
            'js/modules/core/app-recovery.js'
        ]
    };

    // Expose JS config globally
    window.ResourceLoaderJSContext = JS_FILES;

    console.log('[rl-config-js.js] JS configuration loaded');

})();
