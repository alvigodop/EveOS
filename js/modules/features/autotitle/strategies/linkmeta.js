// Strategy: LinkMeta (Keyless Metadata API)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    window.EveOS.Autotitle.Strategies.LinkMeta = async function (url, signal) {
        console.log("Autotitle: Trying LinkMeta strategy...");
        try {
            const apiUrl = `https://api.linkmeta.dev/v1/meta?url=${encodeURIComponent(url)}`;
            const response = await fetch(apiUrl, { signal });
            if (!response.ok) {
                console.warn(`Autotitle: LinkMeta returned status ${response.status}`);
                return null;
            }

            const data = await response.json();
            if (data && data.title) {
                console.log("Autotitle: LinkMeta success:", data.title);
                return {
                    title: data.title.trim(),
                    icon: data.favicon || data.icon || null,
                    coverUrl: data.image || null,
                    description: data.description || null,
                    source: 'LinkMeta'
                };
            }
        } catch (error) {
            console.warn("Autotitle: LinkMeta failed", error);
        }
        return null;
    };
})();
