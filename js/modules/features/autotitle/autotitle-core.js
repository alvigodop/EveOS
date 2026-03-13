// --- AUTO-TITLE CORE MODULE ---
window.getTitleFromUrl = async function (url) {
    // Orchestrates the strategies defined in external modules

    const strats = window.EveOS?.Autotitle?.Strategies;
    if (!strats) {
        console.error("Autotitle strategies not loaded.");
        return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    /**
     * Check if URL is likely a video/content site that needs OpenGraph
     */
    function isVideoOrContentSite(url) {
        const videoHosts = [
            'video-site-a.test', 'video-site-b.test', 'video-site-c.test', 'video-site-d.test',
            'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com',
            'twitch.tv', 'tiktok.com', 'instagram.com', 'twitter.com', 'x.com',
            'reddit.com', 'facebook.com', 'netflix.com', 'hulu.com'
        ];
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            return videoHosts.some(h => hostname.includes(h));
        } catch (e) { return false; }
    }

    /**
     * Check if a title looks like just a generic site name
     */
    function looksLikeGenericSiteName(title, url) {
        if (!title) return true;
        const cleanTitle = title.trim().toLowerCase();

        // Very short or generic-looking titles
        if (cleanTitle.length < 15) return true;

        // Common generic patterns
        const genericPatterns = ['view video', 'watch video', 'home', 'welcome'];
        if (genericPatterns.some(p => cleanTitle.includes(p))) return true;

        // Title is just the domain name
        try {
            const domain = new URL(url).hostname.replace('www.', '').split('.')[0].toLowerCase();
            if (cleanTitle === domain || cleanTitle.replace(/[^a-z]/g, '') === domain) return true;
        } catch (e) { }

        return false;
    }

    function mergeAutotitleResult(primaryResult, candidateResult) {
        if (!candidateResult) return primaryResult;
        if (!primaryResult) return { ...candidateResult };
        return {
            ...primaryResult,
            icon: candidateResult.icon || primaryResult.icon || null,
            coverUrl: candidateResult.coverUrl || primaryResult.coverUrl || null,
            description: candidateResult.description || primaryResult.description || null,
            source: candidateResult.source || primaryResult.source,
            isFallback: !!(primaryResult.isFallback || candidateResult.isFallback),
            isMicrolinkFallback: !!(primaryResult.isMicrolinkFallback || candidateResult.isMicrolinkFallback)
        };
    }

    function adoptAutotitleTitle(primaryResult, candidateResult) {
        if (!candidateResult?.title || candidateResult.title === "CLOUDFLARE_BLOCK") return mergeAutotitleResult(primaryResult, candidateResult);
        return {
            ...mergeAutotitleResult(primaryResult, candidateResult),
            title: candidateResult.title
        };
    }

    function isClearlyBetterTitle(candidateResult, primaryResult, url) {
        if (!candidateResult?.title || candidateResult.title === "CLOUDFLARE_BLOCK") return false;
        if (!primaryResult?.title || primaryResult.title === "CLOUDFLARE_BLOCK") return true;
        
        if (looksLikeGenericSiteName(primaryResult.title, url) && !looksLikeGenericSiteName(candidateResult.title, url)) {
            return true;
        }
        return candidateResult.title.length > primaryResult.title.length + 5;
    }

    try {
        // For video/content sites, try MicroLink FIRST (OpenGraph has the real title)
        if (isVideoOrContentSite(url) && strats.GoogleSearch) {
            console.log("Autotitle: Video site detected. Trying MicroLink first...");
            const microResult = await strats.GoogleSearch(url, controller.signal);
            if (microResult && microResult.title && microResult.title.length > 10) {
                console.log("Autotitle: MicroLink returned:", microResult.title);
                clearTimeout(timeoutId);
                return microResult;
            }
        }

        // Strategy 1: AllOrigins (JSON) - For normal sites
        let primaryResult = null;
        if (strats.AllOrigins) {
            console.log("Autotitle: Trying AllOrigins strategy...");
            primaryResult = await strats.AllOrigins(url, controller.signal);
            if (primaryResult && !looksLikeGenericSiteName(primaryResult.title, url)) {
                console.log("Autotitle: AllOrigins returned good title:", primaryResult.title);
                if (primaryResult.coverUrl) {
                    clearTimeout(timeoutId);
                    return primaryResult;
                }
            }
        }

        // Strategy 2: CorsProxy.io (Raw HTML)
        if (strats.CorsProxy) {
            console.log("Autotitle: Trying CorsProxy strategy...");
            const corsResult = await strats.CorsProxy(url, controller.signal);
            if (corsResult && !looksLikeGenericSiteName(corsResult.title, url)) {
                console.log("Autotitle: CorsProxy returned good title:", corsResult.title);
                if (!primaryResult || isClearlyBetterTitle(corsResult, primaryResult, url)) {
                    primaryResult = adoptAutotitleTitle(primaryResult, corsResult);
                } else if (!primaryResult.coverUrl && corsResult.coverUrl) {
                    primaryResult = mergeAutotitleResult(primaryResult, corsResult);
                }
                if (primaryResult?.coverUrl) {
                    clearTimeout(timeoutId);
                    return primaryResult;
                }
            }
            if (corsResult && (!primaryResult || isClearlyBetterTitle(corsResult, primaryResult, url))) {
                primaryResult = adoptAutotitleTitle(primaryResult, corsResult);
            } else if (corsResult && primaryResult && !primaryResult.coverUrl && corsResult.coverUrl) {
                primaryResult = mergeAutotitleResult(primaryResult, corsResult);
            }
        }

        // Strategy 3: LinkMeta (Keyless API)
        if (strats.LinkMeta) {
            const linkMetaResult = await strats.LinkMeta(url, controller.signal);
            if (linkMetaResult && linkMetaResult.title) {
                if (!primaryResult || isClearlyBetterTitle(linkMetaResult, primaryResult, url)) {
                    console.log("Autotitle: LinkMeta returned better title:", linkMetaResult.title);
                    primaryResult = adoptAutotitleTitle(primaryResult, linkMetaResult);
                } else if (!primaryResult.coverUrl && linkMetaResult.coverUrl) {
                    primaryResult = mergeAutotitleResult(primaryResult, linkMetaResult);
                }
            }
        }

        // Strategy 4: MicroLink.io (if not already tried for video sites)
        if (strats.GoogleSearch && !isVideoOrContentSite(url)) {
            console.log("Autotitle: Trying MicroLink for OpenGraph...");
            const microResult = await strats.GoogleSearch(url, controller.signal);
            if (microResult && microResult.title) {
                if (!primaryResult || isClearlyBetterTitle(microResult, primaryResult, url)) {
                    console.log("Autotitle: MicroLink returned better title:", microResult.title);
                    primaryResult = adoptAutotitleTitle(primaryResult, microResult);
                } else if (!primaryResult.coverUrl && microResult.coverUrl) {
                    primaryResult = mergeAutotitleResult(primaryResult, microResult);
                }
            }
        }

        // Strategy 5: Advanced Scraper Engine (CORS Proxy Pool & Browser Emulator)
        if (strats.ScraperEngine && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url))) {
            console.log("Autotitle: Trying Advanced Scraper Engine fallback...");
            try {
                const scraperResult = await strats.ScraperEngine(url, controller.signal);
                if (scraperResult && scraperResult.title) {
                    if (!primaryResult || isClearlyBetterTitle(scraperResult, primaryResult, url)) {
                        primaryResult = adoptAutotitleTitle(primaryResult, scraperResult);
                    }
                }
            } catch (e) {
                console.warn("Autotitle: ScraperEngine strategy failed", e);
            }
        }

        // Return whatever we got
        if (primaryResult) {
            console.log("Autotitle: Using primary result:", primaryResult.title);
            clearTimeout(timeoutId);
            return primaryResult;
        }

        // Strategy 4: URL Slug Fallback
        if (strats.UrlSlug) {
            console.log("Autotitle: Trying UrlSlug fallback...");
            const result = strats.UrlSlug(url);
            if (result) {
                clearTimeout(timeoutId);
                return result;
            }
        }

    } catch (e) {
        console.warn("Autotitle orchestration error", e);
    } finally {
        clearTimeout(timeoutId);
    }

    return null;
};
