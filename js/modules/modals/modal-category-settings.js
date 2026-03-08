window.currentCategoryCtx = null;

(function () {
    function escapeCategorySettingsHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeCategorySettingsJs(value) {
        return String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function getCategorySettingsWorkspaceId() {
        return String(window.eveState?.config?.activeWorkspace || (typeof config !== 'undefined' ? config?.activeWorkspace : '') || 'main').trim() || 'main';
    }

    function countFolderBookmarks(folderLinks, folderId) {
        return Array.isArray(folderLinks.get(folderId)) ? folderLinks.get(folderId).length : 0;
    }

    function renderFolderManagerRows(categoryName, workspaceId, viewModel, folderId, depth) {
        const folders = viewModel.childrenMap.get(folderId) || [];
        return folders.map((folder) => {
            const safeCategoryJs = escapeCategorySettingsJs(categoryName);
            const safeFolderJs = escapeCategorySettingsJs(folder.id);
            const bookmarkCount = countFolderBookmarks(viewModel.folderLinks, folder.id);
            const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
            const metaParts = [];
            metaParts.push(`${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'}`);
            metaParts.push(`${childCount} subfolder${childCount === 1 ? '' : 's'}`);
            const indentPx = depth * 18;

            return ''
                + `<div class="bookmark-folder-manager-row" style="display:flex; flex-direction:column; gap:8px; padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03); margin-left:${indentPx}px;">`
                    + '<div style="display:flex; gap:10px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;">'
                        + '<div style="display:flex; flex-direction:column; gap:4px; min-width:0;">'
                            + `<div style="font-weight:600; color:var(--text-main); overflow-wrap:anywhere;">${escapeCategorySettingsHtml(folder.name)}</div>`
                            + `<div style="font-size:0.78rem; opacity:0.72;">${escapeCategorySettingsHtml(metaParts.join(' | '))}</div>`
                        + '</div>'
                        + '<div style="display:flex; gap:6px; flex-wrap:wrap;">'
                            + `<button type="button" onclick="closeModals(); openAddModalForFolder('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Add Bookmark</button>`
                            + `<button type="button" onclick="promptCreateBookmarkFolder('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Subfolder</button>`
                            + `<button type="button" onclick="promptRenameBookmarkFolder('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Rename</button>`
                            + `<button type="button" onclick="deleteBookmarkFolderPrompt('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Delete</button>`
                        + '</div>'
                    + '</div>'
                    + renderFolderManagerRows(categoryName, workspaceId, viewModel, folder.id, depth + 1)
                + '</div>';
        }).join('');
    }

    window.renderCategoryFolderManager = function () {
        const container = document.getElementById('category-folder-manager');
        if (!container) return;
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const folderApi = window.EveBookmarkFolders;

        if (!folderApi?.buildFolderView) {
            container.innerHTML = '<div style="opacity:0.72; font-size:0.9rem;">Folder controls are not available yet.</div>';
            return;
        }

        const scopedLinks = Array.isArray(window.eveState?.links)
            ? window.eveState.links.filter((link) =>
                String(link?.workspace || '') === workspaceId
                && String(link?.category || 'Unsorted') === categoryName
            )
            : [];
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, scopedLinks);
        const rootBookmarks = viewModel.rootLinks.length;
        const folderCount = viewModel.nodes.length;

        if (!folderCount) {
            container.innerHTML = ''
                + '<div style="padding:12px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; opacity:0.8;">'
                    + `<div style="font-weight:600; margin-bottom:4px;">No folders in this card yet</div>`
                    + `<div style="font-size:0.84rem;">Root bookmarks currently visible in this card: ${rootBookmarks}</div>`
                + '</div>';
            return;
        }

        container.innerHTML = ''
            + '<div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02);">'
                + `<div style="font-weight:600; margin-bottom:4px;">Root bookmarks</div>`
                + `<div style="font-size:0.84rem; opacity:0.76;">${rootBookmarks} bookmark${rootBookmarks === 1 ? '' : 's'} not assigned to a folder</div>`
            + '</div>'
            + renderFolderManagerRows(categoryName, workspaceId, viewModel, null, 0);
    };

    window.openCategorySettings = function (categoryName, activeTab = 'general') {
        window.currentCategoryCtx = categoryName;
        window.ctxCatName = categoryName;

        const titleEl = document.getElementById('catSettingsTitle');
        if (titleEl) titleEl.innerText = `Settings: ${categoryName}`;

        const modal = document.getElementById('categorySettingsModal');
        if (modal) {
            modal.style.display = 'flex';
            switchCategoryTab(activeTab);
        }
    };

    window.switchCategoryTab = function (tabName) {
        document.querySelectorAll('#categorySettingsModal .tab-btn').forEach((button) => button.classList.remove('active'));
        const tabBtn = document.getElementById(`tab-btn-${tabName}`);
        if (tabBtn) tabBtn.classList.add('active');

        document.querySelectorAll('#categorySettingsModal .tab-content').forEach((content) => {
            content.style.display = 'none';
        });
        const tabContent = document.getElementById(`cat-tab-${tabName}`);
        if (tabContent) tabContent.style.display = 'block';

        const modalInner = document.querySelector('#categorySettingsModal .modal');
        if (modalInner) {
            modalInner.style.width = '500px';
            modalInner.style.maxWidth = '90%';
        }

        if (tabName === 'folders') {
            window.renderCategoryFolderManager();
            if (modalInner) {
                modalInner.style.width = '620px';
                modalInner.style.maxWidth = '94%';
            }
            return;
        }

        if (tabName === 'search') {
            const searchCont = document.getElementById('modal-api-search-container');
            const resultsCont = document.getElementById('modal-api-results-container');
            if (window.EveOS?.API?.Manager) {
                window.EveOS.API.Manager.renderSearchUI(searchCont, resultsCont, window.currentCategoryCtx);
                setTimeout(() => {
                    const input = searchCont.querySelector('input');
                    if (input) input.focus();
                }, 100);
            }
            return;
        }

        if (tabName === 'scraper') {
            const scraperCont = document.getElementById('modal-scraper-container');
            if (modalInner) {
                modalInner.style.width = '900px';
                modalInner.style.maxWidth = '95%';
            }
            if (scraperCont && window.CategoryScraperPanel) {
                window.CategoryScraperPanel.renderInModal(window.currentCategoryCtx, scraperCont);
                setTimeout(() => {
                    const input = scraperCont.querySelector('.scraper-search-input');
                    if (input) input.focus();
                }, 100);
            }
        }
    };
})();
