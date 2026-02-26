// Strategy 3: URL Slug Fallback
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    window.EveOS.Autotitle.Strategies.UrlSlug = function (url) {
        try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/').filter(s => s && s.length > 0);
            if (pathSegments.length > 0) {
                let slug = pathSegments[pathSegments.length - 1];
                slug = slug.replace(/\.(html|php|aspx|jsp)$/, '');
                const title = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                console.info("Proxies blocked, falling back to URL slug:", title);
                return { title: title, icon: null, isFallback: true };
            }
        } catch (e) {
            console.warn("Slug fallback failed", e);
        }
        return null;
    };
})();
