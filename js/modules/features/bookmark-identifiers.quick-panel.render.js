window.EveBookmarkIdentifiers = window.EveBookmarkIdentifiers || {};

(function (ns) {
    if (ns.QuickPanelRender) return;

    function create(deps) {
        const {
            escapeHtml,
            normalizeCategoryName,
            normalizeFolderId,
            buildQuickLinkKey,
            buildQuickLinkDestinationKey,
            normalizeQuickLinks,
            getQuickLinkRecents,
            getWorkspaceLabel,
            buildBadgeHtml,
            getIdentifierStats,
            getQuickPanelQuery,
            getQuickPanelState,
            matchesQuickPanelQuery,
            getChildFolders,
            getFolderPathLabel,
            getBookmarksForFolder
        } = deps;
    function renderSummaryPanel(definition, link) {
        const stats = getIdentifierStats(definition.id);
        const quickLinks = normalizeQuickLinks(definition.quickLinks);
        const currentCard = `${getWorkspaceLabel(link?.workspace)} / ${normalizeCategoryName(link?.category)}`;
        return `
            <div class="bookmark-identifier-panel__topline">
                <div class="bookmark-identifier-panel__badge">${buildBadgeHtml([definition.id])}</div>
                <div class="bookmark-identifier-panel__top-actions">
                    <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="quick">Quick Links</button>
                    <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="close">Close</button>
                </div>
            </div>
            <div class="bookmark-identifier-panel__title">${escapeHtml(definition.label)}</div>
            <p class="bookmark-identifier-panel__desc">${escapeHtml(definition.description || 'No description set for this label yet.')}</p>
            <div class="bookmark-identifier-panel__stats">
                <div><strong>${stats.bookmarkCount}</strong><span>Bookmarks</span></div>
                <div><strong>${stats.cardCount}</strong><span>Cards</span></div>
                <div><strong>${quickLinks.length}</strong><span>Quick Links</span></div>
            </div>
            <div class="bookmark-identifier-panel__context">Current: ${escapeHtml(currentCard)}</div>
        `;
    }

    function renderCardButtons(definition) {
        const quickLinks = normalizeQuickLinks(definition.quickLinks);
        if (!quickLinks.length) {
            return '<div class="bookmark-identifier-panel__empty">No quick-link cards are attached to this label yet. Add them in Settings.</div>';
        }
        const selectedKey = getQuickPanelState()?.target
            ? buildQuickLinkKey(getQuickPanelState().target.workspaceId, getQuickPanelState().target.categoryName)
            : '';
        const query = getQuickPanelQuery();
        const visibleLinks = quickLinks.filter((entry) => !query || matchesQuickPanelQuery([
            entry.categoryName,
            getWorkspaceLabel(entry.workspaceId)
        ]));
        if (!visibleLinks.length) {
            return '<div class="bookmark-identifier-panel__empty">No quick-link cards match this filter.</div>';
        }
        return visibleLinks.map((entry) => {
            const key = buildQuickLinkKey(entry.workspaceId, entry.categoryName);
            const isActive = key === selectedKey ? ' is-active' : '';
            return `
                <button type="button" class="bookmark-identifier-panel__card${isActive}" data-bi-action="card" data-key="${escapeHtml(key)}">
                    <span>${escapeHtml(entry.categoryName)}</span>
                    <small>${escapeHtml(getWorkspaceLabel(entry.workspaceId))}</small>
                </button>
            `;
        }).join('');
    }

    function renderRecentDestinations(definition) {
        const allowedCards = new Set(normalizeQuickLinks(definition.quickLinks).map((entry) => (
            buildQuickLinkKey(entry.workspaceId, entry.categoryName)
        )));
        const rows = getQuickLinkRecents().filter((entry) => {
            if (!allowedCards.has(buildQuickLinkKey(entry.workspaceId, entry.categoryName))) return false;
            if (!getQuickPanelQuery()) return true;
            return matchesQuickPanelQuery([
                entry.categoryName,
                getWorkspaceLabel(entry.workspaceId),
                getFolderPathLabel(entry.workspaceId, entry.categoryName, entry.folderId)
            ]);
        }).slice(0, 5);
        if (!rows.length) return '';
        return `
            <div class="bookmark-identifier-panel__recent">
                <div class="bookmark-identifier-panel__section-label">Recent destinations</div>
                <div class="bookmark-identifier-panel__recent-list">
                    ${rows.map((entry) => `
                        <button type="button" class="bookmark-identifier-panel__recent-chip" data-bi-action="recent" data-key="${escapeHtml(buildQuickLinkDestinationKey(entry))}">
                            <span>${escapeHtml(entry.categoryName)}</span>
                            <small>${escapeHtml(getFolderPathLabel(entry.workspaceId, entry.categoryName, entry.folderId))}</small>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderQuickPanelFilter() {
        const query = getQuickPanelQuery();
        return `
            <div class="bookmark-identifier-panel__filter">
                <input type="search" value="${escapeHtml(query)}" data-bi-action="filter" placeholder="Filter cards, folders, or bookmarks">
                ${query ? '<button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="clear-filter">Clear</button>' : ''}
            </div>
        `;
    }

    function renderFolderBrowser(target) {
        if (!target?.workspaceId || !target?.categoryName) {
            return '<div class="bookmark-identifier-panel__empty">Pick a quick-link card to inspect it.</div>';
        }
        const folderId = normalizeFolderId(target.folderId);
        const folders = getChildFolders(target.workspaceId, target.categoryName, folderId).filter((folder) => matchesQuickPanelQuery([
            folder?.name,
            getFolderPathLabel(target.workspaceId, target.categoryName, folder?.id)
        ]));
        const bookmarks = getBookmarksForFolder(target.workspaceId, target.categoryName, folderId).filter((bookmark) => matchesQuickPanelQuery([
            bookmark?.title,
            bookmark?.url,
            bookmark?.notes
        ]));
        const pathLabel = getFolderPathLabel(target.workspaceId, target.categoryName, folderId);
        const folderRows = folders.map((folder) => `
            <button type="button" class="bookmark-identifier-panel__folder-row" data-bi-action="folder" data-folder-id="${escapeHtml(folder.id)}">
                <span>${escapeHtml(folder.name || 'Folder')}</span>
                <small>${escapeHtml(getFolderPathLabel(target.workspaceId, target.categoryName, folder.id))}</small>
            </button>
        `).join('');
        const bookmarkRows = bookmarks.slice(0, 80).map((bookmark) => `
            <div class="bookmark-identifier-panel__bookmark-row">
                <span>${escapeHtml(bookmark.title || 'Untitled')}</span>
                <small>${escapeHtml(String(bookmark.url || '').replace(/^https?:\/\//, '').slice(0, 72))}</small>
            </div>
        `).join('');
        const overflow = bookmarks.length > 80
            ? `<div class="bookmark-identifier-panel__overflow">Showing 80 of ${bookmarks.length} bookmarks.</div>`
            : '';
        return `
            <div class="bookmark-identifier-panel__browser-head">
                <div>
                    <strong>${escapeHtml(target.categoryName)}</strong>
                    <span>${escapeHtml(pathLabel)}</span>
                </div>
                ${folderId ? '<button type="button" data-bi-action="up">Up</button>' : ''}
            </div>
            <div class="bookmark-identifier-panel__action-row">
                <button type="button" class="bookmark-identifier-panel__primary" data-bi-action="move">Move Here</button>
                <button type="button" class="bookmark-identifier-panel__secondary" data-bi-action="copy">Copy Here</button>
            </div>
            <div class="bookmark-identifier-panel__browser-list">
                ${folderRows || ''}
                ${bookmarkRows || ''}
                ${(!folderRows && !bookmarkRows) ? '<div class="bookmark-identifier-panel__empty">This location is empty.</div>' : ''}
                ${overflow}
            </div>
        `;
    }

    function renderQuickLinksPanel(definition) {
        const quickLinks = normalizeQuickLinks(definition.quickLinks);
        if (!getQuickPanelState().target && quickLinks.length) {
            getQuickPanelState().target = { ...quickLinks[0], folderId: '' };
        }
        return `
            <div class="bookmark-identifier-panel__topline">
                <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="summary">Back</button>
                <button type="button" class="bookmark-identifier-panel__ghost" data-bi-action="close">Close</button>
            </div>
            <div class="bookmark-identifier-panel__title">Quick Links</div>
            ${renderQuickPanelFilter()}
            ${renderRecentDestinations(definition)}
            <div class="bookmark-identifier-panel__cards">${renderCardButtons(definition)}</div>
            ${renderFolderBrowser(getQuickPanelState().target)}
        `;
    }


        return {
            renderSummaryPanel,
            renderQuickLinksPanel
        };
    }

    ns.QuickPanelRender = { create };
})(window.EveBookmarkIdentifiers);