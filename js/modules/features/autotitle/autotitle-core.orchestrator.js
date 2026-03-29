window.EveOS = window.EveOS || {};
window.EveOS.Autotitle = window.EveOS.Autotitle || {};

(function (ns) {
    const runtime = ns.RuntimeCore = ns.RuntimeCore || {};
    if (runtime.orchestratorLoaded) return;

    async function getTitleFromUrl(url, options = {}) {
        const strats = ns?.Strategies;
        if (!strats) {
            console.error('Autotitle strategies not loaded.');
            return null;
        }

        const ctx = runtime.createAutotitleContext(url, options, strats);

        try {
            if (ctx.isVideoOrContentSite(url) && strats.GoogleSearch) {
                console.log('Autotitle: Video site detected. Trying MicroLink first...');
                const microResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(strats.GoogleSearch, 7000), url);
                if (microResult && microResult.title && microResult.title.length > 10) {
                    console.log('Autotitle: MicroLink returned:', microResult.title);
                    return microResult;
                }
            }

            const browserResult = await runtime.runBrowserHtmlStrategies(ctx);
            if (browserResult) return browserResult;

            const sharedResult = await runtime.runSharedFallbackStrategies(ctx);
            if (sharedResult) return sharedResult;

            await runtime.runCoverRecoveryStrategies(ctx);

            return runtime.finalizePrimaryResult(ctx) || runtime.runUrlSlugFallback(ctx);
        } catch (e) {
            console.warn('Autotitle orchestration error', e);
        }

        return null;
    }

    Object.assign(runtime, { getTitleFromUrl });
    runtime.orchestratorLoaded = true;
})(window.EveOS.Autotitle);
