// --- AUTO-TITLE CORE MODULE ---
window.getTitleFromUrlLightpanda = async function (url, options = {}) {
    const strategy = window.EveOS?.Autotitle?.Strategies?.Lightpanda;
    if (typeof strategy !== 'function') {
        console.error("Autotitle Lightpanda strategy not loaded.");
        return null;
    }

    const normalizeAutotitleResult = window.EveOS?.Autotitle?.CoreUtils?.normalizeAutotitleResult;
    const preserveBlockedLightpandaResult = (result) => {
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
                lightpandaBlocked: true,
                browserFallbackBlocked: true,
                source: result.source || 'Lightpanda'
            };
        }
        return null;
    };

    const timeoutMs = Number(options.timeoutMs || 30000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const result = await strategy(url, controller.signal);
        return preserveBlockedLightpandaResult(result);
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.warn("Autotitle Lightpanda-only fetch failed", error);
        }
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
};

window.getTitleFromUrlCamofox = async function (url, options = {}) {
    const strategy = window.EveOS?.Autotitle?.Strategies?.Camofox;
    if (typeof strategy !== 'function') {
        console.error("Autotitle Camofox strategy not loaded.");
        return null;
    }

    const normalizeAutotitleResult = window.EveOS?.Autotitle?.CoreUtils?.normalizeAutotitleResult;
    const preserveBlockedCamofoxResult = (result) => {
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
                camofoxBlocked: true,
                browserFallbackBlocked: true,
                source: result.source || 'Camofox'
            };
        }
        return null;
    };

    const timeoutMs = Number(options.timeoutMs || 45000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const result = await strategy(url, controller.signal);
        return preserveBlockedCamofoxResult(result);
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.warn("Autotitle Camofox-only fetch failed", error);
        }
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
};

window.getTitleFromUrlHeadless = async function (url, options = {}) {
    const utils = window.EveOS?.Autotitle?.CoreUtils || {};
    const isWeakAutotitleResult = typeof utils.isWeakAutotitleResult === 'function'
        ? utils.isWeakAutotitleResult
        : (result) => !result || !result.title || result.title === 'CLOUDFLARE_BLOCK' || !!result.isFallback;
    const scoreCoverUrl = typeof utils.scoreCoverUrl === 'function'
        ? utils.scoreCoverUrl
        : ((coverUrl) => coverUrl ? 0 : -999);
    const mergeAutotitleMetadata = typeof utils.mergeAutotitleMetadata === 'function'
        ? utils.mergeAutotitleMetadata
        : ((primary, candidate) => candidate || primary);
    const isClearlyBetterTitle = typeof utils.isClearlyBetterTitle === 'function'
        ? utils.isClearlyBetterTitle
        : ((candidate, primary) => !!candidate?.title && (!primary?.title || String(candidate.title).length > String(primary.title || '').length));
    const strongCoverThreshold = Number(options.coverStrengthThreshold || 80);
    const hasStrongCoverResult = (result) => scoreCoverUrl(result?.coverUrl, url) >= strongCoverThreshold;

    let best = null;

    const lightpandaResult = await window.getTitleFromUrlLightpanda(url, {
        timeoutMs: Number(options.lightpandaTimeoutMs || 30000)
    });
    if (lightpandaResult) {
        best = lightpandaResult;
        if (!isWeakAutotitleResult(lightpandaResult, url) && lightpandaResult.title !== 'CLOUDFLARE_BLOCK' && hasStrongCoverResult(lightpandaResult)) {
            return lightpandaResult;
        }
    }

    const camofoxResult = await window.getTitleFromUrlCamofox(url, {
        timeoutMs: Number(options.camofoxTimeoutMs || 45000)
    });
    if (camofoxResult) {
        if (!best || isClearlyBetterTitle(camofoxResult, best, url)) {
            best = camofoxResult;
        } else {
            best = mergeAutotitleMetadata(best, camofoxResult, url);
            if (camofoxResult.title && (!best.title || isClearlyBetterTitle(camofoxResult, best, url))) {
                best.title = camofoxResult.title;
            }
        }
        if (!isWeakAutotitleResult(camofoxResult, url) && camofoxResult.title !== 'CLOUDFLARE_BLOCK') {
            return best;
        }
    }

    return best;
};

