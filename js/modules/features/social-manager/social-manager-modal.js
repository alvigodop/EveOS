// --- SOCIAL MANAGER MODAL ---
(function () {
    const MODAL_ID = 'socialManagerModal';
    const IFRAME_ID = 'socialManagerFrame';
    const THEME_STYLE_ID = 'eveSocialThemeBridge';
    const POPUP_STYLE_ID = 'eveSocialPopupBridgeStyle';
    const POPUP_ACTIONS_ID = 'eveSocialPopupActions';

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

    function ensureEmbeddedPopupStyle(doc) {
        if (!doc) return;
        const head = doc.head || doc.getElementsByTagName('head')[0];
        if (!head) return;

        let style = doc.getElementById(POPUP_STYLE_ID);
        if (!style) {
            style = doc.createElement('style');
            style.id = POPUP_STYLE_ID;
            head.appendChild(style);
        }

        style.textContent = `
#instaPopup.popup-overlay{
  z-index:1200 !important;
}
#instaPopup .popup-content{
  width:min(1200px, 96vw) !important;
  max-width:1200px !important;
  height:min(88vh, 920px) !important;
}
#instaPopup .popup-header{
  gap:12px !important;
}
#instaPopup .popup-iframe-container{
  background:#ffffff !important;
  min-height:0 !important;
}
#instaPopup .popup-iframe{
  background:#ffffff !important;
}
#${POPUP_ACTIONS_ID}{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  padding:12px 16px;
  border-top:1px solid var(--border);
  background:var(--card);
  flex-wrap:wrap;
}
#${POPUP_ACTIONS_ID} .status{
  font-size:0.82rem;
  opacity:0.8;
}
#${POPUP_ACTIONS_ID} .controls{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  justify-content:flex-end;
}
`;
    }

    function ensureEmbeddedPopupActions(doc, win) {
        const popup = doc.getElementById('instaPopup');
        const content = popup?.querySelector('.popup-content');
        if (!content) return null;

        let actions = doc.getElementById(POPUP_ACTIONS_ID);
        if (!actions) {
            actions = doc.createElement('div');
            actions.id = POPUP_ACTIONS_ID;
            actions.innerHTML = `
<div class="status" data-role="status">Bridge view ready</div>
<div class="controls">
  <button type="button" class="btn-outline btn-sm" data-role="reload">Reload View</button>
  <button type="button" class="btn-success btn-sm" data-role="approve">Approve</button>
  <button type="button" class="btn-outline btn-sm" style="color:#6b7280; border-color:#9ca3af;" data-role="na">N/A</button>
  <button type="button" class="btn-outline btn-sm" style="color:red; border-color:red;" data-role="deny">✕</button>
</div>`;
            content.appendChild(actions);
        }

        const status = actions.querySelector('[data-role="status"]');
        const reloadButton = actions.querySelector('[data-role="reload"]');
        const approveButton = actions.querySelector('[data-role="approve"]');
        const naButton = actions.querySelector('[data-role="na"]');
        const denyButton = actions.querySelector('[data-role="deny"]');

        if (reloadButton) {
            reloadButton.onclick = function () {
                const current = win.__eveSocialPopupCurrent;
                if (current) {
                    win.openPopup(current.id, current.site);
                }
            };
        }

        if (approveButton) {
            approveButton.onclick = function () {
                if (typeof win.overlayApprove === 'function') win.overlayApprove();
                if (typeof win.closePopup === 'function') win.closePopup();
            };
        }

        if (naButton) {
            naButton.onclick = function () {
                if (typeof win.overlayNA === 'function') win.overlayNA();
                if (typeof win.closePopup === 'function') win.closePopup();
            };
        }

        if (denyButton) {
            denyButton.onclick = function () {
                if (typeof win.overlayDeny === 'function') win.overlayDeny();
                if (typeof win.closePopup === 'function') win.closePopup();
            };
        }

        return { status };
    }

    function installEmbeddedPopupBridge(frame) {
        if (!frame) return;

        try {
            const win = frame.contentWindow;
            const doc = frame.contentDocument;
            if (!win || !doc || typeof win.openPopup !== 'function') return;

            const originalOpenPopup = win.__eveSocialOriginalOpenPopup || win.openPopup.bind(win);
            win.__eveSocialOriginalOpenPopup = originalOpenPopup;
            const originalOverlayApprove = win.__eveSocialOriginalOverlayApprove || (typeof win.overlayApprove === 'function' ? win.overlayApprove.bind(win) : null);
            const originalOverlayNA = win.__eveSocialOriginalOverlayNA || (typeof win.overlayNA === 'function' ? win.overlayNA.bind(win) : null);
            const originalOverlayDeny = win.__eveSocialOriginalOverlayDeny || (typeof win.overlayDeny === 'function' ? win.overlayDeny.bind(win) : null);
            win.__eveSocialOriginalOverlayApprove = originalOverlayApprove;
            win.__eveSocialOriginalOverlayNA = originalOverlayNA;
            win.__eveSocialOriginalOverlayDeny = originalOverlayDeny;

            const popup = doc.getElementById('instaPopup');
            const popupFrame = doc.getElementById('popupFrame');
            const popupTitle = doc.getElementById('popupTitle');
            const popupRealLink = doc.getElementById('popupRealLink');
            if (!popup || !popupFrame || !popupTitle || !popupRealLink) return;

            popup.style.removeProperty('display');
            ensureEmbeddedPopupStyle(doc);
            const actions = ensureEmbeddedPopupActions(doc, win);

            win.overlayApprove = function () {
                const current = win.__eveSocialPopupCurrent;
                if (current && typeof win.approveOne === 'function') {
                    win.approveOne(current.id);
                    return;
                }
                if (originalOverlayApprove) {
                    return originalOverlayApprove();
                }
            };

            win.overlayNA = function () {
                const current = win.__eveSocialPopupCurrent;
                if (current && typeof win.markAsNA === 'function') {
                    win.markAsNA(current.id);
                    return;
                }
                if (originalOverlayNA) {
                    return originalOverlayNA();
                }
            };

            win.overlayDeny = function () {
                const current = win.__eveSocialPopupCurrent;
                if (current && typeof win.removeOneNew === 'function') {
                    win.removeOneNew(current.id);
                    return;
                }
                if (originalOverlayDeny) {
                    return originalOverlayDeny();
                }
            };

            win.closePopup = function () {
                popup.classList.remove('active');
                popupFrame.src = '';
                doc.body.style.overflow = '';
                win.__eveSocialPopupCurrent = null;
                if (actions?.status) actions.status.textContent = 'Bridge view ready';
            };

            win.openPopup = async function (id, site = 'instagram') {
                const descriptor = buildSocialPopupDescriptor(id, site);
                const viewerUrl = await resolvePopupViewerUrl(descriptor.targetUrl);
                const canEmbed = canUseEmbeddedPopupViewer(descriptor.targetUrl, viewerUrl);

                if (!canEmbed) {
                    if (actions?.status) {
                        actions.status.textContent = 'Bridge unavailable. Using external popup.';
                    }
                    return originalOpenPopup(id, site);
                }

                const dimmingOverlay = doc.getElementById('dimmingOverlay');
                if (dimmingOverlay) {
                    dimmingOverlay.classList.remove('active');
                }

                popupTitle.textContent = descriptor.title;
                popupRealLink.href = descriptor.targetUrl;
                popupRealLink.target = '_blank';
                popupRealLink.rel = 'noopener noreferrer';
                popupRealLink.textContent = descriptor.realLinkLabel;
                popupFrame.src = viewerUrl;
                popup.classList.add('active');
                doc.body.style.overflow = 'hidden';
                win.__eveSocialPopupCurrent = { id, site, targetUrl: descriptor.targetUrl, viewerUrl };
                if (actions?.status) {
                    actions.status.textContent = viewerUrl === descriptor.targetUrl
                        ? 'Embedded direct view active'
                        : 'Bridge view active';
                }
            };
        } catch (error) {
            console.warn('Social Manager popup bridge install failed:', error);
        }
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
            installEmbeddedPopupBridge(frame);
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
            installEmbeddedPopupBridge(frame);
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
