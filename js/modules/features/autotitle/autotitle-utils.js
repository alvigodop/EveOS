window.EveOS = window.EveOS || {};
window.EveOS.Autotitle = window.EveOS.Autotitle || {};

(function (ns) {
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

    function sanitizeAssetUrlValue(value) {
        let nextValue = decodeHtmlEntities(String(value || '')).trim();
        if (!nextValue) return null;
        nextValue = nextValue.replace(/^url\((.*)\)$/i, '$1').trim();
        nextValue = nextValue.replace(/^['"]+|['"]+$/g, '').trim();
        nextValue = nextValue.replace(/[);,\s]+$/g, '').trim();
        if (!nextValue) return null;
        try {
            return new URL(nextValue).href;
        } catch (e) {
            return nextValue;
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

    function scoreIconUrl(url) {
        if (!url || isRejectedIconUrl(url)) return -999;
        const low = String(url).toLowerCase();
        let score = 0;

        if (low.includes('favicon')) score += 50;
        if (low.includes('apple-touch-icon')) score += 40;
        if (low.includes('logo')) score += 30;
        if (low.endsWith('.ico') || low.includes('.ico?')) score += 20;
        if (low.includes('icon')) score += 10;

        if (low.includes('custom') || low.includes('placeholder') || low.includes('default')) score -= 50;
        if (low.includes('banner') || low.includes('header') || low.includes('bg-')) score -= 30;
        if (/(?:^|\/)(?:images?|assets|static|wp-content|media)\//i.test(low) && score < 10) score -= 10;

        return score;
    }

    function pickBetterIconUrl(primaryIcon, candidateIcon) {
        const primaryScore = scoreIconUrl(primaryIcon);
        const candidateScore = scoreIconUrl(candidateIcon);
        if (candidateScore > primaryScore && candidateScore > -10) return candidateIcon || null;
        if (primaryScore > -10) return primaryIcon || null;
        return candidateIcon || primaryIcon || null;
    }

    function isLikelyCoverUrl(value) {
        const url = String(value || '').trim().toLowerCase();
        if (!url) return false;
        if (/cover|poster|thumbnail|thumb|banner|hero|backdrop|manga|comic|chapter|title|og-image/.test(url)) return true;
        if (/uploads\.mangadex\.org\/covers\/|static\.mfcdn\.[a-z]{2,3}\//.test(url)) return true;
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
            if (/\/g\/ygm\.png(?:[?#].*)?$/i.test(url)) return true;
            if (/\/cover\/avif\/[^/?#]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(url)) return true;
            if (/\/cover\/webp\/[^/?#]+\.(?:jpe?g|png|avif)(?:[?#].*)?$/i.test(url)) return true;
            if (/noimage|no-image|nocover|no-cover|placeholder|default-cover/i.test(url)) return true;
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
            if (/\/w\/\d+\/\d+\/[^/?#]+\.(webp|avif|jpg|jpeg|png)(?:[?#].*)?$/i.test(url)) score += 140;
            if (/\/cover\/(?:avif|webp|png|jpe?g)\//i.test(url)) score += 100;
            if (/\/cover\/(?:avif|webp|png|jpe?g)\/_s\d+\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(url)) score += 45;
            if (/\/cover\/avif\/[^/?#]+\.avif(?:[?#].*)?$/i.test(url)) score += 85;
            if (/\/cover\/webp\/[^/?#]+\.webp(?:[?#].*)?$/i.test(url)) score += 75;
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
            normalized.coverUrl = sanitizeAssetUrlValue(normalized.coverUrl);
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
        const genericPatterns = ['view video', 'watch video', 'home', 'welcome', 'index', 'untitled', 'loading...', 'please wait'];
        if (genericPatterns.some(p => cleanTitle.includes(p))) return true;

        // Title is just the domain name (reject a bare site label on a detail page)
        try {
            const parsed = new URL(url);
            const domain = parsed.hostname.replace('www.', '').split('.')[0].toLowerCase();
            const normalizedTitle = cleanTitle.replace(/[^a-z0-9]/g, '');
            
            // If the title is just the bare domain label (e.g. "ExampleSite")
            if (normalizedTitle === domain || normalizedTitle === domain + 'com' || normalizedTitle === domain + 'org' || normalizedTitle === domain + 'net') {
                // Reject it if it's a detail page (has a path longer than just /)
                if (parsed.pathname.length > 1) {
                    return true;
                }
            }
        } catch (e) { }

        return false;
    }

    function mergeAutotitleResult(primaryResult, candidateResult, targetUrl) {
        if (!candidateResult) return primaryResult;
        if (!primaryResult) return { ...candidateResult };
        return {
            ...primaryResult,
            icon: pickBetterIconUrl(primaryResult.icon, candidateResult.icon),
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
            icon: pickBetterIconUrl(primaryResult.icon, candidateResult.icon),
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

    function isWeakAutotitleResult(result, url) {
        if (!result || !result.title) return true;
        if (result.title === "CLOUDFLARE_BLOCK") return true;
        if (result.isFallback) return true;
        return looksLikeGenericSiteName(result.title, url);
    }

    ns.CoreUtils = Object.assign(ns.CoreUtils || {}, {
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
    });
})(window.EveOS.Autotitle);
