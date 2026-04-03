// Text Input Section Container HTML Loader

async function loadTextInputSectionContainer() {
    try {
        console.log('Loading Text Input Section Container...');

        const htmlContent = `
<div class="text-input-section gemini-text-input-shell">
    <div id="text-input-field-placeholder" class="gemini-text-input-field-slot"></div>
    <div class="gemini-input-actions">
        <div id="send-button-placeholder"></div>
        <div id="popout-button-placeholder"></div>
    </div>
</div>
`;
        console.log('Text Input Section Container HTML loaded successfully');

        const placeholder = document.getElementById('text-input-section-placeholder');
        if (placeholder) {
            placeholder.outerHTML = htmlContent;
            console.log('Text Input Section Container HTML inserted into placeholder');

            const textInputSection = document.querySelector('.text-input-section');
            if (textInputSection && typeof componentHandler !== 'undefined') {
                componentHandler.upgradeElements(textInputSection);
                console.log('Text Input Section Container MDL components upgraded');
            }
        } else {
            console.warn('Text Input Section Container placeholder not found');
        }

    } catch (error) {
        console.error('Error loading Text Input Section Container:', error);
    }
}
