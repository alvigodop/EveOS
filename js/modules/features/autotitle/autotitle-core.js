// --- AUTO-TITLE CORE MODULE ---
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

    function decodeHtmlEntities(value) {
        return String(value || '')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#0*39;/gi, "'")
            .replace(/&#x27;/gi, "'");
    }

    function normalizeComparableUrl(value) {
        if (!value) return null;
        try {
            const parsed = new URL(String(value).trim());
            parsed.hash = '';
            return parsed.href.replace(/[?#].*$/, '');
        } catch (e) {
            return String(value || '').trim().replace(/[?#].*$/, '') || null;
        }
    }

    function isLikelyIconUrl(value) {
        const url = String(value || '').trim().toLowerCase();
        if (!url) return false;
        if (/favicon|apple-touch-icon|mstile|mask-icon|site-icon|pwa\/icons\/icon-|\/icons?\//.test(url)) return true;
        if (/\.ico(?:[?#].*)?$/i.test(url)) return true;
        if (/icon[-_]?(\d+|small|tiny|square)?\.(png|jpg|jpeg|webp|svg)(?:[?#].*)?$/i.test(url)) return true;
        if (/(^|[\/_-])(16|24|32|48|57|60|64|72|76|96|114|120|128|144|152|167|180|192|256|384|512)x?\1?(png|jpg|jpeg|webp|svg)$/i.test(url)) return true;
        return false;
    }

    function isRejectedIconUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return false;
        const variants = new Set([raw.toLowerCase()]);
        try {
            variants.add(decodeURIComponent(raw).toLowerCase());
        } catch (e) { }
        try {
            const parsed = new URL(raw);
            variants.add((parsed.href || '').toLowerCase());
            variants.add((parsed.pathname || '').toLowerCase());
        } catch (e) { }
        for (const url of variants) {
            if (/^file:\/\//.test(url)) return true;
            if (/^file:\/[a-z]:\//i.test(url)) return true;
            if (/\/static\/favicon\.ico(?:[?#].*)?$/.test(url)) return true;
        }
        return false;
    }

    function isLikelyCoverUrl(value) {
        const url = String(value || '').trim().toLowerCase();
        if (!url) return false;
        if (/cover|poster|thumbnail|thumb|banner|hero|backdrop|manga|comic|chapter|title|og-image/.test(url)) return true;
        if (/uploads\.mangadex\.org\/covers\/|static\.mfcdn\.cc\//.test(url)) return true;
        return false;
    }

    function isRejectedCoverUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return false;
        const variants = new Set([raw.toLowerCase()]);
        try {
            variants.add(decodeURIComponent(raw).toLowerCase());
        } catch (e) { }
        try {
            const parsed = new URL(raw);
            variants.add((parsed.href || '').toLowerCase());
            variants.add((parsed.pathname || '').toLowerCase());
            variants.add((parsed.search || '').toLowerCase());
            try {
                variants.add(decodeURIComponent(parsed.pathname || '').toLowerCase());
                variants.add(decodeURIComponent(parsed.search || '').toLowerCase());
            } catch (e) { }
        } catch (e) { }

        for (const url of variants) {
            if (/\/cover\/\d+\/_s\d+\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(url)) return true;
            if (/[_-]s\d+\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(url) && /\/cover\//.test(url)) return true;
        }
        return false;
    }

    function scoreCoverUrl(value, targetUrl) {
        const raw = String(value || '').trim();
        if (!raw) return -999;
        if (isRejectedCoverUrl(raw)) return -999;
        if (isLikelyIconUrl(raw) && !isLikelyCoverUrl(raw)) return -500;

        const variants = new Set([raw.toLowerCase()]);
        try {
            variants.add(decodeURIComponent(raw).toLowerCase());
        } catch (e) { }

        let score = 0;
        for (const url of variants) {
            if (/uploads\.mangadex\.org\/covers\//.test(url)) score += 120;
            if (/static\.mfcdn\.cc\//.test(url)) score += 120;
            if (/cover|poster|thumbnail|thumb|banner|hero|backdrop|manga|comic|chapter|title|og-image/.test(url)) score += 45;
            if (/\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(url)) score += 35;
            if (/[a-z0-9][a-z0-9_-]{4,}\/\d+\//i.test(url)) score += 25;
            if (/\/cover\/\d+\//i.test(url) && !/[a-z0-9][a-z0-9_-]{4,}\/\d+\//i.test(url)) score -= 40;
            if (/\/assets\//.test(url)) score -= 25;
            if (/@\d+\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(url)) score -= 20;
            if (/placeholder|default|no-cover|noimage|blank/.test(url)) score -= 60;
        }

        try {
            const parsed = new URL(raw);
            if (parsed.hostname) {
                score += 5;
            }
            const hints = getUrlHints(targetUrl);
            if (hints?.coverUrl) {
                const normalizedCandidate = normalizeComparableUrl(raw);
                const normalizedHint = normalizeComparableUrl(hints.coverUrl);
                if (normalizedCandidate && normalizedHint && normalizedCandidate === normalizedHint) {
                    score += 140;
                }
            }
        } catch (e) { }

        return score;
    }

    function pickBetterCoverUrl(primaryCover, candidateCover, targetUrl) {
        const primaryScore = scoreCoverUrl(primaryCover, targetUrl);
        const candidateScore = scoreCoverUrl(candidateCover, targetUrl);
        if (candidateScore > primaryScore) return candidateCover || null;
        return primaryCover || null;
    }

    function trimSiteSuffix(title, targetUrl) {
        const raw = decodeHtmlEntities(title).trim();
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

        if (normalized.title === 'CLOUDFLARE_BLOCK' && !normalized.icon && !normalized.coverUrl && !normalized.description) {
            return null;
        }

        if (normalized.title) {
            normalized.title = trimSiteSuffix(normalized.title, targetUrl);
            normalized.title = normalized.title
                .replace(/\s*Manga\s*-\s*Read Manga Online Free\s*$/i, '')
                .replace(/\s*-\s*Read Manga Online Free\s*$/i, '')
                .replace(/\s*-\s*Read Online(?:\s+Free)?\s*$/i, '')
                .replace(/\s*-\s*MangaDex\s*$/i, '')
                .trim();
        }

        if ((!normalized.title || looksLikeGenericSiteName(normalized.title, targetUrl)) && hints?.titleFromSlug) {
            normalized.title = hints.titleFromSlug;
            normalized.isFallback = !!result.isFallback;
        }

        if (!normalized.icon && hints?.icon) {
            normalized.icon = hints.icon;
        }
        if (normalized.icon && isRejectedIconUrl(normalized.icon)) {
            normalized.icon = null;
        }
        if (normalized.coverUrl) {
            const normalizedCover = normalizeComparableUrl(normalized.coverUrl);
            const normalizedIcon = normalizeComparableUrl(normalized.icon);
            if (
                isRejectedCoverUrl(normalized.coverUrl) ||
                (normalizedIcon && normalizedCover === normalizedIcon) ||
                (isLikelyIconUrl(normalized.coverUrl) && !isLikelyCoverUrl(normalized.coverUrl))
            ) {
                normalized.coverUrl = null;
            }
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

    function mergeAutotitleResult(primaryResult, candidateResult, targetUrl) {
        if (!candidateResult) return primaryResult;
        if (!primaryResult) return { ...candidateResult };
        return {
            ...primaryResult,
            icon: candidateResult.icon || primaryResult.icon || null,
            coverUrl: pickBetterCoverUrl(primaryResult.coverUrl, candidateResult.coverUrl, targetUrl),
            description: candidateResult.description || primaryResult.description || null,
            source: candidateResult.source || primaryResult.source,
            isFallback: !!(primaryResult.isFallback || candidateResult.isFallback),
            isMicrolinkFallback: !!(primaryResult.isMicrolinkFallback || candidateResult.isMicrolinkFallback),
            isAdvancedScrape: !!(primaryResult.isAdvancedScrape || candidateResult.isAdvancedScrape)
        };
    }

    function mergeAutotitleMetadata(primaryResult, candidateResult, targetUrl) {
        if (!candidateResult) return primaryResult;
        if (!primaryResult) return { ...candidateResult };
        return {
            ...primaryResult,
            icon: primaryResult.icon || candidateResult.icon || null,
            coverUrl: pickBetterCoverUrl(primaryResult.coverUrl, candidateResult.coverUrl, targetUrl),
            description: primaryResult.description || candidateResult.description || null,
            isFallback: !!(primaryResult.isFallback || candidateResult.isFallback),
            isMicrolinkFallback: !!(primaryResult.isMicrolinkFallback || candidateResult.isMicrolinkFallback),
            isAdvancedScrape: !!(primaryResult.isAdvancedScrape || candidateResult.isAdvancedScrape)
        };
    }

    function adoptAutotitleTitle(primaryResult, candidateResult, targetUrl) {
        if (!candidateResult?.title || candidateResult.title === "CLOUDFLARE_BLOCK") {
            return mergeAutotitleMetadata(primaryResult, candidateResult, targetUrl);
        }
        return {
            ...mergeAutotitleResult(primaryResult, candidateResult, targetUrl),
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
        let parsedUrl = null;
        try {
            parsedUrl = new URL(url);
        } catch (e) { }
        const isMangaFireHost = /(^|\.)mangafire\.to$/i.test(parsedUrl?.hostname || '');

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

        if (isBrowserHtmlMode && strats.LinkMeta) {
            const earlyLinkMeta = normalizeAutotitleResult(await runStrategy(strats.LinkMeta, 5000), url);
            if (earlyLinkMeta) {
                primaryResult = mergeAutotitleMetadata(primaryResult, earlyLinkMeta, url);
                if (!allowSlowCover && earlyLinkMeta.title && !looksLikeGenericSiteName(earlyLinkMeta.title, url) && earlyLinkMeta.coverUrl) {
                    return earlyLinkMeta;
                }
            }
        }

        // Strategy 1: AllOrigins (JSON) - For normal sites
        if (strats.AllOrigins) {
            console.log("Autotitle: Trying AllOrigins strategy...");
            primaryResult = normalizeAutotitleResult(await runStrategy(strats.AllOrigins, isBrowserHtmlMode ? 12000 : 4500), url) || primaryResult;
            if (primaryResult && !looksLikeGenericSiteName(primaryResult.title, url)) {
                console.log("Autotitle: AllOrigins returned good title:", primaryResult.title);
                if (!allowSlowCover && primaryResult.coverUrl) {
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
        if (strats.ScraperEngine && (!primaryResult || primaryResult.isFallback || primaryResult.title === "CLOUDFLARE_BLOCK" || looksLikeGenericSiteName(primaryResult.title, url) || (allowSlowCover && !primaryResult.coverUrl))) {
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

        if (isBrowserHtmlMode && allowSlowCover && (!primaryResult?.coverUrl || scoreCoverUrl(primaryResult.coverUrl, url) < 60)) {
            const coverRecoveryStrategies = [
                { fn: isMangaFireHost ? strats.MangaFireHtml : null, timeout: 22000, attempts: 2 },
                { fn: strats.AllOrigins, timeout: 12000, attempts: 2 },
                { fn: strats.LinkMeta, timeout: 5000, attempts: 2 },
                { fn: strats.CorsProxy, timeout: 5000, attempts: 2 },
                { fn: strats.ScraperEngine, timeout: 10000, attempts: 2 }
            ];
            for (const strategy of coverRecoveryStrategies) {
                if (typeof strategy.fn !== 'function') continue;
                const recoveryResult = normalizeAutotitleResult(await runStrategy(strategy.fn, strategy.timeout, {
                    attempts: strategy.attempts || 1,
                    accept: (result) => !!result?.coverUrl
                }), url);
                if (!recoveryResult) continue;
                primaryResult = mergeAutotitleMetadata(primaryResult, recoveryResult, url);
                if (scoreCoverUrl(primaryResult?.coverUrl, url) >= 80) break;
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
