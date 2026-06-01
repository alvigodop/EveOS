// Unidex View Layout Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createLayout = function createLayout(deps) {
        const state = deps?.state || {};
        const LARGE_ENTRY_LAYOUT_THRESHOLD = 180;
        let largeMasonryToken = 0;
        let largeMasonryCleanup = null;
        let largeMasonryFrame = 0;

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

        function getLargeMasonryContainers(entriesSection) {
            if (!entriesSection) return [];
            if (entriesSection.classList.contains('is-grouped-entry-set')) {
                return Array.from(entriesSection.querySelectorAll('.unidex-identifier-group-body'));
            }
            return [entriesSection];
        }

        function updateLargeEntrySetClasses(entriesSection) {
            if (!entriesSection) return { isLarge: false, hasGroups: false, entryCount: 0 };
            const entryCount = entriesSection.querySelectorAll('.unidex-entry-item').length;
            const hasGroups = !!entriesSection.querySelector('.unidex-identifier-group');
            const isLarge = entryCount > LARGE_ENTRY_LAYOUT_THRESHOLD;
            entriesSection.classList.toggle('is-large-entry-set', isLarge);
            entriesSection.classList.toggle('is-flat-entry-set', isLarge && !hasGroups);
            entriesSection.classList.toggle('is-grouped-entry-set', isLarge && hasGroups);
            entriesSection.dataset.unidexEntryCount = String(entryCount);
            return { isLarge, hasGroups, entryCount };
        }

        function stopLargeMasonryMaintenance() {
            largeMasonryToken += 1;
            if (typeof largeMasonryCleanup === 'function') {
                largeMasonryCleanup();
                largeMasonryCleanup = null;
            }
            if (largeMasonryFrame) cancelAnimationFrame(largeMasonryFrame);
            largeMasonryFrame = 0;
        }

        function clearEntriesMasonrySpans(entriesSection) {
            stopLargeMasonryMaintenance();
            if (!entriesSection?.dataset?.unidexMasonryApplied) {
                if (entriesSection) entriesSection.style.minHeight = '';
                return;
            }
            entriesSection.querySelectorAll('.unidex-entry-item, .unidex-identifier-group').forEach(function (item) {
                item.style.gridRowEnd = '';
                delete item.dataset.unidexMasonryMeasured;
                delete item.dataset.unidexMasonryHeight;
            });
            entriesSection.querySelectorAll('.unidex-identifier-group-body').forEach(function (container) {
                delete container.dataset.unidexMasonryScanIndex;
            });
            delete entriesSection.dataset.unidexMasonryScanIndex;
            if (entriesSection) {
                entriesSection.style.minHeight = '';
                delete entriesSection.dataset.unidexMasonryApplied;
            }
        }

        function getMasonryMetrics(container) {
            const computedStyle = window.getComputedStyle(container);
            const rowHeight = parseFloat(computedStyle.getPropertyValue('grid-auto-rows')) || 8;
            let rowGap = parseFloat(computedStyle.getPropertyValue('row-gap'));
            if (!rowGap || Number.isNaN(rowGap)) {
                rowGap = parseFloat(computedStyle.getPropertyValue('gap')) || 0;
            }
            return { rowHeight, rowGap };
        }

        function applyMasonryItem(item, container, metrics) {
            if (!item || !container || !document.body?.contains(item)) return;
            const localMetrics = metrics || getMasonryMetrics(container);
            const entriesSection = item.closest('.unidex-entries');
            const isLargeEntrySet = entriesSection?.classList?.contains('is-large-entry-set');
            if (!isLargeEntrySet) item.style.gridRowEnd = 'auto';
            const rect = item.getBoundingClientRect();
            const measuredHeight = isLargeEntrySet
                ? (rect.height || item.offsetHeight || 0)
                : Math.max(item.scrollHeight || 0, rect.height || 0);
            const span = Math.max(1, Math.ceil((measuredHeight + localMetrics.rowGap) / (localMetrics.rowHeight + localMetrics.rowGap)));
            item.style.gridRowEnd = `span ${span}`;
            item.dataset.unidexMasonryMeasured = '1';
            item.dataset.unidexMasonryHeight = String(Math.round(measuredHeight));
        }

        function getMasonryScrollHosts() {
            const hosts = [window];
            const mainContent = document.getElementById('main-content');
            if (mainContent && mainContent !== document.body && mainContent !== document.documentElement) {
                hosts.push(mainContent);
            }
            return hosts;
        }

        function applyEntriesMasonry(entriesSection) {
            if (!entriesSection?.classList?.contains('is-grid-layout')) return;
            if (entriesSection.classList.contains('is-large-entry-set')) return;
            const metrics = getMasonryMetrics(entriesSection);
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
                const span = Math.max(1, Math.ceil((heights[index] + metrics.rowGap) / (metrics.rowHeight + metrics.rowGap)));
                item.style.gridRowEnd = `span ${span}`;
            });
            entriesSection.dataset.unidexMasonryApplied = '1';

            requestAnimationFrame(function () {
                entriesSection.style.minHeight = '';
            });
        }

        function scheduleVisibleLargeMasonry(entriesSection) {
            const containers = getLargeMasonryContainers(entriesSection);
            if (!containers.length) return;
            largeMasonryToken += 1;
            const token = largeMasonryToken;

            entriesSection.dataset.unidexMasonryApplied = 'pending-visible';

            function scheduleWindowMeasure() {
                if (largeMasonryFrame) return;
                largeMasonryFrame = requestAnimationFrame(function () {
                    largeMasonryFrame = 0;
                    if (token !== largeMasonryToken || !document.body?.contains(entriesSection)) return;
                    measureLargeViewportWindow(entriesSection, containers);
                });
            }

            function handleProgressiveChunk() {
                if (token !== largeMasonryToken || !document.body?.contains(entriesSection)) return;
                measureLargeViewportWindow(entriesSection, containers);
                scheduleWindowMeasure();
            }

            if (typeof largeMasonryCleanup === 'function') largeMasonryCleanup();
            const scrollHosts = getMasonryScrollHosts();
            scrollHosts.forEach(function (host) {
                host.addEventListener('scroll', scheduleWindowMeasure, { passive: true });
            });
            window.addEventListener('resize', scheduleWindowMeasure, { passive: true });
            entriesSection.addEventListener('unidex-progressive-chunk', handleProgressiveChunk);
            largeMasonryCleanup = function cleanupLargeMasonry() {
                scrollHosts.forEach(function (host) {
                    host.removeEventListener('scroll', scheduleWindowMeasure);
                });
                window.removeEventListener('resize', scheduleWindowMeasure);
                entriesSection.removeEventListener('unidex-progressive-chunk', handleProgressiveChunk);
            };

            measureLargeViewportWindow(entriesSection, containers);
            scheduleWindowMeasure();

            setTimeout(function () {
                if (token !== largeMasonryToken || !document.body?.contains(entriesSection)) return;
                scheduleWindowMeasure();
            }, 180);

            if (!entriesSection.dataset.unidexLargeMasonryLoadBound) {
                entriesSection.dataset.unidexLargeMasonryLoadBound = '1';
                entriesSection.addEventListener('load', function (event) {
                    const target = event.target;
                    if (!target?.classList?.contains('unidex-entry-cover')) return;
                    const item = target.closest('.unidex-entry-item');
                    if (!item || !isNearViewport(item, 900)) return;
                    requestAnimationFrame(function () {
                        applyMasonryItem(item, item.parentElement);
                    });
                }, true);
            }
        }

        function isNearViewport(item, margin) {
            if (!item) return false;
            const rect = item.getBoundingClientRect();
            return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
        }

        function measureLargeViewportWindow(entriesSection, containers) {
            const viewportTop = -700;
            const viewportBottom = window.innerHeight + 900;
            const maxPerFrame = 120;
            let measured = 0;
            containers.forEach(function (container) {
                if (measured >= maxPerFrame) return;
                const metrics = getMasonryMetrics(container);
                const children = container.children || [];
                let startIndex = Number(container.dataset.unidexMasonryScanIndex || 0);
                if (!Number.isFinite(startIndex) || startIndex < 0) startIndex = 0;
                if (startIndex >= children.length) startIndex = Math.max(0, children.length - 1);

                while (startIndex > 0) {
                    const probe = children[startIndex];
                    if (!probe?.classList?.contains('unidex-entry-item')) {
                        startIndex -= 1;
                        continue;
                    }
                    const probeRect = probe.getBoundingClientRect();
                    if (probeRect.top <= viewportBottom) break;
                    startIndex = Math.max(0, startIndex - 48);
                }

                while (startIndex < children.length) {
                    const probe = children[startIndex];
                    if (!probe?.classList?.contains('unidex-entry-item')) {
                        startIndex += 1;
                        continue;
                    }
                    const probeRect = probe.getBoundingClientRect();
                    if (probeRect.bottom >= viewportTop) break;
                    startIndex += 1;
                }

                let nextScanIndex = startIndex;
                for (let index = startIndex; index < children.length; index += 1) {
                    if (measured >= maxPerFrame) break;
                    const item = children[index];
                    if (!item?.classList?.contains('unidex-entry-item')) continue;
                    const rect = item.getBoundingClientRect();
                    if (rect.top > viewportBottom) break;
                    if (rect.bottom < viewportTop) {
                        nextScanIndex = index;
                        continue;
                    }
                    if (item.dataset.unidexMasonryMeasured === '1') {
                        const previousHeight = Number(item.dataset.unidexMasonryHeight || 0);
                        const currentHeight = Math.round(rect.height || item.offsetHeight || 0);
                        if (previousHeight > 0 && Math.abs(currentHeight - previousHeight) < 6) continue;
                    }
                    applyMasonryItem(item, container, metrics);
                    measured += 1;
                }
                container.dataset.unidexMasonryScanIndex = String(Math.max(0, nextScanIndex - 8));
            });
            entriesSection.dataset.unidexMasonryApplied = 'visible';
        }

        function scheduleEntriesMasonry(entriesSection) {
            if (!entriesSection) return;
            applyEntriesMasonry(entriesSection);
            requestAnimationFrame(function () {
                applyEntriesMasonry(entriesSection);
            });
        }

        const geometryHelpers = window.UnidexViewModules.createUnidexGeometryHelpers({
            scheduleEntriesMasonry
        });
        const { forceEntriesLayoutPass } = geometryHelpers;
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
