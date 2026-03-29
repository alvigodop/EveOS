window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core || {};
    const runtime = ns._main = ns._main || {};
    if (runtime.presentationLoaded) return;

    const {
        getLinkById,
        getTargetContext,
        getFolderApi,
        normalizeTargetVisibilityScopeType
    } = core;

    function getPinLabel(pin) {
        const context = getTargetContext(pin);
        if (!context) return '';
        if (pin.targetType === 'bookmark') {
            const link = getLinkById(pin.targetId);
            return String(link?.title || 'Bookmark').trim() || 'Bookmark';
        }
        if (pin.targetType === 'card') {
            return context.categoryName;
        }
        if (pin.targetType === 'folder') {
            const folder = getFolderApi()?.getFolderById?.(context.workspaceId, context.categoryName, context.folderId);
            return String(folder?.name || 'Folder').trim() || 'Folder';
        }
        return '';
    }

    function getPinMeta(pin) {
        const context = getTargetContext(pin);
        if (!context) return '';
        if (pin.targetType === 'bookmark') {
            const folderLabel = context.folderId
                ? (getFolderApi()?.buildFolderPathLabel?.(context.workspaceId, context.categoryName, context.folderId) || '')
                : 'Root';
            const scopeLabel = pin.scopeType === 'folder'
                ? 'Folder scoped'
                : (pin.scopeType === 'card' ? 'Card scoped' : 'Tab scoped');
            return `${context.categoryName} | ${folderLabel} | ${scopeLabel}`;
        }
        if (pin.targetType === 'card') {
            const scopeLabel = normalizeTargetVisibilityScopeType(pin.scopeType) === 'card' ? 'Focused card only' : 'Tab scoped';
            return `${context.categoryName} card | ${scopeLabel}`;
        }
        if (pin.targetType === 'folder') {
            const scopeLabel = normalizeTargetVisibilityScopeType(pin.scopeType) === 'card' ? 'Focused card only' : 'Tab scoped';
            return `${context.categoryName} | Folder | ${scopeLabel}`;
        }
        return '';
    }

    function getPinIcon(pin) {
        if (pin.targetType === 'bookmark') {
            const link = getLinkById(pin.targetId);
            return String(link?.icon || '').trim() || '\u{1F517}';
        }
        if (pin.targetType === 'card') return '\u{1F5C2}';
        if (pin.targetType === 'folder') return '\u{1F4C1}';
        return '\u{1F4CC}';
    }

    Object.assign(runtime, {
        getPinLabel,
        getPinMeta,
        getPinIcon
    });

    runtime.presentationLoaded = true;
})();
