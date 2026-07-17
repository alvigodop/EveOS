(function () {
    'use strict';

    window.MonitorChecker = window.MonitorChecker || {};
    window.MonitorChecker.forceRestartMainServer = function () {
        return window.MonitorCommands.restartGemini(
            document.getElementById('restartGeminiBtn')
        );
    };
    window.MonitorChecker.refreshGeminiDemo = function () {
        return window.MonitorUI.refreshFrame();
    };
    window.refreshGeminiDemo = window.MonitorChecker.refreshGeminiDemo;
})();