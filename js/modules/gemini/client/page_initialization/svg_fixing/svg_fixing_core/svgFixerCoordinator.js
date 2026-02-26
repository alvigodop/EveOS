/**
 * svgFixerCoordinator.js
 * Coordinator for SVG Fixing Core.
 * Exposes core functions to the global window object for backward compatibility.
 */

window.SvgFixingCore = window.SvgFixingCore || {};

// Expose functions globally for backward compatibility and access
window.fixSvgViewBoxIssues = function () {
    if (window.SvgFixingCore.fixSvgViewBoxIssues) {
        return window.SvgFixingCore.fixSvgViewBoxIssues();
    } else {
        console.error("SvgFixingCore.fixSvgViewBoxIssues not available yet.");
        return 0;
    }
};

window.setupSvgViewBoxMonitor = function () {
    if (window.SvgFixingCore.setupSvgViewBoxMonitor) {
        window.SvgFixingCore.setupSvgViewBoxMonitor();
    } else {
        console.error("SvgFixingCore.setupSvgViewBoxMonitor not available yet.");
    }
};

console.log("svgFixerCoordinator.js loaded.");
