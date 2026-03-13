// Strategy: MicroLink.io Metadata API Fallback
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
        if (/(?:^|\/)(?:images?|assets|static|wp-content|media)\//i.test(low) && score < 10) score -= 30;

        return score;
    };

    window.EveOS.Autotitle.Strategies.GoogleSearch = async function (url, signal) {
        try {
            const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;
            const res = await fetch(apiUrl, { signal: signal });
            if (!res.ok) return null;

            const data = await res.json();
            if (data.status === 'success' && data.data) {
                const metadata = data.data;
                const result = {
                    title: metadata.title || null,
                    icon: null,
                    coverUrl: metadata.image?.url || null,
                    description: metadata.description || null,
                    isMicrolinkFallback: true,
                    source: 'MicroLink'
                };

                const logoUrl = metadata.logo?.url;
                if (logoUrl && isValidIconUrl(logoUrl)) {
                    const score = scoreIconUrl(logoUrl);
                    if (score >= 15) {
                        console.log(`Autotitle: MicroLink icon ${logoUrl} accepted (Score: ${score})`);
                        result.icon = logoUrl;
                    } else {
                        console.log(`Autotitle: MicroLink icon ${logoUrl} rejected (Score: ${score})`);
                    }
                }

                if (result.title) return result;
            }
        } catch (e) {
            console.warn("MicroLink strategy failed", e);
        }
        return null;
    };
})();
