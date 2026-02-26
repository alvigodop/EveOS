/* js/modules/gemini/gemini-init.js */
(function () {
    console.log("Initializing Gemini Interface Integration...");

    function injectGeminiUI() {
        // Check if already injected
        if (document.getElementById('gemini-ui-root')) {
            return;
        }

        // Create container
        const geminiContainer = document.createElement('div');
        geminiContainer.id = 'gemini-ui-root';
        geminiContainer.style.width = '100%';
        geminiContainer.style.height = '600px';
        geminiContainer.style.maxHeight = '80vh';
        geminiContainer.style.display = 'flex';
        geminiContainer.style.flexDirection = 'column';
        geminiContainer.style.overflow = 'auto';
        geminiContainer.style.background = '#fff';
        geminiContainer.style.color = '#333';
        geminiContainer.style.position = 'relative';
        geminiContainer.style.marginTop = '0';
        geminiContainer.style.borderRadius = '8px';
        geminiContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        // Increased margin to prevent hiding status group
        geminiContainer.style.marginBottom = '20px';

        // Initial content
        geminiContainer.innerHTML = `
            <div id="app-loading-state" style="display: flex; justify-content: center; align-items: center; height: 100%; width: 100%; font-family: 'Roboto', sans-serif; color: #666; flex-grow: 1;">
                <div style="text-align: center;">
                    <h3>Loading Gemini Interface...</h3>
                    <p>Status: Initializing modules...</p>
                </div>
            </div>
        `;

        // Robust injection: Target placeholder first, then fallback to title.nextSibling
        let target = document.getElementById('gemini-placeholder');
        if (target) {
            target.appendChild(geminiContainer);
            console.log("Gemini Init: UI injected into placeholder.");
        } else {
            const indicatorContent = document.querySelector('#loadingIndicator .indicator-content');
            if (!indicatorContent || !indicatorContent.querySelector('.indicator-title')) {
                console.log("Gemini Init: Search Monitor structure not ready, waiting...");
                setTimeout(injectGeminiUI, 500);
                return;
            }
            const title = indicatorContent.querySelector('.indicator-title');
            if (title && title.nextSibling) {
                indicatorContent.insertBefore(geminiContainer, title.nextSibling);
            } else {
                indicatorContent.prepend(geminiContainer);
            }
            console.log("Gemini Init: UI injected using fallback order logic.");
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectGeminiUI);
    } else {
        injectGeminiUI();
    }
})();
