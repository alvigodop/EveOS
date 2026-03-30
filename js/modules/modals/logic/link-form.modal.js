window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (ns.modalReady) return;
    if (!ns.coverImagesReady) {
        console.warn('[LinkForm] Cover image helpers missing; modal controller not initialized.');
        return;
    }

    const {
        normalizeManualIcon,
        normalizeCoverImageUrl,
        parseCoverImagesValue,
        bindCoverImagesInputs,
        resetCoverImageCandidateEditor
    } = ns;

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
            newCoverImage: document.getElementById('newCoverImage'),
            newCoverImages: document.getElementById('newCoverImages'),
            newFixedCoverImage: document.getElementById('newFixedCoverImage'),
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
        const initialCategory = prefs.category;
        const modal = ensureAddModalElements();
        if (!modal) return;

        modal.modalTitle.innerText = 'Add Link';
        modal.editId.value = '';
        refreshCategoryDatalist();
        modal.newTitle.value = '';
        modal.newUrl.value = '';
        modal.newCategory.value = initialCategory;
        if (window.EveBookmarkFolders?.refreshEditorFolderSelect) {
            window.EveBookmarkFolders.refreshEditorFolderSelect(prefs.folderId);
        } else if (modal.newFolderId) {
            modal.newFolderId.value = '';
        }
        if (modal.newCoverImage) modal.newCoverImage.value = '';
        if (modal.newCoverImages) modal.newCoverImages.value = '';
        if (modal.newFixedCoverImage) modal.newFixedCoverImage.value = '';
        resetCoverImageCandidateEditor();
        modal.newPriority.value = '';
        modal.newIcon.value = '';
        bindCoverImagesInputs();

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
        const link = links.find((item) => String(item?.id) === targetId);
        if (!link) return;
        const modal = ensureAddModalElements();
        if (!modal) return;

        modal.modalTitle.innerText = 'Edit Link';
        modal.editId.value = link.id;
        refreshCategoryDatalist();
        modal.newTitle.value = link.title;
        modal.newUrl.value = link.url;
        modal.newCategory.value = link.category;
        if (window.EveBookmarkFolders?.refreshEditorFolderSelect) {
            window.EveBookmarkFolders.refreshEditorFolderSelect(String(link.folderId || '').trim());
        } else if (modal.newFolderId) {
            modal.newFolderId.value = String(link.folderId || '').trim();
        }
        if (modal.newCoverImage) modal.newCoverImage.value = String(link.coverImage || '').trim();
        if (modal.newCoverImages) modal.newCoverImages.value = Array.isArray(link.coverImages) ? link.coverImages.join('\n') : '';
        if (modal.newFixedCoverImage) modal.newFixedCoverImage.value = String(link.fixedCoverImage || '').trim();
        resetCoverImageCandidateEditor();
        modal.newPriority.value = link.priority || '';
        modal.newIcon.value = normalizeManualIcon(link.icon);
        bindCoverImagesInputs();

        window.tempSources = link.sources ? [...link.sources] : [];
        renderSourcesList();
        modal.searchResults.style.display = 'none';

        ns.setupLibraryToggleHandlers();
        ns.loadLibraryStateForLink(link.id, link.category || 'Unsorted');

        modal.addModal.style.display = 'flex';
        if (typeof hideCategoryQuickPicker === 'function') hideCategoryQuickPicker();
    };

    window.saveLink = function () {
        const modal = ensureAddModalElements();
        if (!modal) return;

        const title = modal.newTitle.value.trim();
        const url = normalizeUrl(modal.newUrl.value);
        const category = modal.newCategory.value.trim() || 'Unsorted';
        const folderId = String(modal.newFolderId?.value || '').trim();
        const coverImage = normalizeCoverImageUrl(modal.newCoverImage?.value);
        const coverImages = parseCoverImagesValue(modal.newCoverImages?.value, coverImage);
        let fixedCoverImage = normalizeCoverImageUrl(modal.newFixedCoverImage?.value);
        if (!coverImages.some((value) => value.toLowerCase() === fixedCoverImage.toLowerCase())) {
            fixedCoverImage = '';
        }
        const priority = modal.newPriority.value;
        const icon = normalizeManualIcon(modal.newIcon.value);

        if (!title || !url) return showToast('Missing Info', 'warning');

        let targetId = null;
        const editId = modal.editId.value;
        if (editId) {
            const index = links.findIndex((item) => item.id == editId);
            if (index > -1) {
                links[index].title = title;
                links[index].url = url;
                links[index].category = category;
                if (folderId) links[index].folderId = folderId;
                else delete links[index].folderId;
                if (coverImage) links[index].coverImage = coverImage;
                else delete links[index].coverImage;
                if (coverImages.length) links[index].coverImages = coverImages;
                else delete links[index].coverImages;
                if (fixedCoverImage) links[index].fixedCoverImage = fixedCoverImage;
                else delete links[index].fixedCoverImage;
                links[index].priority = priority;
                links[index].icon = icon;
                links[index].sources = [...window.tempSources];
                targetId = links[index].id;
            }
        } else {
            const newId = Date.now();
            links.push({
                id: newId,
                title,
                url,
                category,
                folderId: folderId || undefined,
                coverImage: coverImage || undefined,
                coverImages: coverImages.length ? coverImages : undefined,
                fixedCoverImage: fixedCoverImage || undefined,
                icon,
                done: false,
                priority,
                workspace: config.activeWorkspace,
                sources: [...window.tempSources]
            });
            targetId = newId;
        }

        if (window.EveBookmarkCovers?.clearSelection && targetId) {
            window.EveBookmarkCovers.clearSelection(targetId);
        }

        saveData();

        if (targetId) {
            ns.saveLibraryLinkState(targetId, category, title, url);
            if (editId && window.EveLibrary?.ConnectionsAPI?.syncFromLink) {
                window.EveLibrary.ConnectionsAPI.syncFromLink(editId);
            }
        }

        closeModals();
        showToast('Link Saved', 'success');
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

    ns.modalReady = true;
})(window.EveLinkForm);
