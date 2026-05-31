window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (ns.modalReady) return;
    if (!ns.coverImagesReady || !ns.relatedUrlsReady) {
        console.warn('[LinkForm] Modal helpers missing; modal controller not initialized.');
        return;
    }

    const {
        normalizeManualIcon,
        normalizeCoverImageUrl,
        parseCoverImagesValue,
        bindCoverImagesInputs,
        resetCoverImageCandidateEditor,
        parseRelatedUrlsValue,
        formatRelatedUrlsValue,
        bindRelatedUrlsInputs,
        resetRelatedUrlCandidateEditor
    } = ns;

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function setLiveLinks(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    function renderAttachedSources() {
        if (typeof window.renderSourcesList === 'function') {
            window.renderSourcesList();
            return;
        }
        const container = document.getElementById('link-sources-container');
        if (!container) return;
        const sourceCount = Array.isArray(window.tempSources) ? window.tempSources.length : 0;
        container.innerHTML = sourceCount
            ? `<div style="opacity:0.6; font-size:0.9rem;">${sourceCount} source${sourceCount === 1 ? '' : 's'} attached.</div>`
            : '<div style="opacity:0.5; font-size:0.9rem;">No sources attached.</div>';
    }

    function bindAddModalOverlayClose(addModal) {
        if (!addModal || addModal.dataset.overlayCloseBound === '1') return;
        addModal.dataset.overlayCloseBound = '1';

        addModal.addEventListener('pointerdown', (event) => {
            addModal.dataset.overlayPointerStarted = event.target === addModal ? '1' : '0';
        });

        addModal.addEventListener('click', (event) => {
            const startedOnOverlay = addModal.dataset.overlayPointerStarted === '1';
            addModal.dataset.overlayPointerStarted = '0';
            if (event.target !== addModal || !startedOnOverlay) return;
            if (typeof window.closeModals === 'function') {
                window.closeModals();
            } else {
                addModal.style.display = 'none';
            }
        });
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
            newBookmarkIdentifiers: document.getElementById('newBookmarkIdentifiers'),
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
        if (!missing.length) {
            bindAddModalOverlayClose(elements.addModal);
            return elements;
        }

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
        // When no explicit category is passed in, honor the user's Settings →
        // General → "Default Card for Add Link" preference (config.defaultAddLinkCategory).
        const fallback = String((typeof config !== 'undefined' && config) ? config.defaultAddLinkCategory : '').trim();
        if (preferredCategory && typeof preferredCategory === 'object') {
            return {
                category: String(preferredCategory.category || preferredCategory.categoryName || '').trim() || fallback,
                folderId: String(preferredCategory.folderId || '').trim()
            };
        }
        return {
            category: String(preferredCategory || '').trim() || fallback,
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
        if (window.EveBookmarkIdentifiers?.renderModalEditor) {
            window.EveBookmarkIdentifiers.renderModalEditor('newBookmarkIdentifiers', []);
        }
        if (modal.newCoverImage) modal.newCoverImage.value = '';
        if (modal.newCoverImages) modal.newCoverImages.value = '';
        if (modal.newFixedCoverImage) modal.newFixedCoverImage.value = '';
        const relatedUrlsInput = document.getElementById('newRelatedUrls');
        if (relatedUrlsInput) relatedUrlsInput.value = '';
        resetCoverImageCandidateEditor();
        resetRelatedUrlCandidateEditor();
        modal.newPriority.value = '';
        modal.newIcon.value = '';
        bindCoverImagesInputs();
        bindRelatedUrlsInputs();

        window.tempSources = [];
        renderAttachedSources();
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
        const link = getLiveLinks().find((item) => String(item?.id) === targetId);
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
        if (window.EveBookmarkIdentifiers?.renderModalEditor) {
            window.EveBookmarkIdentifiers.renderModalEditor('newBookmarkIdentifiers', Array.isArray(link.identifiers) ? link.identifiers : []);
        }
        if (modal.newCoverImage) modal.newCoverImage.value = String(link.coverImage || '').trim();
        if (modal.newCoverImages) modal.newCoverImages.value = Array.isArray(link.coverImages) ? link.coverImages.join('\n') : '';
        if (modal.newFixedCoverImage) modal.newFixedCoverImage.value = String(link.fixedCoverImage || '').trim();
        const relatedUrlsInput = document.getElementById('newRelatedUrls');
        if (relatedUrlsInput) relatedUrlsInput.value = formatRelatedUrlsValue(link.relatedUrls);
        resetCoverImageCandidateEditor();
        resetRelatedUrlCandidateEditor();
        modal.newPriority.value = link.priority || '';
        modal.newIcon.value = normalizeManualIcon(link.icon);
        bindCoverImagesInputs();
        bindRelatedUrlsInputs();

        window.tempSources = link.sources ? [...link.sources] : [];
        renderAttachedSources();
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
        const url = ns.normalizeStoredUrl
            ? ns.normalizeStoredUrl(modal.newUrl.value)
            : normalizeUrl(modal.newUrl.value);
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
        const identifiers = window.EveBookmarkIdentifiers?.readModalEditorSelection
            ? window.EveBookmarkIdentifiers.readModalEditorSelection('newBookmarkIdentifiers')
            : [];
        const relatedUrls = parseRelatedUrlsValue(document.getElementById('newRelatedUrls')?.value || '');

        if (!title || !url) return showToast('Missing Info', 'warning');

        let targetId = null;
        const editId = modal.editId.value;
        const liveLinks = getLiveLinks();
        let previousWorkspaceId = String(config?.activeWorkspace || 'main').trim() || 'main';
        let previousCategoryName = category;
        let previousFolderId = '';
        if (editId) {
            const index = liveLinks.findIndex((item) => item.id == editId);
            if (index > -1) {
                previousWorkspaceId = String(liveLinks[index].workspace || previousWorkspaceId).trim() || previousWorkspaceId;
                previousCategoryName = String(liveLinks[index].category || previousCategoryName).trim() || previousCategoryName;
                previousFolderId = String(liveLinks[index].folderId || '').trim();
                liveLinks[index].title = title;
                liveLinks[index].url = url;
                liveLinks[index].category = category;
                if (folderId) liveLinks[index].folderId = folderId;
                else delete liveLinks[index].folderId;
                if (coverImage) liveLinks[index].coverImage = coverImage;
                else delete liveLinks[index].coverImage;
                if (coverImages.length) liveLinks[index].coverImages = coverImages;
                else delete liveLinks[index].coverImages;
                if (fixedCoverImage) liveLinks[index].fixedCoverImage = fixedCoverImage;
                else delete liveLinks[index].fixedCoverImage;
                if (identifiers.length) liveLinks[index].identifiers = identifiers;
                else delete liveLinks[index].identifiers;
                if (relatedUrls.length) liveLinks[index].relatedUrls = relatedUrls;
                else delete liveLinks[index].relatedUrls;
                liveLinks[index].priority = priority;
                liveLinks[index].icon = icon;
                liveLinks[index].sources = [...window.tempSources];
                targetId = liveLinks[index].id;
            }
        } else {
            const newId = Date.now();
            liveLinks.push({
                id: newId,
                title,
                url,
                category,
                folderId: folderId || undefined,
                coverImage: coverImage || undefined,
                coverImages: coverImages.length ? coverImages : undefined,
                fixedCoverImage: fixedCoverImage || undefined,
                identifiers: identifiers.length ? identifiers : undefined,
                relatedUrls: relatedUrls.length ? relatedUrls : undefined,
                icon,
                done: false,
                priority,
                workspace: config.activeWorkspace,
                sources: [...window.tempSources]
            });
            targetId = newId;
        }

        if (targetId) {
            setLiveLinks(liveLinks);
        }

        if (window.EveBookmarkCovers?.clearSelection && targetId) {
            window.EveBookmarkCovers.clearSelection(targetId);
        }
        if (window.EveFaviconCache?.fetchAndCache && window.EveFaviconUtils?.getDomainFromUrl) {
            const warmFavicons = () => {
                [url].concat(relatedUrls.map((entry) => entry?.url)).forEach((candidateUrl) => {
                    const domain = window.EveFaviconUtils.getDomainFromUrl(candidateUrl);
                    if (domain) window.EveFaviconCache.fetchAndCache(domain, 32);
                });
            };
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(warmFavicons, { timeout: 1200 });
            } else {
                setTimeout(warmFavicons, 250);
            }
        }

        const currentWorkspaceId = String(editId ? previousWorkspaceId : (config?.activeWorkspace || previousWorkspaceId || 'main')).trim() || 'main';
        const affectedScopes = [
            { workspaceId: previousWorkspaceId, categoryName: previousCategoryName },
            { workspaceId: currentWorkspaceId, categoryName: category }
        ].filter((scope, index, all) => {
            const key = `${scope.workspaceId}::${scope.categoryName}`;
            return scope.workspaceId && scope.categoryName
                && all.findIndex((item) => `${item.workspaceId}::${item.categoryName}` === key) === index;
        });
        const dataDelta = {
            complete: false,
            workspaceIds: Array.from(new Set(affectedScopes.map((scope) => scope.workspaceId))),
            categoryNames: Array.from(new Set(affectedScopes.map((scope) => scope.categoryName))),
            linkIds: [String(targetId || '').trim()].filter(Boolean),
            updatedLinkIds: editId ? [String(targetId || '').trim()].filter(Boolean) : [],
            addedLinkIds: editId ? [] : [String(targetId || '').trim()].filter(Boolean),
            affectedScopes,
            folderIds: Array.from(new Set([previousFolderId, folderId || ''].map((id) => String(id || '').trim()).filter(Boolean))),
            hasFolderStoreChanges: false
        };

        saveData({
            forceRender: true,
            skipSuggestions: true,
            source: editId ? 'bookmark-edit' : 'bookmark-create',
            meta: {
                kind: editId ? 'bookmark-edit' : 'bookmark-create',
                linkId: String(targetId || '').trim(),
                workspaceId: currentWorkspaceId,
                categoryName: category,
                folderId: folderId || '',
                previousWorkspaceId,
                previousCategoryName,
                previousFolderId,
                dataDelta
            }
        });

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
            if (ns._localLibraryDraftSync?.linkId === String(editId)) return;

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
