/**
 * svgDomMonitor.js
 * Handles DOM monitoring and MutationObservers for SVG fixes.
 */

window.SvgFixingCore = window.SvgFixingCore || {};

window.SvgFixingCore.setupSvgViewBoxMonitor = function () {
    console.log('Setting up ultra-comprehensive SVG viewBox monitoring (Modularized)...');

    if (!window.SvgFixingCore.fixSvgViewBoxIssues) {
        console.error("SvgFixingCore.fixSvgViewBoxIssues not found! Monitoring cannot start.");
        return;
    }

    const runFixes = () => {
        window.SvgFixingCore.fixSvgViewBoxIssues();
    };

    // Primary MutationObserver for DOM changes
    const observer = new MutationObserver(mutations => {
        let needsFixing = false;

        mutations.forEach(mutation => {
            // Handle added nodes
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const svgsToCheck = [];

                    if (node.tagName === 'SVG') {
                        svgsToCheck.push(node);
                    } else if (node.querySelector) {
                        svgsToCheck.push(...node.querySelectorAll('svg'));
                    }

                    svgsToCheck.forEach(svg => {
                        const viewBox = svg.getAttribute('viewBox');
                        if (viewBox && viewBox.includes('%')) {
                            needsFixing = true;
                        }
                    });

                    // Special handling for Material Design component creation
                    if (node.classList && (
                        node.classList.contains('mdl-progress') ||
                        node.classList.contains('mdl-js-progress') ||
                        node.className.includes('progress') ||
                        node.className.includes('mdl-')
                    )) {
                        needsFixing = true;
                    }
                }
            });

            // Handle attribute changes (specifically viewBox changes)
            if (mutation.type === 'attributes' && mutation.attributeName === 'viewBox') {
                const element = mutation.target;
                if (element.tagName === 'SVG') {
                    const viewBox = element.getAttribute('viewBox');
                    if (viewBox && viewBox.includes('%')) {
                        needsFixing = true;
                    }
                }
            }
        });

        // Apply fixes if needed
        if (needsFixing) {
            console.log('SVG viewBox issues detected, applying fixes...');
            setTimeout(() => {
                runFixes();
            }, 10); // Very short delay to batch multiple mutations
        }
    });

    // Start observing with comprehensive options
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['viewBox', 'class', 'data-upgraded'],
        attributeOldValue: true
    });

    // Secondary observer specifically for Material Design Lite upgrades
    const mdlObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' &&
                (mutation.attributeName === 'class' || mutation.attributeName === 'data-upgraded')) {
                const element = mutation.target;

                if (element.classList && (
                    element.classList.contains('mdl-progress') ||
                    element.classList.contains('mdl-js-progress') ||
                    element.classList.contains('is-upgraded')
                )) {
                    // MDL component was upgraded, check for SVG issues
                    setTimeout(() => {
                        const svgs = element.querySelectorAll('svg');
                        svgs.forEach(svg => {
                            const viewBox = svg.getAttribute('viewBox');
                            if (!viewBox || viewBox.includes('%')) {
                                svg.setAttribute('viewBox', '0 0 100 4');
                                console.log('Fixed post-upgrade MDL SVG viewBox');
                            }
                        });
                    }, 50); // Slightly longer delay for MDL upgrades
                }
            }
        });
    });

    mdlObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-upgraded'],
        subtree: true
    });

    // Periodic sweep to catch any missed SVGs (every 10 seconds)
    setInterval(() => {
        const percentageSvgs = document.querySelectorAll('svg[viewBox*="%"]');
        if (percentageSvgs.length > 0) {
            console.log(`Periodic sweep detected ${percentageSvgs.length} SVGs with percentage viewBox, fixing...`);
            runFixes();
        }
    }, 10000);

    // Aggressive immediate fix on page events
    ['DOMContentLoaded', 'load', 'pageshow'].forEach(eventType => {
        document.addEventListener(eventType, () => {
            setTimeout(() => {
                console.log(`Applying SVG fixes on ${eventType} event`);
                runFixes();
            }, 100);
        });
    });

    // Fix after Material Design Lite is fully loaded
    if (typeof componentHandler !== 'undefined') {
        // MDL is loaded, apply fixes after component upgrades
        setTimeout(() => {
            console.log('MDL detected, applying comprehensive SVG fixes...');
            runFixes();
        }, 500);
    } else {
        // Wait for MDL to load
        const checkMDL = setInterval(() => {
            if (typeof componentHandler !== 'undefined') {
                clearInterval(checkMDL);
                setTimeout(() => {
                    console.log('MDL loaded, applying comprehensive SVG fixes...');
                    runFixes();
                }, 500);
            }
        }, 100);

        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkMDL), 10000);
    }

    console.log('Ultra-comprehensive SVG viewBox monitor activated (Modularized)');
};

console.log("svgDomMonitor.js loaded.");
