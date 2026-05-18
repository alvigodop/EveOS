window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const debugState = ns.DebugViewState = ns.DebugViewState || {
        selectedWorkspaceId: ''
    };

    function escHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escAttr(value) {
        return escHtml(value).replace(/"/g, '&quot;');
    }

    function text(value, fallback) {
        const normalized = String(value ?? '').trim();
        return normalized || String(fallback ?? '').trim();
    }

    function getAllLinks() {
        if (typeof window.getLiveLinks === 'function') {
            return window.getLiveLinks();
        }
        return Array.isArray(window.eveState?.links)
            ? window.eveState.links
            : (typeof window.links !== 'undefined' ? window.links : []);
    }

    function getConfig() {
        return window.eveState?.config || (typeof config !== 'undefined' ? config : {});
    }

    function getWorkspaces() {
        return getConfig().workspaces || [];
    }

    function getWorkspaceById(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = getWorkspaces();
        if (helpers?.findById) return helpers.findById(workspaces, workspaceId) || null;
        return workspaces.find(function (workspace) {
            return text(workspace?.id, '') === text(workspaceId, '');
        }) || null;
    }

    function getWorkspacePathLabel(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = getWorkspaces();
        const path = helpers?.getPath ? helpers.getPath(workspaces, workspaceId) : [];
        if (path.length) {
            return path.map(function (workspace) {
                return text(workspace?.name, workspace?.id || '');
            }).filter(Boolean).join(' > ');
        }
        const workspace = getWorkspaceById(workspaceId);
        return workspace ? text(workspace.name, workspace.id) : text(workspaceId, 'Unknown tab');
    }

    function getDescendantWorkspaceIds(workspace) {
        const helpers = window.EveWorkspaceHelpers;
        if (helpers?.getDescendantIds) {
            return helpers.getDescendantIds(workspace)
                .map(function (id) { return text(id, ''); })
                .filter(Boolean);
        }
        const ids = [];
        (Array.isArray(workspace?.subTabs) ? workspace.subTabs : []).forEach(function walk(child) {
            const childId = text(child?.id, '');
            if (childId) ids.push(childId);
            (Array.isArray(child?.subTabs) ? child.subTabs : []).forEach(walk);
        });
        return ids;
    }

    function getFolderStore() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') return window.eveState.bookmarkFolders;
        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') return window.bookmarkFolders;
        if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') return bookmarkFolders;
        return {};
    }

    function buildFolderScopedKey(workspaceId, categoryName) {
        if (typeof window.EveBookmarkFolders?.buildScopedKey === 'function') {
            return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
        }
        return text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
    }

    function getFolderNodesForCard(workspaceId, categoryName) {
        const tree = getFolderStore()[buildFolderScopedKey(workspaceId, categoryName)];
        if (Array.isArray(tree)) return tree;
        return Array.isArray(tree?.nodes) ? tree.nodes : [];
    }

    function getCategoryNamesForWorkspace(workspaceId, workspaceLinks) {
        const cfg = getConfig();
        const ws = text(workspaceId, 'main');
        const names = [];
        function add(name) {
            const normalized = text(name, '');
            if (normalized && !names.includes(normalized)) names.push(normalized);
        }
        const workspaceOrder = Array.isArray(cfg.categoryOrderByWorkspace?.[ws]) ? cfg.categoryOrderByWorkspace[ws] : [];
        workspaceOrder.forEach(add);
        if (ws === 'main' && !workspaceOrder.length) {
            (Array.isArray(cfg.categoryOrder) ? cfg.categoryOrder : []).forEach(add);
        }
        (Array.isArray(workspaceLinks) ? workspaceLinks : []).forEach(function (link) {
            add(link?.category || 'Unsorted');
        });
        Object.keys(getFolderStore()).forEach(function (key) {
            const prefix = ws + '::';
            if (key.startsWith(prefix)) add(key.slice(prefix.length));
        });
        return names;
    }

    function countBookmarkIdentifiers(link) {
        const ids = Array.isArray(link?.identifierIds) ? link.identifierIds : (Array.isArray(link?.bookmarkIdentifierIds) ? link.bookmarkIdentifierIds : []);
        const tags = Array.isArray(link?.tags) ? link.tags : [];
        return ids.length + tags.length;
    }

    function collectWorkspaceBreakdown() {
        const links = getAllLinks();
        const workspaces = getWorkspaces();
        const helpers = window.EveWorkspaceHelpers;
        const allWsIds = helpers?.flattenIds ? new Set(helpers.flattenIds(workspaces)) : new Set();
        const rows = [];
        const counts = {};

        links.forEach(function (link) {
            if (!link) return;
            const ws = String(link.workspace || 'main').trim();
            counts[ws] = (counts[ws] || 0) + 1;
        });

        const flat = helpers?.flatten ? helpers.flatten(workspaces) : workspaces;
        flat.forEach(function (workspace) {
            if (!workspace) return;
            const id = String(workspace.id);
            rows.push({
                id: id,
                name: workspace.name || id,
                icon: workspace.icon || 'folder',
                linkCount: counts[id] || 0,
                status: 'active',
                depth: helpers?.getDepth ? helpers.getDepth(workspaces, id) : 0,
                pathLabel: getWorkspacePathLabel(id),
                childCount: Array.isArray(workspace.subTabs) ? workspace.subTabs.length : 0,
                linkedTo: text(workspace.linkedTo, ''),
                hiddenInParent: !!workspace.hiddenInParent
            });
        });

        Object.keys(counts).forEach(function (wsId) {
            if (!allWsIds.has(wsId) && !rows.some(function (row) { return row.id === wsId; })) {
                rows.push({
                    id: wsId,
                    name: wsId,
                    icon: 'ghost',
                    linkCount: counts[wsId],
                    status: 'orphaned',
                    depth: 0,
                    pathLabel: wsId,
                    childCount: 0,
                    linkedTo: '',
                    hiddenInParent: false
                });
            }
        });

        return rows.sort(function (left, right) {
            return Number(right.linkCount || 0) - Number(left.linkCount || 0);
        });
    }

    async function collectWorkspaceDetail(workspaceId, options = {}) {
        const wsId = text(workspaceId, '');
        if (!wsId) return null;

        const workspace = getWorkspaceById(wsId);
        const links = getAllLinks();
        const directLinks = links.filter(function (link) {
            return text(link?.workspace, 'main') === wsId;
        });
        const descendantIds = workspace ? getDescendantWorkspaceIds(workspace) : [];
        const descendantSet = new Set(descendantIds);
        const branchLinks = links.filter(function (link) {
            const linkWorkspaceId = text(link?.workspace, 'main');
            return linkWorkspaceId === wsId || descendantSet.has(linkWorkspaceId);
        });
        const categoryNames = getCategoryNamesForWorkspace(wsId, directLinks);
        const cards = categoryNames.map(function (categoryName) {
            const cardLinks = directLinks.filter(function (link) {
                return text(link?.category, 'Unsorted') === categoryName;
            });
            const folderNodes = getFolderNodesForCard(wsId, categoryName);
            return {
                name: categoryName,
                bookmarks: cardLinks.length,
                folders: folderNodes.length,
                linkedLibrary: cardLinks.filter(function (link) {
                    return !!(link?.library?.linked || link?.libraryEntryId || link?.libraryId || link?.linkedLibrary);
                }).length,
                pinned: cardLinks.filter(function (link) {
                    return !!(link?.pinned || link?.isPinned || link?.pinId);
                }).length,
                done: cardLinks.filter(function (link) { return !!link?.done; }).length,
                identifiers: cardLinks.reduce(function (sum, link) {
                    return sum + countBookmarkIdentifiers(link);
                }, 0)
            };
        }).sort(function (left, right) {
            return Number(right.bookmarks || 0) - Number(left.bookmarks || 0) || left.name.localeCompare(right.name);
        });

        const childTabs = Array.isArray(workspace?.subTabs)
            ? workspace.subTabs.map(function (child) {
                const childId = text(child?.id, '');
                return {
                    id: childId,
                    name: text(child?.name, childId),
                    icon: text(child?.icon, 'folder'),
                    pathLabel: getWorkspacePathLabel(childId),
                    bookmarks: links.filter(function (link) { return text(link?.workspace, 'main') === childId; }).length,
                    childCount: Array.isArray(child?.subTabs) ? child.subTabs.length : 0,
                    hiddenInParent: !!child?.hiddenInParent,
                    linkedTo: text(child?.linkedTo, '')
                };
            })
            : [];

        const indexApi = window.EveOS?.SearchAdvanced?.Index;
        const snapshot = options.snapshot || indexApi?.getSnapshot?.() || null;
        const integrity = indexApi?.getIntegrityReport
            ? await indexApi.getIntegrityReport({ snapshot, scope: { workspaceId: wsId } })
            : null;
        const folderIntegrity = window.EveBookmarkFolders?.collectFolderIntegrity
            ? window.EveBookmarkFolders.collectFolderIntegrity({ workspaceId: wsId })
            : null;
        const linkedTarget = workspace?.linkedTo ? getWorkspaceById(workspace.linkedTo) : null;

        return {
            id: wsId,
            name: workspace ? text(workspace.name, wsId) : wsId,
            icon: workspace ? text(workspace.icon, 'folder') : 'ghost',
            status: workspace ? 'active' : 'orphaned',
            pathLabel: getWorkspacePathLabel(wsId),
            depth: window.EveWorkspaceHelpers?.getDepth ? window.EveWorkspaceHelpers.getDepth(getWorkspaces(), wsId) : 0,
            hiddenInParent: !!workspace?.hiddenInParent,
            linkedTo: text(workspace?.linkedTo, ''),
            linkedTargetName: linkedTarget ? text(linkedTarget.name, linkedTarget.id) : '',
            linkedTargetPath: linkedTarget ? getWorkspacePathLabel(linkedTarget.id) : '',
            directBookmarks: directLinks.length,
            branchBookmarks: branchLinks.length,
            cards: cards,
            cardCount: cards.length,
            folderCount: cards.reduce(function (sum, card) { return sum + Number(card.folders || 0); }, 0),
            linkedLibraryCount: cards.reduce(function (sum, card) { return sum + Number(card.linkedLibrary || 0); }, 0),
            pinnedCount: cards.reduce(function (sum, card) { return sum + Number(card.pinned || 0); }, 0),
            doneCount: cards.reduce(function (sum, card) { return sum + Number(card.done || 0); }, 0),
            identifierCount: cards.reduce(function (sum, card) { return sum + Number(card.identifiers || 0); }, 0),
            childTabs,
            directChildCount: childTabs.length,
            descendantCount: descendantIds.length,
            integrity,
            folderIntegrity,
            issues: (Array.isArray(integrity?.issues) ? integrity.issues : []).slice(0, 6)
        };
    }

    function renderIssueList(issues, truncatedCount) {
        const rows = (Array.isArray(issues) ? issues : []).slice(0, 8);
        if (!rows.length && !truncatedCount) return '';
        let html = '<div class="nx-debug-mini-list">';
        rows.forEach(function (issue) {
            const label = [
                issue.severity || 'info',
                issue.type || 'result',
                issue.title || 'Untitled'
            ].join(' / ');
            const reason = Array.isArray(issue.reasons) && issue.reasons.length
                ? issue.reasons[0]
                : (issue.pathLabel || issue.workspaceLabel || '');
            html += '<div class="nx-debug-mini-row"><span>' + escHtml(label) + '</span><span>' + escHtml(reason) + '</span></div>';
        });
        if (truncatedCount) {
            html += '<div class="nx-debug-mini-row"><span>more issues</span><span>' + truncatedCount + '</span></div>';
        }
        html += '</div>';
        return html;
    }

    function renderWorkspaceBreakdown(rows, selectedWorkspaceId) {
        let html = '<div class="nx-debug-ws-list">';
        rows.forEach(function (workspace) {
            const depthPad = workspace.depth > 0 ? ' style="padding-left:' + (workspace.depth * 12) + 'px"' : '';
            const statusClass = workspace.status === 'orphaned' ? ' nx-debug-orphan' : '';
            const selectedClass = workspace.id === selectedWorkspaceId ? ' nx-debug-ws-selected' : '';
            const title = [
                workspace.pathLabel,
                workspace.childCount ? workspace.childCount + ' child tab(s)' : '',
                workspace.linkedTo ? 'Shortcut to ' + workspace.linkedTo : '',
                workspace.hiddenInParent ? 'Hidden in parent' : ''
            ].filter(Boolean).join(' | ');
            html += '<button type="button" class="nx-debug-ws-row' + statusClass + selectedClass + '"'
                + depthPad
                + ' data-workspace-id="' + escAttr(workspace.id) + '"'
                + ' title="' + escAttr(title) + '">';
            html += '<span class="nx-debug-ws-icon">' + escHtml(workspace.icon) + '</span>';
            html += '<span class="nx-debug-ws-name">' + escHtml(workspace.name) + '</span>';
            if (workspace.childCount) html += '<span class="nx-debug-ws-chip">' + workspace.childCount + ' child</span>';
            if (workspace.linkedTo) html += '<span class="nx-debug-ws-chip">link</span>';
            html += '<span class="nx-debug-ws-count">' + workspace.linkCount + '</span>';
            if (workspace.status === 'orphaned') html += '<span class="nx-debug-ws-badge">ghost</span>';
            html += '</button>';
        });
        html += '</div>';
        return html;
    }

    function renderWorkspaceDetail(detail) {
        if (!detail) {
            return '<div class="nx-debug-ws-empty">Select a tab above to inspect its live Nexus contents.</div>';
        }

        let html = '<div class="nx-debug-ws-detail" data-workspace-id="' + escAttr(detail.id) + '">';
        html += '<div class="nx-debug-ws-detail-head">';
        html += '<div>';
        html += '<div class="nx-debug-ws-detail-title">' + escHtml(detail.icon) + ' ' + escHtml(detail.name) + '</div>';
        html += '<div class="nx-debug-ws-detail-path">' + escHtml(detail.pathLabel) + '</div>';
        html += '</div>';
        html += '<div class="nx-debug-ws-detail-badges">';
        html += '<span>' + escHtml(detail.status) + '</span>';
        html += '<span>depth ' + Math.max(0, Number(detail.depth || 0)) + '</span>';
        if (detail.hiddenInParent) html += '<span>hidden parent</span>';
        if (detail.linkedTo) html += '<span>shortcut</span>';
        html += '</div>';
        html += '</div>';

        if (detail.linkedTo) {
            html += '<div class="nx-debug-ws-linked">Shortcut source: '
                + escHtml(detail.linkedTargetPath || detail.linkedTo)
                + '</div>';
        }

        html += '<div class="nx-debug-ws-stats">';
        [
            ['Direct bookmarks', detail.directBookmarks],
            ['Branch bookmarks', detail.branchBookmarks],
            ['Cards', detail.cardCount],
            ['Folders', detail.folderCount],
            ['Child tabs', detail.directChildCount],
            ['Descendants', detail.descendantCount],
            ['Library linked', detail.linkedLibraryCount],
            ['Pinned', detail.pinnedCount],
            ['Done', detail.doneCount],
            ['Labels', detail.identifierCount],
            ['Issues', detail.integrity?.issueCount || 0],
            ['Folder issues', detail.folderIntegrity?.issueCount || 0]
        ].forEach(function (item) {
            html += '<div class="nx-debug-ws-stat"><span>' + escHtml(item[0]) + '</span><strong>' + escHtml(item[1]) + '</strong></div>';
        });
        html += '</div>';

        html += '<div class="nx-debug-ws-actions">';
        html += '<button type="button" class="nx-debug-action-btn" data-nx-debug-action="open-workspace" data-workspace-id="' + escAttr(detail.id) + '">Open Tab</button>';
        html += '<button type="button" class="nx-debug-action-btn" data-nx-debug-action="scope-workspace" data-workspace-id="' + escAttr(detail.id) + '">Scope Nexus Here</button>';
        html += '<button type="button" class="nx-debug-action-btn" data-nx-debug-action="view-state" data-workspace-id="' + escAttr(detail.id) + '">Open View State</button>';
        html += '<button type="button" class="nx-debug-action-btn" data-nx-debug-action="open-map" data-workspace-id="' + escAttr(detail.id) + '">Open Map</button>';
        html += '</div>';

        if (detail.childTabs.length) {
            html += '<div class="nx-debug-ws-subtitle">Child Tabs</div>';
            html += '<div class="nx-debug-mini-list">';
            detail.childTabs.slice(0, 8).forEach(function (child) {
                const suffix = [
                    child.bookmarks + ' links',
                    child.childCount + ' child tabs',
                    child.hiddenInParent ? 'hidden' : '',
                    child.linkedTo ? 'shortcut' : ''
                ].filter(Boolean).join(' / ');
                html += '<button type="button" class="nx-debug-mini-row nx-debug-ws-child" data-workspace-id="' + escAttr(child.id) + '">';
                html += '<span>' + escHtml(child.icon) + ' ' + escHtml(child.name) + '</span><span>' + escHtml(suffix) + '</span>';
                html += '</button>';
            });
            if (detail.childTabs.length > 8) {
                html += '<div class="nx-debug-mini-row"><span>more child tabs</span><span>' + (detail.childTabs.length - 8) + '</span></div>';
            }
            html += '</div>';
        }

        html += '<div class="nx-debug-ws-subtitle">Cards In This Tab</div>';
        if (detail.cards.length) {
            html += '<div class="nx-debug-mini-list">';
            detail.cards.slice(0, 8).forEach(function (card) {
                const suffix = [
                    card.bookmarks + ' links',
                    card.folders + ' folders',
                    card.linkedLibrary + ' library',
                    card.identifiers + ' labels'
                ].join(' / ');
                html += '<div class="nx-debug-mini-row"><span>' + escHtml(card.name) + '</span><span>' + escHtml(suffix) + '</span></div>';
            });
            if (detail.cards.length > 8) {
                html += '<div class="nx-debug-mini-row"><span>more cards</span><span>' + (detail.cards.length - 8) + '</span></div>';
            }
            html += '</div>';
        } else {
            html += '<div class="nx-debug-ws-empty">No direct cards/bookmarks are stored in this tab.</div>';
        }

        if (detail.issues.length) {
            html += '<div class="nx-debug-ws-subtitle">Top Issues</div>';
            html += renderIssueList(detail.issues, Math.max(0, Number(detail.integrity?.issueCount || 0) - detail.issues.length));
        }

        html += '</div>';
        return html;
    }

    function bindWorkspaceInteractions(container, renderDebugPanel) {
        if (!container || typeof renderDebugPanel !== 'function') return;

        container.querySelectorAll('.nx-debug-ws-row[data-workspace-id], .nx-debug-ws-child[data-workspace-id]').forEach(function (row) {
            row.onclick = function () {
                const workspaceId = text(row.getAttribute('data-workspace-id'), '');
                if (!workspaceId) return;
                debugState.selectedWorkspaceId = workspaceId;
                renderDebugPanel(container);
            };
        });

        container.querySelectorAll('[data-nx-debug-action]').forEach(function (actionNode) {
            actionNode.onclick = function (event) {
                if (event?.stopPropagation) event.stopPropagation();
                const action = actionNode.getAttribute('data-nx-debug-action');
                const workspaceId = text(actionNode.getAttribute('data-workspace-id'), debugState.selectedWorkspaceId);
                if (!workspaceId) return;
                if (action === 'open-workspace') {
                    if (typeof window.switchWorkspace === 'function') {
                        window.switchWorkspace(workspaceId, { forceRender: true });
                    }
                    if (typeof showToast === 'function') showToast('Opened tab ' + getWorkspacePathLabel(workspaceId), 'info');
                } else if (action === 'scope-workspace') {
                    window.EveOS?.SearchAdvanced?.UI?.openExpandedSearchModal?.({
                        scope: { workspaceId },
                        scopeMode: 'current',
                        autoSearch: false
                    });
                    if (typeof showToast === 'function') showToast('Nexus scoped to ' + getWorkspacePathLabel(workspaceId), 'info');
                } else if (action === 'view-state') {
                    window.EveOS?.SearchAdvanced?.DatapackView?.openGateway?.({
                        scope: { workspaceId }
                    });
                } else if (action === 'open-map') {
                    if (window.EveConstellationMap?.openWorkspaceMap) {
                        window.EveConstellationMap.openWorkspaceMap(workspaceId);
                    } else if (typeof showToast === 'function') {
                        showToast('Constellation Map is not available', 'warning');
                    }
                }
            };
        });
    }

    ns.DebugWorkspace = {
        debugState,
        escHtml,
        escAttr,
        text,
        getWorkspacePathLabel,
        collectWorkspaceBreakdown,
        collectWorkspaceDetail,
        renderWorkspaceBreakdown,
        renderWorkspaceDetail,
        bindWorkspaceInteractions
    };
})();