window.getTitleFromUrl = async function (url, options = {}) {
    // Orchestrates the strategies defined in external modules

    const strats = window.EveOS?.Autotitle?.Strategies;
    if (!strats) {
        console.error("Autotitle strategies not loaded.");
        return null;
    }

    const isBrowserHtmlMode = window.location?.protocol === 'file:';
    const allowSlowCover = !!options.allowSlowCover;

    function runStrategy(strategyFn, timeoutMs, options = {}) {
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
    }

    const utils = window.EveOS?.Autotitle?.CoreUtils || {};
    const {
        toTitleCaseSlug,
        getUrlHints,
        escapeRegex,
        decodeHtmlEntities,
        normalizeComparableUrl,
        sanitizeAssetUrlValue,
        isLikelyIconUrl,
        isRejectedIconUrl,
        isLikelyCoverUrl,
        isRejectedCoverUrl,
        scoreCoverUrl,
        pickBetterCoverUrl,
        trimSiteSuffix,
        normalizeAutotitleResult,
        isVideoOrContentSite,
        looksLikeGenericSiteName,
        mergeAutotitleResult,
        mergeAutotitleMetadata,
        adoptAutotitleTitle,
        isClearlyBetterTitle,
        isWeakAutotitleResult
    } = utils;
    const strongCoverThreshold = Number(options.coverStrengthThreshold || 80);
    const hasStrongCoverResult = (result) => scoreCoverUrl(result?.coverUrl, url) >= strongCoverThreshold;
    const needsCoverUpgrade = (result) => allowSlowCover && (!result?.coverUrl || !hasStrongCoverResult(result));
    let lightpandaBlocked = false;
    let lightpandaAttempted = false;
    let camofoxBlocked = false;
    let camofoxAttempted = false;
    const normalizeLightpandaResult = (result) => {
        if (!result) return null;
        const normalized = normalizeAutotitleResult(result, url);
        if (normalized) return normalized;
        if (result?.blocked || result?.title === 'CLOUDFLARE_BLOCK') {
            return {
                ...result,
                title: 'CLOUDFLARE_BLOCK',
                blocked: true,
                lightpandaBlocked: true,
                browserFallbackBlocked: true,
                source: result.source || 'Lightpanda'
            };
        }
        return null;
    };
    const normalizeCamofoxResult = (result) => {
        if (!result) return null;
        const normalized = normalizeAutotitleResult(result, url);
        if (normalized) return normalized;
        if (result?.blocked || result?.title === 'CLOUDFLARE_BLOCK') {
            return {
                ...result,
                title: 'CLOUDFLARE_BLOCK',
                blocked: true,
                camofoxBlocked: true,
                browserFallbackBlocked: true,
                source: result.source || 'Camofox'
            };
        }
        return null;
    };
    const shouldSkipBrowserProxyFallbacks = () => (
        isBrowserHtmlMode
        && (
            (lightpandaAttempted && !!window._eveLightpandaReachable)
            || (camofoxAttempted && !!window._eveCamofoxReachable)
        )
    );

    try {
        let parsedUrl = null;
        try {
            parsedUrl = new URL(url);
        } catch (e) { }
        const isMangaFireHost = /(^|\.)mangafire\.to$/i.test(parsedUrl?.hostname || '');
        const isGalleryPage = /^\/g\/\d+\/[a-z0-9]+\/?$/i.test(parsedUrl?.pathname || '');

        // For video/content sites, try MicroLink FIRST (OpenGraph has the real title)
        if (isVideoOrContentSite(url) && strats.GoogleSearch) {
            console.log("Autotitle: Video site detected. Trying MicroLink first...");
            const microResult = normalizeAutotitleResult(await runStrategy(strats.GoogleSearch, 7000), url);
            if (microResult && microResult.title && microResult.title.length > 10) {
                console.log("Autotitle: MicroLink returned:", microResult.title);
                return microResult;
            }
        }

        let primaryResult = null;

        if (isBrowserHtmlMode && allowSlowCover && isGalleryPage && strats.GalleryPageHtml) {
            const earlyGalleryPageResult = normalizeAutotitleResult(
                await runStrategy(strats.GalleryPageHtml, 22000, {
                    attempts: 2,
                    accept: (result) => !!result?.title && !!result?.coverUrl
                }),
                url
            );
            if (earlyGalleryPageResult) {
                primaryResult = mergeAutotitleMetadata(primaryResult, earlyGalleryPageResult, url);
                if (earlyGalleryPageResult.title && earlyGalleryPageResult.coverUrl) {
                    return earlyGalleryPageResult;
                }
            }
        }

        if (isBrowserHtmlMode && allowSlowCover && isMangaFireHost && strats.MangaFireHtml) {
            const earlyMangaFireResult = normalizeAutotitleResult(
                await runStrategy(strats.MangaFireHtml, 22000, {
                    attempts: 2,
                    accept: (result) => !!result?.coverUrl
                }),
                url
            );
            if (earlyMangaFireResult) {
                primaryResult = mergeAutotitleMetadata(primaryResult, earlyMangaFireResult, url);
                if (earlyMangaFireResult.title && earlyMangaFireResult.coverUrl && earlyMangaFireResult.icon) {
                    return earlyMangaFireResult;
                }
            }
        }

        if (isBrowserHtmlMode && strats.MangaDexApi) {
            const mangaDexApiResult = normalizeAutotitleResult(await runStrategy(strats.MangaDexApi, 5000), url);
            if (mangaDexApiResult) {
                primaryResult = mergeAutotitleMetadata(primaryResult, mangaDexApiResult, url);
                if (mangaDexApiResult.title && mangaDexApiResult.coverUrl) {
                    return mangaDexApiResult;
                }
            }
        }

        // Browser HTML mode benefits more from direct metadata APIs than proxy scraping.
        if (isBrowserHtmlMode && strats.GoogleSearch && !isVideoOrContentSite(url)) {
            console.log("Autotitle: Browser HTML mode detected. Trying MicroLink early...");
            const earlyMicro = normalizeAutotitleResult(await runStrategy(strats.GoogleSearch, 7000), url);
            if (!primaryResult && earlyMicro) {
                primaryResult = mergeAutotitleMetadata(primaryResult, earlyMicro, url);
            } else if (earlyMicro) {
                if (isClearlyBetterTitle(earlyMicro, primaryResult, url)) {
                    primaryResult = adoptAutotitleTitle(primaryResult, earlyMicro, url);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, earlyMicro, url);
                }
            }
            if (!allowSlowCover && earlyMicro?.title && !looksLikeGenericSiteName(earlyMicro.title, url) && earlyMicro.coverUrl && !primaryResult?.source?.includes?.('MangaDexAPI')) {
                return earlyMicro;
            }
        }

        if (isBrowserHtmlMode && allowSlowCover && strats.MangaFireHtml) {
            const mangaFireResult = normalizeAutotitleResult(await runStrategy(strats.MangaFireHtml, 22000, {
                attempts: isMangaFireHost ? 2 : 1,
                accept: (result) => !!result?.coverUrl
            }), url);
            if (mangaFireResult) {
                if (!primaryResult || isClearlyBetterTitle(mangaFireResult, primaryResult, url)) {
                    primaryResult = adoptAutotitleTitle(primaryResult, mangaFireResult, url);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, mangaFireResult, url);
                }
                if (!allowSlowCover && primaryResult?.title && primaryResult?.coverUrl && primaryResult?.icon) {
                    return primaryResult;
                }
            }
        }

        if (isBrowserHtmlMode && allowSlowCover && strats.GalleryPageHtml) {
            const galleryPageResult = normalizeAutotitleResult(await runStrategy(strats.GalleryPageHtml, 22000, {
                attempts: isGalleryPage ? 2 : 1,
                accept: (result) => !!result?.coverUrl
            }), url);
            if (galleryPageResult) {
                if (!primaryResult || isClearlyBetterTitle(galleryPageResult, primaryResult, url)) {
                    primaryResult = adoptAutotitleTitle(primaryResult, galleryPageResult, url);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, galleryPageResult, url);
                }
            }
        }

        if (isBrowserHtmlMode && strats.LinkMeta) {
            const earlyLinkMeta = normalizeAutotitleResult(await runStrategy(strats.LinkMeta, 5000), url);
            if (earlyLinkMeta) {
                primaryResult = mergeAutotitleMetadata(primaryResult, earlyLinkMeta, url);
                if (!allowSlowCover && earlyLinkMeta.title && !looksLikeGenericSiteName(earlyLinkMeta.title, url) && earlyLinkMeta.coverUrl) {
                    return earlyLinkMeta;
                }
            }
        }

        if (isBrowserHtmlMode && strats.Lightpanda && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url) || needsCoverUpgrade(primaryResult))) {
            console.log("Autotitle: Trying Lightpanda early before proxy fallbacks...");
            try {
                lightpandaAttempted = true;
                const earlyLightpandaRawResult = await runStrategy(strats.Lightpanda, 30000);
                const earlyLightpandaResult = normalizeLightpandaResult(earlyLightpandaRawResult);
                if (earlyLightpandaResult) {
                    if (earlyLightpandaResult.blocked || earlyLightpandaResult.title === "CLOUDFLARE_BLOCK") {
                        lightpandaBlocked = true;
                    }
                    if (!primaryResult || isClearlyBetterTitle(earlyLightpandaResult, primaryResult, url)) {
                        primaryResult = adoptAutotitleTitle(primaryResult, earlyLightpandaResult, url);
                    } else {
                        primaryResult = mergeAutotitleMetadata(primaryResult, earlyLightpandaResult, url);
                    }
                    if (primaryResult?.title && primaryResult?.coverUrl && !primaryResult?.blocked && hasStrongCoverResult(primaryResult)) {
                        const normalizedEarlyLightpanda = normalizeAutotitleResult(primaryResult, url);
                        if (normalizedEarlyLightpanda) normalizedEarlyLightpanda.lightpandaBlocked = !!lightpandaBlocked;
                        return normalizedEarlyLightpanda;
                    }
                }
            } catch (e) {
                console.warn("Autotitle: Early Lightpanda strategy failed", e);
            }
        }

        if (isBrowserHtmlMode && strats.Camofox && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url) || needsCoverUpgrade(primaryResult))) {
            console.log("Autotitle: Trying Camofox after Lightpanda...");
            try {
                camofoxAttempted = true;
                const earlyCamofoxRawResult = await runStrategy(strats.Camofox, 45000);
                const earlyCamofoxResult = normalizeCamofoxResult(earlyCamofoxRawResult);
                if (earlyCamofoxResult) {
                    if (earlyCamofoxResult.blocked || earlyCamofoxResult.title === "CLOUDFLARE_BLOCK") {
                        camofoxBlocked = true;
                    }
                    if (!primaryResult || isClearlyBetterTitle(earlyCamofoxResult, primaryResult, url)) {
                        primaryResult = adoptAutotitleTitle(primaryResult, earlyCamofoxResult, url);
                    } else {
                        primaryResult = mergeAutotitleMetadata(primaryResult, earlyCamofoxResult, url);
                    }
                    if (primaryResult?.title && primaryResult?.coverUrl && !primaryResult?.blocked && hasStrongCoverResult(primaryResult)) {
                        const normalizedEarlyCamofox = normalizeAutotitleResult(primaryResult, url);
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
                console.warn("Autotitle: Early Camofox strategy failed", e);
            }
        }

        if (shouldSkipBrowserProxyFallbacks()) {
            console.log("Autotitle: Local browser bridge responded. Skipping browser proxy fallbacks.");
        }

        if (primaryResult && (lightpandaBlocked || camofoxBlocked) && primaryResult.title === "CLOUDFLARE_BLOCK") {
            return {
                ...primaryResult,
                lightpandaBlocked: !!lightpandaBlocked,
                camofoxBlocked: !!camofoxBlocked,
                browserFallbackBlocked: true
            };
        }

        // Strategy 1: AllOrigins (JSON) - For normal sites
        if (strats.AllOrigins && !(isBrowserHtmlMode && (lightpandaBlocked || shouldSkipBrowserProxyFallbacks()))) {
            console.log("Autotitle: Trying AllOrigins strategy...");
            try {
                const allOriginsResult = normalizeAutotitleResult(await runStrategy(strats.AllOrigins, isBrowserHtmlMode ? 12000 : 4500), url);
                if (allOriginsResult) {
                    if (allOriginsResult.title && !looksLikeGenericSiteName(allOriginsResult.title, url)) {
                        console.log("Autotitle: AllOrigins returned good title:", allOriginsResult.title);
                        if (!primaryResult || isClearlyBetterTitle(allOriginsResult, primaryResult, url)) {
                            primaryResult = adoptAutotitleTitle(primaryResult, allOriginsResult, url);
                        } else {
                            primaryResult = mergeAutotitleMetadata(primaryResult, allOriginsResult, url);
                        }
                        if (!allowSlowCover && primaryResult.coverUrl) {
                            return primaryResult;
                        }
                    } else {
                        primaryResult = mergeAutotitleMetadata(primaryResult, allOriginsResult, url);
                    }
                }
            } catch (e) {
                console.warn("Autotitle: AllOrigins strategy failed", e);
            }
        }

        // Strategy 2: CorsProxy.io (Raw HTML)
        if (strats.CorsProxy && !(isBrowserHtmlMode && (lightpandaBlocked || shouldSkipBrowserProxyFallbacks()))) {
            console.log("Autotitle: Trying CorsProxy strategy...");
            const corsResult = normalizeAutotitleResult(await runStrategy(strats.CorsProxy, 4500), url);
            if (corsResult && !looksLikeGenericSiteName(corsResult.title, url)) {
                console.log("Autotitle: CorsProxy returned good title:", corsResult.title);
                if (!primaryResult || isClearlyBetterTitle(corsResult, primaryResult, url)) {
                    primaryResult = adoptAutotitleTitle(primaryResult, corsResult, url);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, corsResult, url);
                }
                if (!allowSlowCover && primaryResult?.coverUrl) {
                    return primaryResult;
                }
            }
            if (corsResult && (!primaryResult || isClearlyBetterTitle(corsResult, primaryResult, url))) {
                primaryResult = adoptAutotitleTitle(primaryResult, corsResult, url);
            } else if (corsResult) {
                primaryResult = mergeAutotitleMetadata(primaryResult, corsResult, url);
            }
        }

        // Strategy 3: LinkMeta (Keyless API)
        if (strats.LinkMeta && !isBrowserHtmlMode) {
            const linkMetaResult = normalizeAutotitleResult(await runStrategy(strats.LinkMeta, 5000), url);
            if (linkMetaResult) {
                if (!primaryResult || isClearlyBetterTitle(linkMetaResult, primaryResult, url)) {
                    console.log("Autotitle: LinkMeta returned better title:", linkMetaResult.title);
                    primaryResult = adoptAutotitleTitle(primaryResult, linkMetaResult, url);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, linkMetaResult, url);
                }
            }
        }

        // Strategy 4: MicroLink.io (if not already tried for video sites)
        if (strats.GoogleSearch && !isVideoOrContentSite(url) && !isBrowserHtmlMode) {
            console.log("Autotitle: Trying MicroLink for OpenGraph...");
            const microResult = normalizeAutotitleResult(await runStrategy(strats.GoogleSearch, 7000), url);
            if (microResult && microResult.title) {
                if (!primaryResult || isClearlyBetterTitle(microResult, primaryResult, url)) {
                    console.log("Autotitle: MicroLink returned better title:", microResult.title);
                    primaryResult = adoptAutotitleTitle(primaryResult, microResult, url);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, microResult, url);
                }
            }
        }

        // Strategy 5: Advanced Scraper Engine (proxy pool / browser emulator)
        if (strats.ScraperEngine && !(isBrowserHtmlMode && (lightpandaBlocked || shouldSkipBrowserProxyFallbacks())) && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url) || needsCoverUpgrade(primaryResult))) {
            console.log("Autotitle: Trying Advanced Scraper Engine fallback...");
            try {
                const scraperResult = normalizeAutotitleResult(await runStrategy(strats.ScraperEngine, 9000), url);
                if (scraperResult) {
                    if (!primaryResult || isClearlyBetterTitle(scraperResult, primaryResult, url)) {
                        primaryResult = adoptAutotitleTitle(primaryResult, scraperResult, url);
                    } else {
                        primaryResult = mergeAutotitleMetadata(primaryResult, scraperResult, url);
                    }
                }
            } catch (e) {
                console.warn("Autotitle: ScraperEngine strategy failed", e);
            }
        }

        // Strategy 5.5: Lightpanda (WSL-based Browsing) - High Reliability Fallback
        if (strats.Lightpanda && !lightpandaAttempted && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url) || needsCoverUpgrade(primaryResult))) {
            console.log("Autotitle: Trying Lightpanda high-reliability fallback...");
            try {
                lightpandaAttempted = true;
                const lpResult = normalizeLightpandaResult(await runStrategy(strats.Lightpanda, 30000));
                if (lpResult) {
                    if (lpResult.blocked || lpResult.title === "CLOUDFLARE_BLOCK") {
                        lightpandaBlocked = true;
                    }
                    if (!primaryResult || isClearlyBetterTitle(lpResult, primaryResult, url)) {
                        primaryResult = adoptAutotitleTitle(primaryResult, lpResult, url);
                    } else {
                        primaryResult = mergeAutotitleMetadata(primaryResult, lpResult, url);
                    }
                }
            } catch (e) {
                console.warn("Autotitle: Lightpanda strategy failed", e);
            }
        }

        if (strats.Camofox && !camofoxAttempted && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url) || needsCoverUpgrade(primaryResult))) {
            console.log("Autotitle: Trying Camofox final browser fallback...");
            try {
                camofoxAttempted = true;
                const camofoxResult = normalizeCamofoxResult(await runStrategy(strats.Camofox, 45000));
                if (camofoxResult) {
                    if (camofoxResult.blocked || camofoxResult.title === "CLOUDFLARE_BLOCK") {
                        camofoxBlocked = true;
                    }
                    if (!primaryResult || isClearlyBetterTitle(camofoxResult, primaryResult, url)) {
                        primaryResult = adoptAutotitleTitle(primaryResult, camofoxResult, url);
                    } else {
                        primaryResult = mergeAutotitleMetadata(primaryResult, camofoxResult, url);
                    }
                }
            } catch (e) {
                console.warn("Autotitle: Camofox strategy failed", e);
            }
        }

        if (primaryResult && (lightpandaBlocked || camofoxBlocked) && primaryResult.title === "CLOUDFLARE_BLOCK") {
            return {
                ...primaryResult,
                lightpandaBlocked: !!lightpandaBlocked,
                camofoxBlocked: !!camofoxBlocked,
                browserFallbackBlocked: true
            };
        }

        if (isBrowserHtmlMode && allowSlowCover && !(lightpandaBlocked || camofoxBlocked) && needsCoverUpgrade(primaryResult)) {
            const coverRecoveryStrategies = [
                { fn: isGalleryPage ? strats.GalleryPageHtml : null, timeout: 22000, attempts: 2 },
                { fn: isMangaFireHost ? strats.MangaFireHtml : null, timeout: 22000, attempts: 2 },
                { fn: !lightpandaAttempted ? strats.Lightpanda : null, timeout: 30000, attempts: 1 },
                { fn: !camofoxAttempted ? strats.Camofox : null, timeout: 45000, attempts: 1 },
                { fn: shouldSkipBrowserProxyFallbacks() ? null : strats.AllOrigins, timeout: 12000, attempts: 2 },
                { fn: strats.LinkMeta, timeout: 5000, attempts: 2 },
                { fn: shouldSkipBrowserProxyFallbacks() ? null : strats.CorsProxy, timeout: 5000, attempts: 2 },
                { fn: shouldSkipBrowserProxyFallbacks() ? null : strats.ScraperEngine, timeout: 10000, attempts: 2 }
            ];
            for (const strategy of coverRecoveryStrategies) {
                if (typeof strategy.fn !== 'function') continue;
                const recoveryRawResult = await runStrategy(strategy.fn, strategy.timeout, {
                    attempts: strategy.attempts || 1,
                    accept: (result) => !!result?.coverUrl
                });
                const recoveryResult = strategy.fn === strats.Lightpanda
                    ? normalizeLightpandaResult(recoveryRawResult)
                    : strategy.fn === strats.Camofox
                        ? normalizeCamofoxResult(recoveryRawResult)
                        : normalizeAutotitleResult(recoveryRawResult, url);
                if (!recoveryResult) continue;
                if (strategy.fn === strats.Lightpanda && (recoveryResult.blocked || recoveryResult.title === "CLOUDFLARE_BLOCK")) {
                    lightpandaBlocked = true;
                }
                if (strategy.fn === strats.Camofox && (recoveryResult.blocked || recoveryResult.title === "CLOUDFLARE_BLOCK")) {
                    camofoxBlocked = true;
                }
                primaryResult = mergeAutotitleMetadata(primaryResult, recoveryResult, url);
                if (hasStrongCoverResult(primaryResult)) break;
            }
        }

        // Return whatever we got
        if (primaryResult) {
            console.log("Autotitle: Using primary result:", primaryResult.title);
            const normalizedPrimary = normalizeAutotitleResult(primaryResult, url);
            if (normalizedPrimary) {
                const finalStrongSuccess = !!normalizedPrimary.title
                    && normalizedPrimary.title !== "CLOUDFLARE_BLOCK"
                    && !isWeakAutotitleResult({
                        ...normalizedPrimary,
                        blocked: false,
                        lightpandaBlocked: false,
                        camofoxBlocked: false,
                        browserFallbackBlocked: false
                    }, url);
                const finalBlocked = finalStrongSuccess
                    ? false
                    : !!(normalizedPrimary.blocked || normalizedPrimary.title === "CLOUDFLARE_BLOCK");
                normalizedPrimary.blocked = finalBlocked && !finalStrongSuccess;
                normalizedPrimary.lightpandaBlocked = finalStrongSuccess ? false : !!lightpandaBlocked;
                normalizedPrimary.camofoxBlocked = finalStrongSuccess ? false : !!camofoxBlocked;
                normalizedPrimary.browserFallbackBlocked = finalStrongSuccess ? false : !!(lightpandaBlocked || camofoxBlocked || finalBlocked);
                if (normalizedPrimary.quality) {
                    normalizedPrimary.quality.blocked = !!normalizedPrimary.blocked;
                    normalizedPrimary.quality.hasCover = !!normalizedPrimary.coverUrl;
                }
            }
            return normalizedPrimary;
        }

        // Strategy 6: URL Slug Fallback
        if (strats.UrlSlug) {
            console.log("Autotitle: Trying UrlSlug fallback...");
            const result = normalizeAutotitleResult(strats.UrlSlug(url), url);
            if (result) {
                result.lightpandaBlocked = !!lightpandaBlocked;
                result.camofoxBlocked = !!camofoxBlocked;
                result.browserFallbackBlocked = !!(lightpandaBlocked || camofoxBlocked);
                return result;
            }
        }

    } catch (e) {
        console.warn("Autotitle orchestration error", e);
    }

    return null;
};
