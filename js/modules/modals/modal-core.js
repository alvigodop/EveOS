// --- MODAL CORE ---
function initModals() {
    if (!window.modalTemplate) return;
    const expandedSearchModal = document.getElementById('expandedSearchModal');
    const expandedSearchDisplay = expandedSearchModal?.style?.display || '';
    let insertedTemplates = false;
    // Check for the concrete link modal root instead of any overlay from unrelated features.
    if (!document.getElementById('addModal')) {
        document.body.insertAdjacentHTML('beforeend', window.modalTemplate);
        insertedTemplates = true;
    }
    // initModals is also an availability guard for deferred features. Only the first call should
    // reset modal visibility; a later guard must not close a panel the user already opened.
    if (insertedTemplates) {
        closeModals();
    }
    if (expandedSearchModal && expandedSearchDisplay && expandedSearchDisplay !== 'none') {
        expandedSearchModal.style.display = expandedSearchDisplay;
    }
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none');
}

function toggleScratchpad() {
    const el = document.getElementById('scratchpad-container');
    if (el) el.classList.toggle('open');
}

function updateSuggestions() {
    if (typeof refreshCategoryDatalist === 'function') {
        refreshCategoryDatalist();
    }
}
