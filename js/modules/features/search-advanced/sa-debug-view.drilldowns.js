window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const state = ns.DebugDrilldownState = ns.DebugDrilldownState || {
        selectedKind: '',
        selectedKey: ''
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

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function issueKey(issue, index) {
        return [
            text(issue?.severity, 'info'),
            text(issue?.type, 'result'),
            text(issue?.workspaceId || issue?.workspaceLabel, ''),
            text(issue?.categoryName, ''),
            text(issue?.folderId, ''),
            text(issue?.linkId, ''),
            text(issue?.title, 'Untitled'),
            index
        ].join('|');
    }

    function getIssues(spine) {
        return toArray(spine?.integrity?.issues);
    }

    function getFolderIssues(spine) {
        const report = spine?.folderIntegrity || {};
        return toArray(report.folders).concat(toArray(report.bookmarks)).map(function (issue, index) {
            return {
                id: 'folder-' + index,
                severity: 'error',
                type: issue.linkId ? 'bookmark-folder' : 'folder',
                title: issue.title || issue.name || issue.folderId || 'Folder issue',
                workspaceId: text(issue.workspaceId, ''),
                categoryName: text(issue.categoryName, ''),
                folderId: text(issue.folderId, ''),
                linkId: text(issue.linkId, ''),
                pathLabel: [issue.workspaceId, issue.categoryName, issue.folderId].filter(Boolean).join(' > '),
                reasons: toArray(issue.reasons),
                issueTypes: toArray(issue.issueTypes)
            };
        });
    }

    function renderButtonRow(kind, key, left, right, extraClass) {
        const selected = state.selectedKind === kind && state.selectedKey === key ? ' nx-debug-drill-selected' : '';
        return '<button type="button" class="nx-debug-mini-row nx-debug-drill-row' + selected + (extraClass || '') + '"'
            + ' data-nx-drill-kind="' + escAttr(kind) + '"'
            + ' data-nx-drill-key="' + escAttr(key) + '">'
            + '<span>' + escHtml(left) + '</span><span>' + escHtml(right) + '</span>'
            + '</button>';
    }

    function getFilteredIssues(spine) {
        const issues = getIssues(spine);
        if (state.selectedKind === 'reason') {
            return issues.filter(function (issue) {
                return toArray(issue.reasons).includes(state.selectedKey);
            });
        }
        if (state.selectedKind === 'workspace') {
            return issues.filter(function (issue) {
                return text(issue.workspaceLabel || issue.workspaceId, '') === state.selectedKey;
            });
        }
        if (state.selectedKind === 'issue') {
            return issues.filter(function (issue, index) {
                return issueKey(issue, index) === state.selectedKey;
            });
        }
        if (state.selectedKind === 'folder') {
            const folderIssues = getFolderIssues(spine);
            return folderIssues.filter(function (issue, index) {
                return issueKey(issue, index) === state.selectedKey;
            });
        }
        return [];
    }

    function renderIssueActions(issue) {
        const workspaceId = text(issue?.workspaceId, '');
        const categoryName = text(issue?.categoryName, '');
        const folderId = text(issue?.folderId, '');
        const linkId = text(issue?.linkId, '');
        let html = '<div class="nx-debug-drill-actions">';
        if (workspaceId && categoryName) {
            html += '<button type="button" class="nx-debug-action-btn" data-nx-drill-action="go-path" data-workspace-id="' + escAttr(workspaceId) + '" data-category-name="' + escAttr(categoryName) + '" data-folder-id="' + escAttr(folderId) + '" data-link-id="' + escAttr(linkId) + '">Go To Path</button>';
            html += '<button type="button" class="nx-debug-action-btn" data-nx-drill-action="open-map" data-workspace-id="' + escAttr(workspaceId) + '" data-category-name="' + escAttr(categoryName) + '" data-folder-id="' + escAttr(folderId) + '">Open Map</button>';
        }
        if (workspaceId) {
            html += '<button type="button" class="nx-debug-action-btn" data-nx-drill-action="view-state" data-workspace-id="' + escAttr(workspaceId) + '" data-category-name="' + escAttr(categoryName) + '">Open View State</button>';
            html += '<button type="button" class="nx-debug-action-btn" data-nx-drill-action="scope-workspace" data-workspace-id="' + escAttr(workspaceId) + '">Scope Nexus Here</button>';
        }
        html += '<button type="button" class="nx-debug-action-btn" data-nx-drill-action="inspect-provenance"'
            + ' data-workspace-id="' + escAttr(workspaceId) + '"'
            + ' data-category-name="' + escAttr(categoryName) + '"'
            + ' data-folder-id="' + escAttr(folderId) + '"'
            + ' data-link-id="' + escAttr(linkId) + '"'
            + ' data-source-kind="' + escAttr(issue?.sourceKind || '') + '"'
            + ' data-provider="' + escAttr(issue?.provider || '') + '"'
            + ' data-path-label="' + escAttr(issue?.pathLabel || '') + '">Inspect Provenance</button>';
        if (issue?.type === 'folder' || issue?.type === 'bookmark-folder') {
            html += '<button type="button" class="nx-debug-action-btn" data-nx-drill-action="repair-folders" data-workspace-id="' + escAttr(workspaceId) + '" data-category-name="' + escAttr(categoryName) + '">Repair This Card</button>';
        }
        html += '</div>';
        return html;
    }

    function renderIssueCards(issues, emptyText) {
        if (!issues.length) {
            return '<div class="nx-debug-drill-empty">' + escHtml(emptyText || 'No matching issues in this scope.') + '</div>';
        }
        let html = '<div class="nx-debug-drill-cards">';
        issues.slice(0, 8).forEach(function (issue) {
            const label = [issue.severity || 'info', issue.type || 'result', issue.title || 'Untitled'].join(' / ');
            html += '<div class="nx-debug-drill-card nx-debug-drill-' + escAttr(issue.severity || 'info') + '">';
            html += '<div class="nx-debug-drill-card-title">' + escHtml(label) + '</div>';
            html += '<div class="nx-debug-drill-card-path">' + escHtml(issue.pathLabel || [issue.workspaceLabel || issue.workspaceId, issue.categoryName, issue.folderId].filter(Boolean).join(' > ')) + '</div>';
            toArray(issue.reasons).slice(0, 4).forEach(function (reason) {
                html += '<div class="nx-debug-drill-reason">' + escHtml(reason) + '</div>';
            });
            html += renderIssueActions(issue);
            html += '</div>';
        });
        if (issues.length > 8) {
            html += '<div class="nx-debug-drill-empty">' + (issues.length - 8) + ' more matching issue(s) hidden in this compact panel.</div>';
        }
        html += '</div>';
        return html;
    }

    function renderSelectedPanel(spine) {
        if (!state.selectedKind || !state.selectedKey) {
            return '<div class="nx-debug-drill-panel"><div class="nx-debug-drill-empty">Click a workspace, reason, issue, or folder disturbance to inspect it here.</div></div>';
        }
        const issues = getFilteredIssues(spine);
        const title = state.selectedKind === 'reason'
            ? 'Reason: ' + state.selectedKey
            : state.selectedKind === 'workspace'
                ? 'Workspace: ' + state.selectedKey
                : state.selectedKind === 'folder'
                    ? 'Folder Disturbance'
                    : 'Issue Detail';
        let html = '<div class="nx-debug-drill-panel">';
        html += '<div class="nx-debug-drill-panel-head"><strong>' + escHtml(title) + '</strong>';
        html += '<button type="button" class="nx-debug-drill-clear" data-nx-drill-action="clear">Clear</button></div>';
        html += renderIssueCards(issues, 'No issue payload is available for this row.');
        html += '</div>';
        return html;
    }

    function renderSpineDrilldowns(spine) {
        if (!spine?.integrity) return '';
        const topWorkspaces = Object.entries(spine.integrity.byWorkspace || {})
            .sort(function (left, right) {
                return Number(right[1] || 0) - Number(left[1] || 0) || String(left[0]).localeCompare(String(right[0]));
            })
            .slice(0, 6);
        const topReasons = Object.entries(spine.integrity.byReason || {})
            .sort(function (left, right) {
                return Number(right[1] || 0) - Number(left[1] || 0);
            })
            .slice(0, 6);
        const issues = getIssues(spine).slice(0, 8);
        const folderIssues = getFolderIssues(spine).slice(0, 8);
        let html = '<div class="nx-debug-drill">';
        html += '<div class="nx-debug-drill-subtitle">Drilldowns</div>';
        html += '<div class="nx-debug-drill-grid">';
        html += '<div><div class="nx-debug-drill-label">Workspace issue counts</div><div class="nx-debug-mini-list">';
        topWorkspaces.forEach(function (entry) {
            html += renderButtonRow('workspace', String(entry[0]), entry[0], entry[1]);
        });
        html += '</div></div>';
        html += '<div><div class="nx-debug-drill-label">Reason buckets</div><div class="nx-debug-mini-list">';
        topReasons.forEach(function (entry) {
            html += renderButtonRow('reason', String(entry[0]), entry[0], entry[1]);
        });
        html += '</div></div>';
        html += '</div>';
        html += '<div class="nx-debug-drill-label">Issue details</div><div class="nx-debug-mini-list">';
        issues.forEach(function (issue, index) {
            html += renderButtonRow('issue', issueKey(issue, index), [issue.severity || 'info', issue.type || 'result', issue.title || 'Untitled'].join(' / '), toArray(issue.reasons)[0] || issue.pathLabel || '');
        });
        if (!issues.length) html += '<div class="nx-debug-drill-empty">No integrity issues in this scope.</div>';
        html += '</div>';
        if (folderIssues.length) {
            html += '<div class="nx-debug-drill-label">Folder path disturbances</div><div class="nx-debug-mini-list">';
            folderIssues.forEach(function (issue, index) {
                html += renderButtonRow('folder', issueKey(issue, index), [issue.severity, issue.type, issue.title].join(' / '), toArray(issue.reasons)[0] || issue.pathLabel || '', ' nx-debug-drill-folder-row');
            });
            html += '</div>';
        }
        html += renderSelectedPanel(spine);
        html += '</div>';
        return html;
    }

    function renderPerformanceHints(perf, overview) {
        const hints = [];
        if (Number(overview?.folderViewCacheSize || 0) > 0) hints.push('Folder cache is warm; clear it only when folder views look stale.');
        if (perf?.linkItemCap === 'unlimited') hints.push('Large datapacks may scroll smoother with perf mode enabled.');
        if (Number(perf?.nexusIndexedRecords || 0) > 0) hints.push('Index is active; use Reindex only after stale Nexus results or bulk edits.');
        if (!hints.length) return '';
        return '<div class="nx-debug-perf-hints">' + hints.map(function (hint) {
            return '<div>' + escHtml(hint) + '</div>';
        }).join('') + '</div>';
    }

    function issueToResult(actionNode) {
        return {
            path: {
                workspaceId: text(actionNode.getAttribute('data-workspace-id'), ''),
                categoryName: text(actionNode.getAttribute('data-category-name'), ''),
                folderId: text(actionNode.getAttribute('data-folder-id'), ''),
                linkId: text(actionNode.getAttribute('data-link-id'), '')
            },
            provenance: {
                linkId: text(actionNode.getAttribute('data-link-id'), ''),
                folderId: text(actionNode.getAttribute('data-folder-id'), '')
            }
        };
    }

    function showInlineProvenance(actionNode) {
        const card = actionNode.closest?.('.nx-debug-drill-card');
        if (!card) return;
        const existing = card.querySelector('.nx-debug-drill-provenance');
        if (existing) {
            existing.remove();
            return;
        }
        const lines = [
            ['Workspace', actionNode.getAttribute('data-workspace-id')],
            ['Card', actionNode.getAttribute('data-category-name')],
            ['Folder', actionNode.getAttribute('data-folder-id')],
            ['Bookmark', actionNode.getAttribute('data-link-id')],
            ['Source kind', actionNode.getAttribute('data-source-kind')],
            ['Provider', actionNode.getAttribute('data-provider')],
            ['Path', actionNode.getAttribute('data-path-label')]
        ].filter(function (entry) {
            return text(entry[1], '');
        });
        const box = document.createElement('div');
        box.className = 'nx-debug-drill-provenance';
        box.innerHTML = lines.length
            ? lines.map(function (entry) {
                return '<div><span>' + escHtml(entry[0]) + '</span><strong>' + escHtml(entry[1]) + '</strong></div>';
            }).join('')
            : '<div>No extra provenance payload is available for this issue.</div>';
        card.appendChild(box);
    }

    function bindDrilldownInteractions(container, renderDebugPanel) {
        if (!container || typeof renderDebugPanel !== 'function') return;
        container.querySelectorAll('[data-nx-drill-kind]').forEach(function (node) {
            node.onclick = function () {
                state.selectedKind = text(node.getAttribute('data-nx-drill-kind'), '');
                state.selectedKey = text(node.getAttribute('data-nx-drill-key'), '');
                renderDebugPanel(container);
            };
        });
        container.querySelectorAll('[data-nx-drill-action]').forEach(function (node) {
            node.onclick = async function (event) {
                event?.stopPropagation?.();
                const action = node.getAttribute('data-nx-drill-action');
                const workspaceId = text(node.getAttribute('data-workspace-id'), '');
                const categoryName = text(node.getAttribute('data-category-name'), '');
                if (action === 'clear') {
                    state.selectedKind = '';
                    state.selectedKey = '';
                    renderDebugPanel(container);
                } else if (action === 'go-path') {
                    ns.Navigation?.goToPath?.(issueToResult(node), { focusBookmark: true });
                } else if (action === 'open-map') {
                    ns.Navigation?.openMap?.(issueToResult(node));
                } else if (action === 'view-state') {
                    ns.DatapackView?.openGateway?.({ scope: { workspaceId, categoryName: categoryName || undefined } });
                } else if (action === 'scope-workspace') {
                    ns.UI?.openExpandedSearchModal?.({ scope: { workspaceId }, scopeMode: 'current', autoSearch: false });
                } else if (action === 'inspect-provenance') {
                    showInlineProvenance(node);
                } else if (action === 'repair-folders') {
                    const repairApi = window.EveBookmarkFolders?.repairFolderIntegrity;
                    if (typeof repairApi !== 'function') return;
                    const result = repairApi({ workspaceId, categoryName });
                    await ns.Index?.rebuild?.({ reason: 'debug-drilldown-folder-repair', force: true });
                    if (typeof renderDashboard === 'function') renderDashboard();
                    if (typeof showToast === 'function') {
                        showToast('Repaired ' + result.rootedFolders + ' folder paths and moved ' + result.movedBookmarksToRoot + ' orphaned bookmarks to card root', 'success');
                    }
                    renderDebugPanel(container);
                }
            };
        });
    }

    ns.DebugDrilldowns = {
        state,
        renderSpineDrilldowns,
        renderPerformanceHints,
        bindDrilldownInteractions
    };
})();
