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
        const coverUrl = String(
            window.EveBookmarkCovers?.getDisplayCover?.(link, libraryEntry?.image || libraryEntry?.imageUrl)
            || link?.coverImage
            || libraryEntry?.image
            || libraryEntry?.imageUrl
            || ''
        ).trim();
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
        const gap = 12;
        let left = rect.right + gap;
        if (left + overlay.offsetWidth > window.innerWidth - viewportPadding) {
            left = rect.left - overlay.offsetWidth - gap;
        }
        if (left < viewportPadding) {
            left = Math.max(viewportPadding, window.innerWidth - overlay.offsetWidth - viewportPadding);
        }

        let top = rect.top + (rect.height / 2) - (overlay.offsetHeight / 2);
        const maxTop = window.innerHeight - overlay.offsetHeight - viewportPadding;
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

        title.textContent = preview.title;
        subtitle.textContent = preview.subtitle;
        image.src = preview.coverUrl;
        image.alt = preview.title + ' cover';
        image.onerror = function () {
            overlay.classList.remove('is-visible');
        };

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
    }

    window.showBookmarkCoverHover = showBookmarkCoverHover;
    window.moveBookmarkCoverHover = moveBookmarkCoverHover;
    window.hideBookmarkCoverHover = hideBookmarkCoverHover;
})();

window.DashboardCategories.buildLinkHtml = function (l, searchStr, activeWorkspace, workspaces, options) {
    const extraOptions = options || {};
    const LINK_ICON = '\u{1F517}';
    const GLOBE_ICON = '\u{1F310}';
    const PIN_ICON = '\u{1F4CC}';
    const CHECK_ICON = '\u2714';
    const EDIT_ICON = '\u270E';
    const DELETE_ICON = '\u2716';

    const isLocal = String(l.url || '').startsWith('file://');
    let domain = '';
    try {
        domain = new URL(l.url).hostname;
    } catch (e) {
        domain = String(l.url || '').replace(/^https?:\/\//, '').split('/')[0];
    }
    const useFavicon = !isLocal && domain && domain.includes('.');

    let iconHtml = (l.icon && l.icon !== LINK_ICON)
        ? (String(l.icon).startsWith('http')
            ? `<img src="${l.icon}" width="16" height="16" style="margin-right:8px;" onerror="this.onerror=null;this.replaceWith('${GLOBE_ICON}');">`
            : `<span style="font-size:1.2rem; margin-right:8px;">${l.icon}</span>`)
        : (useFavicon
            ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" width="16" height="16" style="margin-right:8px;" onerror="this.onerror=null;this.replaceWith('${GLOBE_ICON}');">`
            : `<span style="font-size:1.2rem; margin-right:8px;">${GLOBE_ICON}</span>`);

    const pClass = l.priority ? `p-${l.priority}` : '';
    const linkId = String(l.id);
    const isChecked = (typeof selectedIds !== 'undefined' && selectedIds.has(linkId)) ? 'checked' : '';
    const isPinned = !!window.EveQuickPins?.isBookmarkPinned?.(linkId);
    const pinnedClass = isPinned ? 'pinned-link' : '';
    const encodedLinkId = encodeURIComponent(linkId);
    const jsLinkIdLiteral = `'${linkId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

    let wsBadge = (searchStr && l.workspace !== activeWorkspace)
        ? `<span class="search-badge">${workspaces.find(w => w.id === l.workspace)?.name || "?"}</span>`
        : '';
    const folderBadge = extraOptions.folderLabel
        ? `<span class="bookmark-folder-link-badge">${extraOptions.folderLabel}</span>`
        : '';
    const isTaskEnabled = extraOptions.isTaskEnabled !== false;
    const doneClass = isTaskEnabled && l.done ? 'done' : '';
    const doneActionHtml = isTaskEnabled
        ? `<span class="icon-btn" onclick="toggleDone(${jsLinkIdLiteral})">${CHECK_ICON}</span>`
        : '';

    return `<li class="${doneClass} ${isLocal ? 'is-local' : ''} ${pClass} ${pinnedClass}" draggable="true" ondragstart="drag(event, ${jsLinkIdLiteral})" oncontextmenu="showLinkContextMenu(event, ${jsLinkIdLiteral})" onmouseenter="showBookmarkCoverHover(event, ${jsLinkIdLiteral})" onmousemove="moveBookmarkCoverHover(event)" onmouseleave="hideBookmarkCoverHover()">
                <input type="checkbox" class="bulk-check" onclick="toggleSelect(${jsLinkIdLiteral}, event)" ${isChecked}>
                ${iconHtml} ${wsBadge} ${folderBadge} <a href="${l.url}" target="_blank" rel="noopener noreferrer" onclick='return (typeof openBookmarkFromDashboard==="function") ? openBookmarkFromDashboard(event, decodeURIComponent("${encodedLinkId}")) : true;'>${l.title}</a>
                <div class="actions">
                    <span class="icon-btn ${isPinned ? 'pin-active' : ''}" onclick="togglePin(${jsLinkIdLiteral})">${PIN_ICON}</span>
                    ${doneActionHtml}
                    <span class="icon-btn" onclick="openEdit(${jsLinkIdLiteral})">${EDIT_ICON}</span>
                    <span class="icon-btn" onclick="deleteLink(${jsLinkIdLiteral})" style="color:var(--danger)">${DELETE_ICON}</span>
                </div>
            </li>`;
};
