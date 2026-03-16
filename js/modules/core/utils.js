// --- UTILS ---
function normalizeUrl(url) {
    if (!url) return "";
    if (url.startsWith('file://')) return url;
    if (!/^https?:\/\//i.test(url)) return 'https://' + url;
    return url;
}

function saveNotes() {
    const notesArea = document.getElementById('notes-area');
    if (notesArea) localStorage.setItem('eveV22Notes', notesArea.value);
}

/**
 * Setup an image element with a proxy fallback mechanism
 * @param {HTMLImageElement} img - The image element
 * @param {string} originalUrl - The original source URL
 * @param {string} finalFallbackUrl - Optional final fallback (placeholder)
 */
function setupProxiedImage(img, originalUrl, finalFallbackUrl) {
    if (!img || !originalUrl) return;

    // Skip if it's already a local file or data URL
    if (originalUrl.startsWith('file://') || originalUrl.startsWith('data:')) {
        img.src = originalUrl;
        return;
    }

    let proxyIndex = -1;
    const proxies = (window.CORSProxyManager && typeof window.CORSProxyManager.getProxies === 'function')
        ? window.CORSProxyManager.getProxies()
        : [];

    img.onerror = function() {
        proxyIndex++;
        if (proxyIndex < proxies.length) {
            const proxyBase = proxies[proxyIndex];
            const proxiedUrl = (window.CPMUtils && typeof window.CPMUtils.constructProxyUrl === 'function')
                ? window.CPMUtils.constructProxyUrl(originalUrl, proxyBase)
                : (proxyBase.endsWith('?') ? (proxyBase + encodeURIComponent(originalUrl)) : (proxyBase + originalUrl));
            
            console.warn(`[ImageUtils] Retrying via proxy: ${proxyBase}`);
            img.src = proxiedUrl;
        } else if (finalFallbackUrl) {
            img.onerror = function() {
                img.style.display = 'none';
            };
            img.src = finalFallbackUrl;
        } else {
            img.style.display = 'none';
        }
    };

    img.src = originalUrl;
}

window.setupProxiedImage = setupProxiedImage;
