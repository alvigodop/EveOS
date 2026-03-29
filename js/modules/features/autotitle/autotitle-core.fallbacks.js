window.EveOS = window.EveOS || {};
window.EveOS.Autotitle = window.EveOS.Autotitle || {};

(function (ns) {
    const runtime = ns.RuntimeCore = ns.RuntimeCore || {};
    if (runtime.fallbacksLoaded) return;

    async function runSharedFallbackStrategies(ctx) {
        if (ctx.strats.AllOrigins && !(ctx.isBrowserHtmlMode && (ctx.lightpandaBlocked || ctx.shouldSkipBrowserProxyFallbacks()))) {
            console.log('Autotitle: Trying AllOrigins strategy...');
            try {
                const allOriginsResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.AllOrigins, ctx.isBrowserHtmlMode ? 12000 : 4500), ctx.url);
                if (allOriginsResult) {
                    if (allOriginsResult.title && !ctx.looksLikeGenericSiteName(allOriginsResult.title, ctx.url)) {
                        console.log('Autotitle: AllOrigins returned good title:', allOriginsResult.title);
                        runtime.mergeIntoPrimaryResult(ctx, allOriginsResult);
                        if (!ctx.allowSlowCover && ctx.primaryResult?.coverUrl) {
                            return ctx.primaryResult;
                        }
                    } else {
                        ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, allOriginsResult, ctx.url);
                    }
                }
            } catch (e) {
                console.warn('Autotitle: AllOrigins strategy failed', e);
            }
        }

        if (ctx.strats.CorsProxy && !(ctx.isBrowserHtmlMode && (ctx.lightpandaBlocked || ctx.shouldSkipBrowserProxyFallbacks()))) {
            console.log('Autotitle: Trying CorsProxy strategy...');
            const corsResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.CorsProxy, 4500), ctx.url);
            if (corsResult && !ctx.looksLikeGenericSiteName(corsResult.title, ctx.url)) {
                console.log('Autotitle: CorsProxy returned good title:', corsResult.title);
                runtime.mergeIntoPrimaryResult(ctx, corsResult);
                if (!ctx.allowSlowCover && ctx.primaryResult?.coverUrl) {
                    return ctx.primaryResult;
                }
            }
            if (corsResult) {
                runtime.mergeIntoPrimaryResult(ctx, corsResult);
            }
        }

        if (ctx.strats.LinkMeta && !ctx.isBrowserHtmlMode) {
            const linkMetaResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.LinkMeta, 5000), ctx.url);
            if (linkMetaResult) {
                if (!ctx.primaryResult || ctx.isClearlyBetterTitle(linkMetaResult, ctx.primaryResult, ctx.url)) {
                    console.log('Autotitle: LinkMeta returned better title:', linkMetaResult.title);
                }
                runtime.mergeIntoPrimaryResult(ctx, linkMetaResult);
            }
        }

        if (ctx.strats.GoogleSearch && !ctx.isVideoOrContentSite(ctx.url) && !ctx.isBrowserHtmlMode) {
            console.log('Autotitle: Trying MicroLink for OpenGraph...');
            const microResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.GoogleSearch, 7000), ctx.url);
            if (microResult && microResult.title) {
                if (!ctx.primaryResult || ctx.isClearlyBetterTitle(microResult, ctx.primaryResult, ctx.url)) {
                    console.log('Autotitle: MicroLink returned better title:', microResult.title);
                }
                runtime.mergeIntoPrimaryResult(ctx, microResult);
            }
        }

        if (ctx.strats.ScraperEngine && !(ctx.isBrowserHtmlMode && (ctx.lightpandaBlocked || ctx.shouldSkipBrowserProxyFallbacks())) && (!ctx.primaryResult || ctx.primaryResult.isFallback || ctx.primaryResult.title === 'CLOUDFLARE_BLOCK' || ctx.looksLikeGenericSiteName(ctx.primaryResult.title, ctx.url) || ctx.needsCoverUpgrade(ctx.primaryResult))) {
            console.log('Autotitle: Trying Advanced Scraper Engine fallback...');
            try {
                const scraperResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.ScraperEngine, 9000), ctx.url);
                if (scraperResult) {
                    runtime.mergeIntoPrimaryResult(ctx, scraperResult);
                }
            } catch (e) {
                console.warn('Autotitle: ScraperEngine strategy failed', e);
            }
        }

        if (ctx.strats.Lightpanda && !ctx.lightpandaAttempted && (!ctx.primaryResult || ctx.primaryResult.isFallback || ctx.primaryResult.title === 'CLOUDFLARE_BLOCK' || ctx.looksLikeGenericSiteName(ctx.primaryResult.title, ctx.url) || ctx.needsCoverUpgrade(ctx.primaryResult))) {
            console.log('Autotitle: Trying Lightpanda high-reliability fallback...');
            try {
                ctx.lightpandaAttempted = true;
                const lpResult = ctx.normalizeLightpandaResult(await ctx.runStrategy(ctx.strats.Lightpanda, 30000));
                if (lpResult) {
                    if (lpResult.blocked || lpResult.title === 'CLOUDFLARE_BLOCK') {
                        ctx.lightpandaBlocked = true;
                    }
                    runtime.mergeIntoPrimaryResult(ctx, lpResult);
                }
            } catch (e) {
                console.warn('Autotitle: Lightpanda strategy failed', e);
            }
        }

        if (ctx.strats.Camofox && !ctx.camofoxAttempted && (!ctx.primaryResult || ctx.primaryResult.isFallback || ctx.primaryResult.title === 'CLOUDFLARE_BLOCK' || ctx.looksLikeGenericSiteName(ctx.primaryResult.title, ctx.url) || ctx.needsCoverUpgrade(ctx.primaryResult))) {
            console.log('Autotitle: Trying Camofox final browser fallback...');
            try {
                ctx.camofoxAttempted = true;
                const camofoxResult = ctx.normalizeCamofoxResult(await ctx.runStrategy(ctx.strats.Camofox, 45000));
                if (camofoxResult) {
                    if (camofoxResult.blocked || camofoxResult.title === 'CLOUDFLARE_BLOCK') {
                        ctx.camofoxBlocked = true;
                    }
                    runtime.mergeIntoPrimaryResult(ctx, camofoxResult);
                }
            } catch (e) {
                console.warn('Autotitle: Camofox strategy failed', e);
            }
        }

        if (ctx.primaryResult && (ctx.lightpandaBlocked || ctx.camofoxBlocked) && ctx.primaryResult.title === 'CLOUDFLARE_BLOCK') {
            return {
                ...ctx.primaryResult,
                lightpandaBlocked: !!ctx.lightpandaBlocked,
                camofoxBlocked: !!ctx.camofoxBlocked,
                browserFallbackBlocked: true
            };
        }

        return null;
    }

    Object.assign(runtime, {
        runSharedFallbackStrategies
    });

    runtime.fallbacksLoaded = true;
})(window.EveOS.Autotitle);
