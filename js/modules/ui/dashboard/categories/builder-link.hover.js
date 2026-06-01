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
