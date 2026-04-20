window.EveSocialManagerModalHelpers = window.EveSocialManagerModalHelpers || {};

(function (ns) {
    function decodeBase64Utf8(input) {
        try {
            return decodeURIComponent(Array.prototype.map.call(atob(input), function (char) {
                return '%' + ('00' + char.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        } catch (error) {
            return atob(input);
        }
    }

    function getThemeToken(token, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        return value || fallback;
    }

    function getThemeBridgeCss() {
        const isLight = document.documentElement.classList.contains('light-theme');
        const accent = getThemeToken('--accent', isLight ? '#0060df' : '#00d4ff');
        const bg = getThemeToken('--bg-color', isLight ? '#f0f2f5' : '#121212');
        const card = getThemeToken('--card-bg', isLight ? '#ffffff' : 'rgba(30, 30, 30, 0.9)');
        const input = getThemeToken('--input-bg', isLight ? '#ffffff' : '#2c2c2c');
        const text = getThemeToken('--text-main', isLight ? '#222222' : '#e0e0e0');
        const border = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.18)';
        const shadow = isLight ? '0 2px 8px rgba(0, 0, 0, 0.10)' : '0 2px 10px rgba(0, 0, 0, 0.40)';

        return `
:root{
  --primary:${accent};
  --success:${getThemeToken('--success', '#00ff88')};
  --bg:${bg};
  --card:${card};
  --text:${text};
  --border:${border};
}
body{
  background: var(--bg) !important;
  color: var(--text) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}
.top-bar,
.panel,
.popup-content{
  background: var(--card) !important;
  color: var(--text) !important;
  border: 1px solid var(--border) !important;
  box-shadow: ${shadow} !important;
}
.list-container{
  background: ${isLight ? '#f8f9fb' : 'rgba(0, 0, 0, 0.16)'} !important;
  border-color: var(--border) !important;
}
input, textarea, select{
  background: ${input} !important;
  color: var(--text) !important;
  border-color: var(--border) !important;
}
button{
  border-radius: 8px !important;
}
.btn-outline{
  border-color: var(--border) !important;
  color: var(--text) !important;
}
a{
  color: var(--primary) !important;
}
`;
    }

    function buildSocialPopupDescriptor(id, site) {
        const normalizedId = encodeURIComponent(String(id || '').trim());
        if (site === 'x') {
            return {
                title: `X · ${id}`,
                targetUrl: `https://x.com/intent/user?user_id=${normalizedId}`,
                realLinkLabel: 'Open Real X'
            };
        }

        return {
            title: `Instagram · @${id}`,
            targetUrl: `https://instagram.com/${normalizedId}`,
            realLinkLabel: 'Open Real IG'
        };
    }

    async function resolvePopupViewerUrl(targetUrl) {
        const normalizedTarget = String(targetUrl || '').trim();
        if (!normalizedTarget) return '';

        try {
            const apiCore = window.EveOS?.API?.Core;
            if (apiCore && typeof apiCore.getPopupViewerUrl === 'function') {
                return await apiCore.getPopupViewerUrl(normalizedTarget);
            }
        } catch (error) {
            console.warn('Social Manager popup resolution failed:', error);
        }

        return normalizedTarget;
    }

    function canUseEmbeddedPopupViewer(targetUrl, viewerUrl) {
        const normalizedTarget = String(targetUrl || '').trim();
        const normalizedViewer = String(viewerUrl || '').trim();
        if (!normalizedTarget || !normalizedViewer) return false;
        if (normalizedViewer !== normalizedTarget) return true;

        try {
            const parsed = new URL(normalizedViewer);
            return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
        } catch (error) {
            return false;
        }
    }

    Object.assign(ns, {
        buildSocialPopupDescriptor,
        canUseEmbeddedPopupViewer,
        decodeBase64Utf8,
        getThemeBridgeCss,
        getThemeToken,
        resolvePopupViewerUrl
    });
})(window.EveSocialManagerModalHelpers);
