window.DashboardCategories = window.DashboardCategories || {};

(function () {
    function toLinkId(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function findLinkById(linkId) {
        const targetId = toLinkId(linkId);
        const linkList = window.eveState?.links || (typeof links !== 'undefined' ? links : []);
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
        const coverUrl = (typeof window.EveBookmarkCovers?.isRenderableCoverUrl === 'function' && !window.EveBookmarkCovers.isRenderableCoverUrl(rawCoverUrl))
            ? ''
            : rawCoverUrl;
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

    function showBookmarkCoverHover(event, linkId) {
        const target = event?.currentTarget;
        const preview = getBookmarkHoverPreview(findLinkById(linkId));
        if (!target || !preview) {
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
        positionBookmarkCoverHoverOverlay(target, overlay);
    }

    function moveBookmarkCoverHover(event) {
        const target = event?.currentTarget;
        const overlay = document.getElementById('bookmark-cover-hover-overlay');
        if (!target || !overlay || !overlay.classList.contains('is-visible')) return;
        positionBookmarkCoverHoverOverlay(target, overlay);
    }

    function hideBookmarkCoverHover() {
        const overlay = document.getElementById('bookmark-cover-hover-overlay');
        if (!overlay) return;
        overlay.classList.remove('is-visible');
        overlay.classList.remove('is-imageless');
    }

    window.showBookmarkCoverHover = showBookmarkCoverHover;
    window.moveBookmarkCoverHover = moveBookmarkCoverHover;
    window.hideBookmarkCoverHover = hideBookmarkCoverHover;
})();

window.DashboardCategories.buildLinkHtml = function (l, searchStr, activeWorkspace, workspaces, options) {
    const extraOptions = options || {};
    const perfMode = !!window._evePerfMode;
    const megaPerfMode = !!window._eveMegaPerfMode;
    const faviconUtils = window.EveFaviconUtils || null;
    const escapeAttr = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
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
    const fallbackOnError = `const fallback=this.dataset.fallbackSrc||'';if(this.dataset.fallbackApplied==='1'||!fallback){this.onerror=null;this.replaceWith('${GLOBE_ICON}');return;}this.dataset.fallbackApplied='1';this.src=fallback;`;

    let iconHtml = (l.icon && l.icon !== LINK_ICON)
        ? (/^(?:https?:\/\/|data:)/i.test(String(l.icon)) || String(l.icon).startsWith('/')
            ? (megaPerfMode ? `<span style="font-size:1.2rem; margin-right:8px;">${GLOBE_ICON}</span>` : `<img src="${escapeAttr(l.icon)}"${fallbackAttr} width="16" height="16" style="margin-right:8px;" loading="lazy" referrerpolicy="no-referrer" onerror="${fallbackOnError}">`)
            : `<span style="font-size:1.2rem; margin-right:8px;">${l.icon}</span>`)
        : (useFavicon
            ? (megaPerfMode ? `<span style="font-size:1.2rem; margin-right:8px;">${GLOBE_ICON}</span>` : `<img src="${safeFaviconSrc}"${fallbackAttr} width="16" height="16" style="margin-right:8px;" loading="lazy" referrerpolicy="no-referrer" onerror="${fallbackOnError}">`)
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

    let wsBadge = (searchStr && l.workspace !== badgeWorkspaceId)
        ? `<span class="search-badge">${workspaces.find(w => w.id === l.workspace)?.name || "?"}</span>`
        : '';

    // Sub-tab origin badge: shown when this link came from a sub-tab merged into the parent view
    let subTabBadge = '';
    if (!perfMode && !searchStr && !isGroupOverviewMode && !suppressCardWorkspaceSubtabBadge) {
        const helpers = window.EveWorkspaceHelpers;
        if (l.workspace !== badgeWorkspaceId) {
            const subWs = helpers
                ? helpers.findById(config.workspaces || [], l.workspace)
                : null;
            const subTabName = subWs ? subWs.name : null;
            if (subTabName) {
                const activeWsObj = helpers ? helpers.findById(config.workspaces, badgeWorkspaceId) : null;
                const linkedToObj = activeWsObj && activeWsObj.linkedTo ? helpers.findById(config.workspaces, activeWsObj.linkedTo) : null;
                const isFromLinkedMain = activeWsObj && activeWsObj.linkedTo === l.workspace;
                const isFromLinkedSub = linkedToObj && helpers.getVisibleDescendantIds(linkedToObj).includes(l.workspace);

                // Check if this link comes through a nested linked sub-tab (parent has a sub-tab with linkedTo targeting this workspace)
                let isFromNestedLink = false;
                if (!isFromLinkedMain && !isFromLinkedSub && activeWsObj) {
                    const visWs = window._eveActiveVisibleWorkspaceIds;
                    if (visWs) {
                        visWs.forEach(function (vId) {
                            if (vId === badgeWorkspaceId) return;
                            const vWs = helpers.findById(config.workspaces || [], vId);
                            if (vWs && vWs.linkedTo) {
                                if (vWs.linkedTo === l.workspace) isFromNestedLink = true;
                                else {
                                    const linkedTarget = helpers.findById(config.workspaces || [], vWs.linkedTo);
                                    if (linkedTarget && helpers.getVisibleDescendantIds(linkedTarget).includes(l.workspace)) isFromNestedLink = true;
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
            const activeWsObj = helpers ? helpers.findById(config.workspaces, badgeWorkspaceId) : null;
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

    const hoverHandlers = megaPerfMode ? '' : ` onmouseenter="showBookmarkCoverHover(event, ${jsLinkIdLiteral})" onmousemove="moveBookmarkCoverHover(event)" onmouseleave="hideBookmarkCoverHover()"`;
    return `<li class="${doneClass} ${isLocal ? 'is-local' : ''} ${pClass} ${pinnedClass}" draggable="true" ondragstart="${dragStartHandler}" oncontextmenu="showLinkContextMenu(event, ${jsLinkIdLiteral})"${hoverHandlers}>
                <input type="checkbox" class="bulk-check" data-bulk-id="${linkId.replace(/&/g, '&amp;').replace(/\"/g, '&quot;')}" onclick="event.preventDefault();event.stopPropagation();toggleSelect(this, ${jsLinkIdLiteral}, event);return false;" ${isChecked}>
                ${iconHtml} ${wsBadge} ${subTabBadge} ${folderBadge} ${detachedBadge} ${identifierBadges} <a href="${l.url}" target="_blank" rel="noopener noreferrer" onclick='return (typeof openBookmarkFromDashboard==="function") ? openBookmarkFromDashboard(event, decodeURIComponent("${encodedLinkId}")) : true;'>${l.title}</a>
                ${trueValueBadge || customOrderBadge}
                <div class="actions">
                    <span class="icon-btn ${isPinned ? 'pin-active' : ''}" onclick="togglePin(${jsLinkIdLiteral})">${PIN_ICON}</span>
                    ${doneActionHtml}
                    <span class="icon-btn" onclick="openEdit(${jsLinkIdLiteral})">${EDIT_ICON}</span>
                    <span class="icon-btn" onclick="deleteLink(${jsLinkIdLiteral})" style="color:var(--danger)">${DELETE_ICON}</span>
                </div>
            </li>`;
};
