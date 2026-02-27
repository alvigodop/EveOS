window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (!Array.isArray(window.tempSources)) {
        window.tempSources = [];
    }

    function normalizeManualIcon(iconValue) {
        const value = String(iconValue || '').trim();
        const normalized = value.replace(/\uFE0F/g, '');
        // Empty (or legacy link icon) means auto favicon behavior.
        if (!normalized) return '';
        if (normalized === '\u{1F517}') return '';
        return value;
    }

    window.toggleLibraryFieldsCollapse = function () {
        const toggle = ns.getLibraryFormToggle();
        if (!toggle?.checked) return;
        ns.setLibraryFieldsCollapsed(!ns.isLibraryFieldsCollapsed);
    };

    window.applySourceMetadataFromAttachedSource = function (index) {
        ns.applySourceMetadataFromAttachedSource(index);
    };

    window.openAddModal = function () {
        document.getElementById('modalTitle').innerText = "Add Link";
        document.getElementById('editId').value = "";
        refreshCategoryDatalist();
        document.getElementById('newTitle').value = "";
        document.getElementById('newUrl').value = "";
        document.getElementById('newCategory').value = "";
        document.getElementById('newPriority').value = "";
        document.getElementById('newIcon').value = "";

        window.tempSources = [];
        renderSourcesList();
        document.getElementById('edit-link-search-results').style.display = 'none';

        ns.setupLibraryToggleHandlers();
        ns.refreshLibraryStatusOptions('Unsorted');
        const toggle = ns.getLibraryFormToggle();
        if (toggle) toggle.checked = false;
        ns.setLibraryFieldsCollapsed(false);
        ns.setLibraryFieldsVisibility(false);
        ns.resetLibraryForm();

        document.getElementById('addModal').style.display = 'flex';
        if (typeof hideCategoryQuickPicker === 'function') hideCategoryQuickPicker();
        document.getElementById('newTitle').focus();
    };

    window.openEdit = function (id) {
        const targetId = String(id);
        const l = links.find(x => String(x?.id) === targetId);
        if (!l) return;
        document.getElementById('modalTitle').innerText = "Edit Link";
        document.getElementById('editId').value = l.id;
        refreshCategoryDatalist();
        document.getElementById('newTitle').value = l.title;
        document.getElementById('newUrl').value = l.url;
        document.getElementById('newCategory').value = l.category;
        document.getElementById('newPriority').value = l.priority || "";
        document.getElementById('newIcon').value = normalizeManualIcon(l.icon);

        window.tempSources = l.sources ? [...l.sources] : [];
        renderSourcesList();
        document.getElementById('edit-link-search-results').style.display = 'none';

        ns.setupLibraryToggleHandlers();
        ns.loadLibraryStateForLink(l.id, l.category || 'Unsorted');

        document.getElementById('addModal').style.display = 'flex';
        if (typeof hideCategoryQuickPicker === 'function') hideCategoryQuickPicker();
    };

    window.saveLink = function () {
        const title = document.getElementById('newTitle').value.trim();
        const url = normalizeUrl(document.getElementById('newUrl').value);
        const cat = document.getElementById('newCategory').value.trim() || "Unsorted";
        const prio = document.getElementById('newPriority').value;
        const icon = normalizeManualIcon(document.getElementById('newIcon').value);

        if (!title || !url) return showToast("Missing Info", "warning");

        let targetId = null;
        const editId = document.getElementById('editId').value;
        if (editId) {
            const idx = links.findIndex(l => l.id == editId);
            if (idx > -1) {
                links[idx].title = title;
                links[idx].url = url;
                links[idx].category = cat;
                links[idx].priority = prio;
                links[idx].icon = icon;
                links[idx].sources = [...window.tempSources];
                targetId = links[idx].id;
            }
        } else {
            const newId = Date.now();
            links.push({
                id: newId,
                title,
                url,
                category: cat,
                icon,
                done: false,
                pinned: false,
                priority: prio,
                workspace: config.activeWorkspace,
                sources: [...window.tempSources]
            });
            targetId = newId;
        }

        saveData();

        if (targetId) {
            ns.saveLibraryLinkState(targetId, cat, title, url);
            if (editId && window.EveLibrary?.ConnectionsAPI?.syncFromLink) {
                window.EveLibrary.ConnectionsAPI.syncFromLink(editId);
            }
        }

        closeModals();
        showToast("Link Saved", "success");
    };

    window.handleEnter = function (e) {
        if (e.key === 'Enter') saveLink();
    };

    if (!window.__eveLibraryBookmarkModalRealtimeBound) {
        window.__eveLibraryBookmarkModalRealtimeBound = true;
        window.addEventListener('eve:library-link-updated', (event) => {
            const detail = event?.detail || {};
            const editId = document.getElementById('editId')?.value;
            const modalOpen = document.getElementById('addModal')?.style?.display === 'flex';
            if (!modalOpen || !editId) return;
            if (String(detail.linkId) !== String(editId)) return;

            const entry = detail.entry || null;
            if (!entry) return;

            const toggle = ns.getLibraryFormToggle();
            if (toggle) toggle.checked = true;
            ns.setLibraryFieldsVisibility(true);
            ns.fillLibraryForm(entry);
            const titleField = document.getElementById('newTitle');
            if (titleField && !titleField.matches(':focus')) {
                titleField.value = entry.title || titleField.value;
            }
            const urlField = document.getElementById('newUrl');
            if (urlField && !urlField.matches(':focus') && entry.sourceUrl) {
                urlField.value = entry.sourceUrl;
            }
        });
    }
})(window.EveLinkForm);
