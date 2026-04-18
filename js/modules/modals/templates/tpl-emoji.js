// --- MODAL TEMPLATES: EMOJI ---
window.modalTemplate += `
<!-- EMOJI PICKER -->
<div id="emoji-picker-container" class="modal-overlay" style="z-index: 4000;">
    <div class="modal" id="emoji-picker-modal">
        <div class="emoji-header">
            <h3>Pick an Emoji</h3>
            <span class="emoji-close" onclick="closeEmojiModal()">✖</span>
        </div>
        <div class="emoji-tabs-bar">
            <button type="button" class="emoji-tabs-arrow emoji-tabs-arrow-left" onclick="scrollEmojiTabs(-1)" aria-label="Scroll categories left">◀</button>
            <div id="emoji-tabs" class="emoji-tabs"></div>
            <button type="button" class="emoji-tabs-arrow emoji-tabs-arrow-right" onclick="scrollEmojiTabs(1)" aria-label="Scroll categories right">▶</button>
        </div>
        <div id="emoji-grid" class="emoji-grid"></div>
    </div>
</div>
`;
