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
<div id="user-transcription-display" style="display:none; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 4px; margin-bottom: 5px; font-style: italic; color: #555;"></div>
<div class="mdl-textfield mdl-js-textfield" style="flex-grow: 1;">
    <input class="mdl-textfield__input" type="text" id="textInput">
    <label class="mdl-textfield__label" for="textInput">Type your message...</label>
</div>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
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

// Export the function to be called by the group aggregator
window.loadTextInputFieldCard = loadTextInputFieldCard; 