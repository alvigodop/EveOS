window.EveOS = window.EveOS || {};
window.EveOS.Autotitle = window.EveOS.Autotitle || {};

(function (ns) {
    const runtime = ns.RuntimeCore = ns.RuntimeCore || {};
    if (runtime.browserLoaded) return;

    function hasUsableFastTitle(ctx, result) {
        return !!(ctx.fastTitleOnly
            && result?.title
            && result.title !== 'CLOUDFLARE_BLOCK'
            && !ctx.looksLikeGenericSiteName(result.title, ctx.url));
    }

    async function runBrowserHtmlStrategies(ctx) {
        if (!ctx.isBrowserHtmlMode) return null;

        if (ctx.allowSlowCover && ctx.isGalleryPage && ctx.strats.GalleryPageHtml) {
            const earlyGalleryPageResult = ctx.normalizeAutotitleResult(
                await ctx.runStrategy(ctx.strats.GalleryPageHtml, 22000, {
                    attempts: 2,
                    accept: (result) => !!result?.title && !!result?.coverUrl
                }),
                ctx.url
            );
            if (earlyGalleryPageResult) {
                ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, earlyGalleryPageResult, ctx.url);
                if (earlyGalleryPageResult.title && earlyGalleryPageResult.coverUrl) {
                    return earlyGalleryPageResult;
                }
            }
        }

        if (ctx.allowSlowCover && ctx.isMangaFireHost && ctx.strats.MangaFireHtml) {
            const earlyMangaFireResult = ctx.normalizeAutotitleResult(
                await ctx.runStrategy(ctx.strats.MangaFireHtml, 22000, {
                    attempts: 2,
                    accept: (result) => !!result?.coverUrl
                }),
                ctx.url
            );
            if (earlyMangaFireResult) {
                ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, earlyMangaFireResult, ctx.url);
                if (earlyMangaFireResult.title && earlyMangaFireResult.coverUrl && earlyMangaFireResult.icon) {
                    return earlyMangaFireResult;
                }
            }
        }

        if (ctx.strats.MangaDexApi) {
            const mangaDexApiResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.MangaDexApi, ctx.strategyTimeout(5000, 3500)), ctx.url);
            if (mangaDexApiResult) {
                ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, mangaDexApiResult, ctx.url);
                if (hasUsableFastTitle(ctx, mangaDexApiResult)) {
                    return mangaDexApiResult;
                }
                if (mangaDexApiResult.title && mangaDexApiResult.coverUrl) {
                    return mangaDexApiResult;
                }
            }
        }

        if (ctx.strats.GoogleSearch && !ctx.isVideoOrContentSite(ctx.url)) {
            console.log('Autotitle: Browser HTML mode detected. Trying MicroLink early...');
            const earlyMicro = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.GoogleSearch, ctx.strategyTimeout(7000, 3500)), ctx.url);
            if (!ctx.primaryResult && earlyMicro) {
                ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, earlyMicro, ctx.url);
            } else if (earlyMicro) {
                runtime.mergeIntoPrimaryResult(ctx, earlyMicro);
            }
            if (hasUsableFastTitle(ctx, earlyMicro)) {
                return earlyMicro;
            }
            if (!ctx.allowSlowCover && earlyMicro?.title && !ctx.looksLikeGenericSiteName(earlyMicro.title, ctx.url) && earlyMicro.coverUrl && !ctx.primaryResult?.source?.includes?.('MangaDexAPI')) {
                return earlyMicro;
            }
        }

        if (ctx.allowSlowCover && ctx.strats.MangaFireHtml) {
            const mangaFireResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.MangaFireHtml, 22000, {
                attempts: ctx.isMangaFireHost ? 2 : 1,
                accept: (result) => !!result?.coverUrl
            }), ctx.url);
            if (mangaFireResult) {
                runtime.mergeIntoPrimaryResult(ctx, mangaFireResult);
            }
        }

        if (ctx.allowSlowCover && ctx.strats.GalleryPageHtml) {
            const galleryPageResult = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.GalleryPageHtml, 22000, {
                attempts: ctx.isGalleryPage ? 2 : 1,
                accept: (result) => !!result?.coverUrl
            }), ctx.url);
            if (galleryPageResult) {
                runtime.mergeIntoPrimaryResult(ctx, galleryPageResult);
            }
        }

        if (ctx.strats.LinkMeta) {
            const earlyLinkMeta = ctx.normalizeAutotitleResult(await ctx.runStrategy(ctx.strats.LinkMeta, ctx.strategyTimeout(5000, 3000)), ctx.url);
            if (earlyLinkMeta) {
                ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, earlyLinkMeta, ctx.url);
                if (hasUsableFastTitle(ctx, earlyLinkMeta)) {
                    return earlyLinkMeta;
                }
                if (!ctx.allowSlowCover && earlyLinkMeta.title && !ctx.looksLikeGenericSiteName(earlyLinkMeta.title, ctx.url) && earlyLinkMeta.coverUrl) {
                    return earlyLinkMeta;
                }
            }
        }

        if (!ctx.fastTitleOnly && ctx.strats.Lightpanda && (!ctx.primaryResult || ctx.primaryResult.isFallback || ctx.primaryResult.title === 'CLOUDFLARE_BLOCK' || ctx.looksLikeGenericSiteName(ctx.primaryResult.title, ctx.url) || ctx.needsCoverUpgrade(ctx.primaryResult))) {
            console.log('Autotitle: Trying Lightpanda early before proxy fallbacks...');
            try {
                ctx.lightpandaAttempted = true;
                const earlyLightpandaResult = ctx.normalizeLightpandaResult(await ctx.runStrategy(ctx.strats.Lightpanda, 30000));
                if (earlyLightpandaResult) {
                    if (earlyLightpandaResult.blocked || earlyLightpandaResult.title === 'CLOUDFLARE_BLOCK') {
                        ctx.lightpandaBlocked = true;
                    }
                    runtime.mergeIntoPrimaryResult(ctx, earlyLightpandaResult);
                    if (ctx.primaryResult?.title && ctx.primaryResult?.coverUrl && !ctx.primaryResult?.blocked && ctx.hasStrongCoverResult(ctx.primaryResult)) {
                        const normalizedEarlyLightpanda = ctx.normalizeAutotitleResult(ctx.primaryResult, ctx.url);
                        if (normalizedEarlyLightpanda) normalizedEarlyLightpanda.lightpandaBlocked = !!ctx.lightpandaBlocked;
                        return normalizedEarlyLightpanda;
                    }
                }
            } catch (e) {
                console.warn('Autotitle: Early Lightpanda strategy failed', e);
            }
        }

        if (!ctx.fastTitleOnly && ctx.strats.Camofox && (!ctx.primaryResult || ctx.primaryResult.isFallback || ctx.primaryResult.title === 'CLOUDFLARE_BLOCK' || ctx.looksLikeGenericSiteName(ctx.primaryResult.title, ctx.url) || ctx.needsCoverUpgrade(ctx.primaryResult))) {
            console.log('Autotitle: Trying Camofox after Lightpanda...');
            try {
                ctx.camofoxAttempted = true;
                const earlyCamofoxResult = ctx.normalizeCamofoxResult(await ctx.runStrategy(ctx.strats.Camofox, 45000));
                if (earlyCamofoxResult) {
                    if (earlyCamofoxResult.blocked || earlyCamofoxResult.title === 'CLOUDFLARE_BLOCK') {
                        ctx.camofoxBlocked = true;
                    }
                    runtime.mergeIntoPrimaryResult(ctx, earlyCamofoxResult);
                    if (ctx.primaryResult?.title && ctx.primaryResult?.coverUrl && !ctx.primaryResult?.blocked && ctx.hasStrongCoverResult(ctx.primaryResult)) {
                        const normalizedEarlyCamofox = ctx.normalizeAutotitleResult(ctx.primaryResult, ctx.url);
                        if (normalizedEarlyCamofox) {
                            normalizedEarlyCamofox.blocked = false;
                            normalizedEarlyCamofox.lightpandaBlocked = false;
                            normalizedEarlyCamofox.camofoxBlocked = false;
                            normalizedEarlyCamofox.browserFallbackBlocked = false;
                            if (normalizedEarlyCamofox.quality) {
                                normalizedEarlyCamofox.quality.blocked = false;
                                normalizedEarlyCamofox.quality.hasCover = !!normalizedEarlyCamofox.coverUrl;
                            }
                        }
                        return normalizedEarlyCamofox;
                    }
                }
            } catch (e) {
                console.warn('Autotitle: Early Camofox strategy failed', e);
            }
        }

        if (ctx.shouldSkipBrowserProxyFallbacks()) {
            console.log('Autotitle: Local browser bridge responded. Skipping browser proxy fallbacks.');
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

    async function runCoverRecoveryStrategies(ctx) {
        if (!ctx.isBrowserHtmlMode || !ctx.allowSlowCover || ctx.lightpandaBlocked || ctx.camofoxBlocked || !ctx.needsCoverUpgrade(ctx.primaryResult)) {
            return;
        }

        const coverRecoveryStrategies = [
            { fn: ctx.isGalleryPage ? ctx.strats.GalleryPageHtml : null, timeout: 22000, attempts: 2 },
            { fn: ctx.isMangaFireHost ? ctx.strats.MangaFireHtml : null, timeout: 22000, attempts: 2 },
            { fn: !ctx.lightpandaAttempted ? ctx.strats.Lightpanda : null, timeout: 30000, attempts: 1 },
            { fn: !ctx.camofoxAttempted ? ctx.strats.Camofox : null, timeout: 45000, attempts: 1 },
            { fn: ctx.shouldSkipBrowserProxyFallbacks() ? null : ctx.strats.AllOrigins, timeout: 12000, attempts: 2 },
            { fn: ctx.strats.LinkMeta, timeout: 5000, attempts: 2 },
            { fn: ctx.shouldSkipBrowserProxyFallbacks() ? null : ctx.strats.CorsProxy, timeout: 5000, attempts: 2 },
            { fn: ctx.shouldSkipBrowserProxyFallbacks() ? null : ctx.strats.ScraperEngine, timeout: 10000, attempts: 2 }
        ];

        for (const strategy of coverRecoveryStrategies) {
            if (typeof strategy.fn !== 'function') continue;
            const recoveryRawResult = await ctx.runStrategy(strategy.fn, strategy.timeout, {
                attempts: strategy.attempts || 1,
                accept: (result) => !!result?.coverUrl
            });
            const recoveryResult = strategy.fn === ctx.strats.Lightpanda
                ? ctx.normalizeLightpandaResult(recoveryRawResult)
                : strategy.fn === ctx.strats.Camofox
                    ? ctx.normalizeCamofoxResult(recoveryRawResult)
                    : ctx.normalizeAutotitleResult(recoveryRawResult, ctx.url);
            if (!recoveryResult) continue;
            if (strategy.fn === ctx.strats.Lightpanda && (recoveryResult.blocked || recoveryResult.title === 'CLOUDFLARE_BLOCK')) {
                ctx.lightpandaBlocked = true;
            }
            if (strategy.fn === ctx.strats.Camofox && (recoveryResult.blocked || recoveryResult.title === 'CLOUDFLARE_BLOCK')) {
                ctx.camofoxBlocked = true;
            }
            ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, recoveryResult, ctx.url);
            if (ctx.hasStrongCoverResult(ctx.primaryResult)) break;
        }
    }

    Object.assign(runtime, {
        runBrowserHtmlStrategies,
        runCoverRecoveryStrategies
    });

    runtime.browserLoaded = true;
})(window.EveOS.Autotitle);
