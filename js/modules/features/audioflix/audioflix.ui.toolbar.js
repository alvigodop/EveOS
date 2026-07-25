// The Audioflix toolbar row (Add Track/Sound, Edit Folders, Import Playlist, Localize, Music Port,
// Nexus Audio Link, Classifiers, Groups, Backend/Frontend) plus the panels it expands. Split out of
// audioflix.ui.js to keep that view under the project line cap; every renderer and open-flag it needs
// arrives late-bound through `ctx`.
window.EveAudioflixUiToolbar = window.EveAudioflixUiToolbar || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiToolbar;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        const { esc, state, uiNexus, uiClass } = ctx;
        const renderForm = ctx.renderForm, renderImportPlaylistForm = ctx.renderImportPlaylistForm;
        const renderLocalizeForm = ctx.renderLocalizeForm, renderMusicPortForm = ctx.renderMusicPortForm;
        const renderFoldersManager = ctx.renderFoldersManager, renderGroupsManager = ctx.renderGroupsManager;
        const renderPortsManager = ctx.renderPortsManager;
        // Open-flags are read fresh on every render through the host view's bag.
        const F = () => ctx.getFlags();

        const renderAddSection = (type) => {
            const isM = type === 'music';
            const isF = (isM ? (state().musicViewMode || 'backend') : (state().soundboardViewMode || 'backend')) === 'frontend';
            const open = F().addFormOpen[type] === true;
            const isLocOpen = F().localizeFormOpen.open === true;
            const vBtn = `<button type="button" class="audioflix-view-toggle${isF ? ' is-active' : ''}" data-af-action="toggle-view-mode" data-af-type="${esc(type)}">${isF ? 'Backend' : 'Frontend'}</button>`;
            const gBtn = `<button type="button" class="audioflix-add-toggle${F().groupsOpen[type] ? ' is-active' : ''}" data-af-action="toggle-groups" data-af-type="${esc(type)}">Groups</button>`;
            const fBtn = isM ? `<button type="button" class="audioflix-add-toggle${F().foldersOpen.music ? ' is-active' : ''}" data-af-action="toggle-folders" data-af-type="music">Edit Folders</button>` : '';
            const pBtn = isM ? `<button type="button" class="audioflix-add-toggle${F().importFormOpen ? ' is-active' : ''}" data-af-action="toggle-import-form">Import Playlist</button>` : '';
            const isLibLocOpen = isLocOpen && F().localizeFormOpen.scope === 'library';
            const lBtn = isM ? `<button type="button" class="audioflix-add-toggle${isLibLocOpen ? ' is-active' : ''}" data-af-action="toggle-localize-form" data-af-scope="library" title="Download online tracks to local files (needs localhost)">Localize</button><button type="button" class="audioflix-add-toggle${F().musicPortFormOpen ? ' is-active' : ''}" data-af-action="toggle-music-port-form" title="Extract local folder music into a Folder tag">Music Port</button>` : '';
            const nBtn = uiNexus.renderButton(type);
            const cBtn = isM ? uiClass.renderButton() : '';
            const cPanel = (isM && F().classifierManagerOpen) ? uiClass.renderManager() : '';
            const nPanel = (F().nexusState.open && F().nexusState.type === type) ? uiNexus.renderPanel(type) : '';
            if (isM) {
                return isF
                    ? `<div class="audioflix-add-section-row">${nBtn}${cBtn}${gBtn}${vBtn}</div>${nPanel}${cPanel}${F().groupsOpen.music ? renderGroupsManager('music') : ''}`
                    : `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${open ? 'is-open' : ''}"><button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="music">${open ? '− Hide add track' : '+ Add Track'}</button></div>${fBtn}${pBtn}${lBtn}${nBtn}${cBtn}${gBtn}${vBtn}</div>${nPanel}${cPanel}${open ? renderForm('music') : ''}${F().importFormOpen ? renderImportPlaylistForm() : ''}${isLibLocOpen ? renderLocalizeForm() : ''}${F().musicPortFormOpen ? renderMusicPortForm() : ''}${F().foldersOpen.music ? renderFoldersManager() : ''}${F().groupsOpen.music ? renderGroupsManager('music') : ''}`;
            }
            return isF
                ? `<div class="audioflix-add-section-row">${nBtn}${gBtn}${vBtn}</div>${nPanel}${F().groupsOpen.sound ? renderGroupsManager('sound') : ''}`
                : `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${open ? 'is-open' : ''}"><button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="sound">${open ? '− Hide add sound' : '+ Add Sound'}</button></div><button type="button" class="audioflix-add-toggle" data-af-action="toggle-ports">Ports</button>${nBtn}${gBtn}${vBtn}</div>${nPanel}${open ? renderForm('sound') : ''}${F().portsOpen ? renderPortsManager() : ''}${F().groupsOpen.sound ? renderGroupsManager('sound') : ''}`;
        };

        return renderAddSection;
    };

    ns.ready = true;
})();
