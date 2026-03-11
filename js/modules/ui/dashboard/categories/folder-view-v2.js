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

    // State Management
    window.EveFolderViewV2.isManhwaModeEnabled = function(workspaceId, categoryName) {
        if (!window.eveState?.config) return false;
        if (typeof window.eveState.config.cardFolderViewModes !== 'object') return false;
        const key = `${workspaceId}::${categoryName}`;
        return !!window.eveState.config.cardFolderViewModes[key];
    };

    window.EveFolderViewV2.toggleManhwaMode = function(workspaceId, categoryName) {
        if (!window.eveState) return;
        if (!window.eveState.config.cardFolderViewModes || typeof window.eveState.config.cardFolderViewModes !== 'object') {
            window.eveState.config.cardFolderViewModes = {};
        }
        const key = `${workspaceId}::${categoryName}`;
        const current = !!window.eveState.config.cardFolderViewModes[key];
        window.eveState.config.cardFolderViewModes[key] = !current;
        
        // Clear active folder state when toggling
        if (window.eveState.config.activeManhwaFolders) {
            delete window.eveState.config.activeManhwaFolders[key];
        }

        if (typeof window.saveConfig === 'function') window.saveConfig();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    };

    window.EveFolderViewV2.saveActiveFolderState = function(workspaceId, categoryName, folderId) {
        if (!window.eveState?.config) return;
        if (!window.eveState.config.activeManhwaFolders) window.eveState.config.activeManhwaFolders = {};
        const key = `${workspaceId}::${categoryName}`;
        if (folderId) {
            window.eveState.config.activeManhwaFolders[key] = folderId;
        } else {
            delete window.eveState.config.activeManhwaFolders[key];
        }
        if (typeof window.saveConfig === 'function') window.saveConfig();
    };

    window.EveFolderViewV2.restoreActiveFolderState = function(workspaceId, categoryName) {
        if (!window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName)) return;
        if (!window.eveState?.config?.activeManhwaFolders) return;
        
        const key = `${workspaceId}::${categoryName}`;
        const targetFolderId = window.eveState.config.activeManhwaFolders[key];
        
        if (targetFolderId) {
            // Give the DOM a tiny beat to attach the card before jumping in
            setTimeout(() => {
                window.EveFolderViewV2.enterFolder(null, categoryName, targetFolderId, workspaceId);
            }, 50);
        }
    };

    // Drag and Drop Helpers for Folder Movement
    window.EveFolderViewV2.handleFolderDragStart = function(event, folderId, categoryName, workspaceId) {
        if (!event || !event.dataTransfer) return;
        event.dataTransfer.setData('text/plain', JSON.stringify({ 
            type: 'folder', 
            id: folderId,
            sourceCategory: categoryName,
            sourceWorkspace: workspaceId
        }));
        event.dataTransfer.effectAllowed = 'move';
        // Add a class for styling while dragging if desired
        setTimeout(() => {
            if (event.target && event.target.classList) {
                event.target.classList.add('is-dragging');
            }
        }, 0);
    };

    window.EveFolderViewV2.handleFolderDrop = function(event, categoryName, targetFolderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const rawData = event.dataTransfer?.getData('text/plain') || event.dataTransfer?.getData('application/json');
        if (!rawData) return;

        let payload = null;
        try {
            payload = JSON.parse(rawData);
        } catch (e) {
            // Not a JSON payload, probably standard bookmark link ID
        }

        // If it's a folder payload, move the folder
        if (payload && payload.type === 'folder' && payload.id) {
            const folderIdToMove = payload.id;
            if (folderIdToMove === targetFolderId) return; // Can't move into itself
            
            const folderApi = window.EveBookmarkFolders;
            if (!folderApi) return;

            const isCrossCard = (payload.sourceWorkspace && payload.sourceWorkspace !== workspaceId) || 
                               (payload.sourceCategory && payload.sourceCategory !== categoryName);

            if (isCrossCard && folderApi.transferFolderToCategory) {
                // Cross-Card Transfer
                folderApi.transferFolderToCategory(
                    folderIdToMove,
                    payload.sourceWorkspace,
                    payload.sourceCategory,
                    workspaceId,
                    categoryName,
                    targetFolderId || ''
                );
            } else if (folderApi.moveFolder) {
                // Intra-Card Move
                folderApi.moveFolder(workspaceId, categoryName, folderIdToMove, targetFolderId || '');
            }
            
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        // Otherwise, it's bookmarks, fallback to standard drop
        if (typeof window.moveBookmarksToFolderDrop === 'function') {
            window.moveBookmarksToFolderDrop(event, categoryName, targetFolderId, workspaceId);
        }
    };

    // Render Root Grid (replaces Tree View for top level)
    window.EveFolderViewV2.renderRootGrid = function(workspaceId, categoryName, viewModel, defaultRenderer) {
        const topLevelFolders = viewModel.topLevelFolders || [];
        const rootLinks = viewModel.rootLinks || [];
        
        let html = '<div class="v2-folder-root-container" style="padding: 0 10px 10px;">';
        
        // Render Folders
        if (topLevelFolders.length > 0) {
            html += `
                <div class="folder-wrap-grid">
                    ${topLevelFolders.map(f => {
                        const dropTargetAttr = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('folder-tile-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('folder-tile-drag-hover')" ondragleave="event.currentTarget.classList.remove('folder-tile-drag-hover')"`;
                        const dragStartAttr = `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(f.id)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;

                        return `
                        <div class="folder-tile" ${dropTargetAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');">
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
                            <button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button>
                        </div>
                    `}).join('')}
                </div>
            `;
        }

        // Render Divider if both exist
        if (topLevelFolders.length > 0 && rootLinks.length > 0) {
            html += `<div class="manhwa-divider">ROOT ITEMS</div>`;
        }

        // Render Bookmarks
        if (rootLinks.length > 0) {
            html += `<div style="padding-top: 4px;">${defaultRenderer(rootLinks)}</div>`;
        }

        if (topLevelFolders.length === 0 && rootLinks.length === 0) {
            html += `<div style="padding: 20px; text-align: center; color: rgba(128,128,128,0.5); font-family: 'Share Tech Mono', monospace; font-size: 11px;">EMPTY SECTOR</div>`;
        }

        html += '</div>';
        return html;
    };

    // Enter a folder and swap the view
    window.EveFolderViewV2.enterFolder = function (event, categoryName, folderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const card = document.querySelector(`.category-card[data-card-category="${escapeCardHtml(categoryName)}"][data-card-workspace="${escapeCardHtml(workspaceId)}"]`);
        if (!card) return;

        window.EveFolderViewV2.saveActiveFolderState(workspaceId, categoryName, folderId);

        const folderApi = window.EveBookmarkFolders;
        if (!folderApi || !folderApi.buildFolderView) return;

        // Ensure we have access to the links for this category
        const catLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === categoryName) : [];
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, catLinks);

        // Build breadcrumb trail dynamically
        let trail = [{ label: categoryName.toLowerCase(), id: null }];
        
        let currentNodeId = folderId;
        let pathNodes = [];
        // Walk up to root
        while (currentNodeId) {
            const node = viewModel.nodes.find(n => n.id === currentNodeId);
            if (node) {
                pathNodes.unshift({ label: node.name, id: node.id });
                currentNodeId = (node.parentId && node.parentId !== node.id && viewModel.nodes.some(n => n.id === node.parentId)) ? node.parentId : null;
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
        let breadcrumbsHtml = `<div class="folder-breadcrumbs" style="position: relative; padding-right: 30px;">`;
        trail.forEach((t, i) => {
            if (i > 0) breadcrumbsHtml += `<span class="breadcrumb-separator">›</span>`;
            const isLast = i === trail.length - 1;
            const clickAction = t.id 
                ? `window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(t.id)}', '${escapeCardJs(workspaceId)}')`
                : `window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')`;
            
            const dropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('active'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(t.id || '')}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('active')" ondragleave="event.currentTarget.classList.remove('active')"`;

            breadcrumbsHtml += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" onclick="${isLast ? '' : clickAction}" ${dropAction}>${escapeCardHtml(t.label.toUpperCase())}</span>`;
            if (isLast) breadcrumbsHtml += `<span class="breadcrumb-cursor"></span>`;
        });

        // Add interior Edit Button if we are actually inside a folder
        if (folderId) {
            breadcrumbsHtml += `
                <button type="button" class="folder-tile-edit-btn" style="position: absolute; right: 0; opacity: 0.7;" title="Edit Current Folder" 
                    onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">
                    &#9998;
                </button>
            `;
        }
        
        breadcrumbsHtml += `</div>`;

        // 2. Build Sub-Folders Grid HTML
        let subFoldersHtml = '';
        if (subFolders.length > 0) {
            subFoldersHtml += `
                <div class="manhwa-divider">FOLDERS</div>
                <div class="folder-wrap-grid">
                    ${subFolders.map(f => {
                        const dropTargetAttr = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('folder-tile-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('folder-tile-drag-hover')" ondragleave="event.currentTarget.classList.remove('folder-tile-drag-hover')"`;
                        const dragStartAttr = `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(f.id)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;

                        return `
                        <div class="folder-tile" ${dropTargetAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');">
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
                            <button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button>
                        </div>
                    `}).join('')}
                </div>
            `;
        }

        // 3. Build Items Grid HTML
        let itemsHtml = '';
        if (folderItems.length > 0) {
            if (subFolders.length > 0) itemsHtml += `<div class="manhwa-divider">ITEMS</div>`;
            
            let flatHtml = folderItems.map(link => {
                const isTaskEnabled = typeof folderApi?.isTaskEnabledForLink === 'function' ? !!folderApi.isTaskEnabledForLink(link) : true;
                if (typeof window.DashboardCategories?.buildLinkHtml === 'function') {
                    return window.DashboardCategories.buildLinkHtml(link, '', workspaceId, window.eveState?.config?.workspaces || [], {
                        folderLabel: '',
                        isTaskEnabled: isTaskEnabled
                    });
                }
                const jsId = escapeCardJs(String(link.id));
                return `
                    <div class="item-row" style="display: flex; align-items: center; gap: 12px; padding: 10px 18px; cursor: pointer; border-left: 2px solid rgba(128,128,128,0.2);" 
                         onclick="if(typeof window.handleLinkClick === 'function') { window.handleLinkClick(event, '${jsId}', this); } else { window.open('${escapeCardJs(link.url)}', '_blank'); }">
                        <span>${escapeCardHtml(link.icon || '🔗')}</span>
                        <span>${escapeCardHtml(link.title)}</span>
                    </div>
                `;
            }).join('');
            
            itemsHtml += `
                <div style="padding: 4px 0;">
                    <ul class="category-scrollable" style="max-height: none; overflow: visible;">
                        ${flatHtml}
                    </ul>
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
                <svg width="10" height="10" style="position: absolute; top: 6px; left: 6px;"><polyline points="8,1 1,1 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg>
                <svg width="10" height="10" style="position: absolute; top: 6px; right: 6px;"><polyline points="1,1 8,1 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg>
                <svg width="10" height="10" style="position: absolute; bottom: 6px; left: 6px;"><polyline points="1,1 1,8 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg>
                <svg width="10" height="10" style="position: absolute; bottom: 6px; right: 6px;"><polyline points="8,1 8,8 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg>
                <div style="position: relative; z-index: 1;">
                    ${subFoldersHtml}
                    ${itemsHtml}
                </div>
            </div>
            <div style="margin-top: 10px; cursor: pointer; color: rgba(128,128,128,0.6); font-family: 'Share Tech Mono', monospace; font-size: 10px;" 
                 onclick="window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')">
                ‹ SYSTEM ROOT
            </div>
        `;

        const listContainer = card.querySelector('.category-scrollable') || card.querySelector('.bookmark-folder-sections') || card.querySelector('.v2-folder-root-container') || card.querySelector('.v2-folder-container');
        if (!listContainer) return;

        if (!card.dataset.mode1Html) {
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

    window.EveFolderViewV2.exitFolder = function (event, categoryName, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const card = document.querySelector(`.category-card[data-card-category="${escapeCardHtml(categoryName)}"][data-card-workspace="${escapeCardHtml(workspaceId)}"]`);
        if (!card || !card.dataset.mode1Html) return;

        window.EveFolderViewV2.saveActiveFolderState(workspaceId, categoryName, null);

        const v2Container = card.querySelector('.v2-folder-container');
        if (v2Container) {
            v2Container.outerHTML = card.dataset.mode1Html;
            delete card.dataset.mode1Html;
        }
    };
})();
