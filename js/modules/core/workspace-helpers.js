// --- WORKSPACE HELPERS (Recursive Sub-Tab Utilities) ---
window.EveWorkspaceHelpers = (function () {

    /**
     * Find a workspace by ID at any depth in the tree.
     * Returns the workspace object or null.
     */
    function findById(workspaces, id) {
        if (!Array.isArray(workspaces) || !id) return null;
        const targetId = String(id);
        for (let i = 0; i < workspaces.length; i++) {
            const ws = workspaces[i];
            if (!ws) continue;
            if (String(ws.id) === targetId) return ws;
            if (Array.isArray(ws.subTabs)) {
                const found = findById(ws.subTabs, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Find the parent workspace of a given ID.
     * Returns null for root-level workspaces.
     */
    function findParent(workspaces, id, parent) {
        if (!Array.isArray(workspaces) || !id) return null;
        const targetId = String(id);
        for (let i = 0; i < workspaces.length; i++) {
            const ws = workspaces[i];
            if (!ws) continue;
            if (String(ws.id) === targetId) return parent || null;
            if (Array.isArray(ws.subTabs)) {
                const found = findParent(ws.subTabs, targetId, ws);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Get the depth of a workspace in the tree (0 = root level).
     * Returns -1 if not found.
     */
    function getDepth(workspaces, id, currentDepth) {
        if (!Array.isArray(workspaces) || !id) return -1;
        const depth = typeof currentDepth === 'number' ? currentDepth : 0;
        const targetId = String(id);
        for (let i = 0; i < workspaces.length; i++) {
            const ws = workspaces[i];
            if (!ws) continue;
            if (String(ws.id) === targetId) return depth;
            if (Array.isArray(ws.subTabs)) {
                const found = getDepth(ws.subTabs, targetId, depth + 1);
                if (found !== -1) return found;
            }
        }
        return -1;
    }

    /**
     * Return a flat array of all workspace objects at every depth.
     */
    function flatten(workspaces) {
        const result = [];
        if (!Array.isArray(workspaces)) return result;
        workspaces.forEach(function (ws) {
            if (!ws) return;
            result.push(ws);
            if (Array.isArray(ws.subTabs)) {
                flatten(ws.subTabs).forEach(function (child) {
                    result.push(child);
                });
            }
        });
        return result;
    }

    /**
     * Return a flat array of all workspace IDs at every depth.
     */
    function flattenIds(workspaces) {
        return flatten(workspaces).map(function (ws) {
            return String(ws.id || '');
        }).filter(Boolean);
    }

    /**
     * Get all descendant IDs of a workspace (not including itself).
     */
    function getDescendantIds(workspace) {
        const result = [];
        if (!workspace || !Array.isArray(workspace.subTabs)) return result;
        workspace.subTabs.forEach(function (child) {
            if (!child) return;
            result.push(String(child.id));
            getDescendantIds(child).forEach(function (id) {
                result.push(id);
            });
        });
        return result;
    }

    /**
     * Remove a workspace by ID at any depth. Returns new array (immutable).
     * Does NOT cascade — caller should handle link reassignment first.
     */
    function removeById(workspaces, id) {
        if (!Array.isArray(workspaces) || !id) return workspaces || [];
        const targetId = String(id);
        return workspaces
            .filter(function (ws) { return ws && String(ws.id) !== targetId; })
            .map(function (ws) {
                if (Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                    return Object.assign({}, ws, { subTabs: removeById(ws.subTabs, targetId) });
                }
                return ws;
            });
    }

    /**
     * Add a sub-tab to a parent workspace. Mutates in place, returns true on success.
     */
    function addSubTab(workspaces, parentId, newTab) {
        const parent = findById(workspaces, parentId);
        if (!parent) return false;
        if (!Array.isArray(parent.subTabs)) parent.subTabs = [];
        parent.subTabs.push(newTab);
        return true;
    }

    /**
     * Find sibling list metadata for a workspace ID.
     * Returns the parent workspace (or null for root), sibling array, and index.
     */
    function findSiblingContext(workspaces, id, parent) {
        if (!Array.isArray(workspaces) || !id) return null;
        const targetId = String(id);
        for (let i = 0; i < workspaces.length; i += 1) {
            const ws = workspaces[i];
            if (!ws) continue;
            if (String(ws.id) === targetId) {
                return {
                    parent: parent || null,
                    parentId: parent ? String(parent.id) : '',
                    siblings: workspaces,
                    index: i
                };
            }
            if (Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                const found = findSiblingContext(ws.subTabs, targetId, ws);
                if (found) return found;
            }
        }
        return null;
    }

    function clampInsertionIndex(index, length) {
        const max = Math.max(0, Number(length) || 0);
        const numericIndex = Number(index);
        if (!Number.isFinite(numericIndex)) return max;
        return Math.max(0, Math.min(max, Math.trunc(numericIndex)));
    }

    function removeNodeFromTree(workspaces, targetId) {
        let removedNode = null;

        function walkList(list) {
            if (!Array.isArray(list)) {
                return { list: [], changed: false };
            }

            let changed = false;
            const nextList = [];

            for (let i = 0; i < list.length; i += 1) {
                const ws = list[i];
                if (!ws) continue;

                if (!removedNode && String(ws.id) === targetId) {
                    removedNode = ws;
                    changed = true;
                    continue;
                }

                let nextWorkspace = ws;
                if (!removedNode && Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                    const childResult = walkList(ws.subTabs);
                    if (childResult.changed) {
                        nextWorkspace = Object.assign({}, ws, { subTabs: childResult.list });
                        changed = true;
                    }
                }

                nextList.push(nextWorkspace);
            }

            return {
                list: changed ? nextList : list.slice(),
                changed: changed
            };
        }

        const result = walkList(workspaces);
        return {
            workspaces: result.list,
            removedNode: removedNode
        };
    }

    function insertNodeIntoTree(workspaces, parentId, index, node) {
        const targetParentId = String(parentId || '').trim();

        if (!targetParentId) {
            const nextRoots = Array.isArray(workspaces) ? workspaces.slice() : [];
            nextRoots.splice(clampInsertionIndex(index, nextRoots.length), 0, node);
            return { workspaces: nextRoots, inserted: true };
        }

        function walkList(list) {
            if (!Array.isArray(list)) {
                return { workspaces: [], inserted: false };
            }

            let inserted = false;
            const nextList = list.map(function (ws) {
                if (!ws) return ws;

                if (!inserted && String(ws.id) === targetParentId) {
                    const subTabs = Array.isArray(ws.subTabs) ? ws.subTabs.slice() : [];
                    subTabs.splice(clampInsertionIndex(index, subTabs.length), 0, node);
                    inserted = true;
                    return Object.assign({}, ws, { subTabs: subTabs });
                }

                if (!inserted && Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                    const childResult = walkList(ws.subTabs);
                    if (childResult.inserted) {
                        inserted = true;
                        return Object.assign({}, ws, { subTabs: childResult.list });
                    }
                }

                return ws;
            });

            return { workspaces: nextList, inserted: inserted };
        }

        return walkList(workspaces);
    }

    /**
     * Move a workspace to a sibling position under the target parent.
     * `targetParentId` is empty for root placement.
     */
    function moveToPosition(workspaces, workspaceId, targetParentId, targetIndex) {
        if (!Array.isArray(workspaces) || !workspaceId) return workspaces || [];

        const dragId = String(workspaceId);
        const dragNode = findById(workspaces, dragId);
        if (!dragNode) return workspaces;

        const nextParentId = String(targetParentId || '').trim();
        if (nextParentId) {
            if (nextParentId === dragId) return workspaces;
            if (getDescendantIds(dragNode).includes(nextParentId)) return workspaces;
        }

        const sourceContext = findSiblingContext(workspaces, dragId);
        if (!sourceContext) return workspaces;

        let normalizedIndex = clampInsertionIndex(targetIndex, Number.MAX_SAFE_INTEGER);
        if (sourceContext.parentId === nextParentId && sourceContext.index < normalizedIndex) {
            normalizedIndex -= 1;
        }

        const removed = removeNodeFromTree(workspaces, dragId);
        if (!removed.removedNode) return workspaces;

        const inserted = insertNodeIntoTree(removed.workspaces, nextParentId, normalizedIndex, removed.removedNode);
        return inserted.inserted ? inserted.workspaces : workspaces;
    }

    function moveBefore(workspaces, workspaceId, targetId) {
        const targetContext = findSiblingContext(workspaces, targetId);
        if (!targetContext) return workspaces || [];
        return moveToPosition(workspaces, workspaceId, targetContext.parentId, targetContext.index);
    }

    function moveAfter(workspaces, workspaceId, targetId) {
        const targetContext = findSiblingContext(workspaces, targetId);
        if (!targetContext) return workspaces || [];
        return moveToPosition(workspaces, workspaceId, targetContext.parentId, targetContext.index + 1);
    }

    /**
     * Ensure every workspace in the tree has a subTabs array.
     * Converts flat/legacy formats. Returns the sanitized array.
     */
    function sanitize(workspaces) {
        if (!Array.isArray(workspaces)) return [];
        return workspaces.map(function (ws) {
            if (typeof ws === 'string') {
                return { id: ws, name: ws, icon: '📁', subTabs: [] };
            }
            if (!ws || typeof ws !== 'object') {
                return null;
            }
            var sanitized = Object.assign({}, ws);
            if (!sanitized.id) sanitized.id = 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            if (!sanitized.name) sanitized.name = sanitized.id;
            if (!sanitized.icon) sanitized.icon = '📁';
            sanitized.subTabs = Array.isArray(ws.subTabs) ? sanitize(ws.subTabs) : [];
            return sanitized;
        }).filter(Boolean);
    }

    /**
     * Check if workspaces need migration (flat format without subTabs).
     */
    function needsMigration(workspaces) {
        if (!Array.isArray(workspaces) || workspaces.length === 0) return false;
        return workspaces.some(function (ws) {
            return typeof ws === 'string' || (ws && typeof ws === 'object' && !Array.isArray(ws.subTabs));
        });
    }

    /**
     * Walk the tree, calling fn(workspace, depth) for each node.
     */
    function walk(workspaces, fn, depth) {
        if (!Array.isArray(workspaces)) return;
        var d = typeof depth === 'number' ? depth : 0;
        workspaces.forEach(function (ws) {
            if (!ws) return;
            fn(ws, d);
            if (Array.isArray(ws.subTabs)) {
                walk(ws.subTabs, fn, d + 1);
            }
        });
    }

    /**
     * Get descendant IDs that are visible in the parent view.
     * Skips sub-tabs (and their descendants) where hiddenInParent is true.
     */
    function getVisibleDescendantIds(workspace) {
        var result = [];
        if (!workspace || !Array.isArray(workspace.subTabs)) return result;
        workspace.subTabs.forEach(function (child) {
            if (!child) return;
            if (child.hiddenInParent) return; // skip this branch entirely
            result.push(String(child.id));
            getVisibleDescendantIds(child).forEach(function (id) {
                result.push(id);
            });
        });
        return result;
    }

    /**
     * Reconstruct the full path (ancestors) to a given workspace ID.
     * Returns an array of workspace objects from root down to the target.
     */
    function getPath(workspaces, id, currentPath) {
        if (!Array.isArray(workspaces) || !id) return [];
        var path = currentPath || [];
        var targetId = String(id);
        for (var i = 0; i < workspaces.length; i++) {
            var ws = workspaces[i];
            if (!ws) continue;
            if (String(ws.id) === targetId) return path.concat([ws]);
            if (Array.isArray(ws.subTabs)) {
                var found = getPath(ws.subTabs, targetId, path.concat([ws]));
                if (found.length > 0) return found;
            }
        }
        return [];
    }

    return {
        findById: findById,
        findParent: findParent,
        getPath: getPath,
        getDepth: getDepth,
        flatten: flatten,
        flattenIds: flattenIds,
        getDescendantIds: getDescendantIds,
        getVisibleDescendantIds: getVisibleDescendantIds,
        removeById: removeById,
        addSubTab: addSubTab,
        findSiblingContext: findSiblingContext,
        moveToPosition: moveToPosition,
        moveBefore: moveBefore,
        moveAfter: moveAfter,
        sanitize: sanitize,
        needsMigration: needsMigration,
        walk: walk
    };
})();
