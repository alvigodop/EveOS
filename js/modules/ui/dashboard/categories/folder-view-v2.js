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

    function buildScopedFolderViewKey(workspaceId, categoryName) {
        return `${String(workspaceId || 'main').trim() || 'main'}::${String(categoryName || '').trim() || 'Unsorted'}`;
    }

    function cloneGhostFilterChain(chain) {
        if (!Array.isArray(chain)) return null;
        const normalized = chain
            .map((item) => ({
                dimension: String(item?.dimension || '').trim(),
                valueKey: String(item?.valueKey || '').trim().toLowerCase(),
                label: String(item?.label || '').trim()
            }))
            .filter((item) => item.dimension && item.valueKey);
        return normalized.length ? normalized : null;
    }

    window.EveFolderViewV2._viewModelCache = window.EveFolderViewV2._viewModelCache || {};
    window.EveFolderViewV2._headerActionState = window.EveFolderViewV2._headerActionState || {};

    window.EveFolderViewV2.setCachedViewModel = function(workspaceId, categoryName, viewModel) {
        window.EveFolderViewV2._viewModelCache[buildScopedFolderViewKey(workspaceId, categoryName)] = viewModel || null;
    };

    window.EveFolderViewV2.getCachedViewModel = function(workspaceId, categoryName) {
        return window.EveFolderViewV2._viewModelCache[buildScopedFolderViewKey(workspaceId, categoryName)] || null;
    };

    function buildHeaderActionKey(workspaceId, categoryName, folderId) {
        return `${buildScopedFolderViewKey(workspaceId, categoryName)}::${String(folderId || '').trim() || '__root__'}`;
    }

    window.EveFolderViewV2.isHeaderActionsExpanded = function (workspaceId, categoryName, folderId) {
        return !!window.EveFolderViewV2._headerActionState[buildHeaderActionKey(workspaceId, categoryName, folderId)];
    };

    function rerenderActiveFolderView(workspaceId, categoryName) {
        const scopedKey = `${workspaceId}::${categoryName}`;
        const activeFolderId = String(window.eveState?.config?.activeManhwaFolders?.[scopedKey] || '').trim();
        if (activeFolderId) {
            window.EveFolderViewV2.enterFolder(null, categoryName, activeFolderId, workspaceId);
            return;
        }
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }

    window.EveFolderViewV2.toggleHeaderActions = function (workspaceId, categoryName, folderId) {
        const key = buildHeaderActionKey(workspaceId, categoryName, folderId);
        window.EveFolderViewV2._headerActionState[key] = !window.EveFolderViewV2._headerActionState[key];
        rerenderActiveFolderView(workspaceId, categoryName);
    };

    function getNodeScopedLinks(viewModel, folderId) {
        const targetNode = viewModel?.nodes?.find((node) => String(node?.id || '') === String(folderId || ''));
        if (!targetNode) return { targetNode: null, links: [] };
        if (targetNode.isGhost) {
            return {
                targetNode,
                links: Array.isArray(targetNode._ghostLinks) ? targetNode._ghostLinks.slice() : []
            };
        }
        const linkIds = collectFolderSubtreeLinkIds(viewModel, folderId);
        const scopedLinks = Array.isArray(viewModel?.scopedLinks)
            ? viewModel.scopedLinks.filter((link) => linkIds.includes(String(link?.id || '')))
            : [];
        return { targetNode, links: scopedLinks };
    }

    function getCategoryLinks(workspaceId, categoryName) {
        return window.getModalLinks
            ? window.getModalLinks().filter((link) => link.workspace === workspaceId && link.category === categoryName)
            : [];
    }

    function collectFolderSubtreeLinkIds(viewModel, folderId) {
        const normalizedFolderId = String(folderId || '').trim();
        if (!normalizedFolderId || !viewModel?.childrenMap || !viewModel?.folderLinks) return [];
        const visited = new Set();
        const linkIds = new Set();
        const stack = [normalizedFolderId];
        while (stack.length > 0) {
            const currentId = String(stack.pop() || '').trim();
            if (!currentId || visited.has(currentId)) continue;
            visited.add(currentId);
            (viewModel.folderLinks.get(currentId) || []).forEach((link) => {
                const linkId = String(link?.id || '').trim();
                if (linkId) linkIds.add(linkId);
            });
            (viewModel.childrenMap.get(currentId) || []).forEach((childNode) => {
                const childId = String(childNode?.id || '').trim();
                if (childId && !visited.has(childId)) stack.push(childId);
            });
        }
        return Array.from(linkIds);
    }

    function getTargetFolderNode(workspaceId, categoryName, folderId) {
        const cachedViewModel = window.EveFolderViewV2.getCachedViewModel(workspaceId, categoryName);
        if (cachedViewModel?.nodes?.length) {
            const cachedNode = cachedViewModel.nodes.find((node) => String(node?.id || '') === String(folderId || ''));
            if (cachedNode) return cachedNode;
        }
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return null;
        const categoryLinks = getCategoryLinks(workspaceId, categoryName);
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks);
        viewModel.scopedLinks = categoryLinks;
        window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);
        return viewModel.nodes.find((node) => String(node?.id || '') === String(folderId || '')) || null;
    }

    window.EveFolderViewV2.getFolderScopedLinkIds = function (workspaceId, categoryName, folderId) {
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return [];
        const categoryLinks = getCategoryLinks(workspaceId, categoryName);
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks);
        viewModel.scopedLinks = categoryLinks;
        window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);
        const { links } = getNodeScopedLinks(viewModel, folderId);
        return links
            .map((link) => String(link?.id || '').trim())
            .filter(Boolean);
    };

    window.EveFolderViewV2.openFolderScopedMap = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        if (window.EveConstellationMap?.openFolderMap) {
            if (targetNode.isGhost && window.EveConstellationMap?.openDerivedMap) {
                const linkIds = window.EveFolderViewV2.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
                window.EveConstellationMap.openDerivedMap({
                    workspaceId,
                    categoryName,
                    linkIds,
                    scopeLabel: targetNode.name
                });
                return;
            }
            window.EveConstellationMap.openFolderMap(workspaceId, categoryName, folderId, targetNode.name);
        }
    };

    window.EveFolderViewV2.openFolderBulkTitle = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        const linkIds = window.EveFolderViewV2.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
        if (!linkIds.length) {
            if (typeof window.showToast === 'function') window.showToast('No bookmarks in this folder subtree.', 'warning');
            return;
        }
        if (typeof window.openBulkTitleModal === 'function') {
            window.openBulkTitleModal({
                categoryName,
                linkIds,
                title: `Auto-Title Links :: ${targetNode.name}`,
                hint: 'Only bookmarks inside this folder and its nested subfolders are included.'
            });
        }
    };

    window.EveFolderViewV2.openFolderBulkLibraryAuto = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        const linkIds = window.EveFolderViewV2.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
        if (!linkIds.length) {
            if (typeof window.showToast === 'function') window.showToast('No bookmarks in this folder subtree.', 'warning');
            return;
        }
        if (typeof window.openBulkLibraryAutoModal === 'function') {
            window.openBulkLibraryAutoModal({
                categoryName,
                linkIds,
                title: `Auto-Add Library Entries :: ${targetNode.name}`,
                hint: 'Strict mode: sources are accepted only when API title/synonym matches the bookmark title exactly (case-sensitive). Only this folder subtree is included.'
            });
        }
    };

    // State Management
    window.EveFolderViewV2.isManhwaModeEnabled = function(workspaceId, categoryName) {
        if (!window.eveState?.config) return true;
        if (typeof window.eveState.config.cardFolderViewModes !== 'object') return true;
        const key = `${workspaceId}::${categoryName}`;
        if (window.eveState.config.cardFolderViewModes.hasOwnProperty(key)) {
            return !!window.eveState.config.cardFolderViewModes[key];
        }
        return true;
    };

    window.EveFolderViewV2.isGhostFolderEnabled = function(workspaceId, categoryName, ghostType) {
        if (!window.eveState?.config) return true;
        if (typeof window.eveState.config.cardGhostFolders !== 'object') return true;
        const key = `${workspaceId}::${categoryName}::${ghostType}`;
        if (window.eveState.config.cardGhostFolders.hasOwnProperty(key)) {
            return !!window.eveState.config.cardGhostFolders[key];
        }
        return true; // Default to true
    };

    window.EveFolderViewV2.toggleGhostFolder = function(workspaceId, categoryName, ghostType) {
        if (!window.eveState) return;
        if (!window.eveState.config.cardGhostFolders || typeof window.eveState.config.cardGhostFolders !== 'object') {
            window.eveState.config.cardGhostFolders = {};
        }
        const key = `${workspaceId}::${categoryName}::${ghostType}`;
        const current = window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, ghostType);
        window.eveState.config.cardGhostFolders[key] = !current;

        if (typeof window.saveConfig === 'function') window.saveConfig();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    };

    window.EveFolderViewV2.toggleManhwaMode = function(workspaceId, categoryName) {
        if (!window.eveState) return;
        if (!window.eveState.config.cardFolderViewModes || typeof window.eveState.config.cardFolderViewModes !== 'object') {
            window.eveState.config.cardFolderViewModes = {};
        }
        const key = `${workspaceId}::${categoryName}`;
        const current = window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName);
        window.eveState.config.cardFolderViewModes[key] = !current;

        // Clear active folder state when toggling
        if (window.eveState.config.activeManhwaFolders) {
            delete window.eveState.config.activeManhwaFolders[key];
        }
        if (window.eveState.config.activeManhwaFolderChains) {
            delete window.eveState.config.activeManhwaFolderChains[key];
        }
        if (window.eveState.config.activeManhwaScopeRoots) {
            delete window.eveState.config.activeManhwaScopeRoots[key];
        }

        if (typeof window.saveConfig === 'function') window.saveConfig();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    };

    window.EveFolderViewV2.saveActiveFolderState = function(workspaceId, categoryName, folderId, ghostChain, scopeRootId) {
        if (!window.eveState?.config) return;
        if (!window.eveState.config.activeManhwaFolders) window.eveState.config.activeManhwaFolders = {};
        if (!window.eveState.config.activeManhwaFolderChains || typeof window.eveState.config.activeManhwaFolderChains !== 'object') {
            window.eveState.config.activeManhwaFolderChains = {};
        }
        if (!window.eveState.config.activeManhwaScopeRoots || typeof window.eveState.config.activeManhwaScopeRoots !== 'object') {
            window.eveState.config.activeManhwaScopeRoots = {};
        }
        const key = `${workspaceId}::${categoryName}`;
        if (folderId) {
            window.eveState.config.activeManhwaFolders[key] = folderId;
        } else {
            delete window.eveState.config.activeManhwaFolders[key];
        }
        const normalizedChain = cloneGhostFilterChain(ghostChain);
        if (normalizedChain) {
            window.eveState.config.activeManhwaFolderChains[key] = normalizedChain;
        } else {
            delete window.eveState.config.activeManhwaFolderChains[key];
        }
        const normalizedScopeRootId = scopeRootId ? String(scopeRootId).trim() : '';
        if (normalizedScopeRootId) {
            window.eveState.config.activeManhwaScopeRoots[key] = normalizedScopeRootId;
        } else {
            delete window.eveState.config.activeManhwaScopeRoots[key];
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

        // Stop bubbling to prevent parent folders from overwriting the payload
        event.stopPropagation();

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
                if (!payload.sourceWorkspace || !payload.sourceCategory) {
                    console.warn('[EveFolderViewV2] Cross-card transfer aborted: Missing source metadata.', payload);
                    return;
                }
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

        const dropTargetAttr = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('active'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('active')" ondragleave="event.currentTarget.classList.remove('active')"`;
        let html = `<div class="v2-folder-root-container" style="padding: 0 10px 10px;" ${dropTargetAttr}>`;

        // Render Folders
        if (topLevelFolders.length > 0) {
            html += `
                <div class="folder-wrap-grid">
                    ${topLevelFolders.map(f => {
                        const isGhost = !!f.isGhost;
                        const dropTargetAttr = isGhost ? '' : `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('folder-tile-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('folder-tile-drag-hover')" ondragleave="event.currentTarget.classList.remove('folder-tile-drag-hover')"`;
                        const dragStartAttr = isGhost ? '' : `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(f.id)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;
                        const matchCount = viewModel.folderLinks.get(f.id)?.length || 0;
                        const childCount = (viewModel.childrenMap.get(f.id) || []).length;
                        const statsLabel = isGhost
                            ? (childCount > 0 ? `${matchCount} matches | ${childCount} views` : `${matchCount} matches`)
                            : `${matchCount} items`;
                        const contextMenuAttr = isGhost
                            ? ''
                            : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');"`;
                        const editButtonHtml = isGhost
                            ? ''
                            : `<button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button>`;

                        return `
                        <div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}" ${dropTargetAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" ${contextMenuAttr}>
                            <div class="folder-tile-left-bar"></div>
                            <div class="folder-icon-box">
                                <svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;">
                                    <rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
                                    <path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
                                </svg>
                            </div>
                            <div class="folder-tile-content">
                                <div class="folder-tile-title">${escapeCardHtml(f.name)}</div>
                                <div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div>
                            </div>
                            ${editButtonHtml}
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

        const cachedViewModel = window.EveFolderViewV2.getCachedViewModel(workspaceId, categoryName);
        const cachedTargetNode = cachedViewModel?.nodes?.find((node) => String(node?.id || '') === String(folderId || ''));
        const scopeRootId = cachedTargetNode?.isGhost
            ? (cachedTargetNode?._ghostScopeRootId || window.eveState?.config?.activeManhwaScopeRoots?.[`${workspaceId}::${categoryName}`] || null)
            : folderId;
        window.EveFolderViewV2.saveActiveFolderState(
            workspaceId,
            categoryName,
            folderId,
            cloneGhostFilterChain(cachedTargetNode?._ghostFilterChain),
            scopeRootId
        );

        const folderApi = window.EveBookmarkFolders;
        if (!folderApi || !folderApi.buildFolderView) return;

        // Ensure we have access to the links for this category
        const catLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === categoryName) : [];
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, catLinks);
        viewModel.scopedLinks = catLinks;
        window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);

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

        const headerActionsExpanded = folderId
            ? window.EveFolderViewV2.isHeaderActionsExpanded(workspaceId, categoryName, folderId)
            : false;

        const folderHeaderActionsHtml = folderId
            ? `
                <div class="folder-breadcrumb-actions">
                    <button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn ${headerActionsExpanded ? 'active' : ''}" title="Folder Actions"
                        onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.toggleHeaderActions('${escapeCardJs(workspaceId)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}');">
                        &#9998;
                    </button>
                    <button type="button" class="folder-breadcrumb-action-btn folder-breadcrumb-icon-btn" title="Constellation Map"
                        onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderScopedMap('${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">
                        &#127756;
                    </button>
                </div>
            `
            : '';

        const editFolderButtonHtml = targetNode.isGhost
            ? ''
            : `
                    <button type="button" class="folder-breadcrumb-action-btn" title="Edit Current Folder"
                        onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">
                        &#9998; Edit Folder
                    </button>`;

        const folderHeaderActionTrayHtml = (folderId && headerActionsExpanded)
            ? `
                <div class="folder-breadcrumb-action-tray">
                    ${editFolderButtonHtml}
                    <button type="button" class="folder-breadcrumb-action-btn" title="Auto-Title Links"
                        onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkTitle('${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">
                        &#127991; Auto-Title
                    </button>
                    <button type="button" class="folder-breadcrumb-action-btn" title="Auto-Add Library Entries"
                        onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkLibraryAuto('${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">
                        &#128214; Auto-Library
                    </button>
                </div>
            `
            : '';

        // 1. Build Breadcrumbs HTML
        let breadcrumbsHtml = `<div class="folder-breadcrumbs"><div class="folder-breadcrumb-trail">`;
        trail.forEach((t, i) => {
            if (i > 0) breadcrumbsHtml += `<span class="breadcrumb-separator">&#8250;</span>`;
            const isLast = i === trail.length - 1;
            const clickAction = t.id
                ? `window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(t.id)}', '${escapeCardJs(workspaceId)}')`
                : `window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')`;

            const dropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('breadcrumb-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(t.id || '')}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('breadcrumb-drag-hover')" ondragleave="event.currentTarget.classList.remove('breadcrumb-drag-hover')"`;

            breadcrumbsHtml += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" onclick="${isLast ? '' : clickAction}" ${dropAction}>${escapeCardHtml(t.label.toUpperCase())}</span>`;
            if (isLast) breadcrumbsHtml += `<span class="breadcrumb-cursor"></span>`;
        });

        breadcrumbsHtml += `</div>`;
        breadcrumbsHtml += folderHeaderActionsHtml;
        breadcrumbsHtml += `</div>`;
        breadcrumbsHtml += folderHeaderActionTrayHtml;

        // 2. Build Sub-Folders Grid HTML
        let subFoldersHtml = '';
        if (subFolders.length > 0) {
            subFoldersHtml += `
                <div class="manhwa-divider">FOLDERS</div>
                <div class="folder-wrap-grid">
                    ${subFolders.map(f => {
                        const isGhost = !!f.isGhost;
                        const dropTargetAttr = isGhost ? '' : `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('folder-tile-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('folder-tile-drag-hover')" ondragleave="event.currentTarget.classList.remove('folder-tile-drag-hover')"`;
                        const dragStartAttr = isGhost ? '' : `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(f.id)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;
                        const matchCount = viewModel.folderLinks.get(f.id)?.length || 0;
                        const childCount = (viewModel.childrenMap.get(f.id) || []).length;
                        const statsLabel = isGhost
                            ? (childCount > 0 ? `${matchCount} matches | ${childCount} views` : `${matchCount} matches`)
                            : `${matchCount} items`;
                        const contextMenuAttr = isGhost
                            ? ''
                            : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');"`;
                        const editButtonHtml = isGhost
                            ? ''
                            : `<button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button>`;

                        return `
                        <div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}" ${dropTargetAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(f.id)}', '${escapeCardJs(workspaceId)}')" ${contextMenuAttr}>
                            <div class="folder-tile-left-bar"></div>
                            <div class="folder-icon-box">
                                <svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;">
                                    <rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
                                    <path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
                                </svg>
                            </div>
                            <div class="folder-tile-content">
                                <div class="folder-tile-title">${escapeCardHtml(f.name)}</div>
                                <div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div>
                            </div>
                            ${editButtonHtml}
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

        const frameDropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('active'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('active')" ondragleave="event.currentTarget.classList.remove('active')"`;

        // Inject the Frame
        const frameHtml = `
            ${breadcrumbsHtml}
            <div class="manhwa-frame" ${frameDropAction}>
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

        window.EveFolderViewV2.saveActiveFolderState(workspaceId, categoryName, null, null, null);

        const card = document.querySelector(`.category-card[data-card-category="${escapeCardHtml(categoryName)}"][data-card-workspace="${escapeCardHtml(workspaceId)}"]`);
        if (!card) {
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }
        if (!card.dataset.mode1Html) {
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        const v2Container = card.querySelector('.v2-folder-container');
        if (v2Container) {
            v2Container.outerHTML = card.dataset.mode1Html;
            delete card.dataset.mode1Html;
        }

        const folderApi = window.EveBookmarkFolders;
        if (folderApi && typeof folderApi.buildFolderView === 'function') {
            const catLinks = window.getModalLinks
                ? window.getModalLinks().filter((link) => link.workspace === workspaceId && link.category === categoryName)
                : [];
            window.EveFolderViewV2.setCachedViewModel(
                workspaceId,
                categoryName,
                Object.assign(folderApi.buildFolderView(workspaceId, categoryName, catLinks), { scopedLinks: catLinks })
            );
        }
    };
})();
