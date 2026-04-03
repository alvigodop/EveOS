/* EveOS Manifest Scripts Part */
window.EveModuleManifestParts = window.EveModuleManifestParts || {};
window.EveModuleManifestScriptChunks = window.EveModuleManifestScriptChunks || [];

window.EveModuleManifestScriptChunks.push([
    // Scraper Feature Modules (Part 3)
    "js/modules/features/scraper/features/search-ui-renderer-components/sur-fandom.js",
    "js/modules/features/scraper/features/search-ui-renderer.js",
    "js/modules/features/scraper/features/result-processor/result-enricher-components/re-fandom.js",
    "js/modules/features/scraper/features/result-processor/result-enricher.js",
    "js/modules/features/scraper/features/result-processor/result-filter.js",
    "js/modules/features/scraper/features/result-processor/result-deduplicator-components/rd-similarity.js",
    "js/modules/features/scraper/features/result-processor/result-deduplicator.js",
    "js/modules/features/scraper/features/result-processor/result-processor.js",
    "js/modules/features/scraper/features/wikipedia-enhancer-components/we-service.js",
    "js/modules/features/scraper/features/wikipedia-enhancer-components/we-processor.js",
    "js/modules/features/scraper/features/wikipedia-enhancer.js",
    "js/modules/features/scraper/features/wikipedia-search/components/wa-fetch.js",
    "js/modules/features/scraper/features/wikipedia-search/components/wa-enrich.js",
    "js/modules/features/scraper/features/wikipedia-search/wikipedia-api.js",
    "js/modules/features/scraper/features/wikipedia-search/wikipedia-cache.js",
    "js/modules/features/scraper/features/wikipedia-search/wikipedia-processor.js",
    "js/modules/features/scraper/features/wikipedia-search/components/sw-orchestrator.js",
    "js/modules/features/scraper/features/wikipedia-search/search-wikipedia.js",
    "js/modules/features/scraper/features/fandom-search/fandom-search-core.js",
    "js/modules/features/scraper/features/fandom-search-components/fsa-search.js",
    "js/modules/features/scraper/features/fandom-search-components/fsa-details.js",
    "js/modules/features/scraper/features/fandom-search/fandom-search-api.js",
    "js/modules/features/scraper/features/fandom-search-components/fsl-cache.js",
    "js/modules/features/scraper/features/fandom-search-components/fsl-live.js",
    "js/modules/features/scraper/features/fandom-search-components/fsl-core.js",
    "js/modules/features/scraper/features/fandom-search/fandom-search-logic.js",
    "js/modules/features/scraper/features/search-manager/search-coordinator-components/sc-flow.js?v=0.1.1",
    "js/modules/features/scraper/features/search-manager/search-coordinator-components/sc-managed.js",
    "js/modules/features/scraper/features/search-manager/search-coordinator-components/sc-cache.js",
    "js/modules/features/scraper/features/search-manager/search-coordinator.js",
    "js/modules/features/scraper/features/search-manager/search-handlers-components/sh-input.js",
    "js/modules/features/scraper/features/search-manager/search-handlers-components/sh-tabs.js?v=0.1.1",
    "js/modules/features/scraper/features/search-manager/search-handlers.js",
    "js/modules/features/scraper/features/search-manager/search-enhancer-components/se-google.js",
    "js/modules/features/scraper/features/search-manager/search-enhancer-components/se-wiki-enhance.js",
    "js/modules/features/scraper/features/search-manager/search-enhancer.js",
    "js/modules/features/scraper/search/search-ui-handler-components/suh-options.js",
    "js/modules/features/scraper/search/search-ui-handler-components/suh-search-control.js",
    "js/modules/features/scraper/search/search-ui-handler.js",
    "js/modules/features/scraper/features/search-manager/search-manager.js",
    "js/modules/features/scraper/search/shared/thumbnail-loader.js",
    "js/modules/features/scraper/data/data-manager-components/dm-utils.js",
    "js/modules/features/scraper/data/data-manager-components/dm-export.js",
    "js/modules/features/scraper/data/data-manager-components/dm-import.js",
    "js/modules/features/scraper/data/data-manager-components/dm-reset.js",
    "js/modules/features/scraper/data/data-manager.js",
    "js/modules/features/scraper/wiki/fandom-domains/fandom-domains-components/fd-storage.js",
    "js/modules/features/scraper/wiki/fandom-domains/fandom-domains-components/fd-api.js",
    "js/modules/features/scraper/wiki/fandom-domains/fandom-domains-components/fd-operations.js",
    "js/modules/features/scraper/wiki/fandom-domains/fandom-domains.js",
    "js/modules/features/scraper/wiki/wiki-entries/wiki-entries-components/we-fetcher.js",
    "js/modules/features/scraper/wiki/wiki-entries/wiki-entries.js",
    "js/modules/features/scraper/wiki/wiki-store/wiki-store.js",
    "js/modules/features/scraper/wiki/wiki-ui-renderer/wur-status.js",
    "js/modules/features/scraper/wiki/wiki-ui-renderer/wur-fandom.js",
    "js/modules/features/scraper/wiki/wiki-ui-renderer/wur-entries.js",
    "js/modules/features/scraper/wiki/wiki-ui-renderer/wur-categories.js",
    "js/modules/features/scraper/wiki/wiki-ui-renderer/wiki-ui-renderer.js?v=1.1.2",
    "js/modules/features/scraper/wiki/wiki-cache-manager/wiki-cache-manager-components/wcm-view.js",
    "js/modules/features/scraper/wiki/wiki-cache-manager/wiki-cache-manager-components/wcm-storage.js",
    "js/modules/features/scraper/wiki/wiki-cache-manager/wiki-cache-manager-components/wcm-update.js",
    "js/modules/features/scraper/wiki/wiki-cache-manager/wiki-cache-manager.js",
    "js/modules/features/scraper/wiki/wiki-content-helper/wiki-content-helper-components/wch-api.js",
    "js/modules/features/scraper/wiki/wiki-content-helper/wiki-content-helper-components/wch-processors.js",
    "js/modules/features/scraper/wiki/wiki-content-helper/wiki-content-helper.js",
    "js/modules/features/scraper/wiki/wiki-navigation/wiki-navigation.js",
    "js/modules/features/scraper/wiki/wiki-manager/wm-delegates.js",
    "js/modules/features/scraper/wiki/wiki-manager/wm-input.js",
    "js/modules/features/scraper/wiki/wiki-manager/wm-fandom.js",
    "js/modules/features/scraper/wiki/wiki-manager/wm-entries.js",
    "js/modules/features/scraper/wiki/wiki-manager/wm-categories.js",
    "js/modules/features/scraper/wiki/wiki-manager/wiki-manager.js",
    "js/modules/features/scraper/features/popular-wikis.js",
    "js/modules/features/scraper/utils/api-test-components/at-connectivity.js",
    "js/modules/features/scraper/utils/api-test-components/at-diagnostics.js",
    "js/modules/features/scraper/utils/api-test-components/at-info.js",
    "js/modules/features/scraper/utils/api-test.js",
    "js/modules/features/scraper/utils/connectivity/connectivity-core.js",
    "js/modules/features/scraper/utils/connectivity/connectivity-diagnostics.js",
    "js/modules/features/scraper/utils/connectivity/connectivity-status-updater.js",
    "js/modules/features/scraper/utils/connectivity/components/cg-core.js",
    "js/modules/features/scraper/utils/connectivity/components/cg-api.js",
    "js/modules/features/scraper/utils/connectivity/components/cg-ui.js",
    "js/modules/features/scraper/utils/connectivity/connectivity-google.js",
    "js/modules/features/scraper/utils/connectivity/connectivity-test.js",
    "js/modules/features/scraper/utils/page-freeze/components/pfn-styles.js",
    "js/modules/features/scraper/utils/page-freeze/components/pfn-ui.js",
    "js/modules/features/scraper/utils/page-freeze/page-freeze-notifications.js",
    "js/modules/features/scraper/utils/page-freeze/detector-components/pfd-core.js",
    "js/modules/features/scraper/utils/page-freeze/page-freeze-detector.js",
    "js/modules/features/scraper/utils/page-freeze/detector-components/pfd-cse-detection.js",
    "js/modules/features/scraper/utils/page-freeze/detector-components/pfd-cse-monitoring.js",
    "js/modules/features/scraper/utils/page-freeze/detector-components/pfd-cse-handlers.js",
    "js/modules/features/scraper/utils/page-freeze/pfd-google-cse.js",
    "js/modules/features/scraper/utils/page-freeze/components/pfr-cse.js",
    "js/modules/features/scraper/utils/page-freeze/components/pfr-ops.js",
    "js/modules/features/scraper/utils/page-freeze/page-freeze-recovery.js",
    "js/modules/features/scraper/utils/event-manager/em-tabs.js",
    "js/modules/features/scraper/utils/event-manager/em-discovery.js",
    "js/modules/features/scraper/utils/event-manager/em-wiki.js",
    "js/modules/features/scraper/utils/event-manager/em-popups.js",
    "js/modules/features/scraper/utils/event-manager/em-input.js",
    "js/modules/features/scraper/utils/event-manager/event-manager.js",
    "js/modules/features/scraper/utils/force-reload/fr-error.js",
    "js/modules/features/scraper/utils/force-reload/fr-compat.js",
    "js/modules/features/scraper/utils/force-reload/fr-config.js",
    "js/modules/features/scraper/utils/force-reload/fr-modules-registry.js",
    "js/modules/features/scraper/utils/force-reload/fr-modules-init.js",
    "js/modules/features/scraper/utils/force-reload/fr-modules.js",
    "js/modules/features/scraper/utils/force-reload/fr-ui.js",
    "js/modules/features/scraper/utils/force-reload/force-reload.js",
    "js/modules/features/scraper/ui/force-reload-handler/force-reload-handler.js",
    "js/modules/features/scraper/utils/emergency-status.js",
    "js/modules/features/scraper/core/global-fix-components/core.js",
    "js/modules/features/scraper/core/global-fix-components/stub-factory.js",
    "js/modules/features/scraper/core/global-fix-components/smart-cache-stub.js",
    "js/modules/features/scraper/core/global-fix-components/fix-direct-search.js",
    "js/modules/features/scraper/helpers/debug-helper.js",
    "js/modules/features/scraper/helpers/module-debugger.js",
    "js/modules/features/scraper/core/initialization/startup-components/startup-core.js",
    "js/modules/features/scraper/core/initialization/startup-components/startup-ui.js",
    "js/modules/features/scraper/core/initialization/startup-components/startup-checks.js",
    "js/modules/features/scraper/core/initialization/startup-helper.js",
    "js/modules/features/scraper/core/app-initializer/components/ai-error.js",
    "js/modules/features/scraper/core/app-initializer/app-initializer.js",
    "js/modules/features/scraper/ui/startup-loader/components/startup-ui.js",
    "js/modules/features/scraper/ui/startup-loader/components/startup-status.js",
    "js/modules/features/scraper/ui/startup-loader/components/startup-init.js",
    "js/modules/features/scraper/ui/startup-loader/startup-loader.js",
    "js/modules/features/scraper/core/app-recovery.js",
    "js/modules/features/scraper/ui/category-scraper-panel.js?v=0.1.1",
    "js/modules/features/scraper/ui/templates/scraper-panel-template.js?v=0.1.3",
    "js/modules/features/scraper/core/scraper-init.js"
]);
