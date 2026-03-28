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

function isRenderableImageUrl(url) {
    const value = String(url || '').trim();
    if (!value) return false;
    if (/^(?:null|undefined|none|n\/a)$/i.test(value)) return false;
    return /^(?:https?:\/\/|file:\/\/|blob:|data:image\/|\/|\.{1,2}\/)/i.test(value);
}

/**
 * Setup an image element with a proxy fallback mechanism
 * @param {HTMLImageElement} img - The image element
 * @param {string} originalUrl - The original source URL
 * @param {string} finalFallbackUrl - Optional final fallback (placeholder)
 */
function setupProxiedImage(img, originalUrl, finalFallbackUrl) {
    if (!img) return;

    const sourceUrl = String(originalUrl || '').trim();
    const fallbackUrl = String(finalFallbackUrl || '').trim();

    function resetImage() {
        img.style.display = '';
    }

    function hideImage() {
        img.style.display = 'none';
    }

    if (!sourceUrl) {
        hideImage();
        return;
    }

    resetImage();
    img.onload = function() {
        resetImage();
    };

    if (!isRenderableImageUrl(sourceUrl)) {
        if (fallbackUrl && fallbackUrl !== sourceUrl) {
            setupProxiedImage(img, fallbackUrl);
        } else {
            hideImage();
        }
        return;
    }

    // Skip if it's already a local file or data URL
    if (
        sourceUrl.startsWith('file://')
        || sourceUrl.startsWith('data:')
        || sourceUrl.startsWith('blob:')
        || sourceUrl.startsWith('/')
        || sourceUrl.startsWith('./')
        || sourceUrl.startsWith('../')
    ) {
        img.onerror = function() {
            if (fallbackUrl && fallbackUrl !== sourceUrl) {
                setupProxiedImage(img, fallbackUrl);
            } else {
                hideImage();
            }
        };
        img.src = sourceUrl;
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
                ? window.CPMUtils.constructProxyUrl(sourceUrl, proxyBase)
                : (proxyBase.endsWith('?') ? (proxyBase + encodeURIComponent(sourceUrl)) : (proxyBase + sourceUrl));
            
            console.warn(`[ImageUtils] Retrying via proxy: ${proxyBase}`);
            img.src = proxiedUrl;
        } else if (fallbackUrl && fallbackUrl !== sourceUrl) {
            setupProxiedImage(img, fallbackUrl);
        } else {
            hideImage();
        }
    };

    img.src = sourceUrl;
}

window.setupProxiedImage = setupProxiedImage;
window.isRenderableImageUrl = isRenderableImageUrl;
