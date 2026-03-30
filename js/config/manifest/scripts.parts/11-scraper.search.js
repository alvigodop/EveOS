/* EveOS Manifest Scripts Part */
window.EveModuleManifestParts = window.EveModuleManifestParts || {};
window.EveModuleManifestScriptChunks = window.EveModuleManifestScriptChunks || [];

window.EveModuleManifestScriptChunks.push([
    // Scraper Feature Modules (Part 2)
    "js/modules/features/scraper/ui/view-grid/components/vg-header.js",
    "js/modules/features/scraper/ui/view-grid/components/vgc-title.js",
    "js/modules/features/scraper/ui/view-grid/components/vgc-details.js",
    "js/modules/features/scraper/ui/view-grid/components/vg-content.js",
    "js/modules/features/scraper/ui/view-grid/components/vg-footer.js",
    "js/modules/features/scraper/ui/view-grid/view-grid.js",
    "js/modules/features/scraper/ui/view-list/components/vl-media.js",
    "js/modules/features/scraper/ui/view-list/components/vl-content.js",
    "js/modules/features/scraper/ui/view-list/components/vl-actions.js",
    "js/modules/features/scraper/ui/view-list/view-list.js",
    "js/modules/features/scraper/ui/tab-manager/components/tm-state.js",
    "js/modules/features/scraper/ui/tab-manager/components/tm-utils.js",
    "js/modules/features/scraper/ui/tab-manager/components/tm-ui.js",
    "js/modules/features/scraper/ui/tab-manager/tab-manager.js",
    "js/modules/features/scraper/ui/popup-manager/components/popup-history.js",
    "js/modules/features/scraper/ui/popup-manager/components/popup-confirmation.js",
    "js/modules/features/scraper/ui/popup-manager/components/viewer/pv-ui.js",
    "js/modules/features/scraper/ui/popup-manager/components/viewer/pv-loader.js",
    "js/modules/features/scraper/ui/popup-manager/components/viewer/pv-state.js",
    "js/modules/features/scraper/ui/popup-manager/components/popup-viewer.js",
    "js/modules/features/scraper/ui/popup-manager/popup-manager.js",
    "js/modules/features/scraper/ui/module-status/ui-module-status.js",
    "js/modules/features/scraper/search/shared/search-display.js",
    "js/modules/features/scraper/ui/ui-result-display/components/urd-core.js",
    "js/modules/features/scraper/ui/ui-result-display/components/urd-grid.js",
    "js/modules/features/scraper/ui/ui-result-display/components/urd-list.js",
    "js/modules/features/scraper/ui/ui-result-display/ui-result-display.js",
    "js/modules/features/scraper/ui/search-controls/search-controls.js",
    "js/modules/features/scraper/ui/dropdown-handler/dropdown-handler.js",
    "js/modules/features/scraper/ui/debug-panel/components/dp-core.js",
    "js/modules/features/scraper/ui/debug-panel/components/dp-panel.js",
    "js/modules/features/scraper/ui/debug-panel/debug-panel.js",
    "js/modules/features/scraper/api/fandom-api.js",
    "js/modules/features/scraper/search/shared/search-options.js",
    "js/modules/features/scraper/search/direct-search/ds-core.js",
    "js/modules/features/scraper/search/direct-search/wikipedia-core.js",
    "js/modules/features/scraper/search/direct-search/wikipedia-logic.js",
    "js/modules/features/scraper/search/direct-search/wikipedia-fallbacks.js",
    "js/modules/features/scraper/search/direct-search/wikipedia-api.js",
    "js/modules/features/scraper/search/direct-search/fandom-core.js",
    "js/modules/features/scraper/search/direct-search/fandom-fallbacks.js",
    "js/modules/features/scraper/search/direct-search/fandom-logic.js",
    "js/modules/features/scraper/search/direct-search.js",
    "js/modules/features/scraper/search/direct-search-test-components/dst-runner.js",
    "js/modules/features/scraper/search/direct-search-test-components/dst-fixes.js",
    "js/modules/features/scraper/search/direct-search-test.js",
    "js/modules/features/scraper/search/config.js",
    "js/modules/features/scraper/search/relevance-scoring-components/rs-scorer.js",
    "js/modules/features/scraper/search/relevance-scoring-components/relevance-scoring.js",
    "js/modules/features/scraper/search/google-cse/cse-config.js",
    "js/modules/features/scraper/search/cse-utils-components/cu-dom.js",
    "js/modules/features/scraper/search/cse-utils-components/cu-fallback.js",
    "js/modules/features/scraper/search/google-cse/cse-utils.js",
    "js/modules/features/scraper/search/google-cse/cse-handlers.js",
    "js/modules/features/scraper/search/google-cse/cse-results.js",
    "js/modules/features/scraper/search/google-cse/google-cse-embedded.js",
    "js/modules/features/scraper/search/cse-handler-components/cth-ui.js",
    "js/modules/features/scraper/search/cse-handler-components/cth-interceptor.js",
    "js/modules/features/scraper/search/google-cse/cse-toggle-handler.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-core.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-ui-components/ui-elements.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-ui-components/ui-pagination.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-ui-components/ui-renderer.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-ui-components/ui-events.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-ui.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-api-components/fcsa-fetch.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-api-components/fcsa-process.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-api.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-scraper-components/scraper-domain.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-scraper-components/scraper-yahoo.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-scraper-components/scraper-brave.js",
    "js/modules/features/scraper/search/fandom-community/fandom-cs-scraper.js",
    "js/modules/features/scraper/search/fandom-community/fandom-community-search.js?v=1.1.3",
    "js/modules/features/scraper/discovery/discovery-components/discovery-logic.js",
    "js/modules/features/scraper/discovery/discovery-components/discovery-domains.js",
    "js/modules/features/scraper/discovery/discovery-components/discovery-search-ui.js",
    "js/modules/features/scraper/discovery/discovery-components/discovery-search-orchestrator.js",
    "js/modules/features/scraper/discovery/discovery-ui-components/dui-utils.js",
    "js/modules/features/scraper/discovery/discovery-ui-components/dui-interface.js",
    "js/modules/features/scraper/discovery/discovery-ui-components/dui-results.js",
    "js/modules/features/scraper/discovery/system/discovery-ui.js",
    "js/modules/features/scraper/discovery/system/discovery.js",
    "js/modules/features/scraper/discovery/domain-validator/domain-validator-components/dv-fetch.js",
    "js/modules/features/scraper/discovery/domain-validator/domain-validator.js",
    "js/modules/features/scraper/discovery/domain-generator/domain-generator-components/dg-formatter.js",
    "js/modules/features/scraper/discovery/domain-generator/domain-generator.js",
    "js/modules/features/scraper/discovery/wikipedia-internal/wd-core.js",
    "js/modules/features/scraper/discovery/wikipedia-internal/wd-mode-direct.js",
    "js/modules/features/scraper/discovery/wikipedia-internal/wd-mode-server.js",
    "js/modules/features/scraper/discovery/wikipedia-internal/wd-search.js",
    "js/modules/features/scraper/discovery/wikipedia-internal/wd-media.js",
    "js/modules/features/scraper/discovery/wikipedia-internal/wd-enhancer.js",
    "js/modules/features/scraper/discovery/wikipedia-internal/wikipedia-discovery.js",
    "js/modules/features/scraper/discovery/fandom-search-components/utils.js",
    "js/modules/features/scraper/discovery/fandom-search-components/api.js",
    "js/modules/features/scraper/discovery/fandom-search-components/ui.js",
    "js/modules/features/scraper/discovery/fandom-search-components/logic/score.js",
    "js/modules/features/scraper/discovery/fandom-search-components/logic/match.js",
    "js/modules/features/scraper/discovery/fandom-search-components/logic/workflow.js",
    "js/modules/features/scraper/discovery/fandom-search-components/logic/strategy.js",
    "js/modules/features/scraper/discovery/fandom-search-components/logic.js",
    "js/modules/features/scraper/discovery/fandom-search/fandom-search.js",
    "js/modules/features/scraper/discovery/fandom-discovery/core.js",
    "js/modules/features/scraper/discovery/fandom-discovery/google-integration.js",
    "js/modules/features/scraper/discovery/fandom-discovery/direct-search.js",
    "js/modules/features/scraper/discovery/fandom-discovery/discovery-strategy-google.js",
    "js/modules/features/scraper/discovery/fandom-discovery/discovery-strategy-fandom.js",
    "js/modules/features/scraper/discovery/fandom-discovery/search-coordinator.js",
    "js/modules/features/scraper/discovery/google-scraper-core-components/gsc-emulator.js",
    "js/modules/features/scraper/discovery/google-scraper-core-components/gsc-connectivity.js",
    "js/modules/features/scraper/discovery/google-scraper-core-components/gsc-scraping.js",
    "js/modules/features/scraper/discovery/google-components/google-scraper-core.js",
    "js/modules/features/scraper/discovery/google-scraper-ui-components/gsu-toggles.js",
    "js/modules/features/scraper/discovery/google-scraper-ui-components/gsu-rendering.js",
    "js/modules/features/scraper/discovery/google-scraper-ui-components/gsu-display.js",
    "js/modules/features/scraper/discovery/google-components/google-scraper-ui.js",
    "js/modules/features/scraper/discovery/google-components/google-search-mock-data.js",
    "js/modules/features/scraper/discovery/google-search-scraper-components/gss-config.js",
    "js/modules/features/scraper/discovery/google-search-scraper-components/gss-connectivity.js",
    "js/modules/features/scraper/discovery/google-components/google-search-scraper.js",
    "js/modules/features/scraper/search/discovery-broker/sdb-core.js",
    "js/modules/features/scraper/search/discovery-broker/sdb-ui.js",
    "js/modules/features/scraper/search/discovery-broker/sdb-fandom.js",
    "js/modules/features/scraper/search/discovery-broker/sdb-wikipedia.js",
    "js/modules/features/scraper/search/search-discovery-broker.js",
    "js/modules/features/scraper/wiki/wiki-discovery-integration/wiki-discovery-components/wdi-ui.js",
    "js/modules/features/scraper/wiki/wiki-discovery-integration/wiki-discovery-components/wdi-fandom.js",
    "js/modules/features/scraper/wiki/wiki-discovery-integration/wiki-discovery-components/wdi-wikipedia.js",
    "js/modules/features/scraper/wiki/wiki-discovery-integration/wiki-discovery-integration.js",
    "js/modules/features/scraper/core/initialization/google-cse-initializer.js",
    "js/modules/features/scraper/features/search-ui-renderer-components/sur-loading.js",
    "js/modules/features/scraper/features/search-ui-renderer-components/sur-error.js",
    "js/modules/features/scraper/features/search-ui-renderer-components/sur-wiki.js",
]);
