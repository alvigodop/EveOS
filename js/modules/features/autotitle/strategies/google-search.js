// Strategy: MicroLink.io Metadata API Fallback
// Uses MicroLink.io's free metadata extraction API
// This API works without CORS issues and extracts OpenGraph/oEmbed metadata
// No API key required for the free tier
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    const isValidIconUrl = (iconUrl) => {
        if (!iconUrl || typeof iconUrl !== 'string') return false;
        const low = iconUrl.toLowerCase();
        if (iconUrl.length > 512) return false;
        if (/ads|track|pixel|metrics|analytics/i.test(iconUrl)) return false;
        if (/\.(png|ico|jpg|jpeg|svg|webp|avif)(?:\?.*)?$/i.test(low)) return true;
        if (/^https?:\/\//i.test(low) && !/\.(js|css|html|php|json)$/i.test(low)) return true;
        return false;
    };

    const scoreIconUrl = (url) => {
        if (!url) return 0;
        const low = url.toLowerCase();
        let score = 0;

        if (low.includes('favicon')) score += 50;
        if (low.includes('apple-touch-icon')) score += 40;
        if (low.includes('logo')) score += 30;
        if (low.endsWith('.ico') || low.includes('.ico?')) score += 20;
        if (low.includes('icon')) score += 10;

        if (low.includes('custom') || low.includes('placeholder') || low.includes('default')) score -= 50;
        if (low.includes('banner') || low.includes('header')) score -= 30;
        if (/(?:^|\/)(?:images?|assets|static|wp-content|media)\//i.test(low) && score < 10) score -= 10;

        return score;
    };

    /**
     * MicroLink.io API Fallback Strategy
     * 
     * This API normalizes metadata from:
     * - OpenGraph (og:title, og:description)
     * - JSON-LD structured data
     * - oEmbed (YouTube, Vimeo, etc.)
     * - Standard HTML (title, meta tags)
     * 
     * Free tier has rate limits but works without API key.
     */
    window.EveOS.Autotitle.Strategies.GoogleSearch = async function (url, signal) {
        try {
            // MicroLink.io free metadata API endpoint
            const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;

            console.info("MicroLink strategy: Fetching metadata from", apiUrl);

            const res = await fetch(apiUrl, { signal: signal });

            if (!res.ok) {
                console.warn(`MicroLink strategy: API returned ${res.status}`);
                if (res.status === 429) {
                    console.warn("MicroLink strategy: Rate limit exceeded (free tier)");
                }
                return null;
            }

            const data = await res.json();

            // Check for successful response
            if (data.status === 'success' && data.data) {
                const metadata = data.data;

                // Priority: title field (extracted from OpenGraph/HTML/oEmbed)
                if (metadata.title && metadata.title.length > 3) {
                    console.info("MicroLink strategy: Found title:", metadata.title);

                    // Note: logo = favicon/site icon, image = content image/thumbnail
                    // These should be kept separate for proper display
                    const result = {
                        title: metadata.title,
                        icon: null,
                        coverUrl: metadata.image?.url || null,  // Content image for thumbnails
                        description: metadata.description || null,
                        isMicrolinkFallback: true,
                        source: 'MicroLink'
                    };

                    const logoUrl = metadata.logo?.url || null;
                    if (logoUrl && isValidIconUrl(logoUrl)) {
                        const score = scoreIconUrl(logoUrl);
                        if (score >= -10) {
                            console.info(`MicroLink strategy: Accepted icon ${logoUrl} (score ${score})`);
                            result.icon = logoUrl;
                        } else {
                            console.info(`MicroLink strategy: Rejected icon ${logoUrl} (score ${score})`);
                        }
                    }

                    return result;
                }
            }

            console.warn("MicroLink strategy: No title found in API response");
            console.debug("MicroLink raw response:", data);

        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn("MicroLink strategy: Request timed out");
            } else {
                console.warn("MicroLink strategy: API error:", e.message);
            }
        }

        return null;
    };

    console.log("EveOS Autotitle: MicroLink.io strategy loaded");
})();
