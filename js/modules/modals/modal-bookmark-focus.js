// --- BOOKMARK FOCUS MODAL ACTIONS ---
(function () {
    const focus = window.EveBookmarkFocus;
    if (!focus?.helpersReady) {
        console.warn('[BookmarkFocus] Helpers missing; modal actions not initialized.');
        return;
    }
    const MODAL_ID = focus.MODAL_ID;
    const toId = focus.toId;
    const findLinkById = focus.findLinkById;
    const getCurrentLinkId = focus.getCurrentLinkId;
    const ensureModalAvailable = focus.ensureModalAvailable;
    const openInNewTab = focus.openInNewTab;
    const refreshHeader = focus.refreshHeader;
    const refreshActionButtons = focus.refreshActionButtons;
    const loadLinkedRecord = focus.loadLinkedRecord;
    const buildLibraryPatch = focus.buildLibraryPatch;
    const buildMetadataPatch = focus.buildMetadataPatch;
    const clickBehaviorApi = window.EveBookmarkClickBehavior;

    function refreshClickBehaviorControls(link) {
        const select = document.getElementById('bookmarkFocusClickBehavior');
        const hint = document.getElementById('bookmarkFocusClickHint');
        const summary = document.getElementById('bookmarkFocusClickSummary');
        if (!select || !clickBehaviorApi?.getModeOptions) return;

        const selectedMode = clickBehaviorApi.getBookmarkMode(link);
        const optionsHtml = clickBehaviorApi.getModeOptions().map((option) => {
            const selected = option.value === selectedMode ? ' selected' : '';
            return `<option value="${option.value}"${selected}>${option.label}</option>`;
        }).join('');
        select.innerHTML = optionsHtml;

        const resolution = clickBehaviorApi.resolveBehaviorForLink(link);
        if (summary) summary.textContent = `Current Result: ${resolution.summary}`;
        if (hint) hint.textContent = clickBehaviorApi.describeMode(selectedMode);
    }

    window.openBookmarkFocusModal = function (linkId) {
        const modal = ensureModalAvailable();
        const link = findLinkById(linkId);
        if (!modal || !link) return false;

        const focusId = document.getElementById('bookmarkFocusId');
        if (focusId) focusId.value = toId(link.id);

        refreshHeader(link);
        refreshActionButtons(link);
        refreshClickBehaviorControls(link);
        loadLinkedRecord(link.id);
        modal.style.display = 'flex';
        return true;
    };

    window.closeBookmarkFocusModal = function () {
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.style.display = 'none';
    };

    window.handleBookmarkFocusOverlayClick = function (event) {
        if (event?.target?.id === MODAL_ID) {
            window.closeBookmarkFocusModal();
        }
    };

    window.openBookmarkFromDashboard = function (event, linkId) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        const link = findLinkById(linkId);
        if (!link) return false;

        const resolution = clickBehaviorApi?.resolveBehaviorForLink
            ? clickBehaviorApi.resolveBehaviorForLink(link)
            : {
                openLink: (typeof config !== 'undefined') && !!config.bookmarkClickOpensLink,
                openFocus: true
            };
        if (resolution.openLink) {
            openInNewTab(link.url);
        }
        if (resolution.openFocus) {
            window.openBookmarkFocusModal(link.id);
        }
        return false;
    };

    window.bookmarkFocusSaveClickBehavior = function (mode) {
        const linkId = getCurrentLinkId();
        if (!linkId || !clickBehaviorApi?.setBookmarkMode) return;
        clickBehaviorApi.setBookmarkMode(linkId, mode);
        const nextLink = findLinkById(linkId);
        refreshClickBehaviorControls(nextLink);
        showToast('Bookmark click behavior updated', 'success');
    };

    window.bookmarkFocusTogglePin = function () {
        const linkId = getCurrentLinkId();
        if (!linkId) return;
        togglePin(linkId);
        const nextLink = findLinkById(linkId);
        refreshActionButtons(nextLink);
    };

    window.bookmarkFocusToggleDone = function () {
        const linkId = getCurrentLinkId();
        if (!linkId) return;
        const currentLink = findLinkById(linkId);
        const isTaskEnabled = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? !!window.EveBookmarkFolders.isTaskEnabledForLink(currentLink)
            : true;
        if (!isTaskEnabled) return;
        toggleDone(linkId);
        const nextLink = findLinkById(linkId);
        refreshActionButtons(nextLink);
    };

    window.bookmarkFocusOpenAgain = function () {
        const linkId = getCurrentLinkId();
        if (!linkId) return;
        const link = findLinkById(linkId);
        if (!link) return;
        openInNewTab(link.url);
    };

    window.bookmarkFocusDelete = async function () {
        const linkId = getCurrentLinkId();
        if (!linkId) return;
        await deleteLink(linkId);
        const stillExists = !!findLinkById(linkId);
        if (!stillExists) {
            window.closeBookmarkFocusModal();
        }
    };

    window.bookmarkFocusSaveLibrary = function () {
        const linkId = getCurrentLinkId();
        if (!linkId) return;
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry || !api?.updateLinkedEntry) {
            showToast('Library connection API is not ready', 'error');
            return;
        }

        const linked = api.getLinkedEntry(linkId);
        if (!linked?.entry) {
            showToast('Bookmark is not linked to a library entry', 'warning');
            return;
        }

        const patch = buildLibraryPatch(linked.entry);
        const didUpdate = api.updateLinkedEntry(linkId, patch);
        if (!didUpdate) {
            showToast('Failed to save library changes', 'error');
            return;
        }
        loadLinkedRecord(linkId);
        showToast('Library entry updated', 'success');
    };

    window.bookmarkFocusRecalibrateMetadata = function () {
        const linkId = getCurrentLinkId();
        if (!linkId) return;

        const link = findLinkById(linkId);
        if (!link) {
            showToast('Bookmark not found', 'error');
            return;
        }

        const sources = Array.isArray(link.sources) ? link.sources : [];
        if (!sources.length) {
            showToast('No attached API sources to recalibrate from', 'warning');
            return;
        }

        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry || !api?.updateLinkedEntry) {
            showToast('Library connection API is not ready', 'error');
            return;
        }

        const linked = api.getLinkedEntry(linkId);
        if (!linked?.entry) {
            showToast('Bookmark must be linked to the library first', 'warning');
            return;
        }

        const patch = buildMetadataPatch(link, linked.entry);
        const didUpdate = api.updateLinkedEntry(linkId, patch);
        if (!didUpdate) {
            showToast('Metadata recalibration failed', 'error');
            return;
        }
        loadLinkedRecord(linkId);
        showToast(`Recalibrated metadata from ${sources.length} source(s)`, 'success');
    };

    window.addEventListener('eve:library-link-updated', (event) => {
        const modal = document.getElementById(MODAL_ID);
        if (!modal || modal.style.display !== 'flex') return;

        const currentId = getCurrentLinkId();
        const eventId = toId(event?.detail?.linkId);
        if (!currentId || !eventId || currentId !== eventId) return;

        const link = findLinkById(currentId);
        refreshHeader(link);
        refreshActionButtons(link);
        refreshClickBehaviorControls(link);
        loadLinkedRecord(currentId);
    });

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const modal = document.getElementById(MODAL_ID);
        if (!modal || modal.style.display !== 'flex') return;
        window.closeBookmarkFocusModal();
    });
})();
