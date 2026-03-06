// Unidex View Panel Builders Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    function identity(value) {
        return value;
    }

    window.UnidexViewModules.createPanelBuilders = function createPanelBuilders(deps) {
        const getAllLinks = deps?.getAllLinks || (() => []);
        const encodeParam = deps?.encodeParam || identity;
        const escapeHtml = deps?.escapeHtml || identity;

        function buildTabsHtml() {
            return (config.workspaces || []).map(function (workspace) {
                const workspaceCount = getAllLinks().filter(function (link) {
                    return String(link.workspace) === String(workspace.id);
                }).length;

                const encodedId = encodeParam(workspace.id);
                const safeName = escapeHtml(workspace.name);
                const safeIcon = escapeHtml(workspace.icon || '');

                return `
                <button type="button"
                    class="unidex-tab-btn"
                    data-text="${safeName.toUpperCase()}"
                    onclick="window.UnidexView.switchWorkspaceTab('${encodedId}')"
                    title="Open ${safeName}">
                    <span class="unidex-tab-main">${safeIcon} ${safeName}</span>
                    <span class="unidex-tab-count">${workspaceCount} links</span>
                </button>
            `;
            }).join('');
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
            buildCardsHtml
        };
    };
})();
