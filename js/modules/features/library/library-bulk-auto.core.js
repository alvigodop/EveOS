// --- BULK LIBRARY AUTO-ADD ---
(function () {
    let bulkLibraryCat = null;

    const Utils = window.EveLibrary?.BulkAutoUtils;
    const Api = window.EveLibrary?.BulkAutoApi;
    const Patch = window.EveLibrary?.BulkAutoPatch;

    if (!Utils || !Api || !Patch) {
        console.warn('[LibraryBulkAuto] Component modules missing (utils/api/patch).');
        return;
    }

    window.openBulkLibraryAutoModal = function (categoryName) {
        bulkLibraryCat = categoryName || 'Unsorted';
        const list = document.getElementById('bulkLibraryAutoList');
        const runButton = document.getElementById('btnRunBulkLibraryAuto');
        if (!list || !runButton) return;

        list.innerHTML = '';
        const categoryLinks = Patch.getCategoryLinks(bulkLibraryCat);
        if (!categoryLinks.length) {
            runButton.disabled = true;
            list.innerHTML = '<div style="padding:10px; color:#888;">No links in this category.</div>';
        } else {
            runButton.disabled = false;
            categoryLinks.forEach(link => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.padding = '6px 8px';
                row.style.borderBottom = '1px solid #333';
                row.innerHTML = `
                    <input type="checkbox" class="bulk-library-auto-check" data-id="${link.id}" style="margin-right:10px;" checked>
                    <div style="flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
                        <div style="font-weight:bold; font-size:0.9rem;">${Utils.escapeHtml(link.title || 'Untitled')}</div>
                        <div style="color:#666; font-size:0.8rem;">${Utils.escapeHtml(link.url || '')}</div>
                    </div>
                    <span id="bulk-lib-status-${link.id}" style="font-size:0.8rem; color:#999;">-</span>
                `;
                list.appendChild(row);
            });
        }

        const modal = document.getElementById('bulkLibraryAutoModal');
        if (modal) modal.style.display = 'flex';
    };

    window.toggleAllBulkLibraryAuto = function (checked) {
        document.querySelectorAll('.bulk-library-auto-check').forEach(checkbox => {
            checkbox.checked = !!checked;
        });
    };

    window.runBulkLibraryAutoUpdate = async function () {
        const selected = Array.from(document.querySelectorAll('.bulk-library-auto-check:checked'));
        if (!selected.length) {
            showToast('Select at least one bookmark.', 'warning');
            return;
        }

        try {
            Api.ensureDependencies();
        } catch (error) {
            showToast(error.message || 'Required modules are not loaded.', 'error');
            return;
        }

        const runButton = document.getElementById('btnRunBulkLibraryAuto');
        if (!runButton) return;
        const originalText = runButton.innerText;
        runButton.disabled = true;
        runButton.innerText = 'Processing...';

        const connections = window.EveLibrary.ConnectionsAPI;
        let processed = 0;
        let created = 0;
        let failed = 0;
        let providerMatches = 0;

        for (const checkbox of selected) {
            const id = checkbox.getAttribute('data-id');
            const link = links.find(item => String(item.id) === String(id));
            const status = document.getElementById(`bulk-lib-status-${id}`);
            if (!link) {
                failed++;
                if (status) status.textContent = 'ERR';
                continue;
            }

            if (status) {
                status.textContent = '...';
                status.style.color = '#999';
            }

            try {
                const matchedSources = await Api.findExactSourcesForTitle(link.title || '');
                link.sources = matchedSources;

                const hadConnection = !!connections.findConnectionByLinkId(link.id);
                if (!hadConnection) {
                    connections.promoteLink(link.id);
                    created++;
                }
                connections.moveLinkedEntryToCategory(link.id, bulkLibraryCat || link.category || 'Unsorted');

                const linked = connections.getLinkedEntry(link.id);
                if (!linked?.entry) throw new Error('Failed to load linked entry');

                const patch = Patch.buildLibraryPatch(link, linked.entry, matchedSources);
                connections.updateLinkedEntry(link.id, patch);

                processed++;
                providerMatches += matchedSources.length;
                if (status) {
                    status.textContent = `${matchedSources.length}/3`;
                    status.style.color = '#8bc34a';
                    status.title = 'Matched provider sources (strict exact title)';
                }
            } catch (error) {
                failed++;
                if (status) {
                    status.textContent = 'ERR';
                    status.style.color = '#f44336';
                    status.title = String(error?.message || error);
                }
            }
        }

        if (typeof saveData === 'function') saveData();

        runButton.disabled = false;
        runButton.innerText = originalText;

        const summary = `Auto library update done: ${processed} processed, ${created} new entries, ${providerMatches} provider matches${failed ? `, ${failed} failed` : ''}.`;
        showToast(summary, failed ? 'warning' : 'success');
    };
})();
