// Strategy 1: AllOrigins (JSON)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    const cleanTitle = (raw) => {
        if (!raw) return null;
        const blockedTitles = [
            "Just a moment...", "Attention Required! | Cloudflare", "Access denied", "403 Forbidden", "404 Not Found", "Too Many Requests"
        ];

        const t = raw
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            .trim();

        if (blockedTitles.some(bt => t.includes(bt))) {
            if (t.includes("Just a moment") || t.includes("Cloudflare")) {
                console.info("Cloudflare protection detected (handled).");
                return "CLOUDFLARE_BLOCK";
            }
            console.warn("Blocked title detected:", t);
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
                try {
                    iconUrl = new URL(iconUrl, baseUrl).href;
                } catch (e) { return null; }
            }
            return iconUrl;
        }
        return null;
    };

    window.EveOS.Autotitle.Strategies.AllOrigins = async function (url, signal) {
        try {
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: signal });
            const data = await res.json();
            if (data.contents) {
                const t = cleanTitle(extractTitle(data.contents));
                if (t === "CLOUDFLARE_BLOCK") throw new Error("AllOrigins Cloudflare Block");
                const i = extractIcon(data.contents, url);
                if (t) return { title: t, icon: i };
            }
        } catch (e) {
            console.warn("AllOrigins failed", e);
        }
        return null; // Continue to next strategy
    };
})();
