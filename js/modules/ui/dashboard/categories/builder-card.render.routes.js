window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderRoutesReady) return;

    var {
        escapeCardHtml,
        escapeCardJs
    } = api;

    function getRenderContext(options) {
        return options && options._dashboardRenderContext ? options._dashboardRenderContext : null;
    }

    function getWorkspaceRecord(workspaceId, context, helpers) {
        if (context && typeof context.getWorkspaceById === 'function') {
            return context.getWorkspaceById(workspaceId);
        }
        if (!helpers) return null;
        return helpers.findById(config.workspaces || [], workspaceId);
    }

    function buildPath(wsId, context, helpers) {
        if (context && typeof context.getPath === 'function') {
            return context.getPath(wsId);
        }
        if (!helpers) return [{ id: wsId, name: wsId, icon: '📁' }];

        var segments = [];
        var workspaces = config.workspaces || [];
        var workspace = helpers.findById(workspaces, wsId);
        if (!workspace) return [{ id: wsId, name: wsId, icon: '📁' }];

        segments.unshift({ id: workspace.id, name: workspace.name, icon: workspace.icon || '📁' });
        var parent = helpers.findParent(workspaces, workspace.id);
        while (parent) {
            segments.unshift({ id: parent.id, name: parent.name, icon: parent.icon || '📁' });
            parent = helpers.findParent(workspaces, parent.id);
        }
        return segments;
    }

    function isDirectDescendant(wsId, context, helpers, activeWorkspaceId) {
        if (context && typeof context.getVisibleDescendantIds === 'function') {
            return context.getVisibleDescendantIds(activeWorkspaceId).indexOf(String(wsId || '').trim()) !== -1;
        }
        if (!helpers) return false;
        var activeWorkspace = helpers.findById(config.workspaces || [], activeWorkspaceId);
        if (!activeWorkspace) return false;
        return helpers.getVisibleDescendantIds(activeWorkspace).indexOf(wsId) !== -1;
    }

    function buildSubTabSourcesHtml(catLinks, options, cardWorkspaceId, activeWorkspaceId, isDetachedParkingCard) {
        if (isDetachedParkingCard) return '';

        var displayWorkspaceId = String(
            options._markerRouteWorkspace
            || options._parentDashboardWorkspace
            || options.activeWorkspace
            || cardWorkspaceId
            || ''
        ).trim();
        if (!displayWorkspaceId) return '';

        var context = getRenderContext(options);
        var subTabIds = new Set();
        (Array.isArray(catLinks) ? catLinks : []).forEach(function (link) {
            var linkWorkspaceId = String(link?.workspace || 'main').trim();
            subTabIds.add(linkWorkspaceId);
        });
        subTabIds.add(cardWorkspaceId);
        if (subTabIds.size < 1) return '';

        var helpers = window.EveWorkspaceHelpers;
        var routeColors = [
            { solid: '#a882ff', bg: 'rgba(168,130,255,0.15)', border: 'rgba(168,130,255,0.3)' },
            { solid: '#40e8d0', bg: 'rgba(0,200,180,0.15)', border: 'rgba(0,200,180,0.35)' },
            { solid: '#ff8c60', bg: 'rgba(255,140,96,0.15)', border: 'rgba(255,140,96,0.3)' },
            { solid: '#60a0ff', bg: 'rgba(96,160,255,0.15)', border: 'rgba(96,160,255,0.3)' },
            { solid: '#c8b400', bg: 'rgba(200,180,0,0.15)', border: 'rgba(200,180,0,0.3)' }
        ];

        var linkedTabsByTarget = context && typeof context.getLinkedTabsByTarget === 'function'
            ? null
            : {};
        if (!linkedTabsByTarget && context && typeof context.getLinkedTabsByTarget === 'function') {
            // Use render-scoped cache.
        } else if (helpers) {
            var visibleWorkspaceIds = window._eveActiveVisibleWorkspaceIds;
            if (visibleWorkspaceIds) {
                visibleWorkspaceIds.forEach(function (visibleWorkspaceId) {
                    var visibleWorkspace = getWorkspaceRecord(visibleWorkspaceId, context, helpers);
                    if (!visibleWorkspace || !visibleWorkspace.linkedTo) return;

                    var linkedTarget = getWorkspaceRecord(visibleWorkspace.linkedTo, context, helpers);
                    if (!linkedTabsByTarget[visibleWorkspace.linkedTo]) linkedTabsByTarget[visibleWorkspace.linkedTo] = [];
                    linkedTabsByTarget[visibleWorkspace.linkedTo].push(visibleWorkspace);

                    if (linkedTarget && Array.isArray(linkedTarget.subTabs)) {
                        var visibleDescendants = context && typeof context.getVisibleDescendantIds === 'function'
                            ? context.getVisibleDescendantIds(linkedTarget.id)
                            : helpers.getVisibleDescendantIds(linkedTarget);
                        visibleDescendants.forEach(function (descendantId) {
                            if (!linkedTabsByTarget[descendantId]) linkedTabsByTarget[descendantId] = [];
                            linkedTabsByTarget[descendantId].push(visibleWorkspace);
                        });
                    }
                });
            }
        }

        var badges = [];
        subTabIds.forEach(function (workspaceId) {
            var routes = [];
            var colorIndex = 0;

            if (workspaceId === displayWorkspaceId) {
                routes.push({
                    type: 'native',
                    color: routeColors[colorIndex++ % routeColors.length],
                    path: buildPath(workspaceId, context, helpers)
                });
            } else if (isDirectDescendant(workspaceId, context, helpers, displayWorkspaceId)) {
                routes.push({
                    type: 'direct',
                    color: routeColors[colorIndex++ % routeColors.length],
                    path: buildPath(workspaceId, context, helpers)
                });
            }

            var linkedTabs = context && typeof context.getLinkedTabsByTarget === 'function'
                ? context.getLinkedTabsByTarget(workspaceId)
                : (linkedTabsByTarget[workspaceId] || []);
            linkedTabs.forEach(function (linkedTab) {
                routes.push({
                    type: 'linked',
                    color: routeColors[colorIndex++ % routeColors.length],
                    linkedTab: { id: linkedTab.id, name: linkedTab.name, icon: linkedTab.icon || '🔗' },
                    sourcePath: buildPath(workspaceId, context, helpers),
                    linkedPath: buildPath(linkedTab.id, context, helpers)
                });
            });

            if (routes.length === 0 && workspaceId !== displayWorkspaceId) {
                routes.push({
                    type: 'direct',
                    color: routeColors[0],
                    path: buildPath(workspaceId, context, helpers)
                });
            }

            if (workspaceId === displayWorkspaceId && routes.length === 1 && routes[0].type === 'native') {
                return;
            }

            var workspace = getWorkspaceRecord(workspaceId, context, helpers);
            var workspaceName = workspace ? escapeCardHtml(workspace.name) : workspaceId;
            var workspaceIcon = workspace ? (workspace.icon || '📁') : '📁';
            var escapedId = escapeCardJs(workspaceId);
            var clickAction = "event.preventDefault(); event.stopPropagation(); if(typeof window.switchWorkspace === 'function') window.switchWorkspace('" + escapedId + "');";

            var badgeStyle = '';
            var badgeClass = 'card-subtab-source';
            if (routes.length === 1) {
                badgeStyle = 'background:' + routes[0].color.bg + ';border-color:' + routes[0].color.border + ';color:' + routes[0].color.solid + ';';
                if (routes[0].type === 'linked') {
                    badgeClass += ' card-subtab-source--linked';
                }
            } else {
                var step = 100 / routes.length;
                var gradientParts = routes.map(function (route, index) {
                    return route.color.solid + '22 ' + (index * step) + '% ' + ((index + 1) * step) + '%';
                });
                badgeStyle = 'background:linear-gradient(90deg,' + gradientParts.join(',') + ');'
                    + 'border-color:' + routes[0].color.border + ';'
                    + 'border-style:dashed;'
                    + 'color:' + routes[0].color.solid + ';';
                badgeClass += ' card-subtab-source--multi';
            }

            var routesData = JSON.stringify(routes.map(function (route) {
                return {
                    type: route.type,
                    color: route.color.solid,
                    path: route.path || route.sourcePath,
                    linkedPath: route.linkedPath || null,
                    linkedTab: route.linkedTab || null
                };
            }));
            var safeRoutesAttr = routesData.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            var hoverHandlers = 'onmouseenter="if(window.showSourceRoutePeek)window.showSourceRoutePeek(event,this)" '
                + 'onmouseleave="if(window.hideSourceRoutePeek)window.hideSourceRoutePeek()" '
                + 'onmousemove="if(window.moveSourceRoutePeek)window.moveSourceRoutePeek(event)"';
            var displayIcon = routes.some(function (route) { return route.type === 'linked'; }) ? '🔗' : workspaceIcon;
            var routeCountBadge = routes.length > 1
                ? '<span class="source-route-count">' + routes.length + '</span>'
                : '';

            badges.push('<span class="' + badgeClass + '" style="' + badgeStyle + '" '
                + 'data-source-routes="' + safeRoutesAttr + '" '
                + hoverHandlers + ' '
                + 'onclick="' + clickAction + '">'
                + displayIcon + ' ' + workspaceName + routeCountBadge
                + '</span>');
        });

        if (badges.length < 1) return '';
        return '<div class="card-subtab-sources">' + badges.join('') + '</div>';
    }

    Object.assign(api, {
        buildSubTabSourcesHtml: buildSubTabSourcesHtml
    });

    api.cardRenderRoutesReady = true;
})();
