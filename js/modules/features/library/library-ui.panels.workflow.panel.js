window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanelWorkflowPanelHelpers) return;

    window.EveLibrary.UIModules.createPanelWorkflowPanelHelpers = function createPanelWorkflowPanelHelpers(deps) {
        const State = deps.State;
        const Storage = deps.Storage;
        const EntriesRenderer = deps.EntriesRenderer;
        const OptionsUpdaters = deps.OptionsUpdaters;
        const StatsRenderer = deps.StatsRenderer;
        const Search = deps.Search;
        const Shared = deps.Shared;
        const forms = deps.forms;
        const getDocument = typeof deps?.getDocument === 'function'
            ? deps.getDocument
            : function () { return document; };
        const getRatingsApi = typeof deps?.getRatingsApi === 'function'
            ? deps.getRatingsApi
            : function () { return window.EveLibrary?.Ratings; };

        function createLibraryPanelHtml(categoryName) {
            if (typeof Shared.createLibraryPanelHtml === 'function') {
                return Shared.createLibraryPanelHtml(categoryName);
            }
            return '<div class="lib-panel-error">Library panel template unavailable.</div>';
        }

        function getFolderFilterContainer(categoryName) {
            const prefix = forms.getPrefix(categoryName);
            return getDocument()?.getElementById(prefix + 'folder-filter-bar') || null;
        }

        function getFolderViewState(categoryName) {
            return typeof State.getCategoryFolderView === 'function'
                ? State.getCategoryFolderView(categoryName)
                : { root: 'all', chain: [], expanded: false };
        }

        function setFolderViewState(categoryName, nextState, options = {}) {
            if (typeof State.setCategoryFolderView === 'function') {
                State.setCategoryFolderView(categoryName, nextState);
            }
            if (!options.skipSave) Storage.saveLibrary();
            if (options.refresh === false) {
                renderFolderFilterBar(categoryName);
                return;
            }
            refreshLibrary(categoryName);
        }

        function createFolderSelect(labelText, options, selectedValue, onChange) {
            const doc = getDocument();
            if (!doc) return null;
            const wrapper = doc.createElement('label');
            wrapper.className = 'lib-folder-select-wrap';

            const label = doc.createElement('span');
            label.className = 'lib-folder-select-label';
            label.textContent = labelText;
            wrapper.appendChild(label);

            const select = doc.createElement('select');
            select.className = 'lib-folder-select';
            (Array.isArray(options) ? options : []).forEach((optionData) => {
                const option = doc.createElement('option');
                option.value = String(optionData?.value || '');
                option.textContent = String(optionData?.label || option.value || '');
                option.selected = option.value === String(selectedValue || '');
                select.appendChild(option);
            });
            select.addEventListener('change', onChange);
            wrapper.appendChild(select);
            return wrapper;
        }

        function buildFolderControlModel(categoryName) {
            const folderNodes = typeof State.getBookmarkFolderNodes === 'function'
                ? State.getBookmarkFolderNodes(categoryName)
                : [];
            if (!Array.isArray(folderNodes) || folderNodes.length === 0) {
                return { controls: [], hasFolders: false };
            }

            const folderView = getFolderViewState(categoryName);
            const folderIndexes = typeof Search.buildFolderIndexes === 'function'
                ? Search.buildFolderIndexes(categoryName)
                : { nodeMap: new Map(), childrenMap: new Map() };
            const nodeMap = folderIndexes?.nodeMap instanceof Map ? folderIndexes.nodeMap : new Map();
            const childrenMap = folderIndexes?.childrenMap instanceof Map ? folderIndexes.childrenMap : new Map();
            const topLevelNodes = childrenMap.get('__root__') || [];
            const controls = [{
                type: 'root',
                selected: String(folderView?.root || 'all'),
                options: [
                    { value: 'all', label: 'All Entries' },
                    { value: 'root', label: 'Root Bookmarks Only' },
                    ...topLevelNodes.map((node) => ({
                        value: `folder:${node.id}`,
                        label: node.name || 'Folder'
                    }))
                ]
            }];

            const rootSelection = String(folderView?.root || 'all').trim();
            if (!rootSelection.startsWith('folder:')) {
                return { controls, hasFolders: true };
            }

            let currentFolderId = String(rootSelection.slice('folder:'.length) || '').trim();
            if (!currentFolderId || !nodeMap.has(currentFolderId)) {
                return { controls, hasFolders: true };
            }

            const chain = Array.isArray(folderView?.chain) ? folderView.chain : [];
            for (let depth = 0; depth < chain.length + 1; depth += 1) {
                const currentNode = nodeMap.get(currentFolderId);
                if (!currentNode) break;
                const childNodes = childrenMap.get(currentFolderId) || [];
                if (!childNodes.length) break;
                const step = chain[depth] && typeof chain[depth] === 'object' ? chain[depth] : {};
                const selected = String(step.selection || 'self');
                controls.push({
                    type: 'branch',
                    folderId: currentFolderId,
                    label: currentNode.name || 'Folder',
                    depth,
                    selected,
                    options: [
                        { value: 'self', label: 'This Folder Only' },
                        { value: 'self_and_descendants', label: 'This + Subfolders' },
                        { value: 'descendants_only', label: 'Subfolders Only' },
                        ...childNodes.map((node) => ({
                            value: `child:${node.id}`,
                            label: `Open ${node.name || 'Folder'}`
                        }))
                    ]
                });
                if (!selected.startsWith('child:')) break;
                const nextFolderId = String(selected.slice('child:'.length) || '').trim();
                if (!nextFolderId || !nodeMap.has(nextFolderId)) break;
                currentFolderId = nextFolderId;
            }

            return { controls, hasFolders: true, expanded: !!folderView?.expanded };
        }

        function renderFolderFilterBar(categoryName) {
            const container = getFolderFilterContainer(categoryName);
            if (!container) return;

            const { controls, hasFolders, expanded } = buildFolderControlModel(categoryName);
            container.innerHTML = '';
            container.classList.toggle('is-empty', !hasFolders);
            if (!hasFolders || !controls.length) return;

            const view = getFolderViewState(categoryName);
            const shouldCollapse = controls.length > 2 && !expanded;
            const visibleControls = shouldCollapse
                ? [controls[0], controls[controls.length - 1]]
                : controls;
            const hiddenCount = shouldCollapse ? controls.length - visibleControls.length : 0;

            visibleControls.forEach((control) => {
                if (control.type === 'root') {
                    const rootSelect = createFolderSelect(
                        'Scope',
                        control.options,
                        control.selected,
                        (event) => {
                            setFolderViewState(categoryName, {
                                ...view,
                                root: String(event?.target?.value || 'all'),
                                chain: [],
                                expanded: false
                            });
                        }
                    );
                    if (rootSelect) container.appendChild(rootSelect);
                    return;
                }

                const branchSelect = createFolderSelect(
                    control.label || 'Folder',
                    control.options,
                    control.selected,
                    (event) => {
                        const nextChain = Array.isArray(view.chain) ? view.chain.slice(0, control.depth + 1) : [];
                        nextChain[control.depth] = { selection: String(event?.target?.value || 'self') };
                        setFolderViewState(categoryName, {
                            ...view,
                            chain: nextChain,
                            expanded: false
                        });
                    }
                );
                if (branchSelect) container.appendChild(branchSelect);
            });

            if (hiddenCount > 0 || controls.length > 2) {
                const doc = getDocument();
                if (!doc) return;
                const toggle = doc.createElement('button');
                toggle.type = 'button';
                toggle.className = 'lib-folder-chain-toggle';
                toggle.textContent = expanded ? 'Hide Path' : '...';
                toggle.title = expanded ? 'Collapse folder path controls' : `Show ${hiddenCount} hidden folder path control${hiddenCount === 1 ? '' : 's'}`;
                toggle.addEventListener('click', () => {
                    setFolderViewState(categoryName, {
                        ...view,
                        expanded: !expanded
                    }, { refresh: false });
                });
                container.appendChild(toggle);
            }
        }

        function initLibraryPanel(categoryName) {
            const prefix = forms.getPrefix(categoryName);
            const doc = getDocument();
            const panel = doc?.getElementById(prefix + 'panel');
            if (!panel) return;
            panel.innerHTML = createLibraryPanelHtml(categoryName);
            renderFolderFilterBar(categoryName);
            OptionsUpdaters.updateStatusOptions(categoryName);
            OptionsUpdaters.updateGenreOptions(categoryName);
            OptionsUpdaters.updateSortByOptions(categoryName);
            OptionsUpdaters.updateFieldsVisibility(categoryName);
            const ratingScaleSelect = doc?.getElementById(prefix + 'search-rating-scale');
            const ratingsApi = getRatingsApi();
            const currentConfig = State?.getConfig ? State.getConfig() : null;
            if (ratingScaleSelect && ratingsApi?.getActiveScale) {
                ratingScaleSelect.value = ratingsApi.getActiveScale(currentConfig);
            }
            const entriesContainer = doc?.getElementById(prefix + 'entries');
            EntriesRenderer.renderEntries(categoryName, entriesContainer);
        }

        function toggleLibraryPanel(categoryName) {
            const prefix = forms.getPrefix(categoryName);
            const panel = document.getElementById(prefix + 'panel');
            if (!panel) return;
            const parentCard = panel.closest('.category-card');
            const isFocusedCard = !!parentCard?.classList.contains('is-focus-mode');
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            if (isFocusedCard) {
                parentCard.classList.toggle('focus-library-only', isHidden);
            }
            if (isHidden) {
                // Show skeleton while library panel builds
                panel.innerHTML = ''
                    + '<div style="display:flex; flex-direction:column; gap:10px; padding:12px;">'
                    +   '<div style="height:34px; border-radius:8px; background:rgba(255,255,255,0.04); animation:pulse 1.2s ease-in-out infinite;"></div>'
                    +   '<div style="height:28px; border-radius:8px; background:rgba(255,255,255,0.03); animation:pulse 1.2s ease-in-out infinite; animation-delay:0.12s;"></div>'
                    +   '<div style="height:60px; border-radius:8px; background:rgba(255,255,255,0.04); animation:pulse 1.2s ease-in-out infinite; animation-delay:0.24s;"></div>'
                    +   '<div style="height:60px; border-radius:8px; background:rgba(255,255,255,0.03); animation:pulse 1.2s ease-in-out infinite; animation-delay:0.36s;"></div>'
                    +   '<div style="height:60px; border-radius:8px; background:rgba(255,255,255,0.04); animation:pulse 1.2s ease-in-out infinite; animation-delay:0.48s;"></div>'
                    + '</div>';

                requestAnimationFrame(function () {
                    setTimeout(function () {
                        initLibraryPanel(categoryName);
                    }, 0);
                });
            }
        }

        function toggleStats(categoryName) {
            const prefix = forms.getPrefix(categoryName);
            const doc = getDocument();
            const entriesView = doc?.getElementById(prefix + 'entries-view');
            const statsView = doc?.getElementById(prefix + 'stats-view');
            if (!entriesView || !statsView) return;
            if (statsView.style.display === 'none') {
                entriesView.style.display = 'none';
                statsView.style.display = 'block';
                if (StatsRenderer) {
                    StatsRenderer.renderStats(categoryName, statsView);
                } else {
                    statsView.innerHTML = '<p>Statistics module not loaded.</p>';
                }
                return;
            }
            statsView.style.display = 'none';
            entriesView.style.display = 'block';
        }

        function refreshLibrary(categoryName) {
            const prefix = forms.getPrefix(categoryName);
            const doc = getDocument();
            const entriesContainer = doc?.getElementById(prefix + 'entries');
            const statsView = doc?.getElementById(prefix + 'stats-view');
            renderFolderFilterBar(categoryName);
            OptionsUpdaters.updateGenreOptions(categoryName);
            EntriesRenderer.renderEntries(categoryName, entriesContainer);
            if (statsView && statsView.style.display !== 'none' && StatsRenderer) {
                StatsRenderer.renderStats(categoryName, statsView);
            }
        }

        function resetAndRefresh(categoryName) {
            Search.resetFilters(categoryName);
            refreshLibrary(categoryName);
        }

        function changeDataType(categoryName, newType) {
            State.setCategoryDataType(categoryName, newType);
            Storage.saveLibrary();
            initLibraryPanel(categoryName);
        }

        return {
            createLibraryPanelHtml,
            initLibraryPanel,
            renderFolderFilterBar,
            toggleLibraryPanel,
            toggleStats,
            refreshLibrary,
            resetAndRefresh,
            changeDataType
        };
    };
})();
