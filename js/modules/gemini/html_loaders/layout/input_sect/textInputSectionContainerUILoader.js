// Text Input Section Container HTML Loader

async function loadTextInputSectionContainer() {
    try {
        console.log('Loading Text Input Section Container...');

        const htmlContent = `
<!-- Text Input Section Container -->
<div class="text-input-section">
    <div id="text-input-field-placeholder"></div>
    <div id="send-button-placeholder"></div>
    <div id="popout-button-placeholder"></div>
</div>
`;
        console.log('Text Input Section Container HTML loaded successfully');

        // Find the placeholder and replace it with the actual content
        const placeholder = document.getElementById('text-input-section-placeholder');
        if (placeholder) {
            placeholder.outerHTML = htmlContent;
            console.log('Text Input Section Container HTML inserted into placeholder');

            // Upgrade MDL components in the newly inserted content
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