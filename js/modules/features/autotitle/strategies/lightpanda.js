// Strategy: Lightpanda (WSL-based Browsing via Backend)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    const cleanTitle = (raw) => {
        if (!raw) return null;
        const blockedTitles = [
            "Just a moment...", "Attention Required! | Cloudflare", "Access denied", "403 Forbidden", "404 Not Found", "Too Many Requests"
        ];
        const title = String(raw)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();

        if (blockedTitles.some((blocked) => title.includes(blocked))) {
            return "CLOUDFLARE_BLOCK";
        }
        return title;
    };

    const utils = window.EveOS?.Autotitle?.CoreUtils || {};
    
    // Fallback extractors if utils aren't available
    const extractMetadata = (html, baseUrl) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        const title = cleanTitle(
            doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
            || doc.title
            || doc.querySelector('title')?.innerText
            || ''
        );

        const icon = doc.querySelector('link[rel*="icon"]')?.href
            || doc.querySelector('link[rel="apple-touch-icon"]')?.href
            || null;

        const coverUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
            || null;

        return {
            title: title ? title.trim() : null,
            icon: icon,
            coverUrl: coverUrl,
            source: 'Lightpanda'
        };
    };

    window.EveOS.Autotitle.Strategies.Lightpanda = async function (url, signal) {
        console.log("Autotitle: Attempting Lightpanda Strategy...");

        const isFileProtocol = window.location?.protocol === 'file:';
        let portsToTry = isFileProtocol ? [window._eveLightpandaPort, 3037, 3000, 3001, 3002, 3003, 3004, 3005].filter(Boolean) : [null];
        portsToTry = [...new Set(portsToTry)]; // Remove duplicates
        
        for (const port of portsToTry) {
            try {
                const apiBase = port ? `http://localhost:${port}` : '';
                const apiUrl = `${apiBase}/api/lightpanda?url=${encodeURIComponent(url)}`;
                
                const response = await fetch(apiUrl, { signal });
                
                if (response.ok) {
                    const html = await response.text();
                    
                    // Use enhanced utils if available, else fallback
                    if (window.EveOS?.Autotitle?.CoreUtils?.extractMetadata) {
                        const metadata = window.EveOS.Autotitle.CoreUtils.extractMetadata(html, url);
                        if (metadata) {
                            metadata.source = 'Lightpanda';
                            console.log(`Autotitle: Lightpanda success (via port ${port || 'default'}):`, metadata.title);
                            
                            // If we found a working port on file protocol, maybe cache it for this session?
                            if (isFileProtocol && port) window._eveLightpandaPort = port;
                            
                            return metadata;
                        }
                    } else {
                        const metadata = extractMetadata(html, url);
                        if (metadata.title) {
                            console.log(`Autotitle: Lightpanda (simple parse) success (via port ${port || 'default'}):`, metadata.title);
                            return metadata;
                        }
                    }
                } else if (response.status === 503) {
                    console.warn("Autotitle: Lightpanda bridge is currently DISABLED in the launcher.");
                    return null; // Don't try other ports if it's explicitly disabled
                } else {
                    console.warn(`Autotitle: Lightpanda backend at ${apiBase} returned error ${response.status}`);
                }
            } catch (error) {
                if (error.name === 'AbortError') return null;
                
                // If connection refused, try next port
                if (isFileProtocol) {
                    console.warn(`Autotitle: Lightpanda connection refused at localhost:${port}. Probing next...`);
                    continue;
                }
                
                console.warn("Autotitle: Lightpanda strategy failed", error);
            }
            
            // If not file protocol or we already tried the dynamic port, just stop
            if (!isFileProtocol) break;
        }

        if (isFileProtocol) {
            console.error("Autotitle: Could not connect to a local Lightpanda bridge. Start 'start-lightpanda-bridge.bat' from 'start-server.bat', then retry.");
        }

        return null;
    };
})();
