window.EveTabNavRuntime = window.EveTabNavRuntime || {};

(function () {
    const rt = window.EveTabNavRuntime;
    const {
        DEFAULT_ICON,
        getConfigRef,
        getSidebarGroupsApi,
        getWorkspaceDepthLabelText,
        buildBreadcrumbPath,
        walkWorkspaces
    } = rt;

    function getWorkspaceSearchItems() {
        var items = [];
        var configRef = getConfigRef();
        if (!configRef) return items;

        var helpers = getWorkspaceHelpers();
        var groupsApi = getSidebarGroupsApi();
        var groupMap = groupsApi && typeof groupsApi.getGroupMap === 'function'
            ? groupsApi.getGroupMap(configRef)
            : new Map();

        walkWorkspaces(function (ws) {
            if (!ws || !ws.id) return;

            var path = buildBreadcrumbPath(ws.id);
            var depthValue = Math.max(0, path.length - 1);
            var pathNames = path.map(function (segment) {
                return String(segment?.name || '').trim();
            }).filter(Boolean);
            var pathText = pathNames.join(' > ');
            var rootId = path.length ? String(path[0].id || '') : String(ws.id || '');
            var rootWorkspace = helpers && typeof helpers.findById === 'function'
                ? helpers.findById(configRef.workspaces || [], rootId)
                : null;
            var groupId = rootWorkspace ? String(rootWorkspace.groupId || '').trim() : '';
            var groupName = groupId && groupMap.has(groupId)
                ? String(groupMap.get(groupId).name || '').trim()
                : '';

            items.push({
                id: String(ws.id || ''),
                name: String(ws.name || ws.id || 'Untitled'),
                icon: ws.icon || DEFAULT_ICON,
                depth: depthValue,
                depthLabelText: getWorkspaceDepthLabelText(depthValue),
                inactive: groupsApi && typeof groupsApi.isWorkspaceEffectivelyInactive === 'function'
                    ? groupsApi.isWorkspaceEffectivelyInactive(ws, configRef)
                    : !!ws.inactive,
                pathText: pathText,
                pathLower: pathText.toLowerCase(),
                nameLower: String(ws.name || ws.id || '').toLowerCase(),
                groupName: groupName,
                groupLower: groupName.toLowerCase()
            });
        });

        return items;
    }

    function getWorkspaceSearchResults(query) {
        var normalizedQuery = String(query || '').trim().toLowerCase();
        if (!normalizedQuery) return [];

        return getWorkspaceSearchItems()
            .map(function (item) {
                var score = 0;
                if (item.nameLower === normalizedQuery) score += 120;
                else if (item.nameLower.indexOf(normalizedQuery) === 0) score += 80;
                else if (item.nameLower.indexOf(normalizedQuery) !== -1) score += 50;

                if (item.pathLower.indexOf(normalizedQuery) !== -1) score += 24;
                if (item.groupLower && item.groupLower.indexOf(normalizedQuery) !== -1) score += 12;
                if (!score) return null;

                return Object.assign({}, item, { score: score });
            })
            .filter(Boolean)
            .sort(function (a, b) {
                if (b.score !== a.score) return b.score - a.score;
                if (a.inactive !== b.inactive) return a.inactive ? 1 : -1;
                if (a.depth !== b.depth) return a.depth - b.depth;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 9);
    }

    Object.assign(rt, {
        getWorkspaceSearchItems,
        getWorkspaceSearchResults
    });
    rt.sharedReady = true;
})();
