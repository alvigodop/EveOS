window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createUnidexGeometryHelpers = function createUnidexGeometryHelpers(deps) {
        const scheduleEntriesMasonry = deps?.scheduleEntriesMasonry;
        const updateLargeEntrySetClasses = deps?.updateLargeEntrySetClasses;
        const getLargeMasonryContainers = deps?.getLargeMasonryContainers;
        const measureLargeViewportWindow = deps?.measureLargeViewportWindow;
        const scheduleVisibleLargeMasonry = deps?.scheduleVisibleLargeMasonry;
        const clearEntriesMasonrySpans = deps?.clearEntriesMasonrySpans;
        const stopLargeMasonryMaintenance = deps?.stopLargeMasonryMaintenance;

        function forceEntriesLayoutPass(gridContainer, layoutMode) {
            if (!gridContainer) return;
            const entriesSection = gridContainer.querySelector('.unidex-entries');
            if (!entriesSection) return;
            const isGrid = layoutMode === 'grid';
            entriesSection.classList.toggle('is-grid-layout', isGrid);
            entriesSection.classList.toggle('is-row-layout', !isGrid);
            const entrySetState = updateLargeEntrySetClasses(entriesSection);

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

                if (entrySetState.isLarge) {
                    entriesSection.style.setProperty('align-items', 'start', 'important');
                    entriesSection.style.setProperty('justify-content', 'center', 'important');
                    if (entrySetState.hasGroups) {
                        entriesSection.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
                        entriesSection.style.setProperty('grid-auto-rows', 'auto', 'important');
                        entriesSection.style.setProperty('grid-auto-flow', 'row', 'important');
                    } else {
                        entriesSection.style.setProperty('grid-template-columns', gridColumns, 'important');
                        entriesSection.style.setProperty('grid-auto-rows', '8px', 'important');
                        entriesSection.style.setProperty('grid-auto-flow', 'row dense', 'important');
                    }
                    const masonryState = String(entriesSection.dataset.unidexMasonryApplied || '');
                    if (masonryState !== 'visible' && masonryState !== 'pending-visible') {
                        scheduleVisibleLargeMasonry(entriesSection);
                    } else if (masonryState === 'visible') {
                        const masonryContainers = getLargeMasonryContainers(entriesSection);
                        measureLargeViewportWindow(entriesSection, masonryContainers);
                    }
                    return;
                }

                clearEntriesMasonrySpans(entriesSection);

                entriesSection.style.setProperty('grid-template-columns', gridColumns, 'important');
                entriesSection.style.setProperty('grid-auto-rows', '8px', 'important');
                entriesSection.style.setProperty('grid-auto-flow', 'row dense', 'important');
                entriesSection.style.setProperty('align-items', 'start', 'important');
                entriesSection.style.setProperty('justify-content', 'center', 'important');

                const visualButtons = Array.from(entriesSection.querySelectorAll('.unidex-entry-visual-btn'));
                const coverSlots = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover-slot'))
                    .filter(function (slot) { return !slot.classList.contains('is-bookmark-only'); });
                const covers = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover'));

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

            entriesSection.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
            entriesSection.style.removeProperty('grid-auto-rows');
            entriesSection.style.removeProperty('grid-auto-flow');
            entriesSection.style.removeProperty('align-items');
            entriesSection.style.removeProperty('justify-content');

            if (entrySetState.isLarge) {
                stopLargeMasonryMaintenance();
                return;
            }

            clearEntriesMasonrySpans(entriesSection);

            const isCompactViewport = window.matchMedia('(max-width: 900px)').matches;
            const targetWidth = isCompactViewport ? 72 : 84;
            const targetHeight = isCompactViewport ? 132 : 156;
            const rowFillHeight = Math.round(targetHeight * 1.32);
            const rowFillOffset = Math.round((rowFillHeight - targetHeight) / 2);
            const visualButtons = Array.from(entriesSection.querySelectorAll('.unidex-entry-visual-btn'));
            const coverSlots = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover-slot'))
                .filter(function (slot) { return !slot.classList.contains('is-bookmark-only'); });
            const covers = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover'));
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


        return { forceEntriesLayoutPass };
    };
})();
