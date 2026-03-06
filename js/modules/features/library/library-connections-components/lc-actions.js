window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCore = window.EveLibrary.ConnectionsCore || {};
window.EveLibrary.ConnectionsCoreModules = window.EveLibrary.ConnectionsCoreModules || {};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;
    const Modules = window.EveLibrary.ConnectionsCoreModules;

    if (!Core.findEntryByConnection || !Core.saveConnections || !Core.getDefaultStatus) {
        console.warn('[EveLibrary.ConnectionsCore] lc-state.js and lc-entry-lookup.js must load before lc-actions.js.');
        return;
    }

    const promoteActions = typeof Modules.createActionsPromote === 'function'
        ? Modules.createActionsPromote(Core)
        : {};
    const syncActions = typeof Modules.createActionsSync === 'function'
        ? Modules.createActionsSync(Core)
        : {};

    Object.assign(Core, promoteActions, syncActions);
})();
