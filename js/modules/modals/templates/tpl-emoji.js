// --- MODAL TEMPLATES: EMOJI ---
window.modalTemplate += `
<!-- EMOJI PICKER -->
<div id="emoji-picker-container" class="modal-overlay" style="z-index: 4000;">
    <div class="modal" style="width: 300px;">
        <div class="emoji-header">
            <h3>Pick an Emoji</h3>
            <span class="emoji-close" onclick="closeEmojiModal()">✖</span>
        </div>
        <div id="emoji-grid" class="emoji-grid"></div>
    </div>
</div>
`;
