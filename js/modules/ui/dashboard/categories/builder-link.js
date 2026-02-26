window.DashboardCategories = window.DashboardCategories || {};

window.DashboardCategories.buildLinkHtml = function (l, searchStr, activeWorkspace, workspaces) {
    const isLocal = l.url.startsWith('file://');
    let domain = "";
    try {
        domain = new URL(l.url).hostname;
    } catch (e) {
        domain = l.url.replace(/^https?:\/\//, '').split('/')[0];
    }
    const useFavicon = !isLocal && domain && domain.includes('.');

    let iconHtml = (l.icon && l.icon !== '🔗')
        ? (l.icon.startsWith('http') ? `<img src="${l.icon}" width="16" height="16" style="margin-right:8px;" onerror="this.onerror=null;this.replaceWith('🌐');">` : `<span style="font-size:1.2rem; margin-right:8px;">${l.icon}</span>`)
        : (useFavicon ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" width="16" height="16" style="margin-right:8px;" onerror="this.onerror=null;this.replaceWith('🌐');">` : '<span style="font-size:1.2rem; margin-right:8px;">🌐</span>');

    const pClass = l.priority ? `p-${l.priority}` : '';
    const isChecked = (typeof selectedIds !== 'undefined' && selectedIds.has(l.id)) ? 'checked' : '';

    let wsBadge = (searchStr && l.workspace !== activeWorkspace)
        ? `<span class="search-badge">${workspaces.find(w => w.id === l.workspace)?.name || "?"}</span>` : "";

    return `<li class="${l.done ? 'done' : ''} ${isLocal ? 'is-local' : ''} ${pClass}" draggable="true" ondragstart="drag(event, ${l.id})" oncontextmenu="showLinkContextMenu(event, ${l.id})">
                <input type="checkbox" class="bulk-check" onclick="toggleSelect(${l.id}, event)" ${isChecked}>
                ${iconHtml} ${wsBadge} <a href="${l.url}" target="_blank">${l.title}</a>
                <div class="actions">
                    <span class="icon-btn ${l.pinned ? 'pin-active' : ''}" onclick="togglePin(${l.id})">📌</span>
                    <span class="icon-btn" onclick="toggleDone(${l.id})">✔</span>
                    <span class="icon-btn" onclick="openEdit(${l.id})">✎</span>
                    <span class="icon-btn" onclick="deleteLink(${l.id})" style="color:var(--danger)">✖</span>
                </div>
            </li>`;
};
