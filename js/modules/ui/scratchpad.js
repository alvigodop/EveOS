// --- SCRATCHPAD MODULE ---

// HTML Template
const scratchpadTemplate = `
<div id="scratchpad-container" class="scratchpad-container">
    <div class="scratchpad-header">
        <span>📝 Scratchpad</span>
        <span style="cursor:pointer; font-size:0.9rem;" onclick="toggleScratchpad()">✖</span>
    </div>
    <textarea id="notes-area" placeholder="Type notes here..." oninput="saveNotes()"></textarea>
</div>
`;

// Inject HTML
function initScratchpad() {
    if (!document.getElementById('scratchpad-container')) {
        document.body.insertAdjacentHTML('beforeend', scratchpadTemplate);

        // Restore notes if they exist
        const notes = localStorage.getItem('eveV22Notes');
        const notesArea = document.getElementById('notes-area');
        if (notesArea) notesArea.value = notes || "";
    }
}

// Logic
function toggleScratchpad() {
    const el = document.getElementById('scratchpad-container');
    if (el) el.classList.toggle('open');
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScratchpad);
} else {
    initScratchpad();
}
