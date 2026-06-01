// Unidex View progressive entry hydration helpers
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createStageProgressiveEntryHelpers = function createStageProgressiveEntryHelpers(deps) {
        const buildEntriesHtml = deps?.buildEntriesHtml;
        const getEntriesDensityMode = deps?.getEntriesDensityMode || (() => 'comfortable');
        const getEntriesGroupMode = deps?.getEntriesGroupMode || (() => 'flat');
        const escapeHtml = deps?.escapeHtml;
        const stabilizeEntriesLayout = deps?.stabilizeEntriesLayout;

        function resolveChunkSize(defaultValue) {
            const raw = Number(window.config?.paginationChunkSize);
            if (!Number.isFinite(raw) || raw <= 0) return defaultValue;
            return Math.max(20, Math.min(2000, Math.round(raw)));
        }
        const PROGRESSIVE_CHUNK_SIZE = resolveChunkSize(220);
        const PROGRESSIVE_GROUP_CHUNK_SIZE = Math.max(PROGRESSIVE_CHUNK_SIZE * 3, resolveChunkSize(760));
        let progressiveEntriesToken = 0;
        const mapButtonHtml = '<button type="button" class="unidex-layout-btn unidex-map-btn" onclick="window.UnidexView.openConstellationMap()" title="Open Constellation Map for this layer">Map</button>';
        const nexusAllTabsBtn = '<button type="button" class="unidex-layout-btn unidex-nexus-btn" onclick="window.UnidexView.openNexusSearch()" title="Search across all tabs (bookmarks + scraper cache)">⚔ Nexus Search</button>';
        function buildNexusScopedBtn(wsId) {
            const safeWsId = String(wsId || '').replace(/'/g, "\\'");
            return '<button type="button" class="unidex-layout-btn unidex-nexus-btn" onclick="window.UnidexView.openNexusSearch(\'' + safeWsId + '\')" title="Search this tab (bookmarks + scraper cache)">⚔ Nexus Search</button>';
        }

        function buildEntriesClassName(layoutMode) {
            return 'unidex-entries '
                + (layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout')
                + ' is-density-' + getEntriesDensityMode();
        }

        function scheduleIdleTask(callback) {
            if (typeof window.requestIdleCallback === 'function') {
                return window.requestIdleCallback(callback, { timeout: 180 });
            }
            return window.setTimeout(function () {
                callback({
                    didTimeout: true,
                    timeRemaining: function () { return 8; }
                });
            }, 16);
        }

        function shouldProgressivelyRenderEntries(entries, groupMode) {
            return Array.isArray(entries)
                && entries.length > PROGRESSIVE_ENTRY_THRESHOLD;
        }

        function getProgressiveInitialCount(layoutMode, totalCount) {
            const baseCount = layoutMode === 'grid'
                ? PROGRESSIVE_GRID_INITIAL_COUNT
                : PROGRESSIVE_ROW_INITIAL_COUNT;
            return Math.min(Math.max(baseCount, 1), totalCount);
        }

        function buildProgressiveStatusHtml(renderedCount, totalCount) {
            return `
                <div class="unidex-progressive-status" data-unidex-progressive-status="1" role="status" aria-live="polite">
                    <span>Showing ${renderedCount.toLocaleString()} of ${totalCount.toLocaleString()} bookmarks</span>
                    <small>Loading the rest in background chunks.</small>
                </div>
            `;
        }

        function buildProgressiveEntriesHtml(entries, taskMode, layoutMode, entryOptions) {
            const totalCount = Array.isArray(entries) ? entries.length : 0;
            const initialCount = getProgressiveInitialCount(layoutMode, totalCount);
            const initialEntries = entries.slice(0, initialCount);
            return {
                initialCount,
                totalCount,
                html: buildEntriesHtml(initialEntries, taskMode, layoutMode, entryOptions)
                    + buildProgressiveStatusHtml(initialCount, totalCount)
            };
        }

        function getIdentifierIds(link) {
            if (typeof window.EveBookmarkIdentifiers?.getIdentifiersForLink === 'function') {
                return window.EveBookmarkIdentifiers.getIdentifiersForLink(link);
            }
            return Array.isArray(link?.identifiers)
                ? link.identifiers.map(function (id) { return String(id || '').trim(); }).filter(Boolean)
                : [];
        }

        function buildIdentifierGroups(entries) {
            const identifierApi = window.EveBookmarkIdentifiers || {};
            const definitions = typeof identifierApi.getDefinitions === 'function'
                ? identifierApi.getDefinitions()
                : [];
            const definitionGroups = (Array.isArray(definitions) ? definitions : []).map(function (definition) {
                return {
                    id: String(definition?.id || '').trim(),
                    label: String(definition?.label || definition?.id || 'Identifier').trim(),
                    links: []
                };
            }).filter(function (group) {
                return !!group.id;
            });
            const groupById = new Map(definitionGroups.map(function (group) {
                return [group.id, group];
            }));
            const unidentifiedLinks = [];

            (Array.isArray(entries) ? entries : []).forEach(function (link) {
                const ids = getIdentifierIds(link);
                if (!ids.length) {
                    unidentifiedLinks.push(link);
                    return;
                }
                ids.forEach(function (id) {
                    if (!groupById.has(id)) {
                        const fallbackGroup = { id, label: id, links: [] };
                        groupById.set(id, fallbackGroup);
                        definitionGroups.push(fallbackGroup);
                    }
                    groupById.get(id).links.push(link);
                });
            });

            const populatedGroups = definitionGroups.filter(function (group) {
                return group.links.length > 0;
            });
            if (unidentifiedLinks.length) {
                populatedGroups.push({
                    id: '__unidentified__',
                    label: 'No Identifier',
                    links: unidentifiedLinks
                });
            }
            return populatedGroups;
        }

        function buildIdentifierGroupBadgeHtml(group) {
            const identifierApi = window.EveBookmarkIdentifiers || {};
            const safeGroupLabel = escapeHtml(group?.label || 'Identifier');
            if (group?.id && group.id !== '__unidentified__' && typeof identifierApi.buildBadgeHtml === 'function') {
                return identifierApi.buildBadgeHtml([group.id]) || `<span class="unidex-identifier-group-fallback">${safeGroupLabel}</span>`;
            }
            return `<span class="unidex-identifier-group-fallback">${safeGroupLabel}</span>`;
        }

        function buildProgressiveIdentifierEntriesHtml(entries, taskMode, layoutMode, entryOptions) {
            const groups = buildIdentifierGroups(entries);
            const rows = [];
            groups.forEach(function (group) {
                group.links.forEach(function (link) {
                    rows.push({ groupId: group.id, link });
                });
            });
            const totalCount = rows.length;
            const initialCount = getProgressiveInitialCount(layoutMode, totalCount);
            const initialRows = rows.slice(0, initialCount);
            const initialLinksByGroup = new Map();
            initialRows.forEach(function (row) {
                if (!initialLinksByGroup.has(row.groupId)) initialLinksByGroup.set(row.groupId, []);
                initialLinksByGroup.get(row.groupId).push(row.link);
            });

            const sectionsHtml = groups.map(function (group) {
                const safeGroupId = escapeHtml(group.id || '');
                const groupKey = encodeURIComponent(group.id || '');
                const groupLinks = initialLinksByGroup.get(group.id) || [];
                const entriesHtml = buildEntriesHtml(groupLinks, taskMode, layoutMode, Object.assign({}, entryOptions, {
                    renderItemsOnly: true,
                    groupMode: 'flat'
                }));
                return `
                    <section class="unidex-identifier-group" data-identifier-id="${safeGroupId}">
                        <header class="unidex-identifier-group-header">
                            <div class="unidex-identifier-group-title">${buildIdentifierGroupBadgeHtml(group)}</div>
                            <span class="unidex-identifier-group-count">${group.links.length} bookmark${group.links.length === 1 ? '' : 's'}</span>
                        </header>
                        <div class="unidex-identifier-group-body" data-unidex-progressive-group="${groupKey}">
                            ${entriesHtml}
                        </div>
                    </section>
                `;
            }).join('');

            return {
                grouped: true,
                rows,
                initialCount,
                totalCount,
                html: sectionsHtml + buildProgressiveStatusHtml(initialCount, totalCount)
            };
        }

        function buildEntriesPayload(entries, taskMode, layoutMode, entryOptions) {
            const groupMode = String(entryOptions?.groupMode || 'flat');
            if (!shouldProgressivelyRenderEntries(entries, groupMode)) {
                return {
                    progressive: false,
                    initialCount: Array.isArray(entries) ? entries.length : 0,
                    totalCount: Array.isArray(entries) ? entries.length : 0,
                    html: buildEntriesHtml(entries, taskMode, layoutMode, entryOptions)
                };
            }
            const payload = groupMode === 'identifiers'
                ? buildProgressiveIdentifierEntriesHtml(entries, taskMode, layoutMode, entryOptions)
                : buildProgressiveEntriesHtml(entries, taskMode, layoutMode, entryOptions);
            payload.progressive = true;
            return payload;
        }

        function scheduleProgressiveEntriesHydration(gridContainer, entries, taskMode, layoutMode, entryOptions, payload) {
            if (!payload?.progressive) return;
            progressiveEntriesToken += 1;
            const token = progressiveEntriesToken;
            const entriesSection = gridContainer?.querySelector?.('.unidex-entries[data-unidex-progressive="1"]');
            if (!entriesSection) return;

            const statusNode = entriesSection.querySelector('[data-unidex-progressive-status="1"]');
            let renderedCount = Number(payload.initialCount || 0);
            const totalCount = Array.isArray(entries) ? entries.length : renderedCount;
            entriesSection.dataset.unidexProgressiveRendered = String(renderedCount);
            entriesSection.dataset.unidexProgressiveTotal = String(totalCount);

            function updateStatus(done) {
                entriesSection.dataset.unidexProgressiveRendered = String(renderedCount);
                if (!statusNode) return;
                statusNode.innerHTML = done
                    ? `<span>Loaded ${totalCount.toLocaleString()} bookmarks</span><small>Large datapack mode is active.</small>`
                    : `<span>Showing ${renderedCount.toLocaleString()} of ${totalCount.toLocaleString()} bookmarks</span><small>Loading the rest in background chunks.</small>`;
            }

            function appendNextChunk() {
                if (token !== progressiveEntriesToken || !document.body?.contains(entriesSection)) return;
                if (renderedCount >= totalCount) {
                    entriesSection.setAttribute('aria-busy', 'false');
                    entriesSection.classList.remove('is-progressive-loading');
                    updateStatus(true);
                    stabilizeEntriesLayout(gridContainer, layoutMode);
                    return;
                }

                const sourceRows = payload.grouped && Array.isArray(payload.rows) ? payload.rows : entries;
                // Recompute per chunk so a fresh Settings change applies without reload.
                const liveChunkBase = resolveChunkSize(220);
                const liveGroupChunk = Math.max(liveChunkBase * 3, resolveChunkSize(760));
                const chunkSize = payload.grouped ? liveGroupChunk : liveChunkBase;
                const nextCount = Math.min(totalCount, renderedCount + chunkSize);
                const chunk = sourceRows.slice(renderedCount, nextCount);

                if (payload.grouped) {
                    const linksByGroup = new Map();
                    chunk.forEach(function (row) {
                        if (!linksByGroup.has(row.groupId)) linksByGroup.set(row.groupId, []);
                        linksByGroup.get(row.groupId).push(row.link);
                    });
                    linksByGroup.forEach(function (groupLinks, groupId) {
                        const groupKey = encodeURIComponent(groupId || '');
                        const groupBody = entriesSection.querySelector(`[data-unidex-progressive-group="${groupKey}"]`);
                        if (!groupBody) return;
                        const chunkHtml = buildEntriesHtml(groupLinks, taskMode, layoutMode, Object.assign({}, entryOptions, {
                            renderItemsOnly: true,
                            groupMode: 'flat'
                        }));
                        const template = document.createElement('template');
                        template.innerHTML = chunkHtml;
                        groupBody.appendChild(template.content);
                    });
                } else {
                    const chunkHtml = buildEntriesHtml(chunk, taskMode, layoutMode, Object.assign({}, entryOptions, {
                        renderItemsOnly: true,
                        groupMode: 'flat'
                    }));
                    const template = document.createElement('template');
                    template.innerHTML = chunkHtml;
                    entriesSection.insertBefore(template.content, statusNode || null);
                }
                renderedCount = nextCount;
                updateStatus(false);
                entriesSection.dispatchEvent(new CustomEvent('unidex-progressive-chunk'));

                scheduleIdleTask(appendNextChunk);
            }

            entriesSection.classList.add('is-progressive-loading');
            entriesSection.setAttribute('aria-busy', 'true');
            updateStatus(false);
            scheduleIdleTask(appendNextChunk);
        }

        function cancelProgressiveEntriesHydration() {
            progressiveEntriesToken += 1;
        }

        return {
            buildEntriesClassName,
            buildEntriesPayload,
            scheduleProgressiveEntriesHydration,
            cancelProgressiveEntriesHydration
        };
    };
})();
