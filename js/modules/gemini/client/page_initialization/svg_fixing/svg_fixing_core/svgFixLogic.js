/**
 * svgFixLogic.js
 * Core logic for identifying and fixing SVG viewBox issues.
 */

window.SvgFixingCore = window.SvgFixingCore || {};

window.SvgFixingCore.fixSvgViewBoxIssues = function () {
    // Fix ALL SVG elements with ANY percentage viewBox values - comprehensive patterns
    const allPercentageSvgs = document.querySelectorAll('svg');
    let fixedCount = 0;

    allPercentageSvgs.forEach(svg => {
        const currentViewBox = svg.getAttribute('viewBox');
        if (currentViewBox && currentViewBox.includes('%')) {
            // Smart replacement based on pattern recognition
            let fixedViewBox = '0 0 100 4'; // Default for progress bars

            // Try to preserve meaningful dimensions where possible
            if (currentViewBox.includes('24')) {
                fixedViewBox = '0 0 24 24'; // Common icon size
            } else if (currentViewBox.includes('48')) {
                fixedViewBox = '0 0 48 48'; // Another common icon size
            } else if (currentViewBox.includes('0 0 100%')) {
                fixedViewBox = '0 0 100 4'; // Progress bar pattern
            } else {
                // Generic replacement - remove all percentages
                fixedViewBox = currentViewBox
                    .replace(/100%/g, '100')
                    .replace(/\d+%/g, (match) => match.replace('%', ''))
                    .replace(/%/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            svg.setAttribute('viewBox', fixedViewBox);
            fixedCount++;
        }
    });

    // Comprehensive Material Design Lite component fixes
    const mdlSelectors = [
        '.mdl-progress',
        '.mdl-js-progress',
        '.mdl-progress__bar',
        '.mdl-progress__buffer',
        '.mdl-progress__primarybar',
        '.mdl-progress__secondarybar',
        '.mdl-spinner',
        '.mdl-spinner__layer',
        '[class*="mdl-progress"]',
        '[class*="progress"]'
    ];

    mdlSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            const svgs = element.querySelectorAll('svg');
            svgs.forEach(svg => {
                const viewBox = svg.getAttribute('viewBox');
                if (!viewBox || viewBox.includes('%') || viewBox === '0 0 100% 4') {
                    svg.setAttribute('viewBox', '0 0 100 4');
                    fixedCount++;
                }
            });
        });
    });

    // Force-fix known problematic patterns with specific targeting
    const knownProblematicPatterns = [
        { selector: 'svg[viewBox="0 0 100% 4"]', fix: '0 0 100 4' },
        { selector: 'svg[viewBox="0 0 100% 8"]', fix: '0 0 100 8' },
        { selector: 'svg[viewBox="0 0 100% 2"]', fix: '0 0 100 2' },
        { selector: 'svg[viewBox="0 0 100% 1"]', fix: '0 0 100 1' },
        { selector: 'svg[viewBox*="100%"]', fix: '0 0 100 4' },
        { selector: 'svg[viewBox*="50%"]', fix: '0 0 50 4' },
        { selector: 'svg[viewBox*="%"]', fix: '0 0 100 4' }
    ];

    knownProblematicPatterns.forEach(({ selector, fix }) => {
        try {
            const problematicSvgs = document.querySelectorAll(selector);
            problematicSvgs.forEach(svg => {
                svg.setAttribute('viewBox', fix);
                fixedCount++;
            });
        } catch (e) {
            // Ignore selector errors, some browsers might not support all patterns
        }
    });

    if (fixedCount > 0) {
        console.log(`SVG viewBox fixes completed: ${fixedCount} SVGs fixed`);
    }
    return fixedCount;
};

console.log("svgFixLogic.js loaded.");
