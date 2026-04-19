(function () {
    'use strict';

    var rt = window.EveSidebarRuntime = window.EveSidebarRuntime || {};
    if (rt.popoutReady) return;

    var popoutEl = null;
    var hideTimer = null;
    var displayTimer = null;

    function ensurePopout() {
        if (popoutEl) return;
        popoutEl = document.createElement('div');
        popoutEl.id = 'ws-popout';
        document.body.appendChild(popoutEl);
    }

    function clearTimers() {
        if (hideTimer) clearTimeout(hideTimer);
        if (displayTimer) clearTimeout(displayTimer);
        hideTimer = null;
        displayTimer = null;
    }

    window.showWsPopout = function (event, ws) {
        clearTimers();
        ensurePopout();
        var item = event.currentTarget;
        var rect = item.getBoundingClientRect();
        var popoutIcon = ws && ws.icon ? ws.icon : '\u{1F4C1}';
        var popoutName = ws && ws.name ? ws.name : 'Untitled';
        var popoutHint = ws && ws.popoutHint ? ws.popoutHint : 'Peek';

        popoutEl.innerHTML = ''
            + '<span class="popout-icon">' + popoutIcon + '</span>'
            + '<span class="popout-name">' + popoutName + '</span>'
            + '<span class="popout-hint">' + popoutHint + '</span>';

        popoutEl.style.display = 'flex';

        var sidebar = document.getElementById('sidebar');
        var sidebarRect = sidebar ? sidebar.getBoundingClientRect() : { right: 60 };

        popoutEl.style.top = (rect.top + (rect.height / 2) - 15) + 'px';
        popoutEl.style.left = (sidebarRect.right + 10) + 'px';

        requestAnimationFrame(function () {
            popoutEl.classList.add('active');
        });
    };

    window.hideWsPopout = function (immediate) {
        if (!popoutEl) return;
        clearTimers();

        var doHide = function () {
            popoutEl.classList.remove('active');
            displayTimer = setTimeout(function () {
                if (!popoutEl.classList.contains('active')) {
                    popoutEl.style.display = 'none';
                }
            }, 150);
        };

        if (immediate) {
            doHide();
        } else {
            hideTimer = setTimeout(doHide, 150);
        }
    };

    function setupEmergencyBrakes() {
        ['#main-content', '.top-bar', '.header', '#sidebar'].forEach(function (selector) {
            var element = document.querySelector(selector);
            if (!element) return;

            if (selector !== '#sidebar') {
                element.addEventListener('mouseenter', function () { window.hideWsPopout(true); });
            } else {
                element.addEventListener('mouseleave', function () { window.hideWsPopout(true); });
            }
        });

        window.addEventListener('blur', function () { window.hideWsPopout(true); });
        document.addEventListener('click', function (event) {
            if (!event.target.closest('.ws-item')) window.hideWsPopout(true);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupEmergencyBrakes);
    } else {
        setupEmergencyBrakes();
    }

    rt.popoutReady = true;
})();
