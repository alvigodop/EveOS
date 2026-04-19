(function () {
    'use strict';

    var rt = window.EveTabNavRuntime = window.EveTabNavRuntime || {};
    if (rt.routePeekReady || !rt.sharedReady) return;

    function ensureRoutePeek() {
        if (rt.state.routePeekEl) return rt.state.routePeekEl;
        rt.state.routePeekEl = document.createElement('div');
        rt.state.routePeekEl.className = 'source-route-peek';
        document.body.appendChild(rt.state.routePeekEl);
        rt.state.routePeekEl.addEventListener('mouseenter', function () {
            clearTimeout(rt.state.routePeekHideTimeout);
        });
        rt.state.routePeekEl.addEventListener('mouseleave', function () {
            scheduleRouteHide();
        });
        return rt.state.routePeekEl;
    }

    function routePathHtml(segments) {
        return segments.map(function (segment, index) {
            var isLast = index === segments.length - 1;
            var html = '<button class="source-route-seg" onclick="event.stopPropagation();if(window.switchWorkspace)window.switchWorkspace(\''
                + rt.escHtml(segment.id) + '\')">'
                + rt.escHtml(segment.icon || rt.DEFAULT_ICON) + ' ' + rt.escHtml(segment.name)
                + '</button>';
            if (!isLast) html += '<span class="source-route-sep">&gt;</span>';
            return html;
        }).join('');
    }

    function scheduleRouteHide(delay) {
        clearTimeout(rt.state.routePeekHideTimeout);
        rt.state.routePeekHideTimeout = setTimeout(function () {
            if (rt.state.routePeekEl) rt.state.routePeekEl.classList.remove('active');
        }, delay || 300);
    }

    window.showSourceRoutePeek = function (event, badgeEl) {
        clearTimeout(rt.state.routePeekHideTimeout);
        var peek = ensureRoutePeek();
        var routesStr = badgeEl.getAttribute('data-source-routes');
        if (!routesStr) return;

        var routes;
        try {
            routes = JSON.parse(routesStr);
        } catch (error) {
            return;
        }

        var pathsToRender = [];
        var uniquePaths = new Set();

        routes.forEach(function (route) {
            var mainPath = route.sourcePath || route.path;
            if (mainPath && mainPath.length > 0) {
                var mainKey = JSON.stringify(mainPath.map(function (segment) { return segment.id; }));
                if (!uniquePaths.has(mainKey)) {
                    uniquePaths.add(mainKey);
                    pathsToRender.push(mainPath);
                }
            }

            if (route.type === 'linked' && route.linkedPath && route.linkedPath.length > 0) {
                var linkedKey = JSON.stringify(route.linkedPath.map(function (segment) { return segment.id; }));
                if (!uniquePaths.has(linkedKey)) {
                    uniquePaths.add(linkedKey);
                    pathsToRender.push(route.linkedPath);
                }
            }
        });

        peek.innerHTML = pathsToRender.map(function (pathArr, index) {
            var isLast = index === pathsToRender.length - 1;
            var borderStyle = isLast ? '' : 'border-bottom: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 4px; padding-bottom: 6px;';
            return '<div class="source-route-path" style="padding: 2px 0; ' + borderStyle + '">'
                + routePathHtml(pathArr)
                + '</div>';
        }).join('');

        var rect = badgeEl.getBoundingClientRect();
        peek.style.top = (rect.bottom + 6) + 'px';
        peek.style.left = Math.max(8, rect.left) + 'px';
        peek.classList.add('active');
    };

    window.moveSourceRoutePeek = function () {};

    window.hideSourceRoutePeek = function () {
        scheduleRouteHide();
    };

    Object.assign(rt, {
        ensureRoutePeek: ensureRoutePeek,
        routePathHtml: routePathHtml,
        scheduleRouteHide: scheduleRouteHide
    });

    rt.routePeekReady = true;
})();
