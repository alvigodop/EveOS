// Unidex View Layout Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createLayout = function createLayout(deps) {
        const state = deps?.state || {};

        function clearLayoutMaintenanceTimers() {
            state.layoutMaintenanceToken += 1;
            if (!state.layoutMaintenanceTimers.length) return;
            state.layoutMaintenanceTimers.forEach(function (timer) {
                clearTimeout(timer);
            });
            state.layoutMaintenanceTimers = [];
        }

        function isUnidexStylesheetHref(href) {
            const normalized = String(href || '')
                .replace(/\\/g, '/')
                .toLowerCase();
            return normalized.includes('/js/modules/ui/dashboard/unidex-view.css')
                || normalized.endsWith('/unidex-view.css')
                || normalized.includes('/unidex-view.css?');
        }

        function promoteUnidexStylesheet() {
            const head = document.head;
            if (!head) return;

            const styleLinks = Array.from(head.querySelectorAll('link[rel="stylesheet"]'));
            const styleLink = styleLinks.find(function (node) {
                return isUnidexStylesheetHref(node.href);
            });

            if (!styleLink || styleLink.parentNode !== head) return;
            const lastStylesheet = styleLinks[styleLinks.length - 1];
            if (styleLink === lastStylesheet) return;
            head.appendChild(styleLink);
        }

        function forceEntriesLayoutPass(gridContainer, layoutMode) {
            if (!gridContainer) return;
            const entriesSection = gridContainer.querySelector('.unidex-entries');
            if (!entriesSection) return;
            const isGrid = layoutMode === 'grid';
            entriesSection.classList.toggle('is-grid-layout', isGrid);
            entriesSection.classList.toggle('is-row-layout', !isGrid);

            const visualButtons = Array.from(entriesSection.querySelectorAll('.unidex-entry-visual-btn'));
            const coverSlots = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover-slot'))
                .filter(function (slot) { return !slot.classList.contains('is-bookmark-only'); });
            const covers = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover'));

            if (isGrid) {
                visualButtons.forEach(function (button) {
                    button.style.setProperty('width', '100%', 'important');
                    button.style.setProperty('min-width', '0', 'important');
                    button.style.setProperty('max-width', 'none', 'important');
                    button.style.setProperty('height', 'auto', 'important');
                    button.style.setProperty('min-height', '0', 'important');
                    button.style.setProperty('border', '0', 'important');
                    button.style.setProperty('background', 'transparent', 'important');
                    button.style.setProperty('overflow', 'visible', 'important');
                    button.style.setProperty('display', 'block', 'important');
                    button.style.setProperty('padding', '0', 'important');
                    button.style.setProperty('line-height', '0', 'important');
                });
                coverSlots.forEach(function (slot) {
                    slot.style.setProperty('width', '100%', 'important');
                    slot.style.setProperty('height', 'auto', 'important');
                    slot.style.setProperty('min-height', '0', 'important');
                    slot.style.setProperty('display', 'block', 'important');
                    slot.style.setProperty('border', '0', 'important');
                    slot.style.setProperty('background', 'transparent', 'important');
                    slot.style.setProperty('overflow', 'visible', 'important');
                    slot.style.setProperty('aspect-ratio', 'auto', 'important');
                });
                covers.forEach(function (image) {
                    image.style.setProperty('width', '100%', 'important');
                    image.style.setProperty('max-width', '100%', 'important');
                    image.style.setProperty('height', 'auto', 'important');
                    image.style.setProperty('min-height', '0', 'important');
                    image.style.setProperty('max-height', 'none', 'important');
                    image.style.setProperty('margin', '0', 'important');
                    image.style.setProperty('object-fit', 'contain', 'important');
                    image.style.setProperty('object-position', 'center top', 'important');
                    image.style.setProperty('transform-origin', 'center center', 'important');
                });
                return;
            }

            const isCompactViewport = window.matchMedia('(max-width: 900px)').matches;
            const targetWidth = isCompactViewport ? 72 : 84;
            const targetHeight = isCompactViewport ? 132 : 156;
            const rowFillHeight = Math.round(targetHeight * 1.32);
            const rowFillOffset = Math.round((rowFillHeight - targetHeight) / 2);
            visualButtons.forEach(function (button) {
                button.style.setProperty('width', `${targetWidth}px`, 'important');
                button.style.setProperty('min-width', `${targetWidth}px`, 'important');
                button.style.setProperty('height', `${targetHeight}px`, 'important');
                button.style.setProperty('min-height', `${targetHeight}px`, 'important');
                button.style.setProperty('border', '1px solid rgba(255,255,255,0.18)', 'important');
                button.style.setProperty('background', 'rgba(0,0,0,0.22)', 'important');
                button.style.setProperty('overflow', 'hidden', 'important');
                button.style.setProperty('display', 'block', 'important');
                button.style.setProperty('padding', '0', 'important');
                button.style.setProperty('line-height', '0', 'important');
            });
            coverSlots.forEach(function (slot) {
                slot.style.setProperty('width', '100%', 'important');
                slot.style.setProperty('height', `${targetHeight}px`, 'important');
                slot.style.setProperty('min-height', `${targetHeight}px`, 'important');
                slot.style.setProperty('display', 'block', 'important');
                slot.style.setProperty('border', '0', 'important');
                slot.style.setProperty('background', 'transparent', 'important');
                slot.style.setProperty('overflow', 'hidden', 'important');
                slot.style.setProperty('align-self', 'stretch', 'important');
            });
            covers.forEach(function (image) {
                image.style.setProperty('width', '100%', 'important');
                image.style.setProperty('max-width', '100%', 'important');
                image.style.setProperty('height', `${rowFillHeight}px`, 'important');
                image.style.setProperty('max-height', 'none', 'important');
                image.style.setProperty('margin-left', '0', 'important');
                image.style.setProperty('margin-top', `-${rowFillOffset}px`, 'important');
                image.style.setProperty('min-height', '0', 'important');
                image.style.setProperty('object-fit', 'cover', 'important');
                image.style.setProperty('object-position', 'center top', 'important');
                image.style.setProperty('transform-origin', 'center top', 'important');
            });
        }

        function stabilizeEntriesLayout(gridContainer, layoutMode) {
            if (!gridContainer) return;
            const entriesSection = gridContainer.querySelector('.unidex-entries');
            if (entriesSection) entriesSection.classList.add('is-layout-stabilizing');

            requestAnimationFrame(function () {
                forceEntriesLayoutPass(gridContainer, layoutMode);
            });

            setTimeout(function () {
                const currentEntries = gridContainer.querySelector('.unidex-entries');
                if (currentEntries) currentEntries.classList.remove('is-layout-stabilizing');
            }, 220);
        }

        function enforceStageLayoutGeometry(gridContainer, getEntriesLayoutMode) {
            if (!gridContainer) return;
            const entries = gridContainer.querySelector('.unidex-entries');
            if (!entries) return;
            forceEntriesLayoutPass(gridContainer, getEntriesLayoutMode());
        }

        function scheduleLayoutMaintenance(gridContainer, getEntriesLayoutMode) {
            clearLayoutMaintenanceTimers();
            const token = state.layoutMaintenanceToken;

            state.LAYOUT_MAINTENANCE_DELAYS_MS.forEach(function (delay) {
                const timer = setTimeout(function () {
                    if (token !== state.layoutMaintenanceToken) return;
                    if (!gridContainer || !document.body?.contains(gridContainer)) return;
                    if (String(config?.viewMode || '') !== 'unidex') return;
                    promoteUnidexStylesheet();
                    enforceStageLayoutGeometry(gridContainer, getEntriesLayoutMode);
                }, delay);
                state.layoutMaintenanceTimers.push(timer);
            });
        }

        return {
            clearLayoutMaintenanceTimers,
            forceEntriesLayoutPass,
            stabilizeEntriesLayout,
            scheduleLayoutMaintenance
        };
    };
})();
