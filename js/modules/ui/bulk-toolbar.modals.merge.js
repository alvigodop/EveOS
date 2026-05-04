// --- BULK TOOLBAR MERGE MODAL HELPERS ---
window.EveBulkToolbar = window.EveBulkToolbar || {};
window.EveBulkToolbar.ModalModules = window.EveBulkToolbar.ModalModules || {};

(function () {
    window.EveBulkToolbar.ModalModules.createMergeModalHelpers = function createMergeModalHelpers(deps) {
        const getSelectedLinks = deps.getSelectedLinks;
        const escapeBulkMoveHtml = deps.escapeBulkMoveHtml;
        const formatSelectionSummary = deps.formatSelectionSummary || function () { return ''; };

        function chooseDefaultBase(selectedLinks) {
            const mergeApi = window.EveBookmarkMerge;
            if (mergeApi && typeof mergeApi.mergeDuplicateGroup === 'function') {
                // Reuse the heuristic chooser via a dry preview: pick the most-linked
                // / longest-url / longest-title bookmark as the suggested base.
                const sorted = (selectedLinks || []).slice().sort((a, b) => {
                    const aLinked = !!window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(String(a?.id))?.entry ? 1 : 0;
                    const bLinked = !!window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(String(b?.id))?.entry ? 1 : 0;
                    if (aLinked !== bLinked) return bLinked - aLinked;
                    const aUrl = String(a?.url || '').length;
                    const bUrl = String(b?.url || '').length;
                    if (aUrl !== bUrl) return bUrl - aUrl;
                    return String(b?.title || '').length - String(a?.title || '').length;
                });
                if (sorted[0]) return String(sorted[0].id);
            }
            const first = (selectedLinks || []).find((link) => !!link?.id);
            return first ? String(first.id) : '';
        }

        function renderBasePicker() {
            const picker = document.getElementById('bulk-merge-base-picker');
            if (!picker) return;
            const links = getSelectedLinks();
            if (!links.length) {
                picker.innerHTML = '<p class="bulk-move-subtitle">Select bookmarks first.</p>';
                return;
            }
            const defaultId = chooseDefaultBase(links);
            picker.innerHTML = links.map((link, index) => {
                const id = String(link?.id || '');
                if (!id) return '';
                const title = escapeBulkMoveHtml(String(link?.title || 'Untitled').trim() || 'Untitled');
                const url = escapeBulkMoveHtml(String(link?.url || '').trim());
                const checked = id === defaultId ? ' checked' : '';
                return (
                    `<label class="bulk-merge-base-row">`
                    + `<input type="radio" name="bulkMergeBase" value="${escapeBulkMoveHtml(id)}"${checked}>`
                    + `<span class="bulk-merge-base-info">`
                    + `<span class="bulk-merge-base-title">${title}</span>`
                    + (url ? `<span class="bulk-merge-base-url">${url}</span>` : '')
                    + `</span>`
                    + `</label>`
                );
            }).join('') || '<p class="bulk-move-subtitle">Select bookmarks first.</p>';
        }

        function setBulkMergeMode(mode) {
            const isAll = mode === 'all';
            const titleRadio = document.querySelector('input[name="bulkMergeMode"][value="title"]');
            const allRadio = document.querySelector('input[name="bulkMergeMode"][value="all"]');
            if (titleRadio) titleRadio.checked = !isAll;
            if (allRadio) allRadio.checked = isAll;
            const picker = document.getElementById('bulk-merge-base-picker');
            if (picker) {
                picker.hidden = !isAll;
                if (isAll) renderBasePicker();
            }
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkMergeMode', mode);
        }

        function openBulkMergeModal() {
            const overlay = document.getElementById('bulk-merge-modal-overlay');
            if (!overlay) return;
            const summary = document.getElementById('bulk-merge-selection-summary');
            if (summary) summary.textContent = formatSelectionSummary();
            setBulkMergeMode('title');
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkMergeMode', 'title');
            overlay.style.display = 'flex';
        }

        function closeBulkMergeModal() {
            const overlay = document.getElementById('bulk-merge-modal-overlay');
            if (overlay) overlay.style.display = 'none';
        }

        function getBulkMergeMode() {
            return document.querySelector('input[name="bulkMergeMode"]:checked')?.value || 'title';
        }

        function getBulkMergeBaseId() {
            return String(document.querySelector('input[name="bulkMergeBase"]:checked')?.value || '').trim();
        }

        return {
            renderBulkMergeBasePicker: renderBasePicker,
            setBulkMergeMode,
            openBulkMergeModal,
            closeBulkMergeModal,
            getBulkMergeMode,
            getBulkMergeBaseId
        };
    };
})();
