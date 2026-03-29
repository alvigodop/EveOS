window.EveOS = window.EveOS || {};
window.EveOS.Autotitle = window.EveOS.Autotitle || {};

(function (ns) {
    const runtime = ns.RuntimeCore || {};
    window.getTitleFromUrlLightpanda = runtime.getTitleFromUrlLightpanda || (async () => null);
    window.getTitleFromUrlCamofox = runtime.getTitleFromUrlCamofox || (async () => null);
    window.getTitleFromUrlHeadless = runtime.getTitleFromUrlHeadless || (async () => null);
    window.getTitleFromUrl = runtime.getTitleFromUrl || (async () => null);
})(window.EveOS.Autotitle);
