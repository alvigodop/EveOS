// --- DASHBOARD DOCK MODULE ---
window.renderDock = function (visibleLinks, dockContainer, focusCategory) {
    if (!dockContainer) return;

    const pinnedLinks = visibleLinks.filter(l => l.pinned);

    if (pinnedLinks.length > 0 && !focusCategory) {
        dockContainer.classList.remove('hidden');
        pinnedLinks.forEach(l => {
            const isLocal = l.url.startsWith('file://');
            let iconHtml = (l.icon && l.icon !== '🔗')
                ? (l.icon.startsWith('http') ? `<img src="${l.icon}" width="24" height="24" style="margin-right:5px; border-radius:4px;">` : `<span style="font-size:1.5rem">${l.icon}</span>`)
                : (isLocal ? '📂' : `<img src="https://www.google.com/s2/favicons?domain=${l.url}&sz=64" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'">`);
            const item = document.createElement('div');
            item.className = 'dock-item';
            item.innerHTML = `<div class="dock-icon" onclick="window.open('${l.url}', '_blank')">${iconHtml}</div><div class="dock-title">${l.title}</div><div class="dock-remove" onclick="togglePin(${l.id})">✖</div>`;
            dockContainer.appendChild(item);
        });
    } else {
        dockContainer.classList.add('hidden');
    }
};
