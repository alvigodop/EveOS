(function () {
    'use strict';

    function bind(id, handler) {
        const node = document.getElementById(id);
        if (node) node.addEventListener('click', function () { handler(node); });
    }

    async function initialize() {
        const ui = window.MonitorUI;
        const checker = window.MonitorChecker;
        ui.initUI();
        bind('toggleGeminiBtn', function (button) {
            return window.MonitorCommands.toggleGemini(button);
        });
        bind('restartGeminiBtn', function (button) {
            return window.MonitorCommands.restartGemini(button);
        });
        bind('refreshStatusBtn', function () {
            return checker.checkServerStatus(true);
        });
        bind('openEveOSBtn', function () {
            return window.MonitorCommands.openEveOS();
        });
        bind('refreshFrameBtn', function () {
            return ui.refreshFrame();
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') checker.checkServerStatus(true);
        });

        ui.displayMessage('Runtime monitor initialized.');
        await checker.checkServerStatus(true);
        window.setInterval(function () {
            checker.checkServerStatus(false);
        }, window.MonitorState.CHECK_INTERVAL);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();