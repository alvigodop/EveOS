(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    function looksLikeGalleryPage(url) {
        try {
            const parsed = new URL(url);
            return /^\/g\/\d+\/[a-z0-9]+\/?$/i.test(parsed.pathname || '');
        } catch (error) {
            return false;
        }
    }

    function decodeEntities(value) {
        return String(value || '')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;|&#34;/gi, '"')
            .replace(/&#x27;|&#39;/gi, "'")
            .trim();
    }

    function cleanTitle(value, baseUrl) {
        const title = decodeEntities(value);
        if (!title) return null;
        try {
            const host = new URL(baseUrl).hostname.replace(/^www\./i, '');
            const root = host.split('.').slice(0, -1).join('.') || host;
            const hostPattern = new RegExp(`\\s*-\\s*${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+galleries?)?\\s*$`, 'i');
            return title.replace(hostPattern, '').trim() || null;
        } catch (error) {
            return title;
        }
    }

    function sanitizeAssetUrlRaw(assetUrl) {
        let value = decodeEntities(assetUrl).trim();
        if (!value) return null;
        value = value.replace(/^url\((.*)\)$/i, '$1').trim();
        value = value.replace(/^['"]+|['"]+$/g, '').trim();
        value = value.replace(/[);,\s]+$/g, '').trim();
        return value || null;
    }

    function resolveAssetUrl(assetUrl, baseUrl) {
        const sanitized = sanitizeAssetUrlRaw(assetUrl);
        if (!sanitized) return null;
        try {
            return new URL(sanitized, baseUrl).href;
        } catch (error) {
            return null;
        }
    }

    function isRejectedCoverUrl(url) {
        const low = String(url || '').trim().toLowerCase();
        if (!low) return true;
        if (/\/g\/ygm\.png(?:[?#].*)?$/i.test(low)) return true;
        if (/\/cover\/\d+\/_s\d+\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(low)) return true;
        if (/\/g\/[a-z0-9_-]{1,12}\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(low)) return true;
        if (/\/cover\/avif\/[^/?#]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(low)) return true;
        if (/\/cover\/webp\/[^/?#]+\.(?:jpe?g|png|avif)(?:[?#].*)?$/i.test(low)) return true;
        if (/noimage|no-image|nocover|no-cover|placeholder|default-cover/i.test(low)) return true;
        return false;
    }

    function scoreCoverCandidate(url) {
        if (!url || isRejectedCoverUrl(url)) return -999;
        const low = String(url).toLowerCase();
        let score = 0;
        if (/\/w\/\d+\/\d+\/[^/?#]+\.(webp|avif|jpg|jpeg|png)(?:[?#].*)?$/i.test(low)) score += 220;
        if (/\/cover\/(?:avif|webp|png|jpe?g)\//i.test(low)) score += 90;
        if (/\/cover\/(?:avif|webp|png|jpe?g)\/_s\d+\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(low)) score += 45;
        if (/\/cover\/avif\/[^/?#]+\.avif(?:[?#].*)?$/i.test(low)) score += 85;
        if (/\/cover\/webp\/[^/?#]+\.webp(?:[?#].*)?$/i.test(low)) score += 70;
        if (/webp|avif/.test(low)) score += 40;
        if (/\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(low)) score += 25;
        if (/[a-z0-9][a-z0-9_-]{4,}\/\d+\//i.test(low)) score += 18;
        if (/cover|poster|thumb|thumbnail|gallery/.test(low)) score += 10;
        if (/icon|logo|favicon|avatar|sprite|badge|pixel/.test(low)) score -= 160;
        return score;
    }

    function pickBestCover(doc, html, baseUrl) {
        const candidates = [];
        const pushCandidate = (raw) => {
            const resolved = resolveAssetUrl(raw, baseUrl);
            if (!resolved) return;
            candidates.push({ url: resolved, score: scoreCoverCandidate(resolved) });
        };

        [
            '#gd1 div',
            '#gd1',
            '#cover',
            '.cover',
            '.gallerycover',
            '[style*="url("]'
        ].forEach((selector) => {
            doc.querySelectorAll(selector).forEach((node) => {
                const styleValue = node.getAttribute('style') || '';
                const match = styleValue.match(/url\((.*?)\)/i);
                if (match?.[1]) pushCandidate(match[1]);
            });
        });

        [
            '#gd1 img',
            '#gleft img',
            '.glthumb img',
            '.cover img',
            'meta[property="og:image"]',
            'meta[property="og:image:secure_url"]',
            'meta[name="twitter:image"]',
            'meta[name="twitter:image:src"]',
            'meta[itemprop="image"]',
            'link[rel="image_src"]'
        ].forEach((selector) => {
            doc.querySelectorAll(selector).forEach((node) => {
                pushCandidate(
                    node.getAttribute('content')
                    || node.getAttribute('href')
                    || node.getAttribute('src')
                    || node.getAttribute('data-src')
                );
            });
        });

        const inlinePatterns = [
            /url\((?:&quot;|&#34;|["'])?(https?:\/\/[^"')\s]+|\/\/[^"')\s]+|\/[^"')\s]+\.(?:avif|webp|png|jpe?g)[^"')\s]*)(?:&quot;|&#34;|["'])?\)/gi,
            /https?:\/\/[^"'`\s<>()\\]+?\.(?:avif|webp|png|jpe?g)(?:\?[^"'`\s<>()\\]*)?/gi,
            /\/\/[^"'`\s<>()\\]+?\.(?:avif|webp|png|jpe?g)(?:\?[^"'`\s<>()\\]*)?/gi
        ];
        inlinePatterns.forEach((pattern) => {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                pushCandidate(match[1] || match[0]);
            }
        });

        return candidates
            .filter((candidate) => candidate.score > -20)
            .sort((a, b) => b.score - a.score)[0]?.url || null;
    }

    function extractMetadata(html, baseUrl) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const title = cleanTitle(
            doc.querySelector('#gn')?.textContent
            || doc.querySelector('#gj')?.textContent
            || doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
            || doc.querySelector('title')?.textContent,
            baseUrl
        );
        const coverUrl = pickBestCover(doc, html, baseUrl);
        const description = decodeEntities(
            doc.querySelector('meta[name="description"]')?.getAttribute('content')
            || doc.querySelector('meta[property="og:description"]')?.getAttribute('content')
            || ''
        ) || null;
        if (!title && !coverUrl && !description) return null;
        return {
            title,
            icon: new URL('/favicon.ico', baseUrl).href,
            coverUrl,
            description,
            source: 'GalleryPageHtml'
        };
    }

    function fetchJsonViaXhr(url, timeoutMs, signal, attemptsLeft = 3) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const retryOrReject = (error) => {
                if (attemptsLeft > 1 && !(signal && signal.aborted)) {
                    setTimeout(() => {
                        fetchJsonViaXhr(url, timeoutMs, signal, attemptsLeft - 1).then(resolve).catch(reject);
                    }, 350);
                    return;
                }
                reject(error);
            };
            const onAbort = () => {
                try { xhr.abort(); } catch (error) {}
                reject(new DOMException('Aborted', 'AbortError'));
            };

            xhr.open('GET', url, true);
            xhr.timeout = timeoutMs;
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                if (signal) signal.removeEventListener('abort', onAbort);
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (error) {
                        reject(error);
                    }
                    return;
                }
                retryOrReject(new Error(`XHR ${xhr.status}`));
            };
            xhr.onerror = function () {
                if (signal) signal.removeEventListener('abort', onAbort);
                retryOrReject(new TypeError('Failed to fetch'));
            };
            xhr.ontimeout = function () {
                if (signal) signal.removeEventListener('abort', onAbort);
                retryOrReject(new DOMException('Timed out', 'AbortError'));
            };

            if (signal) {
                if (signal.aborted) return onAbort();
                signal.addEventListener('abort', onAbort, { once: true });
            }

            xhr.send();
        });
    }

    window.EveOS.Autotitle.Strategies.GalleryPageHtml = async function (url, signal) {
        if (!looksLikeGalleryPage(url)) return null;
        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const payload = await fetchJsonViaXhr(proxyUrl, 32000, signal);
            const html = payload?.contents || '';
            if (!html) return null;
            return extractMetadata(html, url);
        } catch (error) {
            console.warn('Autotitle: gallery page HTML strategy failed', error);
            return null;
        }
    };
})();
