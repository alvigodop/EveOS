// Unidex View Panel Builders Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    function identity(value) {
        return value;
    }

    window.UnidexViewModules.createPanelBuilders = function createPanelBuilders(deps) {
        const getAllLinks = deps?.getAllLinks || (() => []);
        const getWorkspaceBookmarkCount = deps?.getWorkspaceBookmarkCount || function (workspaceId) {
            return getAllLinks().filter(function (link) {
                return String(link.workspace) === String(workspaceId);
            }).length;
        };
        const encodeParam = deps?.encodeParam || identity;
        const escapeHtml = deps?.escapeHtml || identity;

        function getWorkspaceName(workspace) {
            return String(workspace?.name || workspace?.id || 'Untitled Tab');
        }

        function getWorkspaceIcon(workspace) {
            return String(workspace?.icon || '');
        }

        function getSubTabs(workspace) {
            return Array.isArray(workspace?.subTabs) ? workspace.subTabs.filter(Boolean) : [];
        }

        function getBranchTabCount(workspace) {
            return getSubTabs(workspace).reduce(function (total, child) {
                return total + 1 + getBranchTabCount(child);
            }, 0);
        }

        function getBranchBookmarkCount(workspace) {
            return getWorkspaceBookmarkCount(workspace?.id) + getSubTabs(workspace).reduce(function (total, child) {
                return total + getBranchBookmarkCount(child);
            }, 0);
        }

        function buildWrappedTabButton(workspace, depth, options) {
            const settings = options || {};
            const name = getWorkspaceName(workspace);
            const encodedId = encodeParam(workspace.id);
            const safeName = escapeHtml(name);
            const rawIcon = getWorkspaceIcon(workspace);
            const safeIcon = rawIcon ? escapeHtml(rawIcon) : '&#128193;';
            const workspaceCount = getWorkspaceBookmarkCount(workspace.id);
            const depthValue = Math.max(0, Number(depth) || 0);
            const depthClass = ' unidex-tab-depth-' + Math.min(depthValue, 4);
            const hiddenClass = workspace.hiddenInParent ? ' unidex-tab-is-hidden' : '';
            const inactiveClass = workspace.inactive ? ' unidex-tab-is-inactive-state' : '';
            const pathHtml = settings.pathLabel
                ? `<span class="unidex-tab-path">${escapeHtml(settings.pathLabel)}</span>`
                : '';
            // badgeToggle turns the root tile's "N nested tabs" chip into the sub-tabs
            // collapse/expand control (stopPropagation keeps the tile's open-tab click intact).
            const badgeHtml = settings.badge
                ? (settings.badgeToggle
                    ? `<span class="unidex-tab-wrap-badge unidex-subtabs-chip" role="button" tabindex="0"
                        title="Show or hide sub tabs"
                        onclick="event.stopPropagation(); window.UnidexView.toggleSubTabs(this);"
                        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();window.UnidexView.toggleSubTabs(this);}"
                        >${escapeHtml(settings.badge)} <span class="unidex-subtabs-arrow">${settings.expanded ? '&#9662;' : '&#9656;'}</span></span>`
                    : `<span class="unidex-tab-wrap-badge">${escapeHtml(settings.badge)}</span>`)
                : '';

            return `<button type="button"
                class="unidex-tab-btn unidex-tab-wrap-tile${settings.root ? ' is-root-tile' : ''}${depthClass}${hiddenClass}${inactiveClass}"
                data-text="${safeName.toUpperCase()}"
                data-ws-depth="${depthValue}"
                onclick="window.UnidexView.switchWorkspaceTab('${encodedId}')"
                title="${workspace.inactive ? safeName + ' is inactive' : 'Open ' + safeName}">
                <span class="unidex-tab-wrap-bar" aria-hidden="true"></span>
                <span class="unidex-tab-main">${safeIcon} ${safeName}${workspace.inactive ? ' <span class="unidex-tab-inactive-tag">inactive</span>' : ''}</span>
                <span class="unidex-tab-count">${workspaceCount} links</span>
                ${pathHtml}
                ${badgeHtml}
            </button>`;
        }

        function shouldShowInactiveTabs() {
            return !!(typeof config !== 'undefined' && config.unidexShowInactiveTabs);
        }

        // Tabs in HIDDEN sidebar groups are treated exactly like inactive tabs: hidden from
        // Unidex by default, grayed out under the "Show Inactive Tabs" toggle.
        function isInHiddenGroup(workspace) {
            const groupId = String(workspace?.groupId || '').trim();
            if (!groupId) return false;
            const groups = (typeof config !== 'undefined' && Array.isArray(config?.sidebarGroups)) ? config.sidebarGroups : [];
            const group = groups.find(function (item) { return String(item?.id || '') === groupId; });
            return !!(group && group.hidden === true);
        }

        // '' when the tab is normally visible; otherwise the reason label shown on its tag.
        function getTabHiddenState(workspace) {
            if (workspace?.inactive) return 'inactive';
            if (isInHiddenGroup(workspace)) return 'hidden group';
            return '';
        }

        function buildWrappedDescendants(workspace, depth, pathParts) {
            const showInactive = shouldShowInactiveTabs();
            return getSubTabs(workspace).filter(function (child) {
                return showInactive || !child.inactive;
            }).map(function (child) {
                const childName = getWorkspaceName(child);
                const childPath = pathParts.concat([childName]);
                const childCount = getSubTabs(child).length;
                const badgeText = childCount > 0
                    ? childCount + ' child tab' + (childCount === 1 ? '' : 's')
                    : '';
                return buildWrappedTabButton(child, depth, {
                    pathLabel: childPath.join(' / '),
                    badge: badgeText
                }) + buildWrappedDescendants(child, depth + 1, childPath);
            }).join('');
        }

        function buildWrappedTabsHtml() {
            // Inactive tabs match the datapack's hidden state: hidden from Unidex by default,
            // grayed out when "Show Inactive Tabs" is on.
            const showInactive = shouldShowInactiveTabs();
            const workspaces = (config.workspaces || []).filter(function (workspace) {
                return showInactive || !workspace.inactive;
            });
            if (!workspaces.length) return '';

            // Sub-tab sections are COLLAPSED by default; the per-session registry keeps a tab's
            // section open across re-renders once the user expands it (fresh page load resets).
            const expandedMap = window.__unidexExpandedSubTabs = window.__unidexExpandedSubTabs || {};

            return workspaces.map(function (workspace) {
                const name = getWorkspaceName(workspace);
                const descendants = getBranchTabCount(workspace);
                const directChildren = getSubTabs(workspace).length;
                const branchLinks = getBranchBookmarkCount(workspace);
                const childHtml = buildWrappedDescendants(workspace, 1, [name]);
                const emptyHtml = childHtml
                    ? ''
                    : '<div class="unidex-tab-wrap-empty">NO SUB TABS IN THIS BRANCH</div>';
                const expanded = !!expandedMap[String(workspace.id)];
                const arrow = expanded ? '&#9662;' : '&#9656;';

                return `<article class="unidex-tab-wrapper-frame${expanded ? '' : ' is-subtabs-collapsed'}" data-subtabs-id="${escapeHtml(String(workspace.id))}">
                    <div class="unidex-tab-frame-top-beam" aria-hidden="true"></div>
                    <div class="unidex-tab-frame-left-glow" aria-hidden="true"></div>
                    <div class="unidex-tab-scan-beam" aria-hidden="true"></div>
                    <div class="unidex-tab-frame-corner is-top-left" aria-hidden="true"></div>
                    <div class="unidex-tab-frame-corner is-top-right" aria-hidden="true"></div>
                    <div class="unidex-tab-frame-corner is-bottom-left" aria-hidden="true"></div>
                    <div class="unidex-tab-frame-corner is-bottom-right" aria-hidden="true"></div>
                    <div class="unidex-tab-wrapper-header">
                        ${buildWrappedTabButton(workspace, 0, {
                            root: true,
                            badge: descendants + ' nested tab' + (descendants === 1 ? '' : 's'),
                            badgeToggle: true,
                            expanded: expanded
                        })}
                        <div class="unidex-tab-wrapper-stats">
                            <span>${directChildren} direct</span>
                            <span>${descendants} nested</span>
                            <span>${branchLinks} branch links</span>
                        </div>
                    </div>
                    <button type="button" class="unidex-manhwa-divider unidex-subtabs-toggle"
                        aria-expanded="${expanded}"
                        title="${expanded ? 'Collapse' : 'Expand'} sub tabs"
                        onclick="window.UnidexView.toggleSubTabs(this)">
                        SUB TABS &middot; ${descendants}
                        <span class="unidex-subtabs-arrow">${arrow}</span>
                    </button>
                    <div class="unidex-tab-wrap-grid">
                        ${childHtml || emptyHtml}
                    </div>
                </article>`;
            }).join('');
        }

        function getCategoryModelsList(categoryModels) {
            return Array.isArray(categoryModels) ? categoryModels.filter(Boolean) : [];
        }

        function getCardSummary(categoryModels) {
            return getCategoryModelsList(categoryModels).reduce(function (summary, model) {
                const total = Number(model?.total || 0);
                const done = Number(model?.done || 0);
                const pending = Number(model?.pending || 0);
                summary.cards += 1;
                summary.links += Number.isFinite(total) ? total : 0;
                summary.done += Number.isFinite(done) ? done : 0;
                summary.pending += Number.isFinite(pending) ? pending : 0;
                if (model?.taskMode) summary.taskCards += 1;
                return summary;
            }, {
                cards: 0,
                links: 0,
                done: 0,
                pending: 0,
                taskCards: 0
            });
        }

        function buildWrappedCardsHtml(workspace, categoryModels, options) {
            const settings = options || {};
            const models = getCategoryModelsList(categoryModels);
            const summary = getCardSummary(models);
            const name = getWorkspaceName(workspace);
            const rawIcon = getWorkspaceIcon(workspace);
            const safeIcon = rawIcon ? escapeHtml(rawIcon) : '&#128193;';
            const safeName = escapeHtml(name);
            const encodedId = encodeParam(workspace?.id || '');
            const depth = Math.max(0, Number(settings.depth) || 0);
            const depthClass = ' unidex-card-wrapper-depth-' + Math.min(depth, 4);
            const rootClass = settings.root ? ' is-root-card-wrapper' : ' is-sub-card-wrapper';
            const sectionLabel = escapeHtml(settings.sectionLabel || 'CARDS');
            const badgeHtml = settings.badge
                ? `<span class="unidex-card-wrapper-badge">${escapeHtml(settings.badge)}</span>`
                : '';
            const pathHtml = settings.pathLabel
                ? `<span class="unidex-card-wrapper-path">${escapeHtml(settings.pathLabel)}</span>`
                : '';
            const openTabAttr = encodedId
                ? ` onclick="window.UnidexView.switchWorkspaceTab('${encodedId}')"`
                : '';
            const cardsHtml = models.length
                ? buildCardsHtml(models)
                : `<div class="unidex-card-wrap-empty">NO CARDS IN THIS TAB</div>`;

            return `<article class="unidex-card-wrapper-frame${rootClass}${depthClass}">
                <div class="unidex-card-frame-top-beam" aria-hidden="true"></div>
                <div class="unidex-card-frame-left-glow" aria-hidden="true"></div>
                <div class="unidex-card-scan-beam" aria-hidden="true"></div>
                <div class="unidex-card-frame-corner is-top-left" aria-hidden="true"></div>
                <div class="unidex-card-frame-corner is-top-right" aria-hidden="true"></div>
                <div class="unidex-card-frame-corner is-bottom-left" aria-hidden="true"></div>
                <div class="unidex-card-frame-corner is-bottom-right" aria-hidden="true"></div>
                <div class="unidex-card-wrapper-header">
                    <button type="button" class="unidex-card-wrapper-tab"${openTabAttr} title="Open ${safeName} tab">
                        <span class="unidex-card-wrapper-title">${safeIcon} ${safeName}</span>
                        ${pathHtml}
                        ${badgeHtml}
                    </button>
                    <div class="unidex-card-wrapper-stats">
                        <span>${summary.cards} cards</span>
                        <span>${summary.links} links</span>
                        <span>${summary.taskCards} tracked</span>
                    </div>
                </div>
                <div class="unidex-manhwa-divider">${sectionLabel}</div>
                <section class="unidex-cards unidex-cards-wrap-grid" aria-label="${safeName} Cards">
                    ${cardsHtml}
                </section>
            </article>`;
        }

        function buildTabsHtml(options) {
            const mode = String(options?.mode || 'wrapped');
            if (mode === 'wrapped') return buildWrappedTabsHtml();

            const helpers = window.EveWorkspaceHelpers;
            const workspaces = config.workspaces || [];
            const tabHtmlParts = [];

            function buildTab(workspace, depth) {
                if (workspace.inactive && !shouldShowInactiveTabs()) return;
                const workspaceCount = getWorkspaceBookmarkCount(workspace.id);

                const encodedId = encodeParam(workspace.id);
                const safeName = escapeHtml(workspace.name);
                const safeIcon = escapeHtml(workspace.icon || '');
                const hiddenMarker = (depth > 0 && workspace.hiddenInParent) ? ' <span class="unidex-tab-hidden">👁‍🗨</span>' : '';
                const inactiveMarker = workspace.inactive ? ' <span class="unidex-tab-inactive-tag">inactive</span>' : '';
                const depthClass = depth > 0 ? ' unidex-tab-sub unidex-tab-depth-' + Math.min(depth, 4) : '';
                const hiddenClass = (depth > 0 && workspace.hiddenInParent) ? ' unidex-tab-is-hidden' : '';
                const inactiveClass = workspace.inactive ? ' unidex-tab-is-inactive-state' : '';

                const btnHtml = `<button type="button"
                    class="unidex-tab-btn${depthClass}${hiddenClass}${inactiveClass}"
                    data-text="${safeName.toUpperCase()}"
                    data-ws-depth="${depth}"
                    onclick="window.UnidexView.switchWorkspaceTab('${encodedId}')"
                    title="${workspace.inactive ? safeName + ' is inactive' : 'Open ' + safeName}">
                    <span class="unidex-tab-main">${safeIcon} ${safeName}${hiddenMarker}${inactiveMarker}</span>
                    <span class="unidex-tab-count">${workspaceCount} links</span>
                </button>`;

                if (depth > 0) {
                    tabHtmlParts.push(`<div class="unidex-tab-row unidex-tab-row-depth-${Math.min(depth, 4)}"><span class="unidex-tab-connector">└</span>${btnHtml}</div>`);
                } else {
                    tabHtmlParts.push(btnHtml);
                }
            }

            if (helpers) {
                helpers.walk(workspaces, buildTab);
            } else {
                workspaces.forEach(function (ws) { buildTab(ws, 0); });
            }

            return tabHtmlParts.join('');
        }

        function buildCardsHtml(categoryModels) {
            if (categoryModels.length === 0) {
                return `
                <div class="unidex-empty-state">
                    <h3>No Cards Yet</h3>
                    <p>This workspace has no categories for the current search.</p>
                </div>
            `;
            }

            return categoryModels.map(function (model) {
                const safeCategory = escapeHtml(model.category);
                const encodedCategory = encodeParam(model.category);
                const progress = model.total > 0 ? Math.round((model.done / model.total) * 100) : 0;
                const metaText = model.taskMode
                    ? `Done: ${model.done} | Pending: ${model.pending}`
                    : `${model.total} links`;
                const progressHtml = model.taskMode
                    ? `<div class="unidex-card-progress"><div class="unidex-card-progress-fill" style="width:${progress}%"></div></div>`
                    : '';

                return `
                <article class="unidex-card ${model.taskMode ? 'is-task-mode' : 'is-link-mode'}" title="${safeCategory}">
                    <button type="button" class="unidex-card-hit"
                        data-text="${safeCategory.toUpperCase()}"
                        onclick="window.UnidexView.selectCategory('${encodedCategory}')"
                        aria-label="Open ${safeCategory}">
                        <div class="unidex-card-header">
                            <h3 class="unidex-card-title">${safeCategory}</h3>
                            <span class="unidex-card-pill">${model.total}</span>
                        </div>
                        <p class="unidex-card-meta">${metaText}</p>
                        ${progressHtml}
                    </button>
                </article>
            `;
            }).join('');
        }

        return {
            buildTabsHtml,
            buildCardsHtml,
            buildWrappedCardsHtml
        };
    };
})();
