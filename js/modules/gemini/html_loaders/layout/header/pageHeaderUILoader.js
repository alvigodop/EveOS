// js/modules/gemini/html_loaders/layout_ui_html_loaders/page_header_html_loader/pageHeaderUILoader.js
// Loads the page header HTML component

async function loadPageHeader() {
    try {
        const html = `
<header class="mdl-layout__header" id="main-header">
    <div class="mdl-layout__header-row">
        <!-- Collapse/Expand Button -->
        <button id="header-collapse-btn" class="mdl-button mdl-js-button mdl-button--icon" title="Collapse Demo">
            <i class="material-icons" id="header-collapse-icon">expand_less</i>
        </button>
        <!-- Title -->
        <span class="mdl-layout-title">Gemini Live Link</span>
        <!-- Spacer -->
        <div class="mdl-layout-spacer"></div>
        <!-- Theme Toggle Button -->
        <button id="theme-toggle-btn" class="mdl-button mdl-js-button mdl-button--icon" title="Toggle Dark/Light Mode">
            <i class="material-icons" id="theme-icon">dark_mode</i>
        </button>
        <!-- Connection Status Indicator Placeholder -->
        <div id="connection-status-placeholder"></div>
    </div>
</header>
`;

        // Find the placeholder and replace it with the page header content
        const placeholder = document.getElementById('page-header-placeholder');
        if (placeholder) {
            placeholder.innerHTML = html;

            // Upgrade MDL components in the newly added content
            if (typeof componentHandler !== 'undefined') {
                componentHandler.upgradeElements(placeholder);
            }

            // Add dynamic CSS for collapsed state
            const style = document.createElement('style');
            style.textContent = `
                .gemini-collapsed-mode .mdl-layout__content { display: none !important; }
                .gemini-collapsed-mode .app-container { display: none !important; }
                .gemini-collapsed-mode .demo-box { display: none !important; }
                
                /* Ensure the Header itself remains visible and interactive */
                .gemini-collapsed-mode#gemini-ui-root .mdl-layout__header,
                .gemini-collapsed-mode .mdl-layout__header {
                    background: #fff !important; /* Restore white background for header strip */
                    color: #333 !important;
                    display: flex !important;
                    visibility: visible !important;
                    z-index: 100 !important;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
                }

                /* Fix White-on-White buttons/text */
                .gemini-collapsed-mode#gemini-ui-root .mdl-layout__header .mdl-button,
                .gemini-collapsed-mode#gemini-ui-root .mdl-layout__header .material-icons,
                .gemini-collapsed-mode#gemini-ui-root .mdl-layout__header .mdl-layout-title,
                .gemini-collapsed-mode #header-collapse-btn,
                .gemini-collapsed-mode #theme-toggle-btn {
                    color: #333 !important; /* Force dark color for icons/text */
                }

                .gemini-collapsed-mode .mdl-layout__header-row {
                    height: 64px !important;
                    padding: 0 40px !important;
                }
                
                /* Target the KEY ROOT container that has hardcoded height/background in gemini-init.js */
                .gemini-collapsed-mode#gemini-ui-root {
                    height: auto !important;
                    min-height: 0 !important;
                    background: transparent !important;
                    box-shadow: none !important;
                    border: none !important;
                    overflow: visible !important;
                }

                /* Target the layout wrapper to shrink-wrap the header */
                .gemini-collapsed-mode.mdl-layout,
                .gemini-collapsed-mode .mdl-layout,
                .gemini-collapsed-mode.mdl-layout__container,
                .gemini-collapsed-mode .mdl-layout__container {
                    height: 64px !important;
                    min-height: 64px !important;
                    max-height: 64px !important;
                    overflow: hidden !important;
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                }
            `;
            document.head.appendChild(style);

            // Add collapse logic for ENTIRE DEMO CONTENT
            const collapseBtn = document.getElementById('header-collapse-btn');
            const collapseIcon = document.getElementById('header-collapse-icon');

            if (collapseBtn) {
                // Function to toggle the main content visibility
                const toggleDemoContent = (shouldCollapse) => {
                    const geminiRoot = document.getElementById('gemini-ui-root');
                    const mdlLayout = document.querySelector('.mdl-layout');
                    const mdlLayoutContainer = document.querySelector('.mdl-layout__container');

                    // The root container is the most important one to collapse
                    // as it has hardcoded height and white background
                    if (geminiRoot) {
                        if (shouldCollapse) {
                            geminiRoot.classList.add('gemini-collapsed-mode');
                        } else {
                            geminiRoot.classList.remove('gemini-collapsed-mode');
                        }
                    }

                    // Also toggle on layout containers for good measure
                    const targetContainer = mdlLayoutContainer || mdlLayout;
                    if (targetContainer) {
                        if (shouldCollapse) {
                            targetContainer.classList.add('gemini-collapsed-mode');
                            if (mdlLayout && mdlLayout !== targetContainer) {
                                mdlLayout.classList.add('gemini-collapsed-mode');
                            }
                        } else {
                            targetContainer.classList.remove('gemini-collapsed-mode');
                            if (mdlLayout) {
                                mdlLayout.classList.remove('gemini-collapsed-mode');
                            }
                        }
                    }

                    if (!geminiRoot && !targetContainer) {
                        // Fallback mechanism (retry if loaded too early)
                        setTimeout(() => toggleDemoContent(shouldCollapse), 100);
                    }
                };

                // Restore state from local storage
                const isCollapsed = localStorage.getItem('geminiDemoCollapsed') === 'true';

                if (isCollapsed) {
                    if (collapseIcon) collapseIcon.textContent = 'expand_more';
                    collapseBtn.title = "Expand Demo";
                    toggleDemoContent(true);
                } else {
                    toggleDemoContent(false);
                }

                collapseBtn.addEventListener('click', () => {
                    // Check current state based on icon (expand_more means currently collapsed)
                    const isNowCollapsed = collapseIcon.textContent === 'expand_more';

                    if (isNowCollapsed) {
                        // Currently collapsed, so EXPAND it
                        if (collapseIcon) collapseIcon.textContent = 'expand_less';
                        collapseBtn.title = "Collapse Demo";
                        toggleDemoContent(false);
                        localStorage.setItem('geminiDemoCollapsed', 'false');
                    } else {
                        // Currently expanded, so COLLAPSE it
                        if (collapseIcon) collapseIcon.textContent = 'expand_more';
                        collapseBtn.title = "Expand Demo";
                        toggleDemoContent(true);
                        localStorage.setItem('geminiDemoCollapsed', 'true');
                    }
                });
            } else {
                console.warn('Collapse button not found');
            }

            console.log('Page header loaded and MDL components upgraded successfully');
        } else {
            console.warn('Page header placeholder not found in DOM');
        }
    } catch (error) {
        console.error('Error loading page header:', error);
    }
}

// Export the function globally
window.loadPageHeader = loadPageHeader; 