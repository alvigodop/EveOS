// --- MODAL CORE ---
function initModals() {
    if (window.modalTemplate && !document.querySelector('.modal-overlay')) {
        document.body.insertAdjacentHTML('beforeend', window.modalTemplate);
        closeModals();
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
