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

    function getDomainFromUrl(url) {
        try {
            return new URL(normalizeUrl(String(url || '').trim())).hostname.replace(/^www\./i, '');
        } catch (error) {
            return '';
        }
    }

    function getRelatedUrlEntries(link) {
        const rawEntries = Array.isArray(link?.relatedUrls) ? link.relatedUrls : [];
        const seen = new Set();
        return rawEntries.map((entry, rawIndex) => {
            const source = typeof entry === 'string' ? { url: entry } : (entry || {});
            const url = normalizeUrl(String(source.url || source.href || source.sourceUrl || '').trim());
            if (!url) return null;
            const dedupeKey = url.toLowerCase();
            if (seen.has(dedupeKey)) return null;
            seen.add(dedupeKey);
            const domain = getDomainFromUrl(url);
            const label = String(source.label || source.title || domain || url).trim() || url;
            return {
                rawIndex,
                url,
                domain,
                title: String(source.title || label).trim() || label,
                label,
                notes: String(source.notes || '').trim(),
                source: String(source.source || '').trim(),
                addedAt: String(source.addedAt || '').trim()
            };
        }).filter(Boolean);
    }

    function getIdentifierDefinitionsForLink(link) {
        const ids = window.EveBookmarkIdentifiers?.getIdentifiersForLink
            ? window.EveBookmarkIdentifiers.getIdentifiersForLink(link)
            : (Array.isArray(link?.identifiers) ? link.identifiers : []);
        const definitions = window.EveBookmarkIdentifiers?.getDefinitions
            ? window.EveBookmarkIdentifiers.getDefinitions()
            : [];
        const map = new Map((Array.isArray(definitions) ? definitions : []).map((definition) => [
            String(definition?.id || '').trim(),
            definition
        ]));
        return (Array.isArray(ids) ? ids : []).map((id) => {
            const key = String(id || '').trim();
            const definition = map.get(key);
            return {
                id: key,
                label: String(definition?.label || key || 'Label').trim() || 'Label',
                icon: String(definition?.icon || '').trim(),
                color: String(definition?.color || '#5b8def').trim() || '#5b8def',
                description: String(definition?.description || '').trim()
            };
        }).filter((definition) => definition.id);
    }

    function hexToRgbParts(value) {
        const raw = String(value || '').trim();
        let hex = /^#[0-9a-f]{6}$/i.test(raw) ? raw.slice(1) : '';
        if (!hex && /^#[0-9a-f]{3}$/i.test(raw)) {
            hex = raw.slice(1).split('').map((part) => part + part).join('');
        }
        if (!hex) hex = '5b8def';
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    function renderFocusIdentifierDetails(link) {
        const panel = document.getElementById('bookmarkFocusIdentifierPanel');
        if (!panel) return 0;
        const identifiers = getIdentifierDefinitionsForLink(link);
        if (!identifiers.length) {
            panel.innerHTML = '<div class="bookmark-focus-context-empty">No bookmark labels attached.</div>';
            return 0;
        }
        panel.innerHTML = identifiers.map((identifier) => {
            const rgb = hexToRgbParts(identifier.color);
            const style = [
                'color:' + escapeHtml(identifier.color),
                'border-color:rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.38)',
                'background:rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.14)'
            ].join(';');
            const icon = identifier.icon
                ? '<span class="bookmark-focus-label-icon">' + escapeHtml(identifier.icon) + '</span>'
                : '';
            return ''
                + '<div class="bookmark-focus-label-card" style="' + style + '" title="' + escapeHtml(identifier.description || identifier.label) + '">'
                +   '<div class="bookmark-focus-label-title">' + icon + '<span>' + escapeHtml(identifier.label) + '</span></div>'
                +   (identifier.description ? '<div class="bookmark-focus-label-desc">' + escapeHtml(identifier.description) + '</div>' : '')
                + '</div>';
        }).join('');
        return identifiers.length;
    }

    function renderFocusRelatedUrlDetails(link, selectedKey) {
        const panel = document.getElementById('bookmarkFocusRelatedUrlPanel');
        if (!panel) return 0;
        const entries = getRelatedUrlEntries(link);
        if (!entries.length) {
            panel.innerHTML = '<div class="bookmark-focus-context-empty">No related URLs attached.</div>';
            return 0;
        }
        panel.innerHTML = entries.map((entry, index) => {
            const targetKey = 'related:' + index;
            const isActive = selectedKey === targetKey;
            const notesHtml = entry.notes
                ? '<div class="bookmark-focus-related-notes">' + escapeHtml(entry.notes) + '</div>'
                : '<div class="bookmark-focus-related-notes is-empty">No notes for this related URL.</div>';
            const sourceMeta = entry.source || entry.addedAt
                ? '<span>' + escapeHtml([entry.source, entry.addedAt].filter(Boolean).join(' / ')) + '</span>'
                : '';
            return ''
                + '<div class="bookmark-focus-related-row' + (isActive ? ' is-active' : '') + '">'
                +   '<div class="bookmark-focus-related-main">'
                +     '<div class="bookmark-focus-related-head">'
                +       '<strong>' + escapeHtml(entry.label) + '</strong>'
                +       '<span>' + escapeHtml(entry.domain || 'related link') + '</span>'
                +       sourceMeta
                +     '</div>'
                +     '<a href="' + escapeHtml(entry.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(entry.url) + '</a>'
                +     notesHtml
                +   '</div>'
                +   '<button type="button" data-focus-related-target="' + escapeHtml(targetKey) + '" onclick="bookmarkFocusChangeTarget(this.dataset.focusRelatedTarget)">' + (isActive ? 'Active' : 'Use') + '</button>'
                + '</div>';
        }).join('');
        return entries.length;
    }

    function refreshFocusContext(link, options) {
        const section = document.getElementById('bookmarkFocusContextSection');
        const summary = document.getElementById('bookmarkFocusContextSummary');
        if (!section) return;
        const selectedKey = getTargetKeyForOverride(link, options);
        const labelCount = renderFocusIdentifierDetails(link);
        const relatedCount = renderFocusRelatedUrlDetails(link, selectedKey);
        if (summary) {
            const parts = [];
            parts.push(labelCount === 1 ? '1 label' : labelCount + ' labels');
            parts.push(relatedCount === 1 ? '1 related URL' : relatedCount + ' related URLs');
            summary.textContent = parts.join(' - ');
        }
    }

    function getRelatedUrlTargets(link) {
        const targets = [];
        const mainUrl = normalizeUrl(String(link?.url || '').trim());
        if (mainUrl) {
            targets.push({
                key: 'main',
                kind: 'main',
                index: -1,
                url: mainUrl,
                title: String(link?.title || mainUrl).trim() || mainUrl,
                label: 'Main URL'
            });
        }
        const seen = new Set(mainUrl ? [mainUrl.toLowerCase()] : []);
        getRelatedUrlEntries(link).forEach((entry) => {
            const url = entry.url;
            const key = url.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const index = targets.filter((item) => item.kind === 'related').length;
            const title = String(entry.label || entry.title || entry.domain || url).trim() || url;
            targets.push({
                key: 'related:' + index,
                kind: 'related',
                index,
                url,
                title,
                label: title,
                notes: entry.notes,
                domain: entry.domain,
                source: entry.source
            });
        });
        return targets;
    }

    function getTargetKeyForOverride(link, options) {
        const targetOverride = normalizeTargetOverride(link, options);
        if (!targetOverride?.isDifferentTarget) return 'main';
        const targets = getRelatedUrlTargets(link);
        if (targetOverride.targetKey && targets.some((target) => target.key === targetOverride.targetKey)) {
            return targetOverride.targetKey;
        }
        if (Number.isInteger(targetOverride.relatedIndex)) {
            const indexKey = 'related:' + targetOverride.relatedIndex;
            if (targets.some((target) => target.key === indexKey)) return indexKey;
        }
        const match = targets.find((target) => target.kind === 'related' && target.url === targetOverride.url);
        return match?.key || 'main';
    }

    function getTargetOverrideForOption(link, targetKey) {
        const normalizedKey = String(targetKey || 'main').trim() || 'main';
        if (normalizedKey === 'main') return null;
        const target = getRelatedUrlTargets(link).find((item) => item.key === normalizedKey);
        if (!target || target.kind !== 'related') return null;
        return normalizeTargetOverride(link, {
            overrideUrl: target.url,
            overrideTitle: target.title,
            targetLabel: 'Related URL',
            relatedIndex: target.index,
            targetKey: target.key
        });
    }

    function refreshTargetSwitcher(link, options) {
        const wrap = document.getElementById('bookmarkFocusTargetSwitcher');
        const select = document.getElementById('bookmarkFocusTargetSelect');
        const hint = document.getElementById('bookmarkFocusTargetHint');
        if (!wrap || !select) return;
        const targets = getRelatedUrlTargets(link);
        if (targets.length <= 1) {
            wrap.hidden = true;
            select.innerHTML = '';
            if (hint) hint.textContent = '';
            return;
        }
        const selectedKey = getTargetKeyForOverride(link, options);
        select.innerHTML = targets.map((target) => {
            const prefix = target.kind === 'main' ? 'Main' : 'Related';
            return '<option value="' + escapeHtml(target.key) + '">' + escapeHtml(prefix + ': ' + target.title) + '</option>';
        }).join('');
        select.value = targets.some((target) => target.key === selectedKey) ? selectedKey : 'main';
        if (hint) {
            const selected = targets.find((target) => target.key === select.value) || targets[0];
            hint.textContent = selected.kind === 'main'
                ? 'Opening the bookmark main URL.'
                : 'Opening related URL: ' + selected.url + (selected.notes ? ' - ' + selected.notes : '');
        }
        wrap.hidden = false;
    }

    function refreshHeader(link, options) {
        const titleElement = document.getElementById('bookmarkFocusTitle');
        const urlElement = document.getElementById('bookmarkFocusUrl');
        const targetOverride = normalizeTargetOverride(link, options);
        if (titleElement) titleElement.textContent = link?.title || 'Untitled';
        if (urlElement) {
            const safeUrl = targetOverride?.url || normalizeUrl(String(link?.url || '').trim());
            urlElement.textContent = targetOverride?.isDifferentTarget
                ? targetOverride.label + ': ' + safeUrl
                : (safeUrl || '');
            urlElement.href = safeUrl || '#';
            urlElement.title = targetOverride?.isDifferentTarget
                ? (targetOverride.title + ' - ' + safeUrl)
                : (safeUrl || '');
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

    function getStatusOptions(categoryName, entry) {
        const state = window.EveLibrary?.State;
        const fallback = ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Hiatus'];
        if (!state) return fallback;
        const fallbackType = state.getCategoryDataType(categoryName || 'Unsorted');
        const mediaTypes = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length
            ? entry.mediaTypes
            : [fallbackType];
        if (typeof state.getStatusOptionsForMediaTypes === 'function') {
            const options = state.getStatusOptionsForMediaTypes(mediaTypes, fallbackType);
            return options.length ? options : fallback;
        }
        const dataTypeName = state.getCategoryDataType(categoryName || 'Unsorted');
        const dataType = state.getDataType(dataTypeName);
        const options = Array.isArray(dataType?.statuses) ? dataType.statuses : [];
        return options.length ? options : fallback;
    }

    function renderStatusOptions(categoryName, selectedStatus, entry) {
        const select = document.getElementById('bookmarkFocusStatus');
        if (!select) return;
        const options = getStatusOptions(categoryName, entry);
        const normalizedSelected = String(selectedStatus || '').trim().toLowerCase();
        const safeOptions = options.slice();
        if (normalizedSelected && !safeOptions.some(status => status.trim().toLowerCase() === normalizedSelected)) {
            safeOptions.unshift(String(selectedStatus || '').trim());
        }
        const html = ['<option value="">Status</option>']
            .concat(safeOptions.map(status => `<option value="${status}">${status}</option>`))
            .join('');
        select.innerHTML = html;
        const selectedMatch = safeOptions.find(status => status.trim().toLowerCase() === normalizedSelected);
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

    function findLiveLink(linkId) {
        const links = typeof getLiveLinks === 'function'
            ? getLiveLinks()
            : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
        return (Array.isArray(links) ? links : []).find((link) => String(link?.id) === String(linkId));
    }

    function mergeBookmarkNotesIntoFocusSummary(linkId) {
        const summary = document.getElementById('bookmarkFocusSummary');
        const linkNotes = String(findLiveLink(linkId)?.notes || '').trim();
        if (!summary || !linkNotes || !linkNotes.includes('=== Bookmark Merge ===')) return;
        if (!summary.value.includes(linkNotes)) {
            summary.value = [summary.value.trim(), linkNotes].filter(Boolean).join('\n\n');
        }
        window.EveLibraryNotesSections?.syncFocusFromRaw?.();
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

        renderStatusOptions(categoryName, entry.status || '', entry);

        const rating = document.getElementById('bookmarkFocusRating');
        const graphic = document.getElementById('bookmarkFocusGraphicChapter');
        const novel = document.getElementById('bookmarkFocusNovelChapter');
        const season = document.getElementById('bookmarkFocusSeason');
        const episode = document.getElementById('bookmarkFocusEpisode');
        const summary = document.getElementById('bookmarkFocusSummary');
        const primaryTitle = document.getElementById('bookmarkFocusPrimaryTitle');
        const titleAltNames = document.getElementById('bookmarkFocusTitleAltNames');
        const aliasHint = document.getElementById('bookmarkFocusAliasHint');
        const aliasSection = document.getElementById('bookmarkFocusAliasSection');
        const aliasSummary = document.getElementById('bookmarkFocusAliasSummary');

        if (rating) rating.value = entry.rating || '';
        if (graphic) graphic.value = entry.graphicChapter ?? entry.chapter ?? 0;
        if (novel) novel.value = entry.novelChapter ?? 0;
        if (season) season.value = entry.season ?? 0;
        if (episode) episode.value = entry.episode ?? 0;
        if (summary) summary.value = entry.summary || '';
        window.EveLibraryNotesSections?.syncFocusFromRaw?.();
        mergeBookmarkNotesIntoFocusSummary(linkedRecord?.connection?.linkId || linkedRecord?.linkId);
        if (primaryTitle) primaryTitle.value = entry.title || '';
        if (titleAltNames) {
            const aliases = getEntryTitleAliases(entry);
            titleAltNames.value = aliases.join(', ');
            if (aliasSection) aliasSection.open = false;
            if (aliasSummary) {
                const primary = String(entry.title || '').trim() || 'Untitled';
                aliasSummary.textContent = aliases.length
                    ? `${primary} | ${aliases.length} alias${aliases.length === 1 ? '' : 'es'}`
                    : primary;
            }
            if (aliasHint) {
                aliasHint.textContent = aliases.length
                    ? `${aliases.length} alternate name${aliases.length === 1 ? '' : 's'} attached to this library entry.`
                    : 'No alternate names yet. Add translated, romanized, or source-specific titles here.';
            }
        }

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
        normalizeTargetOverride,
        getTargetOverrideForOption,
        refreshTargetSwitcher,
        refreshFocusContext,
        refreshHeader,
        refreshActionButtons,
        loadLinkedRecord
    });
    ns.viewReady = true;
})();
