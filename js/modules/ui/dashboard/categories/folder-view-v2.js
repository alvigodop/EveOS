window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    // Escape utilities
    function escapeCardHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    function escapeCardJs(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    // Enter a folder and swap the view
    window.EveFolderViewV2.enterFolder = function (event, categoryName, folderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const card = document.querySelector(`.category-card[data-card-category="${escapeCardHtml(categoryName)}"][data-card-workspace="${escapeCardHtml(workspaceId)}"]`);
        if (!card) return;

        const folderApi = window.EveBookmarkFolders;
        if (!folderApi || !folderApi.buildFolderView) return;

        // Ensure we have access to the links for this category
        const catLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === categoryName) : [];
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, catLinks);

        // Build breadcrumb trail dynamically (Assuming simple 1-level depth for V1, can be expanded to walk parentIds)
        let trail = [{ label: categoryName.toLowerCase(), id: null }];
        
        let currentNodeId = folderId;
        let pathNodes = [];
        // Walk up to root
        while (currentNodeId) {
            const node = viewModel.nodes.find(n => n.id === currentNodeId);
            if (node) {
                pathNodes.unshift({ label: node.name, id: node.id });
                currentNodeId = node.parentId && node.parentId !== node.id && viewModel.nodes.some(n => n.id === node.parentId) ? node.parentId : null;
            } else {
                break;
            }
        }
        trail = trail.concat(pathNodes);

        // Get the specific node we are entering
        const targetNode = viewModel.nodes.find(n => n.id === folderId);
        if (!targetNode) return;

        const subFolders = viewModel.childrenMap.get(targetNode.id) || [];
        const folderItems = viewModel.folderLinks.get(targetNode.id) || [];

        // 1. Build Breadcrumbs HTML
        let breadcrumbsHtml = `<div class="folder-breadcrumbs">`;
        trail.forEach((t, i) => {
            if (i > 0) breadcrumbsHtml += `<span class="breadcrumb-separator">›</span>`;
            const isLast = i === trail.length - 1;
            const clickAction = t.id 
                ? `window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(t.id)}', '${escapeCardJs(workspaceId)}')`
                : `window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')`;
            
            breadcrumbsHtml += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" onclick="${isLast ? '' : clickAction}">${escapeCardHtml(t.label.toUpperCase())}</span>`;
            if (isLast) breadcrumbsHtml += `<span class="breadcrumb-cursor"></span>`;
        });
        breadcrumbsHtml += `</div>`;

        // 2. Build Sub-Folders Grid HTML
        let subFoldersHtml = '';
        if (subFolders.length > 0) {
            subFoldersHtml += `
                <div class="manhwa-divider">FOLDERS</div>
                <div class="folder-wrap-grid">
                    ${subFolders.map(f => `
                        <div class="folder-tile" onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')">
                            <div class="folder-tile-left-bar"></div>
                            <div class="folder-icon-box">
                                <svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;">
                                    <rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
                                    <path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
                                </svg>
                            </div>
                            <div class="folder-tile-content">
                                <div class="folder-tile-title">${escapeCardHtml(f.name)}</div>
                                <div class="folder-tile-stats">${viewModel.folderLinks.get(f.id)?.length || 0} items</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 3. Build Items Grid HTML
        let itemsHtml = '';
        if (folderItems.length > 0) {
            if (subFolders.length > 0) itemsHtml += `<div class="manhwa-divider">ITEMS</div>`;
            itemsHtml += `
                <div style="display: flex; flex-direction: column; gap: 1px; padding: 4px 0;">
                    ${folderItems.map(item => `
                        <div class="item-row" style="display: flex; align-items: center; gap: 12px; padding: 10px 18px; cursor: pointer; border-left: 2px solid rgba(128,128,128,0.2); transition: all 0.14s;" 
                             onmouseenter="this.style.background='rgba(255,255,255,0.05)'; this.style.borderLeftColor='var(--accent-color, #0088ff)';" 
                             onmouseleave="this.style.background='transparent'; this.style.borderLeftColor='rgba(128,128,128,0.2)';"
                             onclick="window.open('${escapeCardJs(item.url)}', '${item.id}')">
                            <span style="font-size: 14px;">${escapeCardHtml(item.icon || '🔗')}</span>
                            <span style="font-family: 'Share Tech Mono', monospace; font-size: 12px; letter-spacing: 0.4px; color: rgba(255,255,255,0.85);">${escapeCardHtml(item.title)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (subFolders.length === 0 && folderItems.length === 0) {
            itemsHtml = `<div style="padding: 20px; text-align: center; color: rgba(128,128,128,0.5); font-family: 'Share Tech Mono', monospace; font-size: 11px;">DATA NODE EMPTY</div>`;
        }

        // Inject the Frame
        const frameHtml = `
            ${breadcrumbsHtml}
            <div class="manhwa-frame">
                <div class="manhwa-frame-top-beam"></div>
                <div class="manhwa-frame-left-glow"></div>
                <div class="manhwa-scan-beam"></div>
                
                <!-- Corner Ticks -->
                <svg width="8" height="8" style="position: absolute; top: -1px; left: -1px;"><polyline points="6,1 1,1 1,6" fill="none" stroke="var(--accent-color, #0088ff)" stroke-width="1.5"/></svg>
                <svg width="8" height="8" style="position: absolute; top: -1px; right: -1px;"><polyline points="1,1 6,1 6,6" fill="none" stroke="var(--accent-color, #0088ff)" stroke-width="1.5"/></svg>
                <svg width="8" height="8" style="position: absolute; bottom: -1px; left: -1px;"><polyline points="1,1 1,6 6,6" fill="none" stroke="var(--accent-color, #0088ff)" stroke-width="1.5"/></svg>
                <svg width="8" height="8" style="position: absolute; bottom: -1px; right: -1px;"><polyline points="6,1 6,6 1,6" fill="none" stroke="var(--accent-color, #0088ff)" stroke-width="1.5"/></svg>
                
                <div style="position: relative; z-index: 1;">
                    ${subFoldersHtml}
                    ${itemsHtml}
                </div>
            </div>
            <div style="margin-top: 10px; cursor: pointer; color: rgba(128,128,128,0.6); font-family: 'Share Tech Mono', monospace; font-size: 10px; display: flex; align-items: center; gap: 6px;" 
                 onclick="window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')">
                ‹ SYSTEM ROOT
            </div>
        `;

        // Swap the card's list HTML
        let listContainer = card.querySelector('.category-scrollable') || card.querySelector('.bookmark-folder-sections');
        if (!listContainer) return;

        // If this is the first time entering, we need to stash the original Mode 1 HTML
        if (!card.dataset.mode1Html) {
            // Find the immediate parent of the list HTML (often the card itself, or right after lib-panel)
            const libPanel = card.querySelector('.lib-panel');
            let contentWrapper = Array.from(card.children).find(el => el !== libPanel && !el.classList.contains('category-header') && !el.classList.contains('cat-progress-bg') && !el.classList.contains('category-footer'));
            if (contentWrapper) {
                card.dataset.mode1Html = contentWrapper.outerHTML;
                contentWrapper.outerHTML = `<div class="v2-folder-container" style="padding: 0 10px 10px;">${frameHtml}</div>`;
            }
        } else {
            const v2Container = card.querySelector('.v2-folder-container');
            if (v2Container) {
                v2Container.innerHTML = frameHtml;
            }
        }
    };

    // Exit the folder and restore the standard list
    window.EveFolderViewV2.exitFolder = function (event, categoryName, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const card = document.querySelector(`.category-card[data-card-category="${escapeCardHtml(categoryName)}"][data-card-workspace="${escapeCardHtml(workspaceId)}"]`);
        if (!card || !card.dataset.mode1Html) return;

        const v2Container = card.querySelector('.v2-folder-container');
        if (v2Container) {
            v2Container.outerHTML = card.dataset.mode1Html;
            delete card.dataset.mode1Html;
        }
    };
})();
