// Nexus Audio Link selection and bulk-edit actions. Kept outside the main dispatcher so scaled
// library management does not make Audioflix's general click router harder to maintain.
window.EveAudioflixUiActionsNexus = window.EveAudioflixUiActionsNexus || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiActionsNexus;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        function matchedMusic() {
            const view = ctx.nexusState || {};
            return window.EveAudioflixNexus?.filter?.({
                type: 'music',
                query: view.query,
                facet: view.facet
            }) || [];
        }

        return async function handleNexusAction(actionTarget, action) {
            const view = ctx.nexusState || {};
            if (action === 'nexus-select-all') {
                ctx.nexusState = Object.assign({}, view, {
                    selectedIds: matchedMusic().map((track) => track.id)
                });
                ctx.rerender();
                return true;
            }
            if (action === 'nexus-clear-selection') {
                ctx.nexusState = Object.assign({}, view, { selectedIds: [] });
                ctx.rerender();
                return true;
            }
            if (action === 'nexus-link-scope' || action === 'nexus-unlink-scope') {
                const selectedIds = view.selectedIds || [];
                if (!selectedIds.length) {
                    ctx.playbackStatus = 'Select at least one track to link.';
                    ctx.rerender();
                    return true;
                }
                const scope = window.EveAudioflixLinks?.inferCurrentScope?.();
                const result = action === 'nexus-link-scope'
                    ? window.EveAudioflixLinks?.add?.(selectedIds, scope, 'music')
                    : window.EveAudioflixLinks?.remove?.(selectedIds, scope, 'music');
                const changed = action === 'nexus-link-scope' ? result?.added : result?.removed;
                ctx.playbackStatus = result?.ok
                    ? `${Number(changed) || 0} track reference(s) ${action === 'nexus-link-scope' ? 'attached to' : 'detached from'} ${result.label || 'the current surface'}.`
                    : (result?.reason || 'Could not update EveOS audio links.');
                ctx.rerender();
                return true;
            }
            if (action !== 'nexus-apply-bulk') return false;

            const bulk = Object.assign({}, view.bulk || {});
            const changes = {
                addGroups: bulk.groupAction === 'add' && bulk.group ? [bulk.group] : [],
                removeGroups: bulk.groupAction === 'remove' && bulk.group ? [bulk.group] : [],
                addClassifiers: bulk.classifierAction === 'add' && bulk.classifier ? [bulk.classifier] : [],
                removeClassifiers: bulk.classifierAction === 'remove' && bulk.classifier ? [bulk.classifier] : [],
                folderAction: bulk.folderAction || '',
                folder: bulk.folder || ''
            };
            const hasChange = changes.addGroups.length || changes.removeGroups.length
                || changes.addClassifiers.length || changes.removeClassifiers.length
                || changes.folderAction;
            if (!hasChange) {
                ctx.playbackStatus = 'Choose at least one group, classifier, or folder operation.';
                ctx.rerender();
                return true;
            }

            const result = window.EveAudioflixBulk?.applyMusicChanges?.(view.selectedIds || [], changes);
            ctx.playbackStatus = result?.ok
                ? `${result.changed} of ${result.selected} selected track(s) updated in one transaction.`
                : (result?.reason || 'Bulk organization failed.');
            if (result?.ok) {
                ctx.nexusState = Object.assign({}, view, { selectedIds: [] });
            }
            ctx.rerender();
            return true;
        };
    };

    ns.ready = true;
})();
