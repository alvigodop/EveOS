// js/modules/gemini/html_loaders/layout_ui_html_loaders/video_section_html_loader/videoSectionUILoader.js
// Loads the Video Section HTML component

async function loadVideoSection() {
    const placeholder = document.getElementById('video-section-placeholder');
    if (!placeholder) {
        console.error('Video section placeholder not found in DOM');
        return Promise.reject('Placeholder not found');
    }
    try {
        const html = `
<!-- Video Section Layout Component -->
<div class="video-section">
    <div id="button-group-container-placeholder"></div>
    <div id="video-canvas-elements-placeholder"></div>
</div>
`;
        placeholder.innerHTML = html;
        if (typeof componentHandler !== 'undefined' && componentHandler.upgradeElements) {
            componentHandler.upgradeElements(placeholder);
        }
        console.log('Video Section loaded and MDL components upgraded');
        return Promise.resolve();
    } catch (error) {
        console.error('Error loading Video Section:', error);
        return Promise.reject(error);
    }
}

// Export the loader function
typeof window.loadVideoSection === 'undefined' && (window.loadVideoSection = loadVideoSection); 