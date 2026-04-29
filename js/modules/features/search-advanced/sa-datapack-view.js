window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.DatapackView) return;

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
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
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
        return window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
    }

    function buildScopedKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
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
        const ordered = [];
        const seen = new Set();
        function addName(categoryName) {
            const normalized = normalizeCategoryName(categoryName);
            if (seen.has(normalized)) return;
            seen.add(normalized);
            ordered.push(normalized);
        }
        if (window.EveCategoryOrder?.getOrder) {
            window.EveCategoryOrder.getOrder(workspaceId).forEach(function (categoryName) {
                addName(categoryName);
            });
        }
        getLiveLinks().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) === normalizeWorkspaceId(workspaceId)) {
                addName(link?.category);
            }
        });
        const prefix = normalizeWorkspaceId(workspaceId) + '::';
        const folderOnlyNames = [];
        Object.keys(getFolderStore()).forEach(function (scopedKey) {
            if (!String(scopedKey).startsWith(prefix)) return;
            folderOnlyNames.push(normalizeCategoryName(String(scopedKey).slice(prefix.length)));
        });
        folderOnlyNames.sort(function (left, right) {
            return left.localeCompare(right, undefined, { sensitivity: 'base' });
        }).forEach(function (categoryName) {
            addName(categoryName);
        });
        return ordered;
    }

    function getFolderNodes(workspaceId, categoryName) {
        if (typeof window.EveBookmarkFolders?.getScopedNodes === 'function') {
            return window.EveBookmarkFolders.getScopedNodes(workspaceId, categoryName) || [];
        }
        const tree = getFolderStore()[buildScopedKey(workspaceId, categoryName)];
        return Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
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
                const id = normalizeWorkspaceId(workspace?.id);
                return {
                    id,
                    name: String(workspace?.name || id).trim() || id,
                    path: getWorkspaceLabel(id),
                    childTabs: Array.isArray(workspace?.subTabs) ? workspace.subTabs.length : 0,
                    bookmarks: getLiveLinks().filter(function (link) {
                        return normalizeWorkspaceId(link?.workspace) === id;
                    }).length,
                    cards: getCategoryNamesForWorkspace(id).length,
                    open: 'openable-reference'
                };
            })
            : [];

        const workspaceRefs = workspaceIds.map(function (workspaceId) {
            return {
                id: workspaceId,
                path: getWorkspaceLabel(workspaceId),
                cards: getCategoryNamesForWorkspace(workspaceId).length,
                bookmarks: getLiveLinks().filter(function (link) {
                    return normalizeWorkspaceId(link?.workspace) === workspaceId;
                }).length
            };
        });

        const visibleCards = cards.slice(0, MAX_MACRO_CARDS);
        return {
            type: 'datapack-view-state',
            generatedAt: new Date().toISOString(),
            scope: {
                mode: scope.all ? 'all-tabs' : 'current',
                workspaceId: rootWorkspaceId,
                workspaceIds,
                categoryName: categoryFilter || null
            },
            counts: {
                workspaces: workspaceRefs.length,
                childTabRefs: childTabRefs.length,
                cards: cards.length,
                cardsShown: visibleCards.length,
                omittedCards: Math.max(0, cards.length - visibleCards.length)
            },
            workspaces: workspaceRefs,
            childTabRefs,
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
            + '<button type="button" class="nx-dv-btn nx-dv-primary" data-nx-dv-action="save-macro">Save Macro Changes</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="revert-macro">Revert</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="cancel">Cancel</button>'
            + '</div></div>'
            + '<div class="nx-dv-summary">'
            + '<span>' + state.counts.workspaces + ' tabs in scope</span>'
            + '<span>' + state.counts.cards + ' cards</span>'
            + '<span>' + state.counts.childTabRefs + ' child refs</span>'
            + '<span>' + state.counts.omittedCards + ' omitted by safety cap</span>'
            + '</div>'
            + renderChildTabRefs(state.childTabRefs)
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
                return '<button type="button" class="nx-dv-ref" data-nx-dv-action="open-tab" data-workspace-id="' + escapeHtml(tab.id) + '">'
                    + '<strong>' + escapeHtml(tab.name) + '</strong>'
                    + '<span>' + escapeHtml(tab.path) + '</span>'
                    + '<small>' + tab.cards + ' cards / ' + tab.bookmarks + ' bookmarks / ' + tab.childTabs + ' child tabs</small>'
                    + '</button>';
            }).join('')
            + '</div></div>';
    }

    function renderCardEditor(cards) {
        if (!cards.length) return '<div class="nx-dv-empty">No cards in this scope.</div>';
        return '<div class="nx-dv-section"><div class="nx-dv-section-title">Cards</div><div class="nx-dv-card-list">'
            + cards.map(function (card) {
                const key = buildScopedKey(card.workspaceId, card.categoryName);
                return '<article class="nx-dv-card" data-card-key="' + escapeHtml(key) + '" data-workspace-id="' + escapeHtml(card.workspaceId) + '" data-category-name="' + escapeHtml(card.categoryName) + '">'
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
                    + '<button type="button" class="nx-dv-btn" data-nx-dv-action="open-card" data-workspace-id="' + escapeHtml(card.workspaceId) + '" data-category-name="' + escapeHtml(card.categoryName) + '">Open Internals</button>'
                    + '</div>'
                    + '</article>';
            }).join('')
            + '</div></div>';
    }

    function saveMacroChanges() {
        const panel = document.getElementById('nxDatapackViewPanel');
        if (!panel) return false;
        const rows = Array.from(panel.querySelectorAll('.nx-dv-card[data-workspace-id][data-category-name]'));
        const edits = rows.map(function (row) {
            const workspaceId = normalizeWorkspaceId(row.getAttribute('data-workspace-id'));
            const oldCategoryName = normalizeCategoryName(row.getAttribute('data-category-name'));
            const rawCategoryName = String(row.querySelector('[data-nx-dv-field="categoryName"]')?.value || '').trim();
            const order = Math.max(1, Number(row.querySelector('[data-nx-dv-field="order"]')?.value) || 1);
            return {
                workspaceId,
                oldCategoryName,
                nextCategoryName: rawCategoryName ? normalizeCategoryName(rawCategoryName) : '',
                order
            };
        });
        if (edits.some(function (edit) { return !edit.nextCategoryName; })) {
            if (typeof showToast === 'function') showToast('Card names cannot be blank.', 'error');
            return false;
        }
        const validationGroups = new Map();
        edits.forEach(function (edit) {
            if (!validationGroups.has(edit.workspaceId)) validationGroups.set(edit.workspaceId, []);
            validationGroups.get(edit.workspaceId).push(edit);
        });
        let validationError = '';
        validationGroups.forEach(function (items, workspaceId) {
            if (validationError) return;
            const nextNames = new Set();
            const oldNames = new Set(items.map(function (item) {
                return item.oldCategoryName.toLowerCase();
            }));
            items.forEach(function (item) {
                const comparableName = item.nextCategoryName.toLowerCase();
                if (nextNames.has(comparableName)) {
                    validationError = 'Duplicate card name in gateway edit: ' + item.nextCategoryName;
                    return;
                }
                nextNames.add(comparableName);
            });
            if (validationError) return;
            const existingNames = getCategoryNamesForWorkspace(workspaceId).map(function (name) {
                return normalizeCategoryName(name).toLowerCase();
            });
            items.forEach(function (item) {
                const comparableName = item.nextCategoryName.toLowerCase();
                if (existingNames.includes(comparableName) && !oldNames.has(comparableName)) {
                    validationError = 'Card name already exists outside this gateway view: ' + item.nextCategoryName;
                }
            });
        });
        if (validationError) {
            if (typeof showToast === 'function') showToast(validationError, 'error');
            return false;
        }
        const liveLinks = getLiveLinks();
        const orderGroups = new Map();
        let renamed = 0;
        let reordered = 0;

        edits.forEach(function (edit) {
            const workspaceId = edit.workspaceId;
            const oldCategoryName = edit.oldCategoryName;
            const nextCategoryName = edit.nextCategoryName;
            const order = edit.order;
            if (!orderGroups.has(workspaceId)) orderGroups.set(workspaceId, []);
            orderGroups.get(workspaceId).push({ oldCategoryName, nextCategoryName, order });

            if (nextCategoryName && nextCategoryName !== oldCategoryName) {
                liveLinks.forEach(function (link) {
                    if (normalizeWorkspaceId(link?.workspace) !== workspaceId) return;
                    if (normalizeCategoryName(link?.category) !== oldCategoryName) return;
                    link.category = nextCategoryName;
                    window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
                });
                window.EveBookmarkFolders?.renameCategoryScope?.(workspaceId, oldCategoryName, nextCategoryName);
                window.EveCategoryOrder?.renameCategory?.(workspaceId, oldCategoryName, nextCategoryName);
                window.EveBookmarkFolders?.renameCardTaskScope?.(workspaceId, oldCategoryName, nextCategoryName);
                renamed += 1;
            }
        });

        setLiveLinks(liveLinks);
        orderGroups.forEach(function (items, workspaceId) {
            const cfg = getConfig();
            if (!cfg.categoryOrderByWorkspace || typeof cfg.categoryOrderByWorkspace !== 'object') cfg.categoryOrderByWorkspace = {};
            const existing = window.EveCategoryOrder?.getOrder
                ? window.EveCategoryOrder.getOrder(workspaceId, { persist: true })
                : (Array.isArray(cfg.categoryOrderByWorkspace[workspaceId]) ? cfg.categoryOrderByWorkspace[workspaceId] : []);
            const shownNames = new Set(items.map(function (item) { return item.nextCategoryName; }));
            const sortedShown = items.slice().sort(function (left, right) {
                return left.order - right.order || left.nextCategoryName.localeCompare(right.nextCategoryName);
            }).map(function (item) {
                return item.nextCategoryName;
            });
            const rest = existing.map(function (name) {
                const replacement = items.find(function (item) { return item.oldCategoryName === name; });
                return replacement ? replacement.nextCategoryName : name;
            }).filter(function (name) {
                return !shownNames.has(name);
            });
            const nextOrder = Array.from(new Set(sortedShown.concat(rest)));
            if (nextOrder.join('\n') !== existing.join('\n')) reordered += 1;
            cfg.categoryOrderByWorkspace[workspaceId] = nextOrder;
        });

        if (!renamed && !reordered) {
            if (typeof showToast === 'function') showToast('No macro changes to save.', 'info');
            return false;
        }
        if (typeof saveConfig === 'function') {
            saveConfig({
                immediate: true,
                source: 'nexus-datapack-view-macro-config',
                meta: { renamed, reordered }
            });
        }
        if (typeof saveData === 'function') {
            saveData({
                immediate: true,
                forceRender: true,
                source: 'nexus-datapack-view-macro-data',
                meta: { renamed, reordered }
            });
        }
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof renderDashboard === 'function') renderDashboard();
        renderGateway(resolveCurrentScope());
        if (typeof showToast === 'function') showToast('Datapack macro changes saved.', 'success');
        return true;
    }

    function buildCardInternals(workspaceId, categoryName) {
        const scopedLinks = getScopedLinks(workspaceId, categoryName);
        const folders = getFolderNodes(workspaceId, categoryName);
        const bookmarkRows = scopedLinks.slice(0, MAX_MICRO_BOOKMARKS).map(function (link) {
            const folderId = normalizeFolderId(link?.folderId);
            const notes = String(link?.notes || '').trim();
            return {
                id: String(link?.id || ''),
                title: String(link?.title || 'Untitled'),
                url: String(link?.url || ''),
                folderId,
                folderPath: getFolderPathLabel(workspaceId, categoryName, folderId),
                identifiers: getIdentifierLabels(link),
                notesSummary: notes ? notes.slice(0, 180) : '',
                linkedLibrary: !!window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(String(link?.id || ''))?.entry
            };
        });
        return {
            workspaceId: normalizeWorkspaceId(workspaceId),
            categoryName: normalizeCategoryName(categoryName),
            counts: {
                bookmarks: scopedLinks.length,
                bookmarksShown: bookmarkRows.length,
                omittedBookmarks: Math.max(0, scopedLinks.length - bookmarkRows.length),
                folders: folders.length
            },
            folders: folders.map(function (folder) {
                const id = normalizeFolderId(folder?.id);
                return {
                    id,
                    name: String(folder?.name || 'Folder'),
                    parentId: normalizeFolderId(folder?.parentId),
                    path: getFolderPathLabel(workspaceId, categoryName, id),
                    bookmarks: scopedLinks.filter(function (link) {
                        return normalizeFolderId(link?.folderId) === id;
                    }).length
                };
            }),
            bookmarks: bookmarkRows
        };
    }

    function openCardInternals(workspaceId, categoryName) {
        closeCardInternals();
        const state = buildCardInternals(workspaceId, categoryName);
        const overlay = document.createElement('div');
        overlay.className = 'nx-dv-micro-overlay';
        overlay.innerHTML = ''
            + '<div class="nx-dv-micro" role="dialog" aria-modal="true" aria-label="Card internals">'
            + '<div class="nx-dv-micro-head">'
            + '<div><div class="nx-dv-kicker">Card Internals</div><h3>' + escapeHtml(state.categoryName) + '</h3></div>'
            + '<button type="button" class="nx-dv-close" data-nx-dv-action="close-micro">X</button>'
            + '</div>'
            + '<div class="nx-dv-summary">'
            + '<span>' + state.counts.bookmarks + ' bookmarks</span>'
            + '<span>' + state.counts.folders + ' folders</span>'
            + '<span>' + state.counts.omittedBookmarks + ' omitted by safety cap</span>'
            + '</div>'
            + '<div class="nx-dv-micro-body">'
            + renderMicroFolders(state)
            + renderMicroBookmarks(state)
            + '</div>'
            + '<div class="nx-dv-micro-actions">'
            + '<button type="button" class="nx-dv-btn nx-dv-primary" data-nx-dv-action="save-micro" data-workspace-id="' + escapeHtml(state.workspaceId) + '" data-category-name="' + escapeHtml(state.categoryName) + '">Save</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="revert-micro" data-workspace-id="' + escapeHtml(state.workspaceId) + '" data-category-name="' + escapeHtml(state.categoryName) + '">Revert</button>'
            + '<button type="button" class="nx-dv-btn" data-nx-dv-action="close-micro">Cancel</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
        return state;
    }

    function renderMicroFolders(state) {
        if (!state.folders.length) return '<div class="nx-dv-empty">No folders in this card.</div>';
        return '<section class="nx-dv-micro-section"><div class="nx-dv-section-title">Folders</div><div class="nx-dv-folder-list">'
            + state.folders.map(function (folder) {
                return '<div class="nx-dv-folder-row">'
                    + '<strong>' + escapeHtml(folder.name) + '</strong>'
                    + '<span title="' + escapeHtml(folder.path) + '">' + escapeHtml(folder.path) + '</span>'
                    + '<small>' + folder.bookmarks + ' bookmarks</small>'
                    + '</div>';
            }).join('')
            + '</div></section>';
    }

    function renderMicroBookmarks(state) {
        if (!state.bookmarks.length) return '<div class="nx-dv-empty">No bookmarks in this card.</div>';
        return '<section class="nx-dv-micro-section"><div class="nx-dv-section-title">Bookmarks</div><div class="nx-dv-bookmark-list">'
            + state.bookmarks.map(function (bookmark) {
                return '<div class="nx-dv-bookmark-row" data-link-id="' + escapeHtml(bookmark.id) + '">'
                    + '<label><span>Title</span><input type="text" data-nx-dv-field="bookmarkTitle" value="' + escapeHtml(bookmark.title) + '"></label>'
                    + '<div class="nx-dv-bookmark-meta">'
                    + '<span title="' + escapeHtml(bookmark.url) + '">' + escapeHtml(bookmark.url || 'No URL') + '</span>'
                    + '<span title="' + escapeHtml(bookmark.folderPath) + '">Folder: ' + escapeHtml(bookmark.folderPath) + '</span>'
                    + (bookmark.identifiers.length ? '<span>Labels: ' + escapeHtml(bookmark.identifiers.join(', ')) + '</span>' : '')
                    + (bookmark.linkedLibrary ? '<span>Library linked</span>' : '')
                    + (bookmark.notesSummary ? '<small>' + escapeHtml(bookmark.notesSummary) + '</small>' : '')
                    + '</div>'
                    + '</div>';
            }).join('')
            + '</div></section>';
    }

    function closeCardInternals() {
        document.querySelectorAll('.nx-dv-micro-overlay').forEach(function (node) {
            node.remove();
        });
    }

    function saveMicroChanges(overlay) {
        const panel = overlay?.querySelector?.('.nx-dv-micro');
        if (!panel) return false;
        const liveLinks = getLiveLinks();
        let changed = 0;
        panel.querySelectorAll('.nx-dv-bookmark-row[data-link-id]').forEach(function (row) {
            const linkId = String(row.getAttribute('data-link-id') || '').trim();
            const title = String(row.querySelector('[data-nx-dv-field="bookmarkTitle"]')?.value || '').trim();
            const link = liveLinks.find(function (candidate) {
                return String(candidate?.id || '') === linkId;
            });
            if (!link || !title || String(link.title || '') === title) return;
            link.title = title;
            window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
            changed += 1;
        });
        if (!changed) {
            if (typeof showToast === 'function') showToast('No micro changes to save.', 'info');
            return false;
        }
        setLiveLinks(liveLinks);
        if (typeof saveData === 'function') {
            saveData({
                immediate: true,
                forceRender: true,
                source: 'nexus-datapack-view-micro-data',
                meta: { changed }
            });
        }
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof showToast === 'function') showToast('Card internals saved.', 'success');
        closeCardInternals();
        renderGateway(resolveCurrentScope());
        return true;
    }

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
        if (action === 'save-macro') {
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
