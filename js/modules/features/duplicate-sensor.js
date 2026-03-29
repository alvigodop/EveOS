window.EveDuplicateSensor = window.EveDuplicateSensor || {};

(function () {
    const ns = window.EveDuplicateSensor;
    const runtime = ns._runtime || {};
    if (ns.ready) return;

    Object.assign(ns, {
        getConfig: runtime.getConfig,
        normalizeScope: runtime.normalizeScope,
        normalizeUrl: runtime.normalizeUrl,
        buildScopedKey: runtime.buildScopedKey,
        scan: runtime.scan,
        mergeDuplicateGroup: runtime.mergeDuplicateGroup
    });

    ns.ready = true;
})();
