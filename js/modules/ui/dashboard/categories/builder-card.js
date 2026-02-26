window.DashboardCategories = window.DashboardCategories || {};

window.DashboardCategories.renderCard = function (cat, catLinks, gridContainer, configOptions) {
    // configOptions contains: { collapsed, hideStats, scrollableCategories, searchStr, activeWorkspace, workspaces }
    const card = document.createElement('div');
    card.className = 'category-card';
    if (configOptions.collapsed.includes(cat)) card.classList.add('collapsed');
    if (!configOptions.hideStats.includes(cat)) card.classList.add('task-mode');

    const total = catLinks.length, done = catLinks.filter(l => l.done).length, pct = total === 0 ? 0 : (done / total) * 100;
    const barClass = pct === 100 ? 'complete' : '';

    card.ondragover = (e) => { if (typeof allowDrop === 'function') allowDrop(e); };
    card.ondrop = (e) => { if (typeof drop === 'function') drop(e, cat); };

    // Generate list HTML using the builder-link helper
    const listHtml = catLinks.map(l =>
        window.DashboardCategories.buildLinkHtml(l, configOptions.searchStr, configOptions.activeWorkspace, configOptions.workspaces)
    ).join('');

    const safeCat = cat.replace(/"/g, '&quot;');
    const safeCatEscaped = safeCat.replace(/'/g, "\\'"); // For onclick handlers
    const libPanelId = `lib-${cat.replace(/[^a-zA-Z0-9]/g, '_')}-panel`;

    card.innerHTML = `
            <div class="cat-progress-bg"><div class="cat-progress-fill ${barClass}" style="width:${pct}%"></div></div>
            <div class="category-header" oncontextmenu="showCategoryContextMenu(event, '${safeCatEscaped}')">
                <div class="cat-title-group">
                    <span class="collapse-arrow" data-cat="${safeCat}" onclick="toggleCollapse(this.dataset.cat)">▼</span>
                    <div class="category-title" title="${safeCat}">${cat}</div>
                    <span class="sort-btn" onclick="moveCategory('${safeCatEscaped}', -1)">▲</span>
                    <span class="sort-btn" onclick="moveCategory('${safeCatEscaped}', 1)">▼</span>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="lib-toggle-btn" onclick="toggleCategoryLibrary('${safeCatEscaped}')" title="Library">📚</button>
                    <button onclick="openCategorySettings('${safeCatEscaped}')" style="padding: 2px 8px; font-size: 1.2rem;">⚙️</button>
                    <button class="launch-btn" data-cat="${safeCat}" onclick="launchCategory(this.dataset.cat)">🚀</button>
                </div>
            </div>
            
            <!-- Library Panel (hidden by default) -->
            <div id="${libPanelId}" class="lib-panel" style="display:none;"></div>
            
            <ul class="${configOptions.scrollableCategories ? 'category-scrollable' : ''}">${listHtml}</ul>
            <div class="category-footer"><span class="stat-pending">Pending: ${total - done}</span><span class="stat-done">Done: ${done}</span></div>
        `;
    gridContainer.appendChild(card);
};
