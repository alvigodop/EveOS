(function () {
    const mod = window.EveCategorySettingsFolders = window.EveCategorySettingsFolders || {};
    if (mod.ready) return;
    if (!mod.renderStateReady || !mod.rowsReady || !mod.panelReady || !mod.formReady) {
        console.warn('[EveCategorySettingsFolders] Dependencies missing; folder settings facade not initialized.');
        return;
    }
    mod.ready = true;
})();
