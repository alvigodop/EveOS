window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;

    const MODAL_ID = 'bookmarkFocusModal';
    const POPUP_BOOTSTRAP_STYLE = 'js/modules/features/scraper/ui/popup-manager/popup-manager.css?v=1.0.1';
    const POPUP_BOOTSTRAP_SCRIPTS = [
        {
            src: 'js/modules/features/scraper/ui/popup-manager/components/popup-history.js',
            isReady: () => !!window.PopupHistory
        },
        {
            src: 'js/modules/features/scraper/ui/popup-manager/components/popup-confirmation.js',
            isReady: () => !!window.PopupConfirmation
        },
        {
            src: 'js/modules/features/scraper/ui/popup-manager/components/viewer/pv-ui.js?v=1.0.1',
            isReady: () => !!window.PVUI
        },
        {
            src: 'js/modules/features/scraper/ui/popup-manager/components/viewer/pv-loader.js?v=1.0.1',
            isReady: () => !!window.PVLoader
        },
        {
            src: 'js/modules/features/scraper/ui/popup-manager/components/viewer/pv-state.js',
            isReady: () => !!window.PVState
        },
        {
            src: 'js/modules/features/scraper/ui/popup-manager/components/popup-viewer.js?v=1.0.1',
            isReady: () => !!window.PopupViewer
        },
        {
            src: 'js/modules/features/scraper/ui/popup-manager/popup-manager.js?v=1.0.2',
            isReady: () => !!(window.PopupManager && typeof window.PopupManager.openPopup === 'function')
        }
    ];

    function toId(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeList(values) {
        const source = [];
        function collect(value) {
            if (Array.isArray(value)) {
                value.forEach(collect);
                return;
            }
            if (value && typeof value === 'object') {
                Object.values(value).forEach(collect);
                return;
            }
            String(value || '').split(/[|,;]/).forEach(item => source.push(item));
        }
        collect(values);
        const seen = new Set();
        return source
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function mergeUniqueLists() {
        const seen = new Set();
        const output = [];
        Array.from(arguments).forEach((list) => {
            normalizeList(list).forEach((item) => {
                const key = item.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                output.push(item);
            });
        });
        return output;
    }

    function getEntryTitleAliases(entry) {
        const primaryTitle = String(entry?.title || '').trim().toLowerCase();
        return mergeUniqueLists(
            entry?.titleAltNames,
            entry?.altTitles,
            entry?.alternativeTitles,
            entry?.aliases
        ).filter((item) => item.toLowerCase() !== primaryTitle);
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function findLinkById(linkId) {
        const target = toId(linkId);
        if (!target) return null;
        const indexApi = getDatapackIndexApi();
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            const resolved = indexApi.resolveBookmarkLink(target);
            if (resolved) return resolved;
        }
        return getLinks().find(item => toId(item.id) === target) || null;
    }

    function getCurrentLinkId() {
        return document.getElementById('bookmarkFocusId')?.value || '';
    }

    function ensureModalAvailable() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;
        if (typeof initModals === 'function') {
            initModals();
            modal = document.getElementById(MODAL_ID);
        }
        return modal;
    }

    function openInNewTab(url) {
        const safeUrl = normalizeUrl(String(url || '').trim());
        if (!safeUrl) return;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
    }

    function hasPopupViewerRuntime() {
        return !!(
            window.PopupManager
            && typeof window.PopupManager.openPopup === 'function'
            && window.PopupViewer
            && window.PVUI
            && window.PVLoader
        );
    }

    function ensurePopupViewerStyles() {
        if (document.querySelector(`link[data-eve-popup-style="${POPUP_BOOTSTRAP_STYLE}"]`)) {
            return;
        }

        const normalizedHref = String(POPUP_BOOTSTRAP_STYLE).split('?')[0];
        const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find((node) => {
            const href = String(node.getAttribute('href') || '');
            return href.includes(normalizedHref);
        });
        if (existingLink) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = POPUP_BOOTSTRAP_STYLE;
        link.dataset.evePopupStyle = POPUP_BOOTSTRAP_STYLE;
        document.head.appendChild(link);
    }

    function normalizePopupAssetPath(value) {
        return String(value || '').trim().split('?')[0];
    }

    function findExistingPopupScript(src) {
        const normalizedSrc = normalizePopupAssetPath(src);
        return Array.from(document.querySelectorAll('script[src]')).find((node) => {
            const nodeSrc = String(node.getAttribute('src') || '').trim();
            return normalizePopupAssetPath(nodeSrc).endsWith(normalizedSrc);
        }) || null;
    }

    function injectPopupViewerScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.dataset.evePopupScript = src;
            script.onload = function () {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = function () {
                reject(new Error(`Failed to load script: ${src}`));
            };
            document.head.appendChild(script);
        });
    }

    function loadPopupViewerScript(definition) {
        return new Promise((resolve, reject) => {
            const normalizedSrc = String(definition?.src || definition || '').trim();
            const isReady = typeof definition?.isReady === 'function'
                ? definition.isReady
                : () => false;
            if (!normalizedSrc) {
                reject(new Error('Missing popup viewer bootstrap script path'));
                return;
            }

            if (isReady()) {
                resolve();
                return;
            }

            const existingScript = findExistingPopupScript(normalizedSrc);
            if (existingScript) {
                if (isReady()) {
                    resolve();
                    return;
                }

                let settled = false;
                const startedAt = Date.now();
                const cleanup = () => {
                    if (pollTimer) clearInterval(pollTimer);
                };
                const resolveIfReady = () => {
                    if (settled || !isReady()) return false;
                    settled = true;
                    cleanup();
                    resolve();
                    return true;
                };
                const fallbackInject = () => {
                    if (settled) return;
                    cleanup();
                    injectPopupViewerScript(normalizedSrc).then(() => {
                        if (isReady()) {
                            resolve();
                            return;
                        }
                        reject(new Error(`Popup runtime script loaded without exposing expected module: ${normalizedSrc}`));
                    }).catch(reject);
                };

                const pollTimer = window.setInterval(() => {
                    if (resolveIfReady()) return;
                    if (Date.now() - startedAt >= 1200) {
                        fallbackInject();
                    }
                }, 50);

                existingScript.addEventListener('load', () => {
                    resolveIfReady();
                }, { once: true });
                existingScript.addEventListener('error', () => {
                    fallbackInject();
                }, { once: true });
                return;
            }

            injectPopupViewerScript(normalizedSrc).then(() => {
                if (isReady()) {
                    resolve();
                    return;
                }
                reject(new Error(`Popup runtime script loaded without exposing expected module: ${normalizedSrc}`));
            }).catch(reject);
        });
    }

    function ensurePopupManagerReady() {
        if (!window.PopupManager || typeof window.PopupManager.openPopup !== 'function') {
            return false;
        }
        if (!window.PopupManager._initialized && typeof window.PopupManager.init === 'function') {
            window.PopupManager.init();
        }
        return hasPopupViewerRuntime();
    }

    function openPopupManagerView(url, title) {
        const safeUrl = normalizeUrl(String(url || '').trim());
        if (!safeUrl || !ensurePopupManagerReady()) {
            return false;
        }
        const opened = window.PopupManager.openPopup(safeUrl, String(title || safeUrl).trim() || safeUrl);
        if (opened) {
            return true;
        }

        window.setTimeout(() => {
            const popup = document.getElementById('wikiPopup');
            if (!popup || popup.classList.contains('active')) {
                return;
            }
            try {
                window.PopupManager.openPopup(safeUrl, String(title || safeUrl).trim() || safeUrl);
            } catch (error) {
                console.warn('[BookmarkFocus] Retrying internal popup open failed:', error);
            }
        }, 80);

        return true;
    }

    function ensurePopupViewerRuntime() {
        if (hasPopupViewerRuntime()) {
            return Promise.resolve(true);
        }

        if (!ns._popupBootstrapPromise) {
            ns._popupBootstrapPromise = (async function bootstrapPopupViewer() {
                ensurePopupViewerStyles();
                for (const scriptDefinition of POPUP_BOOTSTRAP_SCRIPTS) {
                    await loadPopupViewerScript(scriptDefinition);
                }
                return ensurePopupManagerReady();
            })().catch((error) => {
                console.warn('[BookmarkFocus] Popup viewer bootstrap failed:', error);
                return false;
            }).finally(() => {
                ns._popupBootstrapPromise = null;
            });
        }

        return ns._popupBootstrapPromise;
    }

    function openInternalView(url, title) {
        const safeUrl = normalizeUrl(String(url || '').trim());
        if (!safeUrl) return false;
        const safeTitle = String(title || safeUrl).trim() || safeUrl;

        if (hasPopupViewerRuntime()) {
            return openPopupManagerView(safeUrl, safeTitle);
        }

        ensurePopupViewerRuntime().then((ready) => {
            if (ready) {
                openPopupManagerView(safeUrl, safeTitle);
                return;
            }
            openInNewTab(safeUrl);
        });
        return true;
    }

    function openBookmarkTarget(url, title, target) {
        const normalizedTarget = String(target || 'newtab').trim().toLowerCase();
        if (normalizedTarget === 'internal') {
            return openInternalView(url, title);
        }
        openInNewTab(url);
        return true;
    }

    function normalizeTargetOverride(link, options) {
        const rawUrl = String(options?.overrideUrl || options?.targetUrl || options?.url || '').trim();
        const safeUrl = rawUrl ? normalizeUrl(rawUrl) : '';
        if (!safeUrl) return null;
        const linkUrl = normalizeUrl(String(link?.url || '').trim());
        const relatedIndex = Number.parseInt(options?.relatedIndex ?? options?.index ?? '', 10);
        return {
            linkId: toId(link?.id),
            url: safeUrl,
            title: String(options?.overrideTitle || options?.targetTitle || options?.title || safeUrl).trim() || safeUrl,
            label: String(options?.targetLabel || options?.label || 'Related URL').trim() || 'Related URL',
            relatedIndex: Number.isInteger(relatedIndex) && relatedIndex >= 0 ? relatedIndex : null,
            targetKey: String(options?.targetKey || '').trim(),
            isDifferentTarget: safeUrl !== linkUrl
        };
    }

    ns._viewShared = {
        MODAL_ID,
        toId,
        escapeHtml,
        normalizeList,
        mergeUniqueLists,
        getEntryTitleAliases,
        getDatapackIndexApi,
        getLinks,
        findLinkById,
        getCurrentLinkId,
        ensureModalAvailable,
        openInNewTab,
        ensurePopupViewerRuntime,
        openInternalView,
        openBookmarkTarget,
        normalizeTargetOverride
    };
    Object.assign(ns, {
        MODAL_ID,
        toId,
        getLinks,
        findLinkById,
        getCurrentLinkId,
        ensureModalAvailable,
        openInNewTab,
        ensurePopupViewerRuntime,
        openInternalView,
        openBookmarkTarget,
        normalizeTargetOverride
    });
})();
