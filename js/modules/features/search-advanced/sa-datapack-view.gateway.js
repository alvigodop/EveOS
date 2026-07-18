window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const shared = ns._DatapackViewShared || {};
    const {
        MAX_MACRO_CARDS,
        escapeHtml,
        normalizeWorkspaceId,
        normalizeCategoryName,
        getConfig,
        getWorkspaces,
        getWorkspaceById,
        getWorkspaceLabel,
        countWorkspaceBookmarks,
        createEntityLink,
        getWorkspaceIdsInScope,
        buildWorkspaceRef,
        buildLinkedSourceRef,
        getCategoryNamesForWorkspace,
        buildCardSummary,
        buildScopedKey,
        resolveCurrentScope
    } = shared;

    function buildGatewayState(scopeInput) {
        const scope = scopeInput || resolveCurrentScope();
        const workspaceIds = scope.all
            ? getWorkspaceIdsInScope({ all: true })
            : getWorkspaceIdsInScope(scope);
        const categoryFilter = scope.categoryName ? normalizeCategoryName(scope.categoryName) : '';
        const cards = [];
        workspaceIds.forEach(function (workspaceId) {
            const categories = categoryFilter ? [categoryFilter] : getCategoryNamesForWorkspace(workspaceId);
            categories.forEach(function (categoryName, index) {
                cards.push(buildCardSummary(workspaceId, categoryName, index));
            });
        });

        const rootWorkspaceId = scope.all ? '' : normalizeWorkspaceId(scope.workspaceId || getConfig().activeWorkspace || 'main');
        const rootWorkspace = rootWorkspaceId ? getWorkspaceById(rootWorkspaceId) : null;
        const childTabRefs = Array.isArray(rootWorkspace?.subTabs)
            ? rootWorkspace.subTabs.map(function (workspace) {
                return buildWorkspaceRef(workspace);
            })
            : [];

        const linkedSourceRefs = rootWorkspace?.linkedTo
            ? [buildLinkedSourceRef(rootWorkspace)].filter(Boolean)
            : [];

        const workspaceRefs = workspaceIds.map(function (workspaceId) {
            return {
                id: workspaceId,
                entityLink: createEntityLink({ type: 'workspace', workspaceId: workspaceId }),
                path: getWorkspaceLabel(workspaceId),
                cards: getCategoryNamesForWorkspace(workspaceId).length,
                bookmarks: countWorkspaceBookmarks(workspaceId)
            };
        });

        const visibleCards = cards.slice(0, MAX_MACRO_CARDS);
        return {
            type: 'datapack-view-state',
            generatedAt: new Date().toISOString(),
            scope: {
                mode: scope.all ? 'all-tabs' : 'current',
                workspaceId: rootWorkspaceId,
                entityLink: rootWorkspaceId ? createEntityLink({ type: 'workspace', workspaceId: rootWorkspaceId }) : '',
                workspaceIds,
                categoryName: categoryFilter || null
            },
            counts: {
                workspaces: workspaceRefs.length,
                childTabRefs: childTabRefs.length,
                linkedSourceRefs: linkedSourceRefs.length,
                cards: cards.length,
                cardsShown: visibleCards.length,
                omittedCards: Math.max(0, cards.length - visibleCards.length)
            },
            workspaces: workspaceRefs,
            childTabRefs,
            linkedSourceRefs,
            cards: visibleCards,
            omitted: {
                bookmarks: 'Open a card internals popup. Bookmark arrays are intentionally not dumped in the Nexus gateway.',
                childTabContents: 'Open a child tab reference to inspect that tab as its own gateway scope.',
                longNotes: 'Long bookmark notes are summarized in card internals only.'
            }
        };
    }

    function renderGateway(scopeInput) {
        const results = document.getElementById('esResults');
        if (!results) return null;
        const state = buildGatewayState(scopeInput);
        const json = JSON.stringify(state, null, 2);
        results.innerHTML = ''
            + '<section class="nx-dv-panel" id="nxDatapackViewPanel">'
            + '<div class="nx-dv-head">'
            + '<div><div class="nx-dv-kicker">Datapack View State</div><h3>Macro Gateway</h3></div>'
            + '<div class="nx-dv-actions">'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="preview-macro">Preview Diff</button>'
            + '<button type="button" class="nx-dv-btn nx-dv-primary" data-nx-dv-action="save-macro">Save Macro Changes</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="revert-macro">Revert</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="cancel">Cancel</button>'
            + '</div></div>'
            + '<div class="nx-dv-summary">'
            + '<span>' + state.counts.workspaces + ' tabs in scope</span>'
            + '<span>' + state.counts.cards + ' cards</span>'
            + '<span>' + state.counts.childTabRefs + ' child refs</span>'
            + '<span>' + state.counts.linkedSourceRefs + ' linked source refs</span>'
            + '<span>' + state.counts.omittedCards + ' omitted by safety cap</span>'
            + '</div>'
            + '<div class="nx-dv-diff" data-nx-dv-diff="macro" hidden></div>'
            + renderChildTabRefs(state.childTabRefs)
            + renderLinkedSourceRefs(state.linkedSourceRefs)
            + renderCardEditor(state.cards)
            + '<details class="nx-dv-json"><summary>Gateway JSON</summary><pre>' + escapeHtml(json) + '</pre></details>'
            + '</section>';
        const meta = document.getElementById('esMeta');
        if (meta) meta.textContent = 'Datapack macro gateway rendered without bookmark dumps.';
        return state;
    }

    function renderChildTabRefs(childTabRefs) {
        if (!childTabRefs.length) return '<div class="nx-dv-empty">No child tab references in this scope.</div>';
        return '<div class="nx-dv-section"><div class="nx-dv-section-title">Child Tab References</div><div class="nx-dv-ref-grid">'
            + childTabRefs.map(function (tab) {
                const shortcutHtml = tab.isShortcut
                    ? '<small>Shortcut source: ' + escapeHtml(tab.linkedTargetPath || tab.linkedTargetName || tab.linkedTo)
                        + ' \u00b7 source ' + tab.sourceCards + ' cards / ' + tab.sourceBookmarks + ' bookmarks'
                        + ' \u00b7 local ' + tab.cards + ' cards / ' + tab.bookmarks + ' bookmarks</small>'
                    : '<small>' + tab.cards + ' cards / ' + tab.bookmarks + ' bookmarks / ' + tab.childTabs + ' child tabs</small>';
                return '<button type="button" class="nx-dv-ref" data-nx-dv-action="open-tab" data-workspace-id="' + escapeHtml(tab.id) + '">'
                    + '<strong>' + escapeHtml(tab.name) + '</strong>'
                    + '<span>' + escapeHtml(tab.path) + '</span>'
                    + '<small title="' + escapeHtml(tab.entityLink) + '">JSON Link: ' + escapeHtml(tab.entityLink) + '</small>'
                    + shortcutHtml
                    + '</button>';
            }).join('')
            + '</div></div>';
    }

    function renderLinkedSourceRefs(linkedSourceRefs) {
        if (!linkedSourceRefs || !linkedSourceRefs.length) return '';
        return '<div class="nx-dv-section"><div class="nx-dv-section-title">Linked Source Tab</div><div class="nx-dv-ref-grid">'
            + linkedSourceRefs.map(function (tab) {
                return '<button type="button" class="nx-dv-ref nx-dv-ref--linked-source" data-nx-dv-action="open-tab" data-workspace-id="' + escapeHtml(tab.id) + '">'
                    + '<strong>' + escapeHtml(tab.name) + '</strong>'
                    + '<span>' + escapeHtml(tab.path) + '</span>'
                    + '<small title="' + escapeHtml(tab.entityLink) + '">JSON Link: ' + escapeHtml(tab.entityLink) + '</small>'
                    + '<small>Source ' + tab.cards + ' cards / ' + tab.bookmarks + ' bookmarks / ' + tab.childTabs + ' child tabs</small>'
                    + '<small>Viewed through shortcut: ' + escapeHtml(tab.viaShortcutPath || tab.viaShortcutName) + ' \u00b7 local shortcut ' + tab.localCards + ' cards / ' + tab.localBookmarks + ' bookmarks</small>'
                    + '</button>';
            }).join('')
            + '</div></div>';
    }

    function renderCardEditor(cards) {
        if (!cards.length) return '<div class="nx-dv-empty">No cards in this scope.</div>';
        return '<div class="nx-dv-section"><div class="nx-dv-section-title">Cards</div><div class="nx-dv-card-list">'
            + cards.map(function (card) {
                const key = buildScopedKey(card.workspaceId, card.categoryName);
                return '<article class="nx-dv-card" data-card-key="' + escapeHtml(key) + '" data-workspace-id="' + escapeHtml(card.workspaceId) + '" data-category-name="' + escapeHtml(card.categoryName) + '" data-order="' + escapeHtml(card.order) + '" data-entity-link="' + escapeHtml(card.entityLink) + '">'
                    + '<div class="nx-dv-card-main">'
                    + '<label><span>Card Name</span><input type="text" data-nx-dv-field="categoryName" value="' + escapeHtml(card.categoryName) + '"></label>'
                    + '<label><span>Order</span><input type="number" min="1" step="1" data-nx-dv-field="order" value="' + escapeHtml(card.order) + '"></label>'
                    + '</div>'
                    + '<div class="nx-dv-card-stats">'
                    + '<span>' + card.counts.bookmarks + ' bookmarks</span>'
                    + '<span>' + card.counts.folders + ' folders</span>'
                    + '<span>' + card.counts.linkedLibrary + ' library</span>'
                    + '<span>' + card.counts.identifiers + ' labels</span>'
                    + '</div>'
                    + '<div class="nx-dv-card-foot">'
                    + '<span>' + escapeHtml(card.workspaceLabel) + '</span>'
                    + '<small title="' + escapeHtml(card.entityLink) + '">JSON Link: ' + escapeHtml(card.entityLink) + '</small>'
                    + '<button type="button" class="nx-dv-btn" data-nx-dv-action="open-card" data-workspace-id="' + escapeHtml(card.workspaceId) + '" data-category-name="' + escapeHtml(card.categoryName) + '">Open Internals</button>'
                    + '</div>'
                    + '</article>';
            }).join('')
            + '</div></div>';
    }

    ns._DatapackViewGateway = {
        buildGatewayState,
        renderGateway,
        renderChildTabRefs,
        renderLinkedSourceRefs,
        renderCardEditor
    };
})();
