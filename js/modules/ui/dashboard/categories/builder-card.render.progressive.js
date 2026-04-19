window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderProgressiveReady) return;

    var RENDER_BATCH = 50;

    function buildShowMoreButton(categoryName, allLinks, alreadyRendered, isFocused) {
        var remaining = allLinks.length - alreadyRendered;
        var buttonId = 'showMore_' + String(categoryName || '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + alreadyRendered;
        if (!window._eveProgressiveLinks) window._eveProgressiveLinks = {};
        window._eveProgressiveLinks[buttonId] = {
            links: allLinks,
            offset: alreadyRendered,
            focused: isFocused
        };
        return '<li class="eve-show-more-item" id="' + buttonId + '">'
            + '<button class="eve-show-more-btn" onclick="window._eveLoadMoreLinks(\'' + buttonId + '\')">'
            + '▾ Show ' + Math.min(remaining, RENDER_BATCH) + ' more (' + remaining + ' remaining)'
            + '</button></li>';
    }

    window._eveLoadMoreLinks = function (buttonId) {
        var store = window._eveProgressiveLinks && window._eveProgressiveLinks[buttonId];
        if (!store) return;

        var links = store.links;
        var offset = store.offset;
        var end = Math.min(offset + RENDER_BATCH, links.length);
        var buttonEl = document.getElementById(buttonId);
        if (!buttonEl) return;

        var parent = buttonEl.parentElement;
        if (!parent) return;

        var fragment = document.createDocumentFragment();
        for (var index = offset; index < end; index++) {
            var link = links[index];
            if (!link) continue;

            var html = '';
            if (store.focused && typeof window.DashboardCategories.buildFocusedLinkHtml === 'function') {
                html = window.DashboardCategories.buildFocusedLinkHtml(link, {
                    taskMode: true,
                    taskEnabled: true
                });
            } else if (typeof window.DashboardCategories.buildLinkHtml === 'function') {
                html = window.DashboardCategories.buildLinkHtml(link, '', '', [], {});
            }

            if (!html) continue;
            var temp = document.createElement('div');
            temp.innerHTML = html;
            while (temp.firstChild) fragment.appendChild(temp.firstChild);
        }

        parent.insertBefore(fragment, buttonEl);

        if (end >= links.length) {
            buttonEl.remove();
            delete window._eveProgressiveLinks[buttonId];
        } else {
            store.offset = end;
            var remaining = links.length - end;
            buttonEl.innerHTML = '<button class="eve-show-more-btn" onclick="window._eveLoadMoreLinks(\'' + buttonId + '\')">'
                + '▾ Show ' + Math.min(remaining, RENDER_BATCH) + ' more (' + remaining + ' remaining)'
                + '</button>';
        }
    };

    Object.assign(api, {
        RENDER_BATCH: RENDER_BATCH,
        buildShowMoreButton: buildShowMoreButton
    });

    api.cardRenderProgressiveReady = true;
})();
