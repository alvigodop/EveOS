(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    function isMangaFireUrl(url) {
        try {
            const parsed = new URL(url);
            return /(^|\.)mangafire\.to$/i.test(parsed.hostname);
        } catch (error) {
            return false;
        }
    }

    function cleanText(value) {
        if (!value) return null;
        return String(value)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim() || null;
    }

    function resolveAssetUrl(assetUrl, baseUrl) {
        if (!assetUrl) return null;
        try {
            return new URL(assetUrl, baseUrl).href;
        } catch (error) {
            return null;
        }
    }

    function parseSrcset(srcset) {
        if (!srcset) return [];
        return String(srcset)
            .split(',')
            .map((part) => part.trim().split(/\s+/)[0])
            .filter(Boolean);
    }

    function scoreCoverCandidate(url) {
        if (!url) return -999;
        const low = String(url).toLowerCase();
        if (/favicon|logo|sprite|avatar|flag|sharethis|emoji|icon|badge|banner|header|ad[sx]?|pixel/.test(low)) return -200;
        if (/\.svg(?:\?.*)?$/i.test(low)) return -120;

        let score = 0;
        if (/cover|poster|thumbnail|thumb|manga|comic|chapter|title/.test(low)) score += 35;
        if (/static\.mfcdn\.cc|uploads|cdn|images|image|media/.test(low)) score += 25;
        if (!/@\d+\.(jpg|jpeg|png|webp|avif)$/i.test(low)) score += 20;
        if (/\.(jpg|jpeg|png|webp|avif)(?:\?.*)?$/i.test(low)) score += 25;
        if (/\/assets\//.test(low)) score -= 30;
        if (/@100\./.test(low)) score -= 18;
        if (/placeholder|default|no-cover/.test(low)) score -= 40;
        return score;
    }

    function extractImageCandidates(doc, baseUrl) {
        const rawCandidates = [];
        const pushResolved = (raw) => {
            const resolved = resolveAssetUrl(raw, baseUrl);
            if (resolved) rawCandidates.push(resolved);
        };

        doc.querySelectorAll('img').forEach((img) => {
            pushResolved(img.getAttribute('src'));
            pushResolved(img.getAttribute('data-src'));
            parseSrcset(img.getAttribute('srcset')).forEach(pushResolved);
            parseSrcset(img.getAttribute('data-srcset')).forEach(pushResolved);
        });

        return Array.from(new Set(rawCandidates))
            .map((url) => ({ url, score: scoreCoverCandidate(url) }))
            .filter((candidate) => candidate.score > -20)
            .sort((a, b) => b.score - a.score);
    }

    function extractMetadata(html, baseUrl) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const title = cleanText(
            doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
            || doc.querySelector('title')?.textContent
        );

        let coverUrl = cleanText(
            doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
            || doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute('content')
        );
        coverUrl = resolveAssetUrl(coverUrl, baseUrl) || extractImageCandidates(doc, baseUrl)[0]?.url || null;

        const description = cleanText(
            doc.querySelector('meta[name="description"]')?.getAttribute('content')
            || doc.querySelector('meta[property="og:description"]')?.getAttribute('content')
        );

        if (!title && !coverUrl && !description) return null;

        return {
            title,
            icon: 'https://s.mfcdn.cc/assets/sites/mangafire/favicon.png?v4',
            coverUrl,
            description,
            source: 'MangaFireHtml'
        };
    }

    function fetchJsonViaXhr(url, timeoutMs, signal) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
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
                reject(new Error(`XHR ${xhr.status}`));
            };
            xhr.onerror = function () {
                if (signal) signal.removeEventListener('abort', onAbort);
                reject(new TypeError('Failed to fetch'));
            };
            xhr.ontimeout = function () {
                if (signal) signal.removeEventListener('abort', onAbort);
                reject(new DOMException('Timed out', 'AbortError'));
            };

            if (signal) {
                if (signal.aborted) return onAbort();
                signal.addEventListener('abort', onAbort, { once: true });
            }

            xhr.send();
        });
    }

    window.EveOS.Autotitle.Strategies.MangaFireHtml = async function (url, signal) {
        if (!isMangaFireUrl(url)) return null;
        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const payload = await fetchJsonViaXhr(proxyUrl, 32000, signal);
            const html = payload?.contents || '';
            if (!html) return null;
            return extractMetadata(html, url);
        } catch (error) {
            console.warn('Autotitle: MangaFire HTML strategy failed', error);
            return null;
        }
    };
})();
