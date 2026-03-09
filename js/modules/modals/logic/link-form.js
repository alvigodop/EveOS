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

    function ensureAddModalElements() {
        if (!document.getElementById('addModal') && typeof initModals === 'function') {
            initModals();
        }

        const elements = {
            addModal: document.getElementById('addModal'),
            modalTitle: document.getElementById('modalTitle'),
            editId: document.getElementById('editId'),
            newTitle: document.getElementById('newTitle'),
            newUrl: document.getElementById('newUrl'),
            newCategory: document.getElementById('newCategory'),
            newFolderId: document.getElementById('newFolderId'),
            newPriority: document.getElementById('newPriority'),
            newIcon: document.getElementById('newIcon'),
            searchResults: document.getElementById('edit-link-search-results')
        };

        const missing = Object.entries(elements)
            .filter(([, el]) => !el)
            .map(([name]) => name);
        if (!missing.length) return elements;

        console.warn(`[LinkForm] Missing modal elements: ${missing.join(', ')}`);
        if (typeof showToast === 'function') {
            showToast('Link modal is not ready yet. Please try again.', 'warning');
        }
        return null;
    }

    window.toggleLibraryFieldsCollapse = function () {
        const toggle = ns.getLibraryFormToggle();
        if (!toggle?.checked) return;
        ns.setLibraryFieldsCollapsed(!ns.isLibraryFieldsCollapsed);
    };

    window.applySourceMetadataFromAttachedSource = function (index) {
        ns.applySourceMetadataFromAttachedSource(index);
    };

    function resolveAddModalPrefs(preferredCategory) {
        if (preferredCategory && typeof preferredCategory === 'object') {
            return {
                category: String(preferredCategory.category || preferredCategory.categoryName || '').trim(),
                folderId: String(preferredCategory.folderId || '').trim()
            };
        }
        return {
            category: String(preferredCategory || '').trim(),
            folderId: ''
        };
    }

    window.openAddModal = function (preferredCategory) {
        const prefs = resolveAddModalPrefs(preferredCategory);
        var initialCategory = prefs.category;
        const modal = ensureAddModalElements();
        if (!modal) return;

        modal.modalTitle.innerText = "Add Link";
        modal.editId.value = "";
        refreshCategoryDatalist();
        modal.newTitle.value = "";
        modal.newUrl.value = "";
        modal.newCategory.value = initialCategory;
        if (window.EveBookmarkFolders?.refreshEditorFolderSelect) {
            window.EveBookmarkFolders.refreshEditorFolderSelect(prefs.folderId);
        } else if (modal.newFolderId) {
            modal.newFolderId.value = '';
        }
        modal.newPriority.value = "";
        modal.newIcon.value = "";

        window.tempSources = [];
        renderSourcesList();
        modal.searchResults.style.display = 'none';

        ns.setupLibraryToggleHandlers();
        ns.refreshLibraryStatusOptions(initialCategory || 'Unsorted');
        const toggle = ns.getLibraryFormToggle();
        if (toggle) toggle.checked = false;
        ns.setLibraryFieldsCollapsed(false);
        ns.setLibraryFieldsVisibility(false);
        ns.resetLibraryForm();

        modal.addModal.style.display = 'flex';
        if (typeof hideCategoryQuickPicker === 'function') hideCategoryQuickPicker();
        modal.newTitle.focus();
    };

    window.openEdit = function (id) {
        const targetId = String(id);
        const l = links.find(x => String(x?.id) === targetId);
        if (!l) return;
        const modal = ensureAddModalElements();
        if (!modal) return;

        modal.modalTitle.innerText = "Edit Link";
        modal.editId.value = l.id;
        refreshCategoryDatalist();
        modal.newTitle.value = l.title;
        modal.newUrl.value = l.url;
        modal.newCategory.value = l.category;
        if (window.EveBookmarkFolders?.refreshEditorFolderSelect) {
            window.EveBookmarkFolders.refreshEditorFolderSelect(String(l.folderId || '').trim());
        } else if (modal.newFolderId) {
            modal.newFolderId.value = String(l.folderId || '').trim();
        }
        modal.newPriority.value = l.priority || "";
        modal.newIcon.value = normalizeManualIcon(l.icon);

        window.tempSources = l.sources ? [...l.sources] : [];
        renderSourcesList();
        modal.searchResults.style.display = 'none';

        ns.setupLibraryToggleHandlers();
        ns.loadLibraryStateForLink(l.id, l.category || 'Unsorted');

        modal.addModal.style.display = 'flex';
        if (typeof hideCategoryQuickPicker === 'function') hideCategoryQuickPicker();
    };

    window.saveLink = function () {
        const modal = ensureAddModalElements();
        if (!modal) return;

        const title = modal.newTitle.value.trim();
        const url = normalizeUrl(modal.newUrl.value);
        const cat = modal.newCategory.value.trim() || "Unsorted";
        const folderId = String(modal.newFolderId?.value || '').trim();
        const prio = modal.newPriority.value;
        const icon = normalizeManualIcon(modal.newIcon.value);

        if (!title || !url) return showToast("Missing Info", "warning");

        let targetId = null;
        const editId = modal.editId.value;
        if (editId) {
            const idx = links.findIndex(l => l.id == editId);
            if (idx > -1) {
                links[idx].title = title;
                links[idx].url = url;
                links[idx].category = cat;
                if (folderId) links[idx].folderId = folderId;
                else delete links[idx].folderId;
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
                folderId: folderId || undefined,
                icon,
                done: false,
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
