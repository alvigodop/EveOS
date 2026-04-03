/**
 * Loads the Text Input Field card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadTextInputFieldCard() {
    const placeholder = document.getElementById('text-input-field-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Text Input Field card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<div id="user-transcription-display" class="gemini-transcription-chip" style="display:none;"></div>
<div class="gemini-text-input-field">
    <input class="gemini-text-input" type="text" id="textInput" placeholder="Type your message...">
</div>
`;
        placeholder.innerHTML = htmlContent;
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Text Input Field card loaded and MDL components upgraded.');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Text Input Field card:', error);
        return Promise.reject(error);
    }
}

window.loadTextInputFieldCard = loadTextInputFieldCard;
