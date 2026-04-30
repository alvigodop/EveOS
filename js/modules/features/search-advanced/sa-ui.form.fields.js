window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    if (window.EveOS.SearchAdvanced.Modules.createUiFormFields) return;

    window.EveOS.SearchAdvanced.Modules.createUiFormFields = function createUiFormFields() {
        function byId(id) {
            return document.getElementById(id);
        }

        function setLoading(isLoading) {
            const runBtn = byId('esRunBtn');
            const results = byId('esResults');
            if (runBtn) {
                runBtn.disabled = !!isLoading;
                runBtn.textContent = isLoading ? '⏳ Searching...' : '⚔ Search';
            }
            if (isLoading && results) {
                results.innerHTML = '<div class="nx-loader"></div>';
            }
        }

        function setMeta(text, isError) {
            const meta = byId('esMeta');
            if (!meta) return;
            meta.textContent = text || '';
            meta.classList.toggle('is-error', !!isError);
        }

        function getFieldValue(id) {
            return (byId(id)?.value || '').trim();
        }

        function collectSettings() {
            return {
                apiKey: getFieldValue('esApiKey'),
                cx: getFieldValue('esCx'),
                sort: byId('esSort')?.value || '',
                siteSearch: getFieldValue('esSite'),
                lr: byId('esLanguage')?.value || '',
                cr: byId('esCountry')?.value || '',
                fileType: byId('esFileType')?.value || '',
                dateRestrict: byId('esDateRestrict')?.value || '',
                safe: byId('esSafe')?.value || '',
                rights: byId('esRights')?.value || '',
                num: byId('esNum')?.value || '10',
                exactTerms: getFieldValue('esExactTerms'),
                excludeTerms: getFieldValue('esExcludeTerms'),
                scopeMode: collectScopeMode(),
                resultsMode: collectResultsMode(),
                activeVectors: collectVectorStates()
            };
        }

        function collectScopeMode() {
            const activeButton = document.querySelector('.nx-mode-btn.nx-mode-btn-active[data-scope-mode]');
            return activeButton?.getAttribute('data-scope-mode') === 'all' ? 'all' : 'current';
        }

        function collectResultsMode() {
            const activeButton = document.querySelector('.nx-mode-btn.nx-mode-btn-active[data-results-mode]');
            return activeButton?.getAttribute('data-results-mode') || 'segmented';
        }

        function collectVectorStates() {
            const vectors = {};
            const slots = document.querySelectorAll('.nx-vector-slot[data-vector]');
            slots.forEach(function (slot) {
                const key = slot.getAttribute('data-vector');
                if (key) vectors[key] = slot.classList.contains('nx-active');
            });
            // Defaults if DOM not ready
            if (!Object.keys(vectors).length) {
                return { google: true, knowledge: true, cachedResults: true, bookmarks: true };
            }
            return vectors;
        }

        function applyScopeMode(mode) {
            const normalizedMode = mode === 'all' ? 'all' : 'current';
            document.querySelectorAll('.nx-mode-btn[data-scope-mode]').forEach(function (button) {
                button.classList.toggle('nx-mode-btn-active', button.getAttribute('data-scope-mode') === normalizedMode);
            });
        }

        function applyResultsMode(mode) {
            const normalizedMode = mode === 'merged' ? 'merged' : 'segmented';
            document.querySelectorAll('.nx-mode-btn[data-results-mode]').forEach(function (button) {
                button.classList.toggle('nx-mode-btn-active', button.getAttribute('data-results-mode') === normalizedMode);
            });
        }

        function initScopeModeToggle() {
            document.querySelectorAll('.nx-mode-btn[data-scope-mode]').forEach(function (button) {
                button.addEventListener('click', function () {
                    const mode = button.getAttribute('data-scope-mode') === 'all' ? 'all' : 'current';
                    applyScopeMode(mode);
                    if (window.EveOS?.SearchAdvanced?.State?.updateSettings) {
                        window.EveOS.SearchAdvanced.State.updateSettings({ scopeMode: mode });
                    }
                    window.EveOS?.SearchAdvanced?.UI?.refreshScopeIndicator?.();
                });
            });
        }

        function initResultsModeToggle() {
            document.querySelectorAll('.nx-mode-btn[data-results-mode]').forEach(function (button) {
                button.addEventListener('click', function () {
                    const mode = button.getAttribute('data-results-mode') || 'segmented';
                    applyResultsMode(mode);
                    if (window.EveOS?.SearchAdvanced?.State?.updateSettings) {
                        window.EveOS.SearchAdvanced.State.updateSettings({ resultsMode: mode });
                    }
                    const results = byId('esResults');
                    const lastSearchResult = results?._nxLastSearchResult;
                    const renderVectorResults = window.EveOS?.SearchAdvanced?.Modules?.renderVectorResults;
                    if (results && lastSearchResult && typeof renderVectorResults === 'function') {
                        renderVectorResults(Object.assign({}, lastSearchResult, { mode: mode }), results);
                    }
                });
            });
        }

        function initVectorToggles() {
            const slots = document.querySelectorAll('.nx-vector-slot[data-vector]');
            slots.forEach(function (slot) {
                slot.addEventListener('click', function () {
                    slot.classList.toggle('nx-active');
                    // Pulse effect
                    slot.classList.add('nx-pulse');
                    setTimeout(function () { slot.classList.remove('nx-pulse'); }, 500);
                });
            });

            // Sidebar collapse/expand toggle
            const toggleBtn = byId('nxSidebarToggle');
            const sidebar = byId('nxSidebar');
            if (toggleBtn && sidebar) {
                toggleBtn.addEventListener('click', function () {
                    const isCollapsed = sidebar.classList.toggle('nx-collapsed');
                    toggleBtn.textContent = isCollapsed ? '▶' : '◀';
                    toggleBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
                    // Sync query value to inline input when collapsing
                    const mainQuery = byId('esQuery');
                    const inlineQuery = byId('nxInlineQuery');
                    if (isCollapsed && mainQuery && inlineQuery) {
                        inlineQuery.value = mainQuery.value;
                    }
                });
            }

            // Inline search input sync
            const inlineQuery = byId('nxInlineQuery');
            const mainQuery = byId('esQuery');
            if (inlineQuery && mainQuery) {
                inlineQuery.addEventListener('input', function () {
                    mainQuery.value = inlineQuery.value;
                });
                mainQuery.addEventListener('input', function () {
                    inlineQuery.value = mainQuery.value;
                });
                inlineQuery.addEventListener('keypress', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const searchBtn = byId('esRunBtn');
                        if (searchBtn) searchBtn.click();
                    }
                });
            }
            const inlineSearchBtn = byId('nxInlineSearchBtn');
            if (inlineSearchBtn) {
                inlineSearchBtn.addEventListener('click', function () {
                    const searchBtn = byId('esRunBtn');
                    if (searchBtn) searchBtn.click();
                });
            }

            initScopeModeToggle();
            initResultsModeToggle();
        }

        function applyVectorStates(vectors) {
            if (!vectors || typeof vectors !== 'object') return;
            Object.keys(vectors).forEach(function (key) {
                const slot = document.querySelector('.nx-vector-slot[data-vector="' + key + '"]');
                if (slot) {
                    slot.classList.toggle('nx-active', !!vectors[key]);
                }
            });
        }

        function applySettingsToForm(settings, query) {
            const current = settings || {};
            if (byId('esApiKey')) byId('esApiKey').value = current.apiKey || '';
            if (byId('esCx')) byId('esCx').value = current.cx || '';
            if (byId('esSort')) byId('esSort').value = current.sort || '';
            if (byId('esSite')) byId('esSite').value = current.siteSearch || '';
            if (byId('esLanguage')) byId('esLanguage').value = current.lr || '';
            if (byId('esCountry')) byId('esCountry').value = current.cr || '';
            if (byId('esFileType')) byId('esFileType').value = current.fileType || '';
            if (byId('esDateRestrict')) byId('esDateRestrict').value = current.dateRestrict || '';
            if (byId('esSafe')) byId('esSafe').value = current.safe || '';
            if (byId('esRights')) byId('esRights').value = current.rights || '';
            if (byId('esNum')) byId('esNum').value = current.num || '10';
            if (byId('esExactTerms')) byId('esExactTerms').value = current.exactTerms || '';
            if (byId('esExcludeTerms')) byId('esExcludeTerms').value = current.excludeTerms || '';
            if (byId('esQuery') && typeof query === 'string') byId('esQuery').value = query;
            applyVectorStates(current.activeVectors);
            applyScopeMode(current.scopeMode || 'current');
            applyResultsMode(current.resultsMode || 'segmented');
        }

        function resetFilters() {
            if (byId('esSort')) byId('esSort').value = '';
            if (byId('esSite')) byId('esSite').value = '';
            if (byId('esLanguage')) byId('esLanguage').value = '';
            if (byId('esCountry')) byId('esCountry').value = '';
            if (byId('esFileType')) byId('esFileType').value = '';
            if (byId('esDateRestrict')) byId('esDateRestrict').value = '';
            if (byId('esSafe')) byId('esSafe').value = '';
            if (byId('esRights')) byId('esRights').value = '';
            if (byId('esNum')) byId('esNum').value = '10';
            if (byId('esExactTerms')) byId('esExactTerms').value = '';
            if (byId('esExcludeTerms')) byId('esExcludeTerms').value = '';
        }

        async function updateFooterStats() {
            try {
                const indexApi = window.EveOS.SearchAdvanced?.Index;
                const Agg = window.EveOS.SearchAdvanced?.CacheAggregator;
                const snapshot = indexApi?.ensureFresh ? await indexApi.ensureFresh() : null;
                const stats = snapshot?.stats || (Agg ? (await Agg.aggregateAllCaches()).stats : null);
                if (!stats) return;
                const entryEl = byId('nxStatEntries');
                const provEl = byId('nxStatProviders');
                const cardEl = byId('nxStatCards');
                const vecEl = byId('nxStatVectors');
                const entryCount = stats.totalRecords ?? stats.totalEntries ?? 0;
                const providerCount = stats.providerCount ?? stats.totalProviders ?? 0;
                const cardCount = stats.cardCount ?? 0;
                if (entryEl) entryEl.textContent = String(entryCount) + ' indexed';
                if (provEl) provEl.textContent = String(providerCount) + ' providers';
                if (cardEl) cardEl.textContent = String(cardCount) + ' cards';
                const activeVectors = document.querySelectorAll('.nx-vector-slot.nx-active').length;
                if (vecEl) vecEl.textContent = String(activeVectors) + ' active';

                // Orphan detection
                if (Agg && typeof Agg.detectOrphanedLinks === 'function') {
                    const orphanReport = Agg.detectOrphanedLinks();
                    updateOrphanBanner(orphanReport);
                }
            } catch (err) {
                console.warn('[NexusSearch] Footer stats error:', err);
            }
        }

        function updateOrphanBanner(report) {
            const banner = byId('nxOrphanBanner');
            const textEl = byId('nxOrphanText');
            if (!banner) return;

            const totalOrphaned = Number(report?.totalOrphaned || report?.orphaned?.length || 0);
            const ghostWorkspaces = Array.isArray(report?.ghostWorkspaces)
                ? report.ghostWorkspaces
                : Object.keys(report?.orphanedByWorkspace || {});

            if (!report || totalOrphaned <= 0 || ghostWorkspaces.length === 0) {
                banner.style.display = 'none';
                return;
            }

            banner.style.display = 'flex';
            const ghostList = ghostWorkspaces.map(function (id) { return '"' + id + '"'; }).join(', ');
            if (textEl) {
                textEl.textContent = totalOrphaned + ' orphaned bookmarks from ' + ghostWorkspaces.length + ' deleted workspace(s): ' + ghostList;
            }

            // Bind View button
            const viewBtn = byId('nxOrphanViewBtn');
            if (viewBtn) {
                viewBtn.onclick = function () {
                    renderOrphanList(report);
                };
            }

            // Bind Rescue button
            const rescueBtn = byId('nxOrphanRescueBtn');
            if (rescueBtn) {
                rescueBtn.onclick = function () {
                    const Agg = window.EveOS.SearchAdvanced?.CacheAggregator;
                    if (!Agg) return;
                    const result = Agg.rescueOrphanedLinks();
                    const tabNames = (result.restoredTabs || []).map(function (t) { return t.name; }).join(', ');
                    if (typeof showToast === 'function') {
                        showToast('Restored ' + (result.restoredTabs || []).length + ' tabs with ' + result.rescued + ' bookmarks: ' + tabNames, 'success');
                    }
                    banner.style.display = 'none';
                    if (typeof renderSidebar === 'function') renderSidebar();
                    if (typeof renderDashboard === 'function') renderDashboard();
                    updateFooterStats();
                };
            }

            // Bind Dismiss button
            const dismissBtn = byId('nxOrphanDismissBtn');
            if (dismissBtn) {
                dismissBtn.onclick = function () {
                    banner.style.display = 'none';
                };
            }
        }

        function renderOrphanList(report) {
            const resultsEl = byId('esResults');
            if (!resultsEl || !report) return;
            const totalOrphaned = Number(report.totalOrphaned || report.orphaned?.length || 0);
            const ghostWorkspaces = Array.isArray(report.ghostWorkspaces)
                ? report.ghostWorkspaces
                : Object.keys(report.orphanedByWorkspace || {});
            report.totalOrphaned = totalOrphaned;
            report.ghostWorkspaces = ghostWorkspaces;
            report.orphanedByWorkspace = report.orphanedByWorkspace || {};

            let html = '<div class="nx-results-stats">⚠ ' + report.totalOrphaned + ' orphaned bookmarks from ' + report.ghostWorkspaces.length + ' ghost workspace(s)</div>';

            report.ghostWorkspaces.forEach(function (wsId) {
                const items = report.orphanedByWorkspace[wsId] || [];
                html += '<div class="nx-result-group">';
                html += '<div class="nx-group-header nx-group-toggle" data-nx-collapse-group>'
                    + '<span class="nx-group-arrow">▾</span>'
                    + '<span class="nx-group-title">👻 Ghost Workspace: "' + wsId + '"</span>'
                    + '<span class="nx-group-count">' + items.length + '</span>'
                    + '</div>';
                html += '<div class="nx-group-body">';

                items.forEach(function (link) {
                    const title = link.title || link.name || link.url || 'Untitled';
                    const url = link.url || '';
                    const category = link.category || 'Unsorted';

                    html += '<article class="nx-result-item nx-result-bookmark">'
                        + '<div class="nx-result-header">'
                        + '<span class="nx-badge nx-badge-bookmark">👻 Orphan</span>'
                        + '<span class="nx-card-tag">📋 ' + category + '</span>'
                        + '<span class="nx-provider-tag">ws: ' + wsId + '</span>'
                        + '</div>'
                        + '<h4 class="nx-result-title">'
                        + (url ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + title + '</a>' : title)
                        + '</h4>'
                        + (url ? '<div class="nx-result-url">' + url + '</div>' : '')
                        + '</article>';
                });

                html += '</div>'; // .nx-group-body
                html += '</div>'; // .nx-result-group
            });

            resultsEl.innerHTML = html;

            // Wire collapse toggles
            resultsEl.querySelectorAll('[data-nx-collapse-group]').forEach(function (header) {
                header.addEventListener('click', function () {
                    var group = header.closest('.nx-result-group');
                    if (group) group.classList.toggle('collapsed');
                });
            });
            setMeta(report.totalOrphaned + ' orphaned bookmarks found', false);
        }

        return {
            byId,
            setLoading,
            setMeta,
            collectSettings,
            applySettingsToForm,
            resetFilters,
            initVectorToggles,
            applyResultsMode,
            collectResultsMode,
            applyVectorStates,
            collectVectorStates,
            updateFooterStats,
            renderOrphanList
        };
    };
})();
