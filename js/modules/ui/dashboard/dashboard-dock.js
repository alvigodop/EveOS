// --- DASHBOARD DOCK MODULE ---
window.renderDock = function (visibleLinks, dockContainer, focusCategory) {
    if (!dockContainer) return;

    const pinnedLinks = visibleLinks.filter(link => link.pinned);
    if (pinnedLinks.length <= 0 || focusCategory) {
        dockContainer.classList.add('hidden');
        return;
    }

    const LINK_ICON = '\u{1F517}';
    const GLOBE_ICON = '\u{1F310}';
    const LOCAL_ICON = '\u{1F4C2}';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getDomain(rawUrl) {
        try {
            return new URL(rawUrl).hostname || String(rawUrl || '');
        } catch (error) {
            return String(rawUrl || '');
        }
    }

    dockContainer.classList.remove('hidden');
    pinnedLinks.forEach(link => {
        const rawUrl = String(link.url || '');
        const isLocal = rawUrl.startsWith('file://');
        const manualIcon = String(link.icon || '').trim();
        const domain = encodeURIComponent(getDomain(rawUrl));
        const encodedLinkId = encodeURIComponent(String(link.id));
        const encodedUrl = encodeURIComponent(normalizeUrl(rawUrl));
        const safeTitle = escapeHtml(link.title || '');

        const iconHtml = (manualIcon && manualIcon !== LINK_ICON)
            ? (manualIcon.startsWith('http')
                ? `<img src="${manualIcon}" width="24" height="24" style="margin-right:5px; border-radius:4px;">`
                : `<span style="font-size:1.5rem">${escapeHtml(manualIcon)}</span>`)
            : (isLocal
                ? LOCAL_ICON
                : `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" onerror="this.onerror=null;this.replaceWith('${GLOBE_ICON}');">`);

        const openHandler = `if (typeof openBookmarkFromDashboard==="function") { openBookmarkFromDashboard(event, decodeURIComponent("${encodedLinkId}")); } else { window.open(decodeURIComponent(this.getAttribute("data-url")), "_blank", "noopener,noreferrer"); }`;
        const removeHandler = `togglePin(decodeURIComponent("${encodedLinkId}"))`;
        const item = document.createElement('div');
        item.className = 'dock-item';
        item.innerHTML = `
            <div class="dock-icon" data-url="${encodedUrl}" onclick='${openHandler}'>${iconHtml}</div>
            <div class="dock-title">${safeTitle}</div>
            <div class="dock-remove" onclick='${removeHandler}'>&times;</div>
        `;
        dockContainer.appendChild(item);
    });
};
