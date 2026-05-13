window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const ns = window.EveContextMenuActions;
    if (ns.jsonLinkReady) return;

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function getLinkApi() {
        return window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
    }

    function getWorkspaceId() {
        return text(window.ctxWsId || window.config?.activeWorkspace, 'main');
    }

    function toast(message, type = 'info') {
        if (typeof showToast === 'function') showToast(message, type);
    }

    function createContextEntityLink(kind) {
        const api = getLinkApi();
        if (!api?.createLink) return '';
        if (kind === 'workspace') {
            return api.createLink({ type: 'workspace', workspaceId: getWorkspaceId() });
        }
        if (kind === 'card') {
            return api.createLink({
                type: 'card',
                workspaceId: getWorkspaceId(),
                categoryName: text(window.ctxCatName, 'Unsorted')
            });
        }
        if (kind === 'folder') {
            return api.createLink({
                type: 'folder',
                workspaceId: getWorkspaceId(),
                categoryName: text(window.ctxCatName, 'Unsorted'),
                folderId: text(window.ctxFolderId, '')
            });
        }
        if (kind === 'bookmark') {
            const link = ns.getCtxLink?.();
            return link ? api.createLink(link) : '';
        }
        return '';
    }

    function runLinkAction(kind, actionId) {
        const api = getLinkApi();
        if (!api?.executeAction) {
            toast('Nebula JSON Link resolver is not loaded yet.', 'warning');
            return null;
        }
        const entityLink = createContextEntityLink(kind);
        if (!entityLink) {
            toast('No entity link could be built for this item.', 'warning');
            return null;
        }
        const outcome = api.executeAction(actionId, entityLink);
        if (actionId === 'validate') {
            const issues = []
                .concat(outcome?.errors || [])
                .concat(outcome?.warnings || []);
            if (outcome?.valid || outcome?.ok) {
                const label = outcome?.resolution?.path?.breadcrumbLabel || entityLink;
                toast('Entity link is valid: ' + label, 'success');
            } else {
                toast('Entity link issue: ' + (issues.join(', ') || 'invalid link'), 'warning');
            }
        } else if (!outcome?.ok) {
            toast('JSON State action failed: ' + ((outcome?.errors || []).join(', ') || 'target unavailable'), 'warning');
        }
        if (typeof closeAllMenus === 'function') closeAllMenus();
        return outcome;
    }

    window.ctxWsValidateJsonLink = function () {
        runLinkAction('workspace', 'validate');
    };

    window.ctxCatOpenJsonState = function () {
        runLinkAction('card', 'open-json-state');
    };

    window.ctxCatValidateJsonLink = function () {
        runLinkAction('card', 'validate');
    };

    window.ctxFolderOpenJsonState = function () {
        runLinkAction('folder', 'open-json-state');
    };

    window.ctxFolderValidateJsonLink = function () {
        runLinkAction('folder', 'validate');
    };

    window.ctxLinkOpenJsonState = function () {
        runLinkAction('bookmark', 'open-json-state');
    };

    window.ctxLinkValidateJsonLink = function () {
        runLinkAction('bookmark', 'validate');
    };

    Object.assign(ns, {
        createContextEntityLink,
        runLinkAction
    });

    ns.jsonLinkReady = true;
})();
