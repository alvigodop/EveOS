// --- BOOKMARK FOCUS MODAL VIEW HELPERS ---
window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;
    if (ns.viewReady) return;
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

    function refreshHeader(link) {
        const titleElement = document.getElementById('bookmarkFocusTitle');
        const urlElement = document.getElementById('bookmarkFocusUrl');
        if (titleElement) titleElement.textContent = link?.title || 'Untitled';
        if (urlElement) {
            const safeUrl = normalizeUrl(String(link?.url || '').trim());
            urlElement.textContent = safeUrl || '';
            urlElement.href = safeUrl || '#';
        }
    }

    function refreshActionButtons(link) {
        const pinBtn = document.getElementById('bookmarkFocusPinBtn');
        const doneBtn = document.getElementById('bookmarkFocusDoneBtn');
        const isTaskEnabled = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? !!window.EveBookmarkFolders.isTaskEnabledForLink(link)
            : true;
        if (pinBtn) {
            const isPinned = !!window.EveQuickPins?.isBookmarkPinned?.(link?.id);
            pinBtn.textContent = isPinned ? 'Unpin' : 'Pin';
        }
        if (doneBtn) {
            doneBtn.style.display = isTaskEnabled ? '' : 'none';
            doneBtn.textContent = link?.done ? 'Mark Pending' : 'Mark Done';
        }
    }

    function setLibraryControlsEnabled(isEnabled) {
        const saveBtn = document.getElementById('bookmarkFocusSaveLibraryBtn');
        const recalibrateBtn = document.getElementById('bookmarkFocusRecalibrateBtn');
        if (saveBtn) saveBtn.disabled = !isEnabled;
        if (recalibrateBtn) recalibrateBtn.disabled = !isEnabled;
    }

    function getStatusOptions(categoryName) {
        const state = window.EveLibrary?.State;
        const fallback = ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Hiatus'];
        if (!state) return fallback;
        const dataTypeName = state.getCategoryDataType(categoryName || 'Unsorted');
        const dataType = state.getDataType(dataTypeName);
        const options = Array.isArray(dataType?.statuses) ? dataType.statuses : [];
        return options.length ? options : fallback;
    }

    function renderStatusOptions(categoryName, selectedStatus) {
        const select = document.getElementById('bookmarkFocusStatus');
        if (!select) return;
        const options = getStatusOptions(categoryName);
        const normalizedSelected = String(selectedStatus || '').trim().toLowerCase();
        const html = ['<option value="">Status</option>']
            .concat(options.map(status => `<option value="${status}">${status}</option>`))
            .join('');
        select.innerHTML = html;
        const selectedMatch = options.find(status => status.trim().toLowerCase() === normalizedSelected);
        if (selectedMatch) select.value = selectedMatch;
    }

    function updateProgressVisibility(entry, categoryName) {
        const state = window.EveLibrary?.State;
        const fallbackType = state?.getCategoryDataType(categoryName || 'Unsorted') || 'graphicNovels';
        const mediaTypes = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length
            ? entry.mediaTypes
            : [fallbackType];

        const hasGraphic = mediaTypes.includes('graphicNovels');
        const hasNovels = mediaTypes.includes('novels');
        const hasFilms = mediaTypes.includes('films');

        const graphicWrap = document.getElementById('bookmarkFocusGraphicWrap');
        const novelWrap = document.getElementById('bookmarkFocusNovelWrap');
        const seasonWrap = document.getElementById('bookmarkFocusSeasonWrap');
        const episodeWrap = document.getElementById('bookmarkFocusEpisodeWrap');

        if (graphicWrap) graphicWrap.style.display = hasGraphic ? 'flex' : 'none';
        if (novelWrap) novelWrap.style.display = hasNovels ? 'flex' : 'none';
        if (seasonWrap) seasonWrap.style.display = hasFilms ? 'flex' : 'none';
        if (episodeWrap) episodeWrap.style.display = hasFilms ? 'flex' : 'none';
    }

    function fillLibraryFields(linkedRecord) {
        const sectionWrap = document.getElementById('bookmarkFocusLibrarySection');
        const fieldsWrap = document.getElementById('bookmarkFocusLibraryFields');
        const missingText = document.getElementById('bookmarkFocusLibraryMissing');
        const categoryLabel = document.getElementById('bookmarkFocusLibraryCategory');

        if (!linkedRecord?.entry) {
            if (sectionWrap) sectionWrap.style.display = 'none';
            if (fieldsWrap) fieldsWrap.style.display = 'none';
            if (missingText) missingText.style.display = 'block';
            if (categoryLabel) categoryLabel.textContent = '';
            setLibraryControlsEnabled(false);
            return null;
        }

        const entry = linkedRecord.entry;
        const categoryName = linkedRecord.connection?.categoryName || 'Unsorted';

        if (sectionWrap) sectionWrap.style.display = 'flex';
        if (fieldsWrap) fieldsWrap.style.display = 'flex';
        if (missingText) missingText.style.display = 'none';
        if (categoryLabel) categoryLabel.textContent = `Category: ${categoryName}`;
        setLibraryControlsEnabled(true);

        renderStatusOptions(categoryName, entry.status || '');

        const rating = document.getElementById('bookmarkFocusRating');
        const graphic = document.getElementById('bookmarkFocusGraphicChapter');
        const novel = document.getElementById('bookmarkFocusNovelChapter');
        const season = document.getElementById('bookmarkFocusSeason');
        const episode = document.getElementById('bookmarkFocusEpisode');
        const summary = document.getElementById('bookmarkFocusSummary');

        if (rating) rating.value = entry.rating || '';
        if (graphic) graphic.value = entry.graphicChapter ?? entry.chapter ?? 0;
        if (novel) novel.value = entry.novelChapter ?? 0;
        if (season) season.value = entry.season ?? 0;
        if (episode) episode.value = entry.episode ?? 0;
        if (summary) summary.value = entry.summary || '';

        updateProgressVisibility(entry, categoryName);
        return linkedRecord;
    }

    function loadLinkedRecord(linkId) {
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry) {
            fillLibraryFields(null);
            return null;
        }
        const linked = api.getLinkedEntry(linkId);
        return fillLibraryFields(linked);
    }

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
        refreshHeader,
        refreshActionButtons,
        loadLinkedRecord
    });
    ns.viewReady = true;
})();
