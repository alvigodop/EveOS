/**
 * svgLifecycle.js
 * Manages SVG attribute fixing lifecycle during page initialization.
 */

window.PageInitializationCore = window.PageInitializationCore || {};

window.PageInitializationCore.SvgLifecycle = {
    init: function () {
        console.log('Initializing page and fixing SVG issues...');

        // Fix existing SVG elements
        if (typeof window.fixSvgViewBoxIssues === 'function') {
            window.fixSvgViewBoxIssues();
        }

        // Set up monitoring for new SVG elements
        if (typeof window.setupSvgViewBoxMonitor === 'function') {
            window.setupSvgViewBoxMonitor();
        }

        // Periodic check for any SVG issues that might be created by external libraries
        setInterval(() => {
            if (typeof window.fixSvgViewBoxIssues === 'function') {
                window.fixSvgViewBoxIssues();
            }
        }, 5000); // Check every 5 seconds for new problematic SVGs

        console.log('Page initialization and enhanced SVG fixes complete');
    },

    // Expose for post-load fixes
    runFixes: function () {
        console.log('Applying SVG fixes after component loading...');
        if (typeof window.fixSvgViewBoxIssues === 'function') {
            window.fixSvgViewBoxIssues();
        }
    }
};

console.log("svgLifecycle.js loaded.");
