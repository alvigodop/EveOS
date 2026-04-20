window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;

    function ensureUnidexMode() {
        if (typeof config === 'undefined') return;
        if (config.viewMode !== 'unidex') {
            config.viewMode = 'unidex';
            if (typeof saveConfig === 'function') saveConfig();
        }
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function ensureGridMode() {
        if (typeof config === 'undefined') return;
        if (config.viewMode !== 'grid') {
            config.viewMode = 'grid';
            if (typeof saveConfig === 'function') saveConfig();
        }
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function focusBookmark(result) {
        const linkId = String(result?.path?.linkId || result?.provenance?.linkId || '').trim();
        if (!linkId || typeof window.openBookmarkFocusModal !== 'function') return false;
        return window.openBookmarkFocusModal(linkId);
    }

    function scrollFolderIntoView(path) {
        if (!path?.workspaceId || !path?.categoryName) return false;
        const pinApi = window.EveQuickPins;
        if (path.folderId && pinApi?._main?.activateFolderPin && typeof pinApi.buildFolderTargetId === 'function') {
            return pinApi._main.activateFolderPin({
                targetId: pinApi.buildFolderTargetId(path.workspaceId, path.categoryName, path.folderId)
            });
        }
        if (pinApi?._main?.activateCardTarget) {
            return pinApi._main.activateCardTarget(path.workspaceId, path.categoryName);
        }
        if (typeof switchWorkspace === 'function') switchWorkspace(path.workspaceId);
        if (typeof setFocus === 'function') setFocus(path.categoryName);
        if (typeof renderDashboard === 'function') renderDashboard();
        return true;
    }

    function goToPath(result, options) {
        const path = result?.path;
        if (!path?.workspaceId || !path?.categoryName) return false;
        ensureGridMode();
        const moved = scrollFolderIntoView(path);
        if (!moved) return false;
        if (options?.focusBookmark) {
            window.setTimeout(function () {
                focusBookmark(result);
            }, 180);
        }
        return true;
    }

    function openInUnidex(result) {
        const path = result?.path;
        if (!path?.workspaceId) return false;
        ensureUnidexMode();
        window.setTimeout(function () {
            const unidex = window.UnidexView;
            if (!unidex) return;
            if (typeof unidex.resetSelection === 'function') unidex.resetSelection();
            if (typeof unidex.switchWorkspaceTab === 'function') {
                unidex.switchWorkspaceTab(path.workspaceId);
            }
            if (path.categoryName && typeof unidex.selectCategory === 'function') {
                window.setTimeout(function () {
                    unidex.selectCategory(path.categoryName);
                }, 120);
            }
        }, 80);
        return true;
    }

    function describePath(path) {
        if (!path) return '';
        const parts = [];
        if (path.workspaceLabel) parts.push(path.workspaceLabel);
        if (path.categoryName) parts.push(path.categoryName);
        if (path.folderLabel) parts.push(path.folderLabel);
        return parts.join(' > ');
    }

    function describeProvenance(result) {
        const lines = [];
        const path = result?.path;
        const provenance = result?.provenance || {};

        if (path?.pathLabel) lines.push('Path: ' + path.pathLabel);
        if (path?.ambiguousWorkspace) {
            lines.push('Workspace resolution: multiple tabs matched; using ' + (path.workspaceLabel || path.workspaceId));
        }
        if (provenance.kind === 'bookmark') {
            if (provenance.linkId) lines.push('Bookmark ID: ' + provenance.linkId);
            if (provenance.done) lines.push('State: marked done');
            if (provenance.orphaned) lines.push('State: orphaned workspace reference');
            if (Array.isArray(provenance.tags) && provenance.tags.length) {
                lines.push('Tags: ' + provenance.tags.join(', '));
            }
        }
        if (provenance.kind === 'cached') {
            if (provenance.sourceQuery) lines.push('Cached query: ' + provenance.sourceQuery);
            if (provenance.provider) lines.push('Provider: ' + provenance.provider);
            const providers = Object.keys(provenance.perSource || {});
            if (providers.length) lines.push('Cache providers: ' + providers.join(', '));
        }
        if (provenance.kind === 'knowledge') {
            if (provenance.wikipediaTitle) lines.push('Wikipedia: ' + provenance.wikipediaTitle);
            if (provenance.fandomDomain) lines.push('Fandom: ' + provenance.fandomDomain);
            if (Array.isArray(provenance.apiQueries) && provenance.apiQueries.length) {
                lines.push('API queries: ' + provenance.apiQueries.join(', '));
            }
            if (Array.isArray(provenance.aliases) && provenance.aliases.length) {
                lines.push('Aliases: ' + provenance.aliases.join(', '));
            }
        }

        return lines;
    }

    ns.Navigation = {
        goToPath,
        openInUnidex,
        focusBookmark,
        describePath,
        describeProvenance
    };
})();
