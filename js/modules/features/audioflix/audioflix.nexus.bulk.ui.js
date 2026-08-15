// Lightweight controls for the Nexus Audio Link bulk organizer. Selection stays in transient UI
// state; only the final atomic operation reaches the datapack-backed Audioflix store.
window.EveAudioflixNexusBulkUi = window.EveAudioflixNexusBulkUi || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixNexusBulkUi;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const esc = deps.esc;
        const getState = deps.getNexusState;
        const audioState = () => window.EveAudioflixState?.ensure?.() || {};
        const bulkState = () => Object.assign({
            groupAction: 'add',
            group: '',
            classifierAction: 'add',
            classifier: '',
            folderAction: '',
            folder: ''
        }, getState()?.bulk || {});

        function options(values) {
            return (values || []).map((value) => `<option value="${esc(value)}"></option>`).join('');
        }

        function render(type, matchCount) {
            if (type !== 'music') return '';
            const snapshot = audioState();
            const view = getState() || {};
            const selectedCount = Array.isArray(view.selectedIds) ? view.selectedIds.length : 0;
            const bulk = bulkState();
            const folders = window.EveAudioflixBulk?.musicFolders?.() || [];
            const currentScope = window.EveAudioflixLinks?.inferCurrentScope?.() || {
                scopeType: 'workspace',
                workspaceId: window.eveState?.config?.activeWorkspace || 'main'
            };
            const currentScopeLabel = window.EveAudioflixLinks?.scopeLabel?.(currentScope)
                || String(currentScope.workspaceId || 'Current tab');
            const linkedCapture = window.EveAudioflixLinks?.captureForScope?.(currentScope, { directOnly: true });
            const linkedCount = Array.isArray(linkedCapture?.items) ? linkedCapture.items.length : 0;
            return `<section class="audioflix-bulk-manager">
                <div class="audioflix-bulk-head">
                    <div><strong>Bulk organize</strong><span><b data-af-bulk-selected-count>${selectedCount}</b> selected / <b data-af-bulk-match-count>${Number(matchCount) || 0}</b> matches</span></div>
                    <div>
                        <button type="button" data-af-action="nexus-select-all">Select all matches</button>
                        <button type="button" data-af-action="nexus-clear-selection">Clear</button>
                    </div>
                </div>
                <div class="audioflix-bulk-fields">
                    <label><span>Group</span><select data-af-bulk-field="groupAction">
                        <option value="add"${bulk.groupAction === 'add' ? ' selected' : ''}>Add to</option>
                        <option value="remove"${bulk.groupAction === 'remove' ? ' selected' : ''}>Remove from</option>
                    </select><input data-af-bulk-field="group" list="audioflix-bulk-groups" value="${esc(bulk.group)}" placeholder="Group name"></label>
                    <datalist id="audioflix-bulk-groups">${options(snapshot.musicGroups)}</datalist>
                    <label><span>Classifier</span><select data-af-bulk-field="classifierAction">
                        <option value="add"${bulk.classifierAction === 'add' ? ' selected' : ''}>Attach</option>
                        <option value="remove"${bulk.classifierAction === 'remove' ? ' selected' : ''}>Detach</option>
                    </select><input data-af-bulk-field="classifier" list="audioflix-bulk-classifiers" value="${esc(bulk.classifier)}" placeholder="Manual classifier"></label>
                    <datalist id="audioflix-bulk-classifiers">${options(snapshot.musicClassifiers)}</datalist>
                    <label><span>Folder</span><select data-af-bulk-field="folderAction">
                        <option value=""${!bulk.folderAction ? ' selected' : ''}>No change</option>
                        <option value="set"${bulk.folderAction === 'set' ? ' selected' : ''}>Move to</option>
                        <option value="clear"${bulk.folderAction === 'clear' ? ' selected' : ''}>Clear folder</option>
                    </select><input data-af-bulk-field="folder" list="audioflix-bulk-folders" value="${esc(bulk.folder)}" placeholder="Destination folder"></label>
                    <datalist id="audioflix-bulk-folders">${options(folders)}</datalist>
                </div>
                <div class="audioflix-bulk-foot">
                    <span>Filled operations are applied together in one durable transaction.</span>
                    <button type="button" class="is-primary" data-af-action="nexus-apply-bulk">Apply to selected</button>
                </div>
                <div class="audioflix-bulk-scope">
                    <div><strong>Link to EveOS</strong><span>${esc(currentScopeLabel)} · <b data-af-linked-count>${linkedCount}</b> linked</span></div>
                    <div>
                        <button type="button" class="is-primary" data-af-action="nexus-link-scope">Attach selected</button>
                        <button type="button" data-af-action="nexus-unlink-scope">Detach selected</button>
                    </div>
                </div>
            </section>`;
        }

        return { render };
    };

    ns.ready = true;
})();
