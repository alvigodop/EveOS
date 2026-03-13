// --- AUTO-TITLE CORE MODULE ---
window.getTitleFromUrl = async function (url) {
    // Orchestrates the strategies defined in external modules

    const strats = window.EveOS?.Autotitle?.Strategies;
    if (!strats) {
        console.error("Autotitle strategies not loaded.");
        return null;
    }

    const isBrowserHtmlMode = window.location?.protocol === 'file:';

    function runStrategy(strategyFn, timeoutMs) {
        if (typeof strategyFn !== 'function') return Promise.resolve(null);
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
    }

    function toTitleCaseSlug(slug) {
        if (!slug) return null;
        const decoded = decodeURIComponent(String(slug).replace(/\+/g, ' '));
        const normalized = decoded
            .replace(/\.(html|php|aspx|jsp)$/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!normalized) return null;
        return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function getUrlHints(targetUrl) {
        try {
            const parsed = new URL(targetUrl);
            const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
            const domainLabel = host.split('.')[0] || '';
            const hints = {
                host,
                domainLabel,
                siteName: null,
                titleFromSlug: null,
                icon: null,
                coverUrl: null
            };

            const mangaDexMatch = parsed.pathname.match(/^\/title\/([0-9a-f-]{36})(?:\/([^/?#]+))?/i);
            if (host.includes('mangadex.org') && mangaDexMatch) {
                hints.siteName = 'MangaDex';
                hints.titleFromSlug = toTitleCaseSlug(mangaDexMatch[2] || '');
                hints.icon = 'https://mangadex.org/pwa/icons/icon-180.png';
                hints.coverUrl = `https://og.mangadex.org/og-image/manga/${mangaDexMatch[1]}`;
            }

            return hints;
        } catch (e) {
            return null;
        }
    }

    function escapeRegex(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function trimSiteSuffix(title, targetUrl) {
        const raw = String(title || '').trim();
        if (!raw) return raw;
        const hints = getUrlHints(targetUrl);
        const suffixTokens = [hints?.siteName, hints?.domainLabel]
            .filter(Boolean)
            .flatMap((token) => [token, String(token).replace(/[-_]+/g, ' ')])
            .filter(Boolean);

        let trimmed = raw;
        for (const token of suffixTokens) {
            const pattern = new RegExp(`\\s*[\\-|–—|·:]\\s*${escapeRegex(token)}\\s*$`, 'i');
            trimmed = trimmed.replace(pattern, '').trim();
        }
        return trimmed || raw;
    }

    function normalizeAutotitleResult(result, targetUrl) {
        if (!result) return null;
        const hints = getUrlHints(targetUrl);
        const normalized = { ...result };

        if (normalized.title) {
            normalized.title = trimSiteSuffix(normalized.title, targetUrl);
        }

        if ((!normalized.title || looksLikeGenericSiteName(normalized.title, targetUrl)) && hints?.titleFromSlug) {
            normalized.title = hints.titleFromSlug;
            normalized.isFallback = !!result.isFallback;
        }

        if (!normalized.icon && hints?.icon) {
            normalized.icon = hints.icon;
        }
        if (!normalized.coverUrl && hints?.coverUrl) {
            normalized.coverUrl = hints.coverUrl;
        }

        return normalized;
    }

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

        if (cleanTitle.length < 4) return true;

        // Common generic patterns
        const genericPatterns = ['view video', 'watch video', 'home', 'welcome', 'index', 'untitled'];
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
            isMicrolinkFallback: !!(primaryResult.isMicrolinkFallback || candidateResult.isMicrolinkFallback),
            isAdvancedScrape: !!(primaryResult.isAdvancedScrape || candidateResult.isAdvancedScrape)
        };
    }

    function mergeAutotitleMetadata(primaryResult, candidateResult) {
        if (!candidateResult) return primaryResult;
        if (!primaryResult) return { ...candidateResult };
        return {
            ...primaryResult,
            icon: primaryResult.icon || candidateResult.icon || null,
            coverUrl: primaryResult.coverUrl || candidateResult.coverUrl || null,
            description: primaryResult.description || candidateResult.description || null,
            isFallback: !!(primaryResult.isFallback || candidateResult.isFallback),
            isMicrolinkFallback: !!(primaryResult.isMicrolinkFallback || candidateResult.isMicrolinkFallback),
            isAdvancedScrape: !!(primaryResult.isAdvancedScrape || candidateResult.isAdvancedScrape)
        };
    }

    function adoptAutotitleTitle(primaryResult, candidateResult) {
        if (!candidateResult?.title || candidateResult.title === "CLOUDFLARE_BLOCK") {
            return mergeAutotitleMetadata(primaryResult, candidateResult);
        }
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
            const microResult = normalizeAutotitleResult(await runStrategy(strats.GoogleSearch, 7000), url);
            if (microResult && microResult.title && microResult.title.length > 10) {
                console.log("Autotitle: MicroLink returned:", microResult.title);
                return microResult;
            }
        }

        // Browser HTML mode benefits more from direct metadata APIs than proxy scraping.
        if (isBrowserHtmlMode && strats.GoogleSearch && !isVideoOrContentSite(url)) {
            console.log("Autotitle: Browser HTML mode detected. Trying MicroLink early...");
            const earlyMicro = normalizeAutotitleResult(await runStrategy(strats.GoogleSearch, 7000), url);
            if (earlyMicro?.title && !looksLikeGenericSiteName(earlyMicro.title, url) && earlyMicro.coverUrl) {
                return earlyMicro;
            }
        }

        let primaryResult = null;

        if (isBrowserHtmlMode && strats.LinkMeta) {
            const earlyLinkMeta = normalizeAutotitleResult(await runStrategy(strats.LinkMeta, 5000), url);
            if (earlyLinkMeta) {
                primaryResult = mergeAutotitleMetadata(primaryResult, earlyLinkMeta);
                if (earlyLinkMeta.title && !looksLikeGenericSiteName(earlyLinkMeta.title, url) && earlyLinkMeta.coverUrl) {
                    return earlyLinkMeta;
                }
            }
        }

        // Strategy 1: AllOrigins (JSON) - For normal sites
        if (strats.AllOrigins) {
            console.log("Autotitle: Trying AllOrigins strategy...");
            primaryResult = normalizeAutotitleResult(await runStrategy(strats.AllOrigins, 4500), url) || primaryResult;
            if (primaryResult && !looksLikeGenericSiteName(primaryResult.title, url)) {
                console.log("Autotitle: AllOrigins returned good title:", primaryResult.title);
                if (primaryResult.coverUrl) {
                    return primaryResult;
                }
            }
        }

        // Strategy 2: CorsProxy.io (Raw HTML)
        if (strats.CorsProxy) {
            console.log("Autotitle: Trying CorsProxy strategy...");
            const corsResult = normalizeAutotitleResult(await runStrategy(strats.CorsProxy, 4500), url);
            if (corsResult && !looksLikeGenericSiteName(corsResult.title, url)) {
                console.log("Autotitle: CorsProxy returned good title:", corsResult.title);
                if (!primaryResult || isClearlyBetterTitle(corsResult, primaryResult, url)) {
                    primaryResult = adoptAutotitleTitle(primaryResult, corsResult);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, corsResult);
                }
                if (primaryResult?.coverUrl) {
                    clearTimeout(timeoutId);
                    return primaryResult;
                }
            }
            if (corsResult && (!primaryResult || isClearlyBetterTitle(corsResult, primaryResult, url))) {
                primaryResult = adoptAutotitleTitle(primaryResult, corsResult);
            } else if (corsResult) {
                primaryResult = mergeAutotitleMetadata(primaryResult, corsResult);
            }
        }

        // Strategy 3: LinkMeta (Keyless API)
        if (strats.LinkMeta && !isBrowserHtmlMode) {
            const linkMetaResult = normalizeAutotitleResult(await runStrategy(strats.LinkMeta, 5000), url);
            if (linkMetaResult) {
                if (!primaryResult || isClearlyBetterTitle(linkMetaResult, primaryResult, url)) {
                    console.log("Autotitle: LinkMeta returned better title:", linkMetaResult.title);
                    primaryResult = adoptAutotitleTitle(primaryResult, linkMetaResult);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, linkMetaResult);
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
                    primaryResult = adoptAutotitleTitle(primaryResult, microResult);
                } else {
                    primaryResult = mergeAutotitleMetadata(primaryResult, microResult);
                }
            }
        }

        // Strategy 5: Advanced Scraper Engine (proxy pool / browser emulator)
        if (strats.ScraperEngine && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url))) {
            console.log("Autotitle: Trying Advanced Scraper Engine fallback...");
            try {
                const scraperResult = normalizeAutotitleResult(await runStrategy(strats.ScraperEngine, 9000), url);
                if (scraperResult) {
                    if (!primaryResult || isClearlyBetterTitle(scraperResult, primaryResult, url)) {
                        primaryResult = adoptAutotitleTitle(primaryResult, scraperResult);
                    } else {
                        primaryResult = mergeAutotitleMetadata(primaryResult, scraperResult);
                    }
                }
            } catch (e) {
                console.warn("Autotitle: ScraperEngine strategy failed", e);
            }
        }

        // Return whatever we got
        if (primaryResult) {
            console.log("Autotitle: Using primary result:", primaryResult.title);
            return normalizeAutotitleResult(primaryResult, url);
        }

        // Strategy 6: URL Slug Fallback
        if (strats.UrlSlug) {
            console.log("Autotitle: Trying UrlSlug fallback...");
            const result = normalizeAutotitleResult(strats.UrlSlug(url), url);
            if (result) {
                return result;
            }
        }

    } catch (e) {
        console.warn("Autotitle orchestration error", e);
    }

    return null;
};
