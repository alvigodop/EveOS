window.DashboardCategories = window.DashboardCategories || {};

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

    return `<li class="${doneClass} ${isLocal ? 'is-local' : ''} ${pClass}" draggable="true" ondragstart="drag(event, ${jsLinkIdLiteral})" oncontextmenu="showLinkContextMenu(event, ${jsLinkIdLiteral})">
                <input type="checkbox" class="bulk-check" onclick="toggleSelect(${jsLinkIdLiteral}, event)" ${isChecked}>
                ${iconHtml} ${wsBadge} ${folderBadge} <a href="${l.url}" target="_blank" rel="noopener noreferrer" onclick='return (typeof openBookmarkFromDashboard==="function") ? openBookmarkFromDashboard(event, decodeURIComponent("${encodedLinkId}")) : true;'>${l.title}</a>
                <div class="actions">
                    <span class="icon-btn ${l.pinned ? 'pin-active' : ''}" onclick="togglePin(${jsLinkIdLiteral})">${PIN_ICON}</span>
                    ${doneActionHtml}
                    <span class="icon-btn" onclick="openEdit(${jsLinkIdLiteral})">${EDIT_ICON}</span>
                    <span class="icon-btn" onclick="deleteLink(${jsLinkIdLiteral})" style="color:var(--danger)">${DELETE_ICON}</span>
                </div>
            </li>`;
};
