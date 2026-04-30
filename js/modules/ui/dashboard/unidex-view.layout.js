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

        function getEntriesMasonryItems(entriesSection) {
            if (!entriesSection) return [];
            return Array.from(entriesSection.children).filter(function (node) {
                return node?.classList?.contains('unidex-entry-item')
                    || node?.classList?.contains('unidex-identifier-group');
            });
        }

        function clearEntriesMasonrySpans(entriesSection) {
            getEntriesMasonryItems(entriesSection).forEach(function (item) {
                item.style.gridRowEnd = '';
            });
            if (entriesSection) entriesSection.style.minHeight = '';
        }

        function applyEntriesMasonry(entriesSection) {
            if (!entriesSection?.classList?.contains('is-grid-layout')) return;
            const computedStyle = window.getComputedStyle(entriesSection);
            const rowHeight = parseFloat(computedStyle.getPropertyValue('grid-auto-rows')) || 8;
            let rowGap = parseFloat(computedStyle.getPropertyValue('row-gap'));
            if (!rowGap || Number.isNaN(rowGap)) {
                rowGap = parseFloat(computedStyle.getPropertyValue('gap')) || 0;
            }

            const items = getEntriesMasonryItems(entriesSection);
            if (!items.length) {
                entriesSection.style.minHeight = '';
                return;
            }

            const currentHeight = entriesSection.offsetHeight;
            if (currentHeight > 100) {
                entriesSection.style.minHeight = `${currentHeight}px`;
            }

            items.forEach(function (item) {
                item.style.gridRowEnd = 'auto';
            });

            const heights = items.map(function (item) {
                return item.getBoundingClientRect().height;
            });

            items.forEach(function (item, index) {
                const span = Math.max(1, Math.ceil((heights[index] + rowGap) / (rowHeight + rowGap)));
                item.style.gridRowEnd = `span ${span}`;
            });

            requestAnimationFrame(function () {
                entriesSection.style.minHeight = '';
            });
        }

        function scheduleEntriesMasonry(entriesSection) {
            if (!entriesSection) return;
            applyEntriesMasonry(entriesSection);
            requestAnimationFrame(function () {
                applyEntriesMasonry(entriesSection);
            });
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
                const isCompactViewport = window.matchMedia('(max-width: 900px)').matches;
                const isNarrowViewport = window.matchMedia('(max-width: 520px)').matches;
                const gridColumns = isNarrowViewport
                    ? 'minmax(0, 1fr)'
                    : (isCompactViewport
                        ? 'repeat(auto-fill, minmax(210px, 240px))'
                        : 'repeat(auto-fill, minmax(220px, 260px))');
                function getGridCoverHeight(node) {
                    const item = node?.closest ? node.closest('.unidex-entry-item') : null;
                    if (isCompactViewport) {
                        if (item?.classList?.contains('is-density-atlas')) return 144;
                        if (item?.classList?.contains('is-density-compact')) return 176;
                        return 188;
                    }
                    if (item?.classList?.contains('is-density-atlas')) return 144;
                    if (item?.classList?.contains('is-density-compact')) return 176;
                    return 218;
                }

                entriesSection.style.setProperty('grid-template-columns', gridColumns, 'important');
                entriesSection.style.setProperty('grid-auto-rows', '8px', 'important');
                entriesSection.style.setProperty('grid-auto-flow', 'row dense', 'important');
                entriesSection.style.setProperty('align-items', 'start', 'important');
                entriesSection.style.setProperty('justify-content', 'center', 'important');
                visualButtons.forEach(function (button) {
                    const targetHeight = getGridCoverHeight(button);
                    button.style.setProperty('width', '100%', 'important');
                    button.style.setProperty('min-width', '0', 'important');
                    button.style.setProperty('max-width', 'none', 'important');
                    button.style.setProperty('height', `${targetHeight}px`, 'important');
                    button.style.setProperty('min-height', `${targetHeight}px`, 'important');
                    button.style.setProperty('max-height', `${targetHeight}px`, 'important');
                    button.style.setProperty('border', '1px solid rgba(255,255,255,0.16)', 'important');
                    button.style.setProperty('background', 'rgba(0,0,0,0.18)', 'important');
                    button.style.setProperty('overflow', 'hidden', 'important');
                    button.style.setProperty('display', 'block', 'important');
                    button.style.setProperty('padding', '0', 'important');
                    button.style.setProperty('line-height', '0', 'important');
                    button.style.setProperty('clip-path', 'inset(0 round 10px)', 'important');
                });
                coverSlots.forEach(function (slot) {
                    const targetHeight = getGridCoverHeight(slot);
                    slot.style.setProperty('width', '100%', 'important');
                    slot.style.setProperty('height', `${targetHeight}px`, 'important');
                    slot.style.setProperty('min-height', `${targetHeight}px`, 'important');
                    slot.style.setProperty('max-height', `${targetHeight}px`, 'important');
                    slot.style.setProperty('display', 'block', 'important');
                    slot.style.setProperty('border', '0', 'important');
                    slot.style.setProperty('background', 'rgba(0,0,0,0.18)', 'important');
                    slot.style.setProperty('overflow', 'hidden', 'important');
                    slot.style.setProperty('aspect-ratio', 'auto', 'important');
                    slot.style.setProperty('clip-path', 'inset(0 round 10px)', 'important');
                });
                covers.forEach(function (image) {
                    image.style.setProperty('width', '100%', 'important');
                    image.style.setProperty('max-width', '100%', 'important');
                    image.style.setProperty('height', '100%', 'important');
                    image.style.setProperty('min-height', '100%', 'important');
                    image.style.setProperty('max-height', '100%', 'important');
                    image.style.setProperty('margin', '0', 'important');
                    image.style.setProperty('object-fit', 'contain', 'important');
                    image.style.setProperty('object-position', 'center center', 'important');
                    image.style.setProperty('transform-origin', 'center center', 'important');
                    if (!image.dataset.unidexMasonryBound) {
                        image.dataset.unidexMasonryBound = '1';
                        image.addEventListener('load', function () {
                            scheduleEntriesMasonry(entriesSection);
                        }, { once: true });
                    }
                });
                scheduleEntriesMasonry(entriesSection);
                return;
            }

            clearEntriesMasonrySpans(entriesSection);
            entriesSection.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
            entriesSection.style.removeProperty('grid-auto-rows');
            entriesSection.style.removeProperty('grid-auto-flow');
            entriesSection.style.removeProperty('align-items');
            entriesSection.style.removeProperty('justify-content');

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
