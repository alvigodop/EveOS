window.EveOS = window.EveOS || {};
window.EveOS.Autotitle = window.EveOS.Autotitle || {};

(function (ns) {
    const runtime = ns.RuntimeCore = ns.RuntimeCore || {};
    if (runtime.bridgesLoaded) return;

    function getBridgeStrategy(name) {
        const strategy = ns?.Strategies?.[name];
        if (typeof strategy !== 'function') {
            console.error(`Autotitle ${name} strategy not loaded.`);
            return null;
        }
        return strategy;
    }

    async function runBridgeFetch(url, source, blockedKey, signal) {
        const strategy = getBridgeStrategy(source);
        if (!strategy) return null;
        const normalizeAutotitleResult = ns?.CoreUtils?.normalizeAutotitleResult;
        const normalizeResult = typeof runtime.createBridgeResultNormalizer === 'function'
            ? runtime.createBridgeResultNormalizer(url, normalizeAutotitleResult, source, blockedKey)
            : ((result) => result || null);

        try {
            const result = await strategy(url, signal);
            return normalizeResult(result);
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.warn(`Autotitle ${source}-only fetch failed`, error);
            }
            return null;
        }
    }

    async function fetchBridgeWithTimeout(url, source, blockedKey, timeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs));
        try {
            return await runBridgeFetch(url, source, blockedKey, controller.signal);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function getTitleFromUrlLightpanda(url, options = {}) {
        return fetchBridgeWithTimeout(url, 'Lightpanda', 'lightpandaBlocked', Number(options.timeoutMs || 30000));
    }

    async function getTitleFromUrlCamofox(url, options = {}) {
        return fetchBridgeWithTimeout(url, 'Camofox', 'camofoxBlocked', Number(options.timeoutMs || 45000));
    }

    async function getTitleFromUrlHeadless(url, options = {}) {
        const utils = ns?.CoreUtils || {};
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

        const lightpandaResult = await getTitleFromUrlLightpanda(url, {
            timeoutMs: Number(options.lightpandaTimeoutMs || 30000)
        });
        if (lightpandaResult) {
            best = lightpandaResult;
            if (!isWeakAutotitleResult(lightpandaResult, url) && lightpandaResult.title !== 'CLOUDFLARE_BLOCK' && hasStrongCoverResult(lightpandaResult)) {
                return lightpandaResult;
            }
        }

        const camofoxResult = await getTitleFromUrlCamofox(url, {
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
            if (!isWeakAutotitleResult(camofoxResult, url) && camofoxResult.title !== 'CLOUDFLARE_BLOCK' && hasStrongCoverResult(best)) {
                return best;
            }
        }

        return best;
    }

    Object.assign(runtime, {
        getTitleFromUrlLightpanda,
        getTitleFromUrlCamofox,
        getTitleFromUrlHeadless
    });

    runtime.bridgesLoaded = true;
})(window.EveOS.Autotitle);
