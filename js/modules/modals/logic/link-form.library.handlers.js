window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    ns.registerLibraryFormHandlers = function registerLibraryFormHandlers() {
        ns.setupLibraryToggleHandlers = function () {
            const toggle = ns.getLibraryFormToggle();
            const collapseBtn = ns.getLibraryCollapseButton();
            const categoryInput = document.getElementById('newCategory');
            const bookmarkUrlInput = document.getElementById('newUrl');
            const bookmarkCoverInput = document.getElementById('newCoverImage');
            const libraryUrlInput = document.getElementById('libSourceUrl');
            const libraryImageInput = document.getElementById('libImageUrl');
            const typeGraphic = document.getElementById('libTypeGraphic');
            const typeFilms = document.getElementById('libTypeFilms');
            const typeNovels = document.getElementById('libTypeNovels');

            if (toggle) {
                toggle.onchange = function () {
                    const enabled = !!toggle.checked;
                    if (enabled) {
                        ns.isLibraryFieldsCollapsed = false;
                        if (bookmarkCoverInput && libraryImageInput) {
                            libraryImageInput.value = bookmarkCoverInput.value || libraryImageInput.value || '';
                        }
                    }
                    ns.setLibraryFieldsVisibility(enabled);
                    if (enabled) ns.refreshDerivedRatingsPreview();
                };
            }
            if (collapseBtn) {
                collapseBtn.onclick = function () {
                    window.toggleLibraryFieldsCollapse();
                };
            }

            const onTypesChanged = function () {
                const categoryName = categoryInput?.value?.trim() || 'Unsorted';
                ns.refreshLibraryStatusOptions(categoryName);
                ns.updateLibraryProgressFieldVisibility(categoryName);
            };
            if (typeGraphic) typeGraphic.onchange = onTypesChanged;
            if (typeFilms) typeFilms.onchange = onTypesChanged;
            if (typeNovels) typeNovels.onchange = onTypesChanged;
            if (categoryInput) {
                categoryInput.oninput = function () {
                    const categoryName = categoryInput.value.trim() || 'Unsorted';
                    ns.refreshLibraryStatusOptions(categoryName);
                    ns.updateLibraryProgressFieldVisibility(categoryName);
                };
            }

            let liveSyncTimer = null;
            const pushLivePatchToLinkedEntry = function (patchFactory) {
                const editId = document.getElementById('editId')?.value;
                if (!editId) return;
                const api = ns.getConnectionsApi();
                if (!api?.findConnectionByLinkId?.(editId)) return;
                clearTimeout(liveSyncTimer);
                liveSyncTimer = setTimeout(function () {
                    const patch = patchFactory();
                    ns._localLibraryDraftSync = {
                        linkId: String(editId),
                        startedAt: Date.now()
                    };
                    try {
                        api.updateLinkedEntry?.(editId, patch);
                    } finally {
                        setTimeout(function () {
                            if (ns._localLibraryDraftSync?.linkId === String(editId)) {
                                ns._localLibraryDraftSync = null;
                            }
                        }, 0);
                    }
                }, 150);
            };

            if (bookmarkUrlInput && libraryUrlInput) {
                let syncing = false;
                bookmarkUrlInput.oninput = function () {
                    if (syncing) return;
                    syncing = true;
                    libraryUrlInput.value = bookmarkUrlInput.value;
                    syncing = false;
                };
                libraryUrlInput.oninput = function () {
                    if (syncing) return;
                    syncing = true;
                    bookmarkUrlInput.value = libraryUrlInput.value;
                    syncing = false;
                };
            }

            if (bookmarkCoverInput && libraryImageInput) {
                let syncingCover = false;
                bookmarkCoverInput.oninput = function () {
                    if (syncingCover) return;
                    syncingCover = true;
                    libraryImageInput.value = bookmarkCoverInput.value;
                    syncingCover = false;
                    ns.refreshCoverImagesSummary?.();
                    pushLivePatchToLinkedEntry(function () {
                        return {
                            image: ns.normalizeLibraryImageUrl(bookmarkCoverInput.value || '')
                        };
                    });
                };
                libraryImageInput.oninput = function () {
                    if (syncingCover) return;
                    syncingCover = true;
                    bookmarkCoverInput.value = libraryImageInput.value;
                    syncingCover = false;
                    ns.refreshCoverImagesSummary?.();
                    pushLivePatchToLinkedEntry(function () {
                        return {
                            image: ns.normalizeLibraryImageUrl(libraryImageInput.value || '')
                        };
                    });
                };
            }

            const ratingInputs = [
                'libRating',
                'libApiRatingAniList',
                'libApiRatingMAL',
                'libApiRatingMangaDex',
                'libApiRatingKitsu',
                'libApiRatingTVmaze',
                'libApiRatingMU',
                'libApiRatingComicK',
                'libApiRatingOpenLibrary',
                'libApiRatingWLN',
                'libApiRatingiTunes'
            ];
            ratingInputs.forEach(function (id) {
                const element = document.getElementById(id);
                if (!element) return;
                const onValueChanged = function () {
                    const derived = ns.refreshDerivedRatingsPreview();
                    pushLivePatchToLinkedEntry(function () {
                        const ratingsPatch = ns.buildRatingsPatch();
                        return {
                            rating: document.getElementById('libRating')?.value || '',
                            apiRatings: ratingsPatch.apiRatings,
                            derivedRatings: derived || ratingsPatch.derivedRatings
                        };
                    });
                };
                element.oninput = onValueChanged;
                element.onchange = onValueChanged;
            });
        };

        ns.loadLibraryStateForLink = function (linkId, categoryName) {
            const toggle = ns.getLibraryFormToggle();
            if (!toggle) return;
            const api = ns.getConnectionsApi();
            ns.refreshLibraryStatusOptions(categoryName);

            const linked = api?.getLinkedEntry?.(linkId);
            if (linked?.entry) {
                toggle.checked = true;
                ns.setLibraryFieldsCollapsed(false);
                ns.setLibraryFieldsVisibility(true);
                ns.fillLibraryForm(linked.entry, categoryName);
                const linkedUrl = linked.entry.sourceUrl || '';
                const newUrlInput = document.getElementById('newUrl');
                if (linkedUrl && newUrlInput && !newUrlInput.matches(':focus')) {
                    newUrlInput.value = linkedUrl;
                }
                if (linked.entry.status) {
                    document.getElementById('libStatus').value = linked.entry.status;
                }
                return;
            }

            toggle.checked = false;
            ns.setLibraryFieldsCollapsed(false);
            ns.setLibraryFieldsVisibility(false);
            ns.resetLibraryForm();
        };

        ns.saveLibraryLinkState = function (linkId, categoryName, title, url) {
            const toggle = ns.getLibraryFormToggle();
            const shouldLink = !!toggle?.checked;
            const api = ns.getConnectionsApi();
            if (!api) return;

            const existing = api.findConnectionByLinkId?.(linkId);

            if (!shouldLink) {
                if (existing) {
                    api.unlinkLink?.(linkId, true);
                }
                return;
            }

            if (!existing) {
                api.promoteLink?.(linkId);
            }

            api.moveLinkedEntryToCategory?.(linkId, categoryName);
            const patch = ns.readLibraryFormPatch();
            if (!patch.mediaTypes || patch.mediaTypes.length === 0) {
                patch.mediaTypes = ['graphicNovels'];
            }
            patch.chapter = patch.graphicChapter || patch.novelChapter || 0;
            patch.title = title;
            if (!patch.sourceUrl && url) patch.sourceUrl = normalizeUrl(url);
            patch.image = ns.normalizeLibraryImageUrl(document.getElementById('newCoverImage')?.value || patch.image || '');
            api.updateLinkedEntry?.(linkId, patch);
        };
    };
})(window.EveLinkForm);
