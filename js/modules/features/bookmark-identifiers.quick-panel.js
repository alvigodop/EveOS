window.EveBookmarkIdentifiers = window.EveBookmarkIdentifiers || {};

(function (ns) {
    const h = ns._helpers || {};
    if (!h.getDefinitions) return;
    const {
        escapeHtml,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        buildQuickLinkKey,
        buildQuickLinkDestinationKey,
        parseQuickLinkKey,
        parseQuickLinkDestinationKey,
        normalizeQuickLinks,
        getQuickLinkRecents,
        rememberQuickLinkDestination,
        getLinksList,
        setLinksList,
        getWorkspaceLabel,
        getDefinitions,
        getIdentifiersForLink,
        buildBadgeHtml
    } = h;
    let quickPanelEl = null;
    let quickPanelHideTimer = 0;
    let quickPanelState = null;
    let quickPanelLastState = null;
    let quickPanelListenersAttached = false;

    function findLinkById(linkId) {
        const targetId = String(linkId || '').trim();
        if (!targetId) return null;
        return getLinksList().find((link) => String(link?.id || '').trim() === targetId) || null;
    }

    function getDefinitionById(identifierId) {
        const targetId = String(identifierId || '').trim();
        if (!targetId) return null;
        return getDefinitions().find((definition) => definition.id === targetId) || null;
    }

    function getPanelElement() {
        if (typeof document === 'undefined') return null;
        if (quickPanelEl && document.body.contains(quickPanelEl)) return quickPanelEl;
        quickPanelEl = document.createElement('div');
        quickPanelEl.id = 'bookmarkIdentifierQuickPanel';
        quickPanelEl.className = 'bookmark-identifier-panel';
        quickPanelEl.addEventListener('mouseenter', cancelQuickPanelHide);
        quickPanelEl.addEventListener('mouseleave', scheduleQuickPanelHide);
        quickPanelEl.addEventListener('mousemove', (event) => {
            event.stopPropagation();
            window.hideBookmarkCoverHover?.();
        });
        quickPanelEl.addEventListener('click', handleQuickPanelClick);
        quickPanelEl.addEventListener('input', handleQuickPanelInput);
        document.body.appendChild(quickPanelEl);
        return quickPanelEl;
    }

    function cancelQuickPanelHide() {
        if (quickPanelHideTimer) {
            clearTimeout(quickPanelHideTimer);
            quickPanelHideTimer = 0;
        }
    }

    function scheduleQuickPanelHide() {
        cancelQuickPanelHide();
        quickPanelHideTimer = setTimeout(hideQuickPanel, 220);
    }

    function hideQuickPanel() {
        cancelQuickPanelHide();
        if (quickPanelState) quickPanelLastState = quickPanelState;
        if (quickPanelEl) quickPanelEl.classList.remove('is-open');
        quickPanelState = null;
    }

    function restoreQuickPanelState() {
        if (!quickPanelState && quickPanelLastState) {
            quickPanelState = quickPanelLastState;
        }
        return quickPanelState;
    }

    function positionQuickPanel() {
        const panel = getPanelElement();
        const anchor = quickPanelState?.anchor;
        if (!panel || !anchor || !document.body.contains(anchor)) return;
        const anchorRect = anchor.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const margin = 12;
        const left = Math.max(margin, Math.min(
            window.innerWidth - panelRect.width - margin,
            anchorRect.left + (anchorRect.width / 2) - (panelRect.width / 2)
        ));
        const topCandidate = anchorRect.top - panelRect.height - margin;
        const top = topCandidate > margin
            ? topCandidate
            : Math.min(window.innerHeight - panelRect.height - margin, anchorRect.bottom + margin);
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(Math.max(margin, top))}px`;
    }

    function getIdentifierStats(identifierId) {
        const targetId = String(identifierId || '').trim();
        const matching = getLinksList().filter((link) => getIdentifiersForLink(link).includes(targetId));
        const workspaces = new Set(matching.map((link) => normalizeWorkspaceId(link.workspace)));
        const cards = new Set(matching.map((link) => `${normalizeWorkspaceId(link.workspace)}::${normalizeCategoryName(link.category)}`));
        return {
            bookmarkCount: matching.length,
            workspaceCount: workspaces.size,
            cardCount: cards.size
        };
    }

    function getQuickPanelQuery() {
        return String(quickPanelState?.query || '').trim();
    }

    function matchesQuickPanelQuery(values) {
        const query = getQuickPanelQuery().toLowerCase();
        if (!query) return true;
        return (Array.isArray(values) ? values : [values]).some((value) => (
            String(value || '').toLowerCase().includes(query)
        ));
    }

    function getFolderNodes(workspaceId, categoryName) {
        if (typeof window.EveBookmarkFolders?.getScopedNodes === 'function') {
            return window.EveBookmarkFolders.getScopedNodes(workspaceId, categoryName) || [];
        }
        return [];
    }

    function getChildFolders(workspaceId, categoryName, folderId) {
        const parentId = normalizeFolderId(folderId);
        return getFolderNodes(workspaceId, categoryName)
            .filter((node) => normalizeFolderId(node?.parentId) === parentId)
            .sort((a, b) => {
                const orderDiff = (Number(a?.order) || 0) - (Number(b?.order) || 0);
                if (orderDiff !== 0) return orderDiff;
                return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
            });
    }

    function getParentFolderId(workspaceId, categoryName, folderId) {
        const targetId = normalizeFolderId(folderId);
        if (!targetId) return '';
        const node = getFolderNodes(workspaceId, categoryName).find((entry) => normalizeFolderId(entry?.id) === targetId);
        return normalizeFolderId(node?.parentId);
    }

    function getFolderPathLabel(workspaceId, categoryName, folderId) {
        if (!folderId) return 'Root';
        if (typeof window.EveBookmarkFolders?.buildFolderPathLabel === 'function') {
            return window.EveBookmarkFolders.buildFolderPathLabel(workspaceId, categoryName, folderId) || 'Folder';
        }
        const nodes = getFolderNodes(workspaceId, categoryName);
        const map = new Map(nodes.map((node) => [normalizeFolderId(node?.id), node]));
        const parts = [];
        let cursor = map.get(normalizeFolderId(folderId));
        let guard = 0;
        while (cursor && guard < 64) {
            parts.unshift(String(cursor.name || 'Folder').trim() || 'Folder');
            cursor = map.get(normalizeFolderId(cursor.parentId));
            guard += 1;
        }
        return parts.join(' / ') || 'Folder';
    }

    function getBookmarksForFolder(workspaceId, categoryName, folderId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const targetFolderId = normalizeFolderId(folderId);
        return getLinksList().filter((link) => (
            normalizeWorkspaceId(link?.workspace) === targetWorkspaceId
            && normalizeCategoryName(link?.category) === targetCategoryName
            && normalizeFolderId(link?.folderId) === targetFolderId
        )).sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' }));
    }

    const panelRenderer = ns.QuickPanelRender.create({
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
        getQuickPanelState: () => quickPanelState,
        matchesQuickPanelQuery,
        getChildFolders,
        getFolderPathLabel,
        getBookmarksForFolder
    });
    const { renderSummaryPanel, renderQuickLinksPanel } = panelRenderer;
    function renderQuickPanel() {
        const panel = getPanelElement();
        if (!panel || !quickPanelState) return;
        quickPanelLastState = quickPanelState;
        const definition = getDefinitionById(quickPanelState.identifierId);
        const link = findLinkById(quickPanelState.linkId);
        if (!definition || !link) {
            hideQuickPanel();
            return;
        }
        panel.innerHTML = quickPanelState.page === 'quick'
            ? renderQuickLinksPanel(definition, link)
            : renderSummaryPanel(definition, link);
        panel.classList.add('is-open');
        requestAnimationFrame(positionQuickPanel);
    }

    function showQuickPanelForBadge(badge) {
        if (!badge) return;
        const identifierId = String(badge.getAttribute('data-bookmark-identifier-id') || '').trim();
        const linkId = String(badge.getAttribute('data-bookmark-id') || '').trim();
        if (!identifierId || !linkId) return;
        cancelQuickPanelHide();
        window.hideBookmarkCoverHover?.();
        quickPanelState = {
            anchor: badge,
            identifierId,
            linkId,
            page: 'summary',
            target: null,
            query: ''
        };
        quickPanelLastState = quickPanelState;
        renderQuickPanel();
    }

    function showQuickLinksView() {
        if (!quickPanelState) return;
        quickPanelState.page = 'quick';
        renderQuickPanel();
    }

    function showSummaryView() {
        if (!quickPanelState) return;
        quickPanelState.page = 'summary';
        renderQuickPanel();
    }

    function openQuickLinkCard(key) {
        if (!quickPanelState) return;
        const parsed = parseQuickLinkKey(key);
        if (!parsed) return;
        quickPanelState.page = 'quick';
        quickPanelState.target = { ...parsed, folderId: '' };
        renderQuickPanel();
    }

    function openQuickLinkFolder(folderId) {
        if (!quickPanelState?.target) return;
        quickPanelState.target = {
            ...quickPanelState.target,
            folderId: normalizeFolderId(folderId)
        };
        renderQuickPanel();
    }

    function openQuickLinkRecent(key) {
        if (!quickPanelState) return;
        const parsed = parseQuickLinkDestinationKey(key);
        if (!parsed) return;
        quickPanelState.page = 'quick';
        quickPanelState.target = parsed;
        renderQuickPanel();
    }

    function quickLinkGoUp() {
        if (!quickPanelState?.target) return;
        quickPanelState.target = {
            ...quickPanelState.target,
            folderId: getParentFolderId(
                quickPanelState.target.workspaceId,
                quickPanelState.target.categoryName,
                quickPanelState.target.folderId
            )
        };
        renderQuickPanel();
    }

    const panelActions = ns.QuickPanelActions.create({
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        rememberQuickLinkDestination,
        getLinksList,
        setLinksList,
        getQuickPanelState: () => quickPanelState,
        findLinkById,
        getFolderPathLabel,
        renderQuickPanel,
        hideQuickPanel
    });
    const {
        transferActiveBookmarkToQuickLinkTarget,
        copyActiveBookmarkToQuickLinkTarget
    } = panelActions;
    function handleQuickPanelClick(event) {
        const target = event.target?.closest?.('[data-bi-action]');
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        cancelQuickPanelHide();
        restoreQuickPanelState();
        const action = target.getAttribute('data-bi-action');
        if (action === 'close') hideQuickPanel();
        else if (action === 'quick') showQuickLinksView();
        else if (action === 'summary') showSummaryView();
        else if (action === 'card') openQuickLinkCard(target.getAttribute('data-key'));
        else if (action === 'recent') openQuickLinkRecent(target.getAttribute('data-key'));
        else if (action === 'folder') openQuickLinkFolder(target.getAttribute('data-folder-id'));
        else if (action === 'up') quickLinkGoUp();
        else if (action === 'move') transferActiveBookmarkToQuickLinkTarget();
        else if (action === 'copy') copyActiveBookmarkToQuickLinkTarget();
        else if (action === 'clear-filter') {
            if (!quickPanelState) return;
            quickPanelState.query = '';
            renderQuickPanel();
        }
    }

    function handleQuickPanelInput(event) {
        const target = event.target?.closest?.('[data-bi-action="filter"]');
        if (!target) return;
        cancelQuickPanelHide();
        if (!restoreQuickPanelState()) return;
        quickPanelState.query = String(target.value || '').trim();
        renderQuickPanel();
        requestAnimationFrame(() => {
            const input = quickPanelEl?.querySelector?.('[data-bi-action="filter"]');
            if (!input) return;
            input.focus();
            const end = input.value.length;
            input.setSelectionRange?.(end, end);
        });
    }

    function getBadgeFromEvent(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return null;
        return target.closest('.bookmark-identifier-badge[data-bookmark-id][data-bookmark-identifier-id]');
    }

    function isInsideQuickPanel(target) {
        return !!(quickPanelEl && target && quickPanelEl.contains(target));
    }

    function attachQuickPanelListeners() {
        if (quickPanelListenersAttached || typeof document === 'undefined') return;
        document.addEventListener('mouseover', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge || badge.contains(event.relatedTarget)) return;
            event.stopPropagation();
            showQuickPanelForBadge(badge);
        }, true);
        document.addEventListener('mouseout', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge) return;
            const next = event.relatedTarget;
            if (badge.contains(next) || isInsideQuickPanel(next)) return;
            scheduleQuickPanelHide();
        }, true);
        document.addEventListener('mousemove', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge && !isInsideQuickPanel(event.target)) return;
            event.stopPropagation();
            window.hideBookmarkCoverHover?.();
        }, true);
        document.addEventListener('click', (event) => {
            const badge = getBadgeFromEvent(event);
            if (badge) {
                event.preventDefault();
                event.stopPropagation();
                showQuickPanelForBadge(badge);
                return;
            }
            if (!isInsideQuickPanel(event.target)) hideQuickPanel();
        }, true);
        document.addEventListener('focusin', (event) => {
            const badge = getBadgeFromEvent(event);
            if (badge) showQuickPanelForBadge(badge);
        }, true);
        document.addEventListener('keydown', (event) => {
            const badge = getBadgeFromEvent(event);
            if (!badge) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showQuickPanelForBadge(badge);
            } else if (event.key === 'Escape') {
                hideQuickPanel();
            }
        }, true);
        window.addEventListener?.('resize', positionQuickPanel);
        quickPanelListenersAttached = true;
    }

    ns.showQuickPanel = function (eventOrElement) {
        const badge = eventOrElement?.currentTarget || eventOrElement?.target || eventOrElement;
        showQuickPanelForBadge(badge);
    };
    ns.showQuickLinksView = showQuickLinksView;
    ns.showSummaryView = showSummaryView;
    ns.openQuickLinkCard = openQuickLinkCard;
    ns.openQuickLinkFolder = openQuickLinkFolder;
    ns.quickLinkGoUp = quickLinkGoUp;
    ns.transferActiveBookmarkToQuickLinkTarget = transferActiveBookmarkToQuickLinkTarget;
    ns.copyActiveBookmarkToQuickLinkTarget = copyActiveBookmarkToQuickLinkTarget;
    ns.attachQuickPanelListeners = attachQuickPanelListeners;

    attachQuickPanelListeners();
})(window.EveBookmarkIdentifiers);
