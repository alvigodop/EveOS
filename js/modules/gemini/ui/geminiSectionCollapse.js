/**
 * Gemini Section Collapse — Shared Toggle Logic
 * 
 * Scans for [data-collapsible-section] elements, wires click
 * handlers on [data-collapsible-header], toggles `.collapsed`
 * on the section wrapper, and persists state in localStorage.
 * 
 * Auto-initializes via MutationObserver so it catches late-loaded
 * Gemini sections without needing an explicit boot event.
 */
(function () {
    'use strict';

    const STORAGE_PREFIX = 'gemini-collapse-';
    const wiredSections = new WeakSet();

    function getStorageKey(sectionKey) {
        return STORAGE_PREFIX + sectionKey;
    }

    function isCollapsed(sectionKey) {
        try {
            return localStorage.getItem(getStorageKey(sectionKey)) === '1';
        } catch (_) {
            return false;
        }
    }

    function persistState(sectionKey, collapsed) {
        try {
            if (collapsed) {
                localStorage.setItem(getStorageKey(sectionKey), '1');
            } else {
                localStorage.removeItem(getStorageKey(sectionKey));
            }
        } catch (_) { /* storage full or disabled */ }
    }

    function initSection(section) {
        if (wiredSections.has(section)) return;

        const sectionKey = section.getAttribute('data-collapsible-section');
        if (!sectionKey) return;

        const header = section.querySelector('[data-collapsible-header]');
        if (!header) return;

        wiredSections.add(section);

        // Neutralize parent placeholder min-heights when collapsed
        function updatePlaceholderConstraints(collapsed) {
            var placeholder = section.closest(
                '#system-log-display-placeholder, #main-chat-log-placeholder, #agentic-functions-section-placeholder'
            );
            if (placeholder) {
                placeholder.classList.toggle('is-gemini-section-collapsed', collapsed);
                if (collapsed) {
                    placeholder.style.minHeight = '0';
                    placeholder.style.flex = '0 0 auto';
                    placeholder.style.maxHeight = 'max-content';
                    placeholder.style.overflow = 'visible';
                } else {
                    placeholder.style.minHeight = '';
                    placeholder.style.flex = '';
                    placeholder.style.maxHeight = '';
                    placeholder.style.overflow = '';
                }
            }
            header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }

        // Restore persisted state
        if (isCollapsed(sectionKey)) {
            section.classList.add('collapsed');
            updatePlaceholderConstraints(true);
        }

        // Wire click handler
        header.addEventListener('click', function (e) {
            // Don't toggle if clicking on buttons, toggles, links inside the header
            var target = e.target;
            if (target.closest('button, a, input, select, textarea, label, .mdl-switch, .mdl-icon-toggle')) {
                return;
            }

            var nowCollapsed = section.classList.toggle('collapsed');
            persistState(sectionKey, nowCollapsed);
            updatePlaceholderConstraints(nowCollapsed);
        });
    }

    function initCollapsibleSections() {
        const sections = document.querySelectorAll('[data-collapsible-section]');
        let newCount = 0;
        sections.forEach(function (s) {
            if (!wiredSections.has(s)) {
                initSection(s);
                newCount++;
            }
        });
        if (newCount > 0) {
            console.log('[GeminiCollapse] Initialized ' + newCount + ' new collapsible section(s). Total: ' + sections.length);
        }
    }

    // Export
    window.initCollapsibleSections = initCollapsibleSections;

    // Auto-init: observe DOM for late-loaded Gemini sections
    function startObserver() {
        const target = document.body;
        if (!target) {
            setTimeout(startObserver, 500);
            return;
        }

        // Initial scan
        initCollapsibleSections();

        // Watch for new sections added by Gemini loaders
        const observer = new MutationObserver(function (mutations) {
            let found = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.hasAttribute && node.hasAttribute('data-collapsible-section')) {
                            found = true;
                            break;
                        }
                        if (node.querySelector && node.querySelector('[data-collapsible-section]')) {
                            found = true;
                            break;
                        }
                    }
                }
                if (found) break;
            }
            if (found) {
                initCollapsibleSections();
            }
        });

        observer.observe(target, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }
})();
