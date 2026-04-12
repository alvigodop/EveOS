(function () {
    const core = window.EveCategorySettingsModalCore || {};
    const {
        escapeCategorySettingsJs,
        getCategorySettingsWorkspaceId,
        getFolderApi
    } = core;

    const mod = window.EveCategorySettingsFolders = window.EveCategorySettingsFolders || {};
    if (mod.panelReady) return;

    const { buildFolderManagerRenderState, renderFolderManagerRows } = mod;

    function buildGhostFolderSections(workspaceId, categoryName, safeCategoryJs) {
        if (!window.EveFolderViewV2) return '';

        const sections = [
            {
                title: 'Link Health (Semantic Drift)',
                types: [
                    { id: 'dead_links', label: '[ Dead Links ]' },
                    { id: 'redirected_links', label: '[ Redirected Links ]' },
                    { id: 'title_drift', label: '[ Title Drift ]' },
                    { id: 'orphaned_lib', label: '[ Orphaned Library Entries ]' }
                ]
            },
            {
                title: 'Domains',
                types: [
                    { id: 'domain_grouping', label: '[ Domain Grouping ]' }
                ]
            },
            {
                title: 'Reading Status',
                types: [
                    { id: 'unread', label: '[ Plan to Read / Unread ]' },
                    { id: 'reading', label: '[ Actively Reading ]' },
                    { id: 'completed', label: '[ Completed ]' },
                    { id: 'on_hold', label: '[ On Hold ]' },
                    { id: 'dropped', label: '[ Dropped ]' }
                ]
            },
            {
                title: 'Task Status',
                types: [
                    { id: 'task_done', label: '[ Done ]' },
                    { id: 'task_pending', label: '[ Pending ]' },
                    { id: 'task_not_tracked', label: '[ Not Tracked ]' }
                ]
            },
            {
                title: 'Maintenance',
                types: [
                    { id: 'unlinked', label: '[ Unlinked Bookmarks ]' },
                    { id: 'missing_covers', label: '[ Missing Covers ]' },
                    { id: 'missing_icons', label: '[ Missing Icons ]' },
                    { id: 'untagged', label: '[ Untagged ]' },
                    { id: 'no_title', label: '[ No Title ]' },
                    { id: 'needs_review', label: '[ Needs Review ]' },
                    { id: 'missing_notes', label: '[ Missing Notes ]' },
                    { id: 'broken_links', label: '[ Broken / Invalid Links ]' }
                ]
            },
            {
                title: 'Activity',
                types: [
                    { id: 'recent', label: '[ Recently Updated ]' },
                    { id: 'recently_visited', label: '[ Recently Visited ]' },
                    { id: 'stale', label: '[ Stale Bookmarks ]' }
                ]
            },
            {
                title: 'Insights',
                types: [
                    { id: 'top_rated', label: '[ Top Rated ]' },
                    { id: 'duplicate_suspects', label: '[ Duplicate Suspects ]' },
                    { id: 'large_folders', label: '[ Large Folders (>15) ]' },
                    { id: 'ancients', label: '[ The Ancients ]' },
                    { id: 'library_stats', label: '[ Genre Clusters ]' },
                    { id: 'library_linked', label: '[ Library-Linked ]' },
                    { id: 'low_confidence', label: '[ Low Confidence ]' },
                    { id: 'high_confidence', label: '[ High Confidence ]' }
                ]
            },
            {
                title: 'True Value',
                types: [
                    { id: 'tv_locked', label: '[ Locked (Unlinked) ]' },
                    { id: 'tv_above', label: '[ Above True (>100%) ]' },
                    { id: 'tv_near', label: '[ Near True (95–100%) ]' },
                    { id: 'tv_below', label: '[ Below True (<95%) ]' }
                ]
            },
            {
                title: 'Indexes',
                types: [
                    { id: 'tag_index', label: '[ By Tags ]' },
                    { id: 'genre_index', label: '[ By Genres ]' },
                    { id: 'author_index', label: '[ By Authors ]' },
                    { id: 'language_index', label: '[ By Language ]' },
                    { id: 'rating_index', label: '[ By Rating ]' },
                    { id: 'confidence_index', label: '[ By Confidence ]' },
                    { id: 'title_index', label: '[ By Title ]' },
                    { id: 'status_index', label: '[ By Status ]' },
                    { id: 'last_read_index', label: '[ By Last Read ]' },
                    { id: 'progress_index', label: '[ By Progress Units ]' },
                    { id: 'demographic_index', label: '[ By Demographic ]' },
                    { id: 'publication_index', label: '[ By Publication Era ]' },
                    { id: 'truevalue_index', label: '[ By True Value Bracket ]' },
                    { id: 'task_index', label: '[ By Task Completion ]' }
                ]
            }
        ];

        let html = `
            <div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); margin-bottom:12px;">
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <div style="font-weight:600;">Smart Ghost Folders</div>
                            <div style="font-size:0.84rem; opacity:0.76;">Toggle which auto-generated views appear inside [ System Views ].</div>
                        </div>
                        <button class="btn-primary" onclick="if(window.EveSemanticDrift) { window.EveSemanticDrift.forceRefreshScan(); }" style="font-size: 0.7rem; padding: 4px 8px;">Refresh Drift Scan</button>
                    </div>
        `;

        sections.forEach((section) => {
            html += `
                <div style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                    <div style="font-size: 0.8rem; color: #aaa; margin-bottom: 6px; font-weight: bold;">${section.title}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:12px;">
            `;
            section.types.forEach((type) => {
                const isEnabled = window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, type.id);
                html += `
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; min-width: 180px;">
                        <input type="checkbox" onchange="window.EveFolderViewV2.toggleGhostFolder('${escapeCategorySettingsJs(workspaceId)}', '${safeCategoryJs}', '${type.id}'); window.renderCategoryFolderManager();" ${isEnabled ? 'checked' : ''}>
                        <span style="font-size:0.85rem;">${type.label}</span>
                    </label>
                `;
            });
            html += '</div></div>';
        });

        html += '</div></div>';
        return html;
    }

    window.renderCategoryFolderManager = function () {
        const container = document.getElementById('category-folder-manager');
        if (!container) return;

        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const folderApi = getFolderApi();
        const safeCategoryJs = escapeCategorySettingsJs(categoryName);

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
        const renderState = buildFolderManagerRenderState(categoryName, workspaceId, viewModel, scopedLinks);
        const rootBookmarks = viewModel.rootLinks.length;
        const folderCount = viewModel.nodes.filter((node) => !node?.isGhost).length;
        const cardPinnedCount = renderState.cardPinnedBookmarkCount;

        const isManhwaMode = window.EveFolderViewV2 && window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName);
        const manhwaModeHtml = window.EveFolderViewV2 ? `
            <div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); margin-bottom:12px;">
                <div style="display:flex; gap:10px; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
                        <div style="font-weight:600;">Folder View Mode</div>
                        <div style="font-size:0.84rem; opacity:0.76;">Switch between standard Tree View and Navigation View (Manhwa System Interface)</div>
                    </div>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" onchange="window.EveFolderViewV2.toggleManhwaMode('${escapeCategorySettingsJs(workspaceId)}', '${safeCategoryJs}'); window.renderCategoryFolderManager();" ${isManhwaMode ? 'checked' : ''}>
                        <span style="font-size:0.85rem;">Enable Manhwa View</span>
                    </label>
                </div>
            </div>
        ` : '';

        const staticHtml = ''
            + manhwaModeHtml
            + buildGhostFolderSections(workspaceId, categoryName, safeCategoryJs)
            + '<div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); margin-bottom:12px;">'
                + '<div style="display:flex; gap:10px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;">'
                    + '<div style="display:flex; flex-direction:column; gap:4px; min-width:0;">'
                        + '<div style="font-weight:600; margin-bottom:4px;">Root bookmarks</div>'
                        + `<div style="font-size:0.84rem; opacity:0.76;">${rootBookmarks} bookmark${rootBookmarks === 1 ? '' : 's'} not assigned to a folder | ${cardPinnedCount} bookmark pin${cardPinnedCount === 1 ? '' : 's'} active in this card</div>`
                    + '</div>'
                    + '<div style="display:flex; gap:6px; flex-wrap:wrap;">'
                        + `<button type="button" onclick="openFolderCreator('${safeCategoryJs}', '')" style="padding:5px 8px; font-size:0.78rem;">Create Root Folder</button>`
                        + `<button type="button" onclick="pinCategoryRootBookmarks('${safeCategoryJs}')" style="padding:5px 8px; font-size:0.78rem;">Pin Root Bookmarks</button>`
                        + `<button type="button" onclick="unpinCategoryBookmarks('${safeCategoryJs}')" style="padding:5px 8px; font-size:0.78rem;">Unpin All In Card</button>`
                    + '</div>'
                + '</div>'
            + '</div>';
        const emptyStateHtml = ''
            + '<div style="padding:12px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; opacity:0.8;">'
                + '<div style="font-weight:600; margin-bottom:4px;">No folders in this card yet</div>'
                + `<div style="font-size:0.84rem;">Root bookmarks currently visible in this card: ${rootBookmarks}</div>`
            + '</div>';
        const renderToken = String(Date.now() + Math.random());
        container.setAttribute('data-folder-render-token', renderToken);

        const renderRowsIntoContainer = function () {
            if (container.getAttribute('data-folder-render-token') !== renderToken) return;
            container.innerHTML = staticHtml + (
                folderCount
                    ? renderFolderManagerRows(categoryName, workspaceId, viewModel, renderState, null, 0)
                    : emptyStateHtml
            );
        };

        if (folderCount > 120) {
            container.innerHTML = staticHtml
                + `<div style="padding:12px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; opacity:0.8;">Rendering ${folderCount} folders...</div>`;
            setTimeout(renderRowsIntoContainer, 0);
            return;
        }

        renderRowsIntoContainer();
    };

    mod.panelReady = true;
})();
