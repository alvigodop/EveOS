// --- SOCIAL MANAGER MODAL ---
(function () {
    const MODAL_ID = 'socialManagerModal';
    const IFRAME_ID = 'socialManagerFrame';
    const THEME_STYLE_ID = 'eveSocialThemeBridge';

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

    function syncFrameTheme(frame) {
        if (!frame) return;
        try {
            const doc = frame.contentDocument;
            if (!doc) return;
            const head = doc.head || doc.getElementsByTagName('head')[0];
            if (!head) return;

            let style = doc.getElementById(THEME_STYLE_ID);
            if (!style) {
                style = doc.createElement('style');
                style.id = THEME_STYLE_ID;
                head.appendChild(style);
            }
            style.textContent = getThemeBridgeCss();
        } catch (error) {
            console.warn('Social Manager theme sync failed:', error);
        }
    }

    function registerFrameHooks(frame) {
        if (!frame || frame.dataset.themeHooked === '1') return;
        frame.addEventListener('load', function () {
            syncFrameTheme(frame);
        });
        frame.dataset.themeHooked = '1';
    }

    function getTemplateHtml() {
        return `
<div class="modal-overlay" id="${MODAL_ID}" onclick="handleSocialManagerOverlayClick(event)">
    <div class="modal" style="max-width:min(1300px, 95vw); width:95vw; height:90vh; padding:14px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <h2 style="margin:0; color:var(--accent);">Social Manager</h2>
            <div style="display:flex; gap:8px; align-items:center;">
                <button type="button" onclick="reloadSocialManagerModal()">Reload</button>
                <button type="button" onclick="closeSocialManagerModal()">Close</button>
            </div>
        </div>
        <iframe id="${IFRAME_ID}" title="Social Manager"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
            style="border:1px solid rgba(255,255,255,0.18); border-radius:8px; width:100%; height:100%; background:#fff;"></iframe>
    </div>
</div>`;
    }

    function ensureModal() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;
        document.body.insertAdjacentHTML('beforeend', getTemplateHtml());
        registerFrameHooks(getFrame());
        return document.getElementById(MODAL_ID);
    }

    function getFrame() {
        return document.getElementById(IFRAME_ID);
    }

    function loadToolHtml(forceReload) {
        const frame = getFrame();
        if (!frame) return;
        registerFrameHooks(frame);

        const socialManagerHtmlB64 = window.SocialManagerEmbeddedHtmlB64 || '';
        if (!socialManagerHtmlB64) {
            frame.srcdoc = '<p style="padding:16px;font-family:Arial,sans-serif;">Social Manager payload not found.</p>';
            return;
        }

        if (!forceReload && frame.dataset.loaded === '1') {
            syncFrameTheme(frame);
            return;
        }

        frame.srcdoc = decodeBase64Utf8(socialManagerHtmlB64);
        frame.dataset.loaded = '1';
    }

    function ensureThemeObserver() {
        if (window.__socialManagerThemeObserverBound) return;
        if (typeof MutationObserver === 'undefined') return;

        const root = document.documentElement;
        if (!root) return;

        let queued = false;
        const enqueueThemeSync = function () {
            if (queued) return;
            queued = true;
            const runner = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
            runner(function () {
                queued = false;
                syncFrameTheme(getFrame());
            });
        };

        const observer = new MutationObserver(enqueueThemeSync);
        observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
        window.__socialManagerThemeObserverBound = true;
    }

    window.openSocialManagerModal = function () {
        const modal = ensureModal();
        if (!modal) return;
        ensureThemeObserver();
        loadToolHtml(false);
        modal.style.display = 'flex';
    };

    window.closeSocialManagerModal = function () {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        modal.style.display = 'none';
    };

    window.reloadSocialManagerModal = function () {
        loadToolHtml(true);
    };

    window.handleSocialManagerOverlayClick = function (event) {
        if (event && event.target && event.target.id === MODAL_ID) {
            window.closeSocialManagerModal();
        }
    };

    window.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        const modal = document.getElementById(MODAL_ID);
        if (!modal || modal.style.display !== 'flex') return;
        window.closeSocialManagerModal();
    });
})();
