// --- MODAL TEMPLATES: EMOJI ---
window.modalTemplate += `
<!-- EMOJI PICKER -->
<div id="emoji-picker-container" class="modal-overlay" style="z-index: 4000;">
    <div class="modal" id="emoji-picker-modal">
        <div class="emoji-header">
            <h3>Pick an Emoji</h3>
            <span class="emoji-close" onclick="closeEmojiModal()">✖</span>
        </div>
        <div id="emoji-tabs" class="emoji-tabs"></div>
        <div id="emoji-grid" class="emoji-grid"></div>
    </div>
</div>
`;
