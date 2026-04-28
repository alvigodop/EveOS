window.EveOS = window.EveOS || {};
window.EveOS.Autotitle = window.EveOS.Autotitle || {};

(function (ns) {
    const runtime = ns.RuntimeCore = ns.RuntimeCore || {};
    if (runtime.helpersLoaded) return;

    function getRuntimeUtils() {
        return ns.CoreUtils || {};
    }

    function createBridgeResultNormalizer(url, normalizeAutotitleResult, source, blockedKey) {
        return function normalizeBridgeResult(result) {
            if (!result) return null;
            const normalized = typeof normalizeAutotitleResult === 'function'
                ? normalizeAutotitleResult(result, url)
                : result;
            if (normalized) return normalized;
            if (result?.blocked || result?.title === 'CLOUDFLARE_BLOCK') {
                return {
                    ...result,
                    title: 'CLOUDFLARE_BLOCK',
                    blocked: true,
                    [blockedKey]: true,
                    browserFallbackBlocked: true,
                    source: result.source || source
                };
            }
            return null;
        };
    }

    function createStrategyRunner(url) {
        return function runStrategy(strategyFn, timeoutMs, options = {}) {
            if (typeof strategyFn !== 'function') return Promise.resolve(null);
            const attempts = Math.max(1, Number(options.attempts || 1));
            const accept = typeof options.accept === 'function' ? options.accept : (() => true);
            const retryDelayMs = Number(options.retryDelayMs || 450);

            const runOnce = () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                return Promise.resolve()
                    .then(() => strategyFn(url, controller.signal))
                    .catch((error) => {
                        if (error?.name !== 'AbortError') {
                            console.warn('Autotitle strategy failed', error);
                        }
                        return null;
                    })
                    .finally(() => clearTimeout(timeoutId));
            };

            return (async () => {
                let bestResult = null;
                for (let attempt = 0; attempt < attempts; attempt++) {
                    const result = await runOnce();
                    if (result) {
                        bestResult = result;
                        if (accept(result)) return result;
                    }
                    if (attempt < attempts - 1) {
                        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                    }
                }
                return bestResult;
            })();
        };
    }

    function createAutotitleContext(url, options, strats) {
        const utils = getRuntimeUtils();
        const {
            scoreCoverUrl = (coverUrl) => coverUrl ? 0 : -999,
            normalizeAutotitleResult = (result) => result || null,
            isVideoOrContentSite = () => false,
            looksLikeGenericSiteName = () => false,
            mergeAutotitleMetadata = ((primary, candidate) => candidate || primary),
            adoptAutotitleTitle = ((primary, candidate) => candidate || primary),
            isClearlyBetterTitle = ((candidate, primary) => !!candidate?.title && (!primary?.title || String(candidate.title).length > String(primary.title || '').length)),
            isWeakAutotitleResult = (result) => !result || !result.title || result.title === 'CLOUDFLARE_BLOCK' || !!result.isFallback
        } = utils;

        const isBrowserHtmlMode = window.location?.protocol === 'file:';
        const allowSlowCover = !!options.allowSlowCover;
        const fastTitleOnly = !!(options.fastTitleOnly || options.fastTitle || options.skipSlowFallbacks);
        const strongCoverThreshold = Number(options.coverStrengthThreshold || 80);
        let parsedUrl = null;
        try {
            parsedUrl = new URL(url);
        } catch (e) { }

        const ctx = {
            url,
            options,
            strats,
            isBrowserHtmlMode,
            allowSlowCover,
            fastTitleOnly,
            strongCoverThreshold,
            parsedUrl,
            isMangaFireHost: /(^|\.)mangafire\.to$/i.test(parsedUrl?.hostname || ''),
            isGalleryPage: /^\/g\/\d+\/[a-z0-9]+\/?$/i.test(parsedUrl?.pathname || ''),
            scoreCoverUrl,
            normalizeAutotitleResult,
            isVideoOrContentSite,
            looksLikeGenericSiteName,
            mergeAutotitleMetadata,
            adoptAutotitleTitle,
            isClearlyBetterTitle,
            isWeakAutotitleResult,
            runStrategy: createStrategyRunner(url),
            primaryResult: null,
            lightpandaBlocked: false,
            lightpandaAttempted: false,
            camofoxBlocked: false,
            camofoxAttempted: false
        };

        ctx.strategyTimeout = (standardMs, fastMs) => Number(ctx.fastTitleOnly ? (fastMs || standardMs) : standardMs);
        ctx.hasStrongCoverResult = (result) => ctx.scoreCoverUrl(result?.coverUrl, ctx.url) >= ctx.strongCoverThreshold;
        ctx.needsCoverUpgrade = (result) => ctx.allowSlowCover && (!result?.coverUrl || !ctx.hasStrongCoverResult(result));
        ctx.normalizeLightpandaResult = createBridgeResultNormalizer(ctx.url, ctx.normalizeAutotitleResult, 'Lightpanda', 'lightpandaBlocked');
        ctx.normalizeCamofoxResult = createBridgeResultNormalizer(ctx.url, ctx.normalizeAutotitleResult, 'Camofox', 'camofoxBlocked');
        ctx.shouldSkipBrowserProxyFallbacks = () => (
            ctx.isBrowserHtmlMode
            && (
                (ctx.lightpandaAttempted && !!window._eveLightpandaReachable)
                || (ctx.camofoxAttempted && !!window._eveCamofoxReachable)
            )
        );
        return ctx;
    }

    function mergeIntoPrimaryResult(ctx, candidateResult) {
        if (!candidateResult) return ctx.primaryResult;
        if (!ctx.primaryResult || ctx.isClearlyBetterTitle(candidateResult, ctx.primaryResult, ctx.url)) {
            ctx.primaryResult = ctx.adoptAutotitleTitle(ctx.primaryResult, candidateResult, ctx.url);
        } else {
            ctx.primaryResult = ctx.mergeAutotitleMetadata(ctx.primaryResult, candidateResult, ctx.url);
        }
        return ctx.primaryResult;
    }

    function finalizePrimaryResult(ctx) {
        if (!ctx.primaryResult) return null;
        console.log('Autotitle: Using primary result:', ctx.primaryResult.title);
        const normalizedPrimary = ctx.normalizeAutotitleResult(ctx.primaryResult, ctx.url);
        if (!normalizedPrimary) return null;

        const finalStrongSuccess = !!normalizedPrimary.title
            && normalizedPrimary.title !== 'CLOUDFLARE_BLOCK'
            && !ctx.isWeakAutotitleResult({
                ...normalizedPrimary,
                blocked: false,
                lightpandaBlocked: false,
                camofoxBlocked: false,
                browserFallbackBlocked: false
            }, ctx.url);
        const finalBlocked = finalStrongSuccess
            ? false
            : !!(normalizedPrimary.blocked || normalizedPrimary.title === 'CLOUDFLARE_BLOCK');

        normalizedPrimary.blocked = finalBlocked && !finalStrongSuccess;
        normalizedPrimary.lightpandaBlocked = finalStrongSuccess ? false : !!ctx.lightpandaBlocked;
        normalizedPrimary.camofoxBlocked = finalStrongSuccess ? false : !!ctx.camofoxBlocked;
        normalizedPrimary.browserFallbackBlocked = finalStrongSuccess ? false : !!(ctx.lightpandaBlocked || ctx.camofoxBlocked || finalBlocked);
        if (normalizedPrimary.quality) {
            normalizedPrimary.quality.blocked = !!normalizedPrimary.blocked;
            normalizedPrimary.quality.hasCover = !!normalizedPrimary.coverUrl;
        }
        return normalizedPrimary;
    }

    function runUrlSlugFallback(ctx) {
        if (typeof ctx.strats?.UrlSlug !== 'function') return null;
        console.log('Autotitle: Trying UrlSlug fallback...');
        const result = ctx.normalizeAutotitleResult(ctx.strats.UrlSlug(ctx.url), ctx.url);
        if (!result) return null;
        result.lightpandaBlocked = !!ctx.lightpandaBlocked;
        result.camofoxBlocked = !!ctx.camofoxBlocked;
        result.browserFallbackBlocked = !!(ctx.lightpandaBlocked || ctx.camofoxBlocked);
        return result;
    }

    Object.assign(runtime, {
        getRuntimeUtils,
        createBridgeResultNormalizer,
        createStrategyRunner,
        createAutotitleContext,
        mergeIntoPrimaryResult,
        finalizePrimaryResult,
        runUrlSlugFallback
    });

    runtime.helpersLoaded = true;
})(window.EveOS.Autotitle);
