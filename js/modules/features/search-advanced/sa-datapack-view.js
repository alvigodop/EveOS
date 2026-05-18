window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.DatapackView) return;
    if (!ns.DatapackViewMicro || !ns.DatapackViewMacroActions) return;

    const MAX_MACRO_CARDS = 250;
    const MAX_MICRO_BOOKMARKS = 120;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeWorkspaceId(value) {
        return String(value || '').trim() || 'main';
    }

    function normalizeCategoryName(value) {
        return String(value || '').trim() || 'Unsorted';
    }

    function normalizeFolderId(value) {
        return String(value || '').trim();
    }

    function getConfig() {
        return window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function getLiveLinks() {
        const live = typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : null;
        const directWindowLinks = Array.isArray(window.links) ? window.links : null;
        const directGlobalLinks = typeof links !== 'undefined' && Array.isArray(links) ? links : null;
        const stateLinks = Array.isArray(window.eveState?.links) ? window.eveState.links : null;
        const richest = [directWindowLinks, directGlobalLinks, stateLinks, live]
            .filter(Array.isArray)
            .sort(function (left, right) { return right.length - left.length; })[0];
        if (richest && live && richest !== live && richest.length > live.length) return richest;
        if (live) return live;
        if (richest) return richest;
        return [];
    }

    function setLiveLinks(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    function getFolderStore() {
        const stores = [
            window.bookmarkFolders,
            typeof bookmarkFolders !== 'undefined' ? bookmarkFolders : null,
            window.eveState?.bookmarkFolders
        ].filter(function (store) {
            return store && typeof store === 'object';
        });
        if (!stores.length) return {};
        return stores.sort(function (left, right) {
            return Object.keys(right).length - Object.keys(left).length;
        })[0];
    }

    function createEntityLink(source) {
        const api = window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
        return api && typeof api.createLink === 'function' ? api.createLink(source) : '';
    }

    function buildScopedKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getStructureSummary() {
        const indexApi = getDatapackIndexApi();
        if (!indexApi || typeof indexApi.getStructureSummary !== 'function') return null;
        const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        const hasReadableSnapshot = typeof indexApi.hasReadableStructureSnapshot === 'function'
            ? indexApi.hasReadableStructureSnapshot()
            : (typeof indexApi.hasUsableSnapshot === 'function'
                ? indexApi.hasUsableSnapshot()
                : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0));
        if (!hasReadableSnapshot) return null;
        return indexApi.getStructureSummary() || null;
    }

    function getCategoryOrderHints(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const cfg = getConfig();
        const hints = [];
        function addList(list) {
            (Array.isArray(list) ? list : []).forEach(function (categoryName) {
                const normalized = normalizeCategoryName(categoryName);
                if (hints.indexOf(normalized) === -1) hints.push(normalized);
            });
        }
        addList(cfg.categoryOrderByWorkspace && Array.isArray(cfg.categoryOrderByWorkspace[ws])
            ? cfg.categoryOrderByWorkspace[ws]
            : []);
        addList(cfg.categoryOrder);
        if (window.EveCategoryOrder?.getOrder) {
            addList(window.EveCategoryOrder.getOrder(ws));
        }
        return hints;
    }

    function sortMaterialCategoryNames(workspaceId, materialNames) {
        const material = new Set(Array.from(materialNames || []).map(normalizeCategoryName));
        const ordered = [];
        getCategoryOrderHints(workspaceId).forEach(function (categoryName) {
            if (!material.has(categoryName) || ordered.indexOf(categoryName) !== -1) return;
            ordered.push(categoryName);
        });
        Array.from(material)
            .sort(function (left, right) {
                return left.localeCompare(right, undefined, { sensitivity: 'base' });
            })
            .forEach(function (categoryName) {
                if (ordered.indexOf(categoryName) === -1) ordered.push(categoryName);
            });
        return ordered;
    }

    function getWorkspaces() {
        return Array.isArray(getConfig().workspaces) ? getConfig().workspaces : [];
    }

    function getWorkspaceById(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        if (helpers?.findById) return helpers.findById(getWorkspaces(), normalizeWorkspaceId(workspaceId)) || null;
        return null;
    }

    function getWorkspaceLabel(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        const path = helpers?.getPath ? helpers.getPath(getWorkspaces(), normalizeWorkspaceId(workspaceId)) : [];
        if (Array.isArray(path) && path.length) {
            return path.map(function (workspace) {
                return String(workspace?.name || workspace?.id || 'Tab').trim() || 'Tab';
            }).join(' > ');
        }
        const workspace = getWorkspaceById(workspaceId);
        return String(workspace?.name || workspaceId || 'main').trim() || 'main';
    }

    function getWorkspaceName(workspaceId) {
        const workspace = getWorkspaceById(workspaceId);
        return String(workspace?.name || workspaceId || 'Tab').trim() || 'Tab';
    }

    function countWorkspaceBookmarks(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        return getLiveLinks().filter(function (link) {
            return normalizeWorkspaceId(link?.workspace) === ws;
        }).length;
    }

    function buildWorkspaceRef(workspace) {
        const id = normalizeWorkspaceId(workspace?.id);
        const linkedTargetId = normalizeWorkspaceId(workspace?.linkedTo || '');
        const linkedTarget = workspace?.linkedTo ? getWorkspaceById(linkedTargetId) : null;
        const ref = {
            id,
            name: String(workspace?.name || id).trim() || id,
            entityLink: createEntityLink({ type: 'workspace', workspaceId: id }),
            path: getWorkspaceLabel(id),
            childTabs: Array.isArray(workspace?.subTabs) ? workspace.subTabs.length : 0,
            bookmarks: countWorkspaceBookmarks(id),
            cards: getCategoryNamesForWorkspace(id).length,
            open: 'openable-reference',
            isShortcut: !!linkedTarget,
            linkedTo: linkedTarget ? normalizeWorkspaceId(linkedTarget.id) : '',
            linkedTargetName: linkedTarget ? getWorkspaceName(linkedTarget.id) : '',
            linkedTargetPath: linkedTarget ? getWorkspaceLabel(linkedTarget.id) : '',
            linkedEntityLink: linkedTarget ? createEntityLink({ type: 'workspace', workspaceId: normalizeWorkspaceId(linkedTarget.id) }) : '',
            sourceCards: linkedTarget ? getCategoryNamesForWorkspace(linkedTarget.id).length : 0,
            sourceBookmarks: linkedTarget ? countWorkspaceBookmarks(linkedTarget.id) : 0
        };
        return ref;
    }

    function buildLinkedSourceRef(shortcutWorkspace) {
        if (!shortcutWorkspace?.linkedTo) return null;
        const linkedTarget = getWorkspaceById(shortcutWorkspace.linkedTo);
        if (!linkedTarget) return null;
        const sourceId = normalizeWorkspaceId(linkedTarget.id);
        const shortcutId = normalizeWorkspaceId(shortcutWorkspace.id);
        return {
            id: sourceId,
            name: getWorkspaceName(sourceId),
            entityLink: createEntityLink({ type: 'workspace', workspaceId: sourceId }),
            path: getWorkspaceLabel(sourceId),
            cards: getCategoryNamesForWorkspace(sourceId).length,
            bookmarks: countWorkspaceBookmarks(sourceId),
            childTabs: Array.isArray(linkedTarget.subTabs) ? linkedTarget.subTabs.length : 0,
            viaShortcutId: shortcutId,
            viaShortcutName: getWorkspaceName(shortcutId),
            viaShortcutPath: getWorkspaceLabel(shortcutId),
            localCards: getCategoryNamesForWorkspace(shortcutId).length,
            localBookmarks: countWorkspaceBookmarks(shortcutId),
            open: 'openable-linked-source'
        };
    }

    function getWorkspaceIdsInScope(scope) {
        const explicitIds = Array.isArray(scope?.workspaceIds)
            ? scope.workspaceIds.map(normalizeWorkspaceId).filter(Boolean)
            : [];
        if (explicitIds.length) return Array.from(new Set(explicitIds));
        const helpers = window.EveWorkspaceHelpers;
        const workspaceId = normalizeWorkspaceId(scope?.workspaceId || getConfig().activeWorkspace || 'main');
        if (!scope?.workspaceId && scope?.all) {
            return helpers?.flattenIds ? helpers.flattenIds(getWorkspaces()) : [workspaceId];
        }
        const ids = new Set([workspaceId]);
        const workspace = getWorkspaceById(workspaceId);
        if (workspace && helpers?.getDescendantIds) {
            helpers.getDescendantIds(workspace).forEach(function (id) {
                if (id) ids.add(normalizeWorkspaceId(id));
            });
        }
        return Array.from(ids);
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const materialNames = new Set();
        function addMaterialName(categoryName) {
            const normalized = normalizeCategoryName(categoryName);
            if (normalized) materialNames.add(normalized);
        }
        getLiveLinks().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) === ws) {
                addMaterialName(link?.category);
            }
        });
        const summary = getStructureSummary();
        if (summary?.cards && typeof summary.cards === 'object') {
            Object.keys(summary.cards).forEach(function (cardKey) {
                const bucket = summary.cards[cardKey];
                if (normalizeWorkspaceId(bucket?.workspaceId) !== ws) return;
                if (Number(bucket?.bookmarkCount || 0) <= 0 && Number(bucket?.folderCount || 0) <= 0) return;
                addMaterialName(bucket?.categoryName || String(cardKey).slice((ws + '::').length));
            });
        }
        const prefix = ws + '::';
        const folderOnlyNames = [];
        Object.keys(getFolderStore()).forEach(function (scopedKey) {
            if (!String(scopedKey).startsWith(prefix)) return;
            const tree = getFolderStore()[scopedKey];
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            if (!nodes.length) return;
            folderOnlyNames.push(normalizeCategoryName(String(scopedKey).slice(prefix.length)));
        });
        folderOnlyNames.forEach(addMaterialName);
        return sortMaterialCategoryNames(ws, materialNames);
    }

    function getFolderNodes(workspaceId, categoryName) {
        const tree = getFolderStore()[buildScopedKey(workspaceId, categoryName)];
        const storeNodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
        if (typeof window.EveBookmarkFolders?.getScopedNodes === 'function') {
            const apiNodes = window.EveBookmarkFolders.getScopedNodes(workspaceId, categoryName) || [];
            return storeNodes.length > apiNodes.length ? storeNodes : apiNodes;
        }
        return storeNodes;
    }

    function getFolderPathLabel(workspaceId, categoryName, folderId) {
        const id = normalizeFolderId(folderId);
        if (!id) return 'Root';
        if (typeof window.EveBookmarkFolders?.buildFolderPathLabel === 'function') {
            return window.EveBookmarkFolders.buildFolderPathLabel(workspaceId, categoryName, id) || 'Folder';
        }
        return id;
    }

    function getIdentifierLabels(link) {
        const ids = window.EveBookmarkIdentifiers?.getIdentifiersForLink
            ? window.EveBookmarkIdentifiers.getIdentifiersForLink(link)
            : (Array.isArray(link?.identifiers) ? link.identifiers : []);
        const definitions = window.EveBookmarkIdentifiers?.getDefinitions?.() || [];
        const byId = new Map(definitions.map(function (definition) {
            return [String(definition?.id || ''), String(definition?.label || definition?.id || '')];
        }));
        return ids.map(function (id) {
            return byId.get(String(id)) || String(id);
        }).filter(Boolean);
    }

    function getScopedLinks(workspaceId, categoryName) {
        const ws = normalizeWorkspaceId(workspaceId);
        const cat = normalizeCategoryName(categoryName);
        return getLiveLinks().filter(function (link) {
            return normalizeWorkspaceId(link?.workspace) === ws
                && normalizeCategoryName(link?.category) === cat;
        });
    }

    function countLinkedLibrary(links) {
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry) return 0;
        return links.filter(function (link) {
            return !!api.getLinkedEntry(String(link?.id || ''))?.entry;
        }).length;
    }

    function countPinned(links) {
        const api = window.EveQuickPins;
        if (!api?.isBookmarkPinned) return 0;
        return links.filter(function (link) {
            return api.isBookmarkPinned(link?.id);
        }).length;
    }

    function buildCardSummary(workspaceId, categoryName, orderIndex) {
        const scopedLinks = getScopedLinks(workspaceId, categoryName);
        const folders = getFolderNodes(workspaceId, categoryName);
        const identifiers = new Set();
        scopedLinks.forEach(function (link) {
            (Array.isArray(link?.identifiers) ? link.identifiers : []).forEach(function (id) {
                if (id) identifiers.add(String(id));
            });
        });
        return {
            workspaceId: normalizeWorkspaceId(workspaceId),
            workspaceLabel: getWorkspaceLabel(workspaceId),
            categoryName: normalizeCategoryName(categoryName),
            entityLink: createEntityLink({
                type: 'card',
                workspaceId: normalizeWorkspaceId(workspaceId),
                categoryName: normalizeCategoryName(categoryName)
            }),
            order: orderIndex + 1,
            entity: 'card',
            internals: 'openable',
            counts: {
                bookmarks: scopedLinks.length,
                rootBookmarks: scopedLinks.filter(function (link) { return !normalizeFolderId(link?.folderId); }).length,
                folderBookmarks: scopedLinks.filter(function (link) { return !!normalizeFolderId(link?.folderId); }).length,
                folders: folders.length,
                linkedLibrary: countLinkedLibrary(scopedLinks),
                pinned: countPinned(scopedLinks),
                done: scopedLinks.filter(function (link) { return !!link?.done; }).length,
                identifiers: identifiers.size
            }
        };
    }

    function resolveCurrentScope() {
        const ui = window.EveOS?.SearchAdvanced?.UI;
        const scopeMode = ui?.getCurrentScopeMode ? ui.getCurrentScopeMode() : 'current';
        const scope = ui?.getResolvedScope ? ui.getResolvedScope(scopeMode) : null;
        if (scopeMode === 'all') return { all: true };
        return scope && (scope.workspaceId || scope.categoryName || Array.isArray(scope.workspaceIds))
            ? scope
            : { workspaceId: normalizeWorkspaceId(getConfig().activeWorkspace || 'main') };
    }

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
                        + ' · source ' + tab.sourceCards + ' cards / ' + tab.sourceBookmarks + ' bookmarks'
                        + ' · local ' + tab.cards + ' cards / ' + tab.bookmarks + ' bookmarks</small>'
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
                    + '<small>Viewed through shortcut: ' + escapeHtml(tab.viaShortcutPath || tab.viaShortcutName) + ' · local shortcut ' + tab.localCards + ' cards / ' + tab.localBookmarks + ' bookmarks</small>'
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

    const macroActions = ns.DatapackViewMacroActions.create({
        normalizeWorkspaceId: normalizeWorkspaceId,
        normalizeCategoryName: normalizeCategoryName,
        getConfig: getConfig,
        getCategoryNamesForWorkspace: getCategoryNamesForWorkspace,
        getLiveLinks: getLiveLinks,
        setLiveLinks: setLiveLinks,
        resolveCurrentScope: resolveCurrentScope,
        renderGateway: renderGateway
    });
    const saveMacroChanges = macroActions.saveMacroChanges;
    const microRuntime = ns.DatapackViewMicro.create({
        MAX_MICRO_BOOKMARKS: MAX_MICRO_BOOKMARKS,
        escapeHtml: escapeHtml,
        normalizeWorkspaceId: normalizeWorkspaceId,
        normalizeCategoryName: normalizeCategoryName,
        normalizeFolderId: normalizeFolderId,
        getScopedLinks: getScopedLinks,
        getFolderNodes: getFolderNodes,
        getFolderPathLabel: getFolderPathLabel,
        getIdentifierLabels: getIdentifierLabels,
        getLiveLinks: getLiveLinks,
        setLiveLinks: setLiveLinks,
        resolveCurrentScope: resolveCurrentScope,
        renderGateway: renderGateway
    });
    const openCardInternals = microRuntime.openCardInternals;
    const closeCardInternals = microRuntime.closeCardInternals;
    const saveMicroChanges = microRuntime.saveMicroChanges;
    function openGateway(options) {
        const modal = document.getElementById('expandedSearchModal');
        if (!modal && typeof window.openExpandedSearchModal === 'function') {
            window.openExpandedSearchModal({ autoSearch: false });
        } else if (modal) {
            modal.style.display = 'flex';
        }
        return renderGateway(options?.scope || null);
    }

    function handleClick(event) {
        const overlay = event.target?.classList?.contains('nx-dv-micro-overlay') ? event.target : null;
        if (overlay) {
            closeCardInternals();
            return;
        }
        const actionNode = event.target?.closest?.('[data-nx-dv-action]');
        if (!actionNode) return;
        const action = actionNode.getAttribute('data-nx-dv-action');
        if (action === 'preview-macro') {
            event.preventDefault();
            saveMacroChanges({ previewOnly: true });
        } else if (action === 'save-macro') {
            event.preventDefault();
            saveMacroChanges();
        } else if (action === 'revert-macro') {
            event.preventDefault();
            renderGateway(resolveCurrentScope());
        } else if (action === 'cancel') {
            event.preventDefault();
            const results = document.getElementById('esResults');
            if (results) results.innerHTML = '';
        } else if (action === 'open-card') {
            event.preventDefault();
            openCardInternals(actionNode.getAttribute('data-workspace-id'), actionNode.getAttribute('data-category-name'));
        } else if (action === 'open-tab') {
            event.preventDefault();
            const workspaceId = normalizeWorkspaceId(actionNode.getAttribute('data-workspace-id'));
            if (typeof window.switchWorkspace === 'function') window.switchWorkspace(workspaceId, { forceRender: true });
            openGateway({ scope: { workspaceId } });
        } else if (action === 'close-micro') {
            event.preventDefault();
            closeCardInternals();
        } else if (action === 'preview-micro') {
            event.preventDefault();
            saveMicroChanges(actionNode.closest('.nx-dv-micro-overlay'), { previewOnly: true });
        } else if (action === 'save-micro') {
            event.preventDefault();
            saveMicroChanges(actionNode.closest('.nx-dv-micro-overlay'));
        } else if (action === 'revert-micro') {
            event.preventDefault();
            openCardInternals(actionNode.getAttribute('data-workspace-id'), actionNode.getAttribute('data-category-name'));
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('click', handleClick, true);
    }

    ns.DatapackView = {
        buildGatewayState,
        renderGateway,
        openGateway,
        openCardInternals,
        closeCardInternals,
        saveMacroChanges,
        saveMicroChanges
    };
})();
