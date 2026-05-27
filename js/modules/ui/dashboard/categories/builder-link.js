window.DashboardCategories = window.DashboardCategories || {};

(function () {
    const BOOKMARK_HOVER_SHOW_DELAY_MS = 110;
    const RELATED_URL_ICON_CYCLE_MS = 3600;
    let bookmarkCoverHoverShowTimer = 0;
    let bookmarkCoverHoverMoveRaf = 0;
    let bookmarkCoverHoverActiveLinkId = '';
    let bookmarkCoverHoverPendingLinkId = '';
    let bookmarkCoverHoverActiveTarget = null;
    let relatedUrlIconCycleTimer = 0;

    function toLinkId(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function findLinkById(linkId) {
        const targetId = toLinkId(linkId);
        if (!targetId) return null;
        const indexApi = getDatapackIndexApi();
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            const resolved = indexApi.resolveBookmarkLink(targetId);
            if (resolved) return resolved;
        }
        const linkList = getLiveLinks();
        return Array.isArray(linkList)
            ? linkList.find((entry) => toLinkId(entry?.id) === targetId) || null
            : null;
    }

    function getBookmarkHoverPreview(link) {
        if (!link) return null;
        const libraryEntry = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(link.id)?.entry || null;
        const rawCoverUrl = String(
            window.EveBookmarkCovers?.getDisplayCover?.(link, libraryEntry?.image || libraryEntry?.imageUrl)
            || link?.coverImage
            || libraryEntry?.image
            || libraryEntry?.imageUrl
            || ''
        ).trim();
        const coverUrl = (typeof window.EveBookmarkCovers?.isDisplayableCoverUrl === 'function')
            ? (window.EveBookmarkCovers.isDisplayableCoverUrl(rawCoverUrl) ? rawCoverUrl : '')
            : ((typeof window.EveBookmarkCovers?.isRenderableCoverUrl === 'function' && !window.EveBookmarkCovers.isRenderableCoverUrl(rawCoverUrl)) ? '' : rawCoverUrl);
        if (!coverUrl) return null;

        let domain = '';
        try {
            domain = new URL(link.url).hostname.replace(/^www\./i, '');
        } catch (error) {
            domain = String(link.url || '').replace(/^https?:\/\//i, '').split('/')[0];
        }

        return {
            coverUrl,
            title: String(link.title || 'Untitled').trim() || 'Untitled',
            subtitle: domain || ''
        };
    }

    function ensureBookmarkCoverHoverOverlay() {
        let overlay = document.getElementById('bookmark-cover-hover-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'bookmark-cover-hover-overlay';
        overlay.className = 'bookmark-cover-hover-overlay';
        overlay.innerHTML = ''
            + '<div class="bookmark-cover-hover-media">'
            + '  <img class="bookmark-cover-hover-image" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
            + '</div>'
            + '<div class="bookmark-cover-hover-copy">'
            + '  <div class="bookmark-cover-hover-title"></div>'
            + '  <div class="bookmark-cover-hover-subtitle"></div>'
            + '</div>';
        document.body.appendChild(overlay);
        return overlay;
    }

    function clearBookmarkCoverHoverTimers() {
        if (bookmarkCoverHoverShowTimer) {
            clearTimeout(bookmarkCoverHoverShowTimer);
            bookmarkCoverHoverShowTimer = 0;
        }
        if (bookmarkCoverHoverMoveRaf) {
            cancelAnimationFrame(bookmarkCoverHoverMoveRaf);
            bookmarkCoverHoverMoveRaf = 0;
        }
    }

    function positionBookmarkCoverHoverOverlay(target, overlay) {
        if (!target || !overlay) return;
        const rect = target.getBoundingClientRect();
        const viewportPadding = 10;
        const gap = 16;
        const overlayW = overlay.offsetWidth;
        const overlayH = overlay.offsetHeight;

        // Horizontal: prefer right of bookmark, then left, then right-align to viewport
        let left = rect.right + gap;
        if (left + overlayW > window.innerWidth - viewportPadding) {
            left = rect.left - overlayW - gap;
        }
        if (left < viewportPadding) {
            left = Math.max(viewportPadding, window.innerWidth - overlayW - viewportPadding);
        }

        // Vertical: align top of overlay with current bookmark row, bias upward
        let top = rect.top - (overlayH * 0.3);
        const maxTop = window.innerHeight - overlayH - viewportPadding;
        if (top > maxTop) top = maxTop;
        if (top < viewportPadding) top = viewportPadding;

        overlay.style.left = Math.round(left) + 'px';
        overlay.style.top = Math.round(top) + 'px';
    }

    function renderBookmarkCoverHover(target, linkId) {
        const normalizedId = toLinkId(linkId);
        const preview = getBookmarkHoverPreview(findLinkById(normalizedId));
        if (!target || !preview || !normalizedId) {
            hideBookmarkCoverHover();
            return;
        }

        const overlay = ensureBookmarkCoverHoverOverlay();
        const image = overlay.querySelector('.bookmark-cover-hover-image');
        const title = overlay.querySelector('.bookmark-cover-hover-title');
        const subtitle = overlay.querySelector('.bookmark-cover-hover-subtitle');
        if (!image || !title || !subtitle) return;

        overlay.classList.remove('is-imageless');
        title.textContent = preview.title;
        subtitle.textContent = preview.subtitle;
        image.alt = preview.title + ' cover';
        image.style.display = '';
        image.onload = function () {
            image.style.display = '';
            overlay.classList.remove('is-imageless');
        };

        if (typeof window.setupProxiedImage === 'function') {
            window.setupProxiedImage(image, preview.coverUrl);
        } else {
            image.src = preview.coverUrl;
            image.onerror = function () {
                image.style.display = 'none';
                overlay.classList.add('is-imageless');
            };
        }

        overlay.classList.add('is-visible');
        bookmarkCoverHoverActiveTarget = target;
        bookmarkCoverHoverActiveLinkId = normalizedId;
        positionBookmarkCoverHoverOverlay(target, overlay);
    }

    function showBookmarkCoverHover(event, linkId) {
        const target = event?.currentTarget;
        const normalizedId = toLinkId(linkId);
        if (!target || !normalizedId || !!window._evePerfMode) {
            hideBookmarkCoverHover();
            return;
        }

        clearBookmarkCoverHoverTimers();
        bookmarkCoverHoverPendingLinkId = normalizedId;
        bookmarkCoverHoverActiveTarget = target;

        const overlay = document.getElementById('bookmark-cover-hover-overlay');
        if (bookmarkCoverHoverActiveLinkId === normalizedId && overlay?.classList.contains('is-visible')) {
            positionBookmarkCoverHoverOverlay(target, overlay);
            return;
        }

        bookmarkCoverHoverShowTimer = setTimeout(() => {
            bookmarkCoverHoverShowTimer = 0;
            if (bookmarkCoverHoverPendingLinkId !== normalizedId || !!window._evePerfMode) return;
            renderBookmarkCoverHover(target, normalizedId);
        }, BOOKMARK_HOVER_SHOW_DELAY_MS);
    }

    function moveBookmarkCoverHover(event) {
        const target = event?.currentTarget;
        const overlay = document.getElementById('bookmark-cover-hover-overlay');
        if (!target || !overlay || !overlay.classList.contains('is-visible')) return;
        bookmarkCoverHoverActiveTarget = target;
        if (bookmarkCoverHoverMoveRaf) return;
        bookmarkCoverHoverMoveRaf = requestAnimationFrame(() => {
            bookmarkCoverHoverMoveRaf = 0;
            positionBookmarkCoverHoverOverlay(bookmarkCoverHoverActiveTarget, overlay);
        });
    }

    function hideBookmarkCoverHover() {
        clearBookmarkCoverHoverTimers();
        bookmarkCoverHoverPendingLinkId = '';
        bookmarkCoverHoverActiveLinkId = '';
        bookmarkCoverHoverActiveTarget = null;
        const overlay = document.getElementById('bookmark-cover-hover-overlay');
        if (!overlay) return;
        overlay.classList.remove('is-visible');
        overlay.classList.remove('is-imageless');
    }

    function cycleRelatedUrlIconSlot(slot) {
        if (!slot || slot.matches(':hover') || slot.querySelector(':focus')) return false;
        const buttons = Array.from(slot.querySelectorAll('.bookmark-related-url-action'));
        if (buttons.length <= 1) return false;
        const currentIndex = buttons.findIndex((button) => button.classList.contains('is-active'));
        const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
        let nextIndex = Math.floor(Math.random() * buttons.length);
        if (nextIndex === safeCurrentIndex) {
            nextIndex = (safeCurrentIndex + 1) % buttons.length;
        }
        buttons.forEach((button, index) => {
            const isActive = index === nextIndex;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-hidden', isActive ? 'false' : 'true');
            button.tabIndex = isActive ? 0 : -1;
        });
        slot.dataset.relatedUrlCycleIndex = String(nextIndex);
        return true;
    }

    function cycleRelatedUrlIconSlots() {
        if (document.hidden) return;
        document.querySelectorAll('.bookmark-related-url-icons[data-related-url-cycle="1"]').forEach(cycleRelatedUrlIconSlot);
    }

    function startRelatedUrlIconCycler() {
        if (relatedUrlIconCycleTimer) return;
        relatedUrlIconCycleTimer = window.setInterval(cycleRelatedUrlIconSlots, RELATED_URL_ICON_CYCLE_MS);
    }

    window.showBookmarkCoverHover = showBookmarkCoverHover;
    window.moveBookmarkCoverHover = moveBookmarkCoverHover;
    window.hideBookmarkCoverHover = hideBookmarkCoverHover;
    window.cycleRelatedUrlIconsNow = cycleRelatedUrlIconSlots;

    window.openRelatedUrlFromDashboard = function (event, linkId, relatedUrl, relatedTitle, relatedIndex) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();
        const safeUrl = typeof normalizeUrl === 'function'
            ? normalizeUrl(String(relatedUrl || '').trim())
            : String(relatedUrl || '').trim();
        if (!safeUrl) return false;
        const safeTitle = String(relatedTitle || safeUrl).trim() || safeUrl;
        if (typeof window.openBookmarkFromDashboard === 'function') {
            return window.openBookmarkFromDashboard(event, linkId, {
                overrideUrl: safeUrl,
                overrideTitle: safeTitle,
                targetLabel: 'Related URL',
                relatedIndex
            });
        }
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        return false;
    };

    startRelatedUrlIconCycler();
})();

window.DashboardCategories.buildLinkHtml = function (l, searchStr, activeWorkspace, workspaces, options) {
    const extraOptions = options || {};
    const renderContext = extraOptions._dashboardRenderContext || null;
    const perfMode = !!window._evePerfMode;
    const megaPerfMode = !!window._eveMegaPerfMode;
    const faviconUtils = window.EveFaviconUtils || null;
    const escapeAttr = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const escapeJsString = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/</g, '\\x3C');
    const isReservedRemoteImageUrl = (value) => {
        try {
            const host = new URL(String(value || '')).hostname.toLowerCase();
            return host === 'example'
                || host.endsWith('.example')
                || host === 'test'
                || host.endsWith('.test')
                || host === 'invalid'
                || host.endsWith('.invalid');
        } catch (error) {
            return false;
        }
    };
    const badgeWorkspaceId = String(extraOptions.dashboardWorkspaceId || activeWorkspace || '').trim()
        || String(activeWorkspace || '').trim();
    const cardWorkspaceId = String(extraOptions.cardWorkspaceId || activeWorkspace || '').trim()
        || String(activeWorkspace || '').trim();
    const linkWorkspaceId = String(l?.workspace || '').trim();
    const suppressCardWorkspaceSubtabBadge = !!extraOptions.suppressCardWorkspaceSubtabBadge
        && !!linkWorkspaceId
        && !!cardWorkspaceId
        && !!badgeWorkspaceId
        && cardWorkspaceId !== badgeWorkspaceId
        && linkWorkspaceId === cardWorkspaceId;

    // Group overview mode: each link is rendered relative to its owning group root,
    // so "main vs shortcut" badge logic works per-tab instead of against a single active tab.
    const overviewRootMap = window._eveGroupOverviewRootMap;
    const isGroupOverviewMode = !!overviewRootMap;
    if (overviewRootMap) {
        const mapped = overviewRootMap.get(String(l.workspace || ''));
        if (mapped) activeWorkspace = mapped;
    }
    const LINK_ICON = '\u{1F517}';
    const GLOBE_ICON = '\u{1F310}';
    const PIN_ICON = '\u{1F4CC}';
    const CHECK_ICON = '\u2714';
    const EDIT_ICON = '\u270E';
    const DELETE_ICON = '\u2716';

    const isLocal = String(l.url || '').startsWith('file://');
    const domain = faviconUtils && typeof faviconUtils.getDomainFromUrl === 'function'
        ? faviconUtils.getDomainFromUrl(l.url)
        : '';
    const useFavicon = !isLocal && !!domain;

    // Use cached favicon data URI when available
    const faviconSrc = useFavicon && faviconUtils && typeof faviconUtils.getBestEffortSrc === 'function'
        ? faviconUtils.getBestEffortSrc(domain, 32)
        : '';
    const faviconFallbackSrc = useFavicon && faviconUtils && typeof faviconUtils.getFallbackSrc === 'function'
        ? faviconUtils.getFallbackSrc(domain, 32)
        : '';
    const safeFaviconSrc = escapeAttr(faviconSrc);
    const safeFaviconFallbackSrc = escapeAttr(faviconFallbackSrc);
    const fallbackAttr = safeFaviconFallbackSrc ? ` data-fallback-src="${safeFaviconFallbackSrc}"` : '';
    const faviconDomainAttr = domain ? ` data-favicon-domain="${escapeAttr(domain)}"` : '';
    const faviconSizeAttr = ' data-favicon-size="32"';
    const fallbackOnError = `if(window.EveFaviconUtils&&typeof window.EveFaviconUtils.handleImageError==='function'){window.EveFaviconUtils.handleImageError(this);return;}this.onerror=null;this.replaceWith('${GLOBE_ICON}');`;

    const customIconText = String(l.icon || '');
    const customIconIsImage = /^(?:https?:\/\/|data:)/i.test(customIconText) || customIconText.startsWith('/');
    const useCustomIcon = !!(l.icon && l.icon !== LINK_ICON && !(customIconIsImage && isReservedRemoteImageUrl(customIconText)));
    let iconHtml = useCustomIcon
        ? (customIconIsImage
            ? (megaPerfMode ? `<span style="font-size:1.2rem; margin-right:8px;">${GLOBE_ICON}</span>` : `<img src="${escapeAttr(l.icon)}"${fallbackAttr}${faviconDomainAttr}${faviconSizeAttr} width="16" height="16" style="margin-right:8px;" loading="lazy" referrerpolicy="no-referrer" onerror="${fallbackOnError}">`)
            : `<span style="font-size:1.2rem; margin-right:8px;">${l.icon}</span>`)
        : (useFavicon
            ? (megaPerfMode ? `<span style="font-size:1.2rem; margin-right:8px;">${GLOBE_ICON}</span>` : `<img src="${safeFaviconSrc}"${fallbackAttr}${faviconDomainAttr}${faviconSizeAttr} width="16" height="16" style="margin-right:8px;" loading="lazy" referrerpolicy="no-referrer" onerror="${fallbackOnError}">`)
            : `<span style="font-size:1.2rem; margin-right:8px;">${GLOBE_ICON}</span>`);

    const pClass = l.priority ? `p-${l.priority}` : '';
    const linkId = String(l.id);
    const isChecked = (typeof selectedIds !== 'undefined' && selectedIds.has(linkId)) ? 'checked' : '';
    const isPinned = perfMode ? false : !!window.EveQuickPins?.isBookmarkPinned?.(linkId);
    const pinnedClass = isPinned ? 'pinned-link' : '';
    const encodedLinkId = encodeURIComponent(linkId);
    const jsLinkIdLiteral = `'${linkId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const detachedEntryId = String(l?.detachedEntryId || '').trim();
    const jsDetachedEntryIdLiteral = `'${detachedEntryId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const dragStartHandler = (l?.detached && detachedEntryId)
        ? `if(window.EveConstellationMap&&window.EveConstellationMap._detached&&typeof window.EveConstellationMap._detached.handleDetachedLinkDragStart==='function') window.EveConstellationMap._detached.handleDetachedLinkDragStart(event, ${jsDetachedEntryIdLiteral}, ${jsLinkIdLiteral});`
        : `drag(event, ${jsLinkIdLiteral})`;

    let wsBadge = ''; // Disabled: workspace context is already shown on the card level

    // Sub-tab origin badge: shown when this link came from a sub-tab merged into the parent view
    let subTabBadge = '';
    if (!perfMode && !searchStr && !isGroupOverviewMode && !suppressCardWorkspaceSubtabBadge) {
        const helpers = window.EveWorkspaceHelpers;
        if (l.workspace !== badgeWorkspaceId) {
            const subWs = renderContext && typeof renderContext.getWorkspaceById === 'function'
                ? renderContext.getWorkspaceById(l.workspace)
                : (helpers ? helpers.findById(config.workspaces || [], l.workspace) : null);
            const subTabName = subWs ? subWs.name : null;
            if (subTabName) {
                const activeWsObj = renderContext && typeof renderContext.getWorkspaceById === 'function'
                    ? renderContext.getWorkspaceById(badgeWorkspaceId)
                    : (helpers ? helpers.findById(config.workspaces, badgeWorkspaceId) : null);
                const linkedToObj = activeWsObj && activeWsObj.linkedTo
                    ? (renderContext && typeof renderContext.getWorkspaceById === 'function'
                        ? renderContext.getWorkspaceById(activeWsObj.linkedTo)
                        : (helpers ? helpers.findById(config.workspaces, activeWsObj.linkedTo) : null))
                    : null;
                const isFromLinkedMain = activeWsObj && activeWsObj.linkedTo === l.workspace;
                const isFromLinkedSub = linkedToObj && (
                    renderContext && typeof renderContext.getVisibleDescendantIds === 'function'
                        ? renderContext.getVisibleDescendantIds(linkedToObj.id).includes(String(l.workspace || '').trim())
                        : helpers.getVisibleDescendantIds(linkedToObj).includes(l.workspace)
                );

                // Check if this link comes through a nested linked sub-tab (parent has a sub-tab with linkedTo targeting this workspace)
                let isFromNestedLink = false;
                if (!isFromLinkedMain && !isFromLinkedSub && activeWsObj) {
                    const visWs = window._eveActiveVisibleWorkspaceIds;
                    if (visWs) {
                        visWs.forEach(function (vId) {
                            if (vId === badgeWorkspaceId) return;
                            const vWs = renderContext && typeof renderContext.getWorkspaceById === 'function'
                                ? renderContext.getWorkspaceById(vId)
                                : (helpers ? helpers.findById(config.workspaces || [], vId) : null);
                            if (vWs && vWs.linkedTo) {
                                if (vWs.linkedTo === l.workspace) isFromNestedLink = true;
                                else {
                                    const linkedTarget = renderContext && typeof renderContext.getWorkspaceById === 'function'
                                        ? renderContext.getWorkspaceById(vWs.linkedTo)
                                        : (helpers ? helpers.findById(config.workspaces || [], vWs.linkedTo) : null);
                                    const visibleDescendants = linkedTarget
                                        ? (renderContext && typeof renderContext.getVisibleDescendantIds === 'function'
                                            ? renderContext.getVisibleDescendantIds(linkedTarget.id)
                                            : helpers.getVisibleDescendantIds(linkedTarget))
                                        : [];
                                    if (visibleDescendants.includes(String(l.workspace || '').trim())) isFromNestedLink = true;
                                }
                            }
                        });
                    }
                }

                if (isFromLinkedMain) {
                    subTabBadge = `<span class="subtab-origin-badge" style="background:var(--accent, #0088ff);color:#fff;font-weight:bold;margin-right:6px;border-radius:4px;padding:2px 6px;font-size:0.75em;" title="From main tab: ${subTabName}">⚓ Main Link</span>`;
                } else if (isFromLinkedSub) {
                    subTabBadge = `<span class="subtab-origin-badge" style="background:var(--accent, #0088ff);color:#fff;margin-right:6px;border-radius:4px;padding:2px 6px;font-size:0.75em;" title="From main sub-tab: ${subTabName}">⚓ Main Sub-Tab</span>`;
                } else if (isFromNestedLink) {
                    subTabBadge = `<span class="subtab-origin-badge" style="background:rgba(0,200,180,0.2);color:#40e8d0;font-weight:bold;margin-right:6px;border-radius:4px;padding:2px 6px;font-size:0.75em;border:1px dashed rgba(0,200,180,0.4);" title="Via linked tab → ${subTabName}">🔗 ${subTabName}</span>`;
                } else {
                    subTabBadge = `<span class="subtab-origin-badge" title="From sub-tab: ${subTabName}">${subWs.icon || '📁'} ${subTabName}</span>`;
                }
            }
        } else {
            const activeWsObj = renderContext && typeof renderContext.getWorkspaceById === 'function'
                ? renderContext.getWorkspaceById(badgeWorkspaceId)
                : (helpers ? helpers.findById(config.workspaces, badgeWorkspaceId) : null);
            if (activeWsObj && activeWsObj.linkedTo) {
                subTabBadge = `<span class="subtab-origin-badge" style="background:#ff8c00;color:#fff;font-weight:bold;margin-right:6px;border-radius:4px;padding:2px 6px;font-size:0.75em;" title="Added specifically to this shortcut tab">🔗 Shortcut Local</span>`;
            }
        }
    }
    const folderBadge = extraOptions.folderLabel
        ? `<span class="bookmark-folder-link-badge">${extraOptions.folderLabel}</span>`
        : '';
    const detachedBadge = (l?.detached && !folderBadge)
        ? '<span class="bookmark-folder-link-badge">Detached</span>'
        : '';
    const identifierBadges = perfMode ? '' : (window.EveBookmarkIdentifiers?.getBadgeHtmlForLink?.(l)
        ? `<span class="bookmark-link-identifiers">${window.EveBookmarkIdentifiers.getBadgeHtmlForLink(l)}</span>`
        : '');
    const relatedUrlEntries = Array.isArray(l?.relatedUrls)
        ? l.relatedUrls.map((entry) => ({
            entry,
            url: String(entry?.url || entry || '').trim()
        })).filter((item) => item.url).slice(0, 8)
        : [];
    const relatedUrlIcons = (!perfMode && relatedUrlEntries.length)
        ? '<span class="bookmark-related-url-icons is-cycling" data-related-url-cycle="1" data-related-url-cycle-index="0" title="Related URLs rotate every few seconds. Hover to pause, then click the current icon.">'
            + relatedUrlEntries.map(({ entry, url: relatedUrl }, index) => {
                if (!relatedUrl) return '';
                const relatedDomain = faviconUtils && typeof faviconUtils.getDomainFromUrl === 'function'
                    ? faviconUtils.getDomainFromUrl(relatedUrl)
                    : '';
                const relatedTitle = String(entry?.label || entry?.title || relatedDomain || relatedUrl).trim();
                const src = relatedDomain && faviconUtils && typeof faviconUtils.getBestEffortSrc === 'function'
                    ? faviconUtils.getBestEffortSrc(relatedDomain, 16)
                    : '';
                const fallback = relatedDomain && faviconUtils && typeof faviconUtils.getFallbackSrc === 'function'
                    ? faviconUtils.getFallbackSrc(relatedDomain, 16)
                    : '';
                const iconMarkup = src
                    ? `<img class="bookmark-related-url-icon" src="${escapeAttr(src)}" data-favicon-domain="${escapeAttr(relatedDomain)}" data-favicon-size="16"${fallback ? ` data-fallback-src="${escapeAttr(fallback)}"` : ''} alt="" loading="lazy" referrerpolicy="no-referrer" onerror="${fallbackOnError}">`
                    : '<span class="bookmark-related-url-icon bookmark-related-url-icon--fallback">' + GLOBE_ICON + '</span>';
                return '<button type="button" class="bookmark-related-url-action' + (index === 0 ? ' is-active' : '') + '"'
                    + (index === 0 ? ' tabindex="0"' : ' tabindex="-1" aria-hidden="true"')
                    + ' title="Open related URL: ' + escapeAttr(relatedTitle) + '"'
                    + ' aria-label="Open related URL: ' + escapeAttr(relatedTitle) + '"'
                    + ' onclick="return window.openRelatedUrlFromDashboard ? window.openRelatedUrlFromDashboard(event, ' + jsLinkIdLiteral + ', \'' + escapeJsString(relatedUrl) + '\', \'' + escapeJsString(relatedTitle) + '\', ' + index + ') : false;">'
                    + iconMarkup
                    + '</button>';
            }).join('')
            + '</span>'
        : '';
    const isTaskEnabled = extraOptions.isTaskEnabled !== false;
    const doneClass = isTaskEnabled && l.done ? 'done' : '';
    const doneActionHtml = isTaskEnabled
        ? `<span class="icon-btn" onclick="toggleDone(${jsLinkIdLiteral})">${CHECK_ICON}</span>`
        : '';

    // Custom order badge
    let customOrderBadge = '';
    if (extraOptions.customOrderEnabled && window.EveCustomOrder) {
        const coNum = window.EveCustomOrder.getNumber(
            extraOptions.customOrderWsId,
            extraOptions.customOrderCategory,
            linkId
        );
        const safeWsId = String(extraOptions.customOrderWsId || '').replace(/'/g, "\\'");
        const safeCoCat = String(extraOptions.customOrderCategory || '').replace(/'/g, "\\'");
        if (typeof coNum === 'number') {
            customOrderBadge = `<span class="custom-order-badge" title="Click to change order" onclick="event.preventDefault();event.stopPropagation();window.EveInlinePrompt.show({label:'Position (current: ${coNum})',value:'${coNum}',type:'number',anchor:this}).then(function(n){if(n!==null&&n!=='')window.EveCustomOrder.setNumber('${safeWsId}','${safeCoCat}',${jsLinkIdLiteral},parseInt(n,10))})">#${coNum}</span>`;
        }
    }

    // True value badge (overrides custom order badge when active)
    let trueValueBadge = '';
    if (extraOptions.trueValueEnabled && extraOptions.trueValueData && window.EveTrueValue) {
        const tvData = extraOptions.trueValueData[linkId];
        if (tvData) {
            const displayText = window.EveTrueValue.formatTrueValue(tvData, extraOptions.trueValueData);
            const badgeClass = tvData.locked ? 'true-value-badge locked' : 'true-value-badge approx';
            const direction = tvData.influence > 0 ? '↑' : tvData.influence < 0 ? '↓' : '=';
            const titleText = tvData.locked
                ? (tvData.rating === null ? 'Locked — no library link' : 'Locked — no rating data')
                : 'Base #' + tvData.basePos + ' ' + direction + ' #' + tvData.truePos + ' (rating: ' + (tvData.rating || '?') + ', ' + tvData.percent + '%)';
            trueValueBadge = `<span class="${badgeClass}" title="${titleText}">${displayText}</span>`;
            customOrderBadge = ''; // true value replaces custom order badge
        }
    }

    const hoverHandlers = perfMode ? '' : ` onmouseenter="showBookmarkCoverHover(event, ${jsLinkIdLiteral})" onmousemove="moveBookmarkCoverHover(event)" onmouseleave="hideBookmarkCoverHover()"`;
    const safeDataLinkId = linkId.replace(/&/g, '&amp;').replace(/\"/g, '&quot;');

    return `<li class="${doneClass} ${isLocal ? 'is-local' : ''} ${pClass} ${pinnedClass}" data-link-id="${safeDataLinkId}" draggable="true" ondragstart="${dragStartHandler}" oncontextmenu="showLinkContextMenu(event, ${jsLinkIdLiteral})"${hoverHandlers}>
                <input type="checkbox" class="bulk-check" data-bulk-id="${safeDataLinkId}" onclick="event.preventDefault();event.stopPropagation();toggleSelect(this, ${jsLinkIdLiteral}, event);return false;" ${isChecked}>
                ${iconHtml} ${wsBadge} ${subTabBadge} ${folderBadge} ${detachedBadge} ${identifierBadges} ${relatedUrlIcons} <a href="${l.url}" target="_blank" rel="noopener noreferrer" onclick='return (typeof openBookmarkFromDashboard==="function") ? openBookmarkFromDashboard(event, decodeURIComponent("${encodedLinkId}")) : true;'>${l.title}</a>
                ${trueValueBadge || customOrderBadge}
                <div class="actions">
                    <span class="icon-btn ${isPinned ? 'pin-active' : ''}" onclick="togglePin(${jsLinkIdLiteral})">${PIN_ICON}</span>
                    ${doneActionHtml}
                    <span class="icon-btn" onclick="openEdit(${jsLinkIdLiteral})">${EDIT_ICON}</span>
                    <span class="icon-btn" onclick="deleteLink(${jsLinkIdLiteral})" style="color:var(--danger)">${DELETE_ICON}</span>
                </div>
            </li>`;
};
