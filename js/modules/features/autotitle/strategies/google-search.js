// Strategy: MicroLink.io Metadata API Fallback
// Uses MicroLink.io's free metadata extraction API
// This API works without CORS issues and extracts OpenGraph/oEmbed metadata
// No API key required for the free tier
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

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
                    return {
                        title: metadata.title,
                        icon: metadata.logo?.url || null,  // Only use logo for favicon
                        coverUrl: metadata.image?.url || null,  // Content image for thumbnails
                        description: metadata.description || null,
                        isMicrolinkFallback: true,
                        source: 'MicroLink'
                    };
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
