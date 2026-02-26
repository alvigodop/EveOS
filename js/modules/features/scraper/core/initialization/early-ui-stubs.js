/**
 * Early UI Stubs
 * 
 * Stub functions for UI controls to prevent ReferenceErrors before modules load.
 * Captures early user interactions and queues them or retries execution.
 */

// Queue for early calls before real functions are loaded
window._earlyUICalls = { source: null, layout: null };

// Stub functions that queue calls for later
window.updateSource = function (source) {
    window._earlyUICalls.source = source;
    // Try again if real function is available
    if (window._realUpdateSource) window._realUpdateSource(source);
};

window.updateLayout = function (layout) {
    window._earlyUICalls.layout = layout;
    if (window._realUpdateLayout) window._realUpdateLayout(layout);
};

window.applyFilters = function () {
    if (window._realApplyFilters) window._realApplyFilters();
};
