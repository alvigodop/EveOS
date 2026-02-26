// Strategy 2: CorsProxy.io (Raw HTML)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    const cleanTitle = (raw) => {
        if (!raw) return null;
        const blockedTitles = [
            "Just a moment...", "Attention Required! | Cloudflare", "Access denied", "403 Forbidden", "404 Not Found", "Too Many Requests"
        ];
        const t = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
        if (blockedTitles.some(bt => t.includes(bt))) {
            if (t.includes("Just a moment") || t.includes("Cloudflare")) return "CLOUDFLARE_BLOCK";
            return null;
        }
        return t;
    };

    const extractTitle = (html) => {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match && match[1] ? match[1] : null;
    };

    const extractIcon = (html, baseUrl) => {
        const match = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
        if (match && match[1]) {
            let iconUrl = match[1];
            if (!iconUrl.startsWith('http')) {
                try { iconUrl = new URL(iconUrl, baseUrl).href; } catch (e) { return null; }
            }
            return iconUrl;
        }
        return null;
    };

    window.EveOS.Autotitle.Strategies.CorsProxy = async function (url, signal) {
        try {
            const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, { signal: signal });
            if (res.status === 403 || res.status === 429) {
                console.warn("CorsProxy blocked (403/429)");
                throw new Error("CorsProxy Blocked");
            }
            const text = await res.text();
            const t = cleanTitle(extractTitle(text));
            const i = extractIcon(text, url);
            if (t) return { title: t, icon: i };
        } catch (e) {
            console.warn("CorsProxy failed", e);
        }
        return null;
    };
})();
