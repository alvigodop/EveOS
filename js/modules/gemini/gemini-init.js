/* js/modules/gemini/gemini-init.js */
(function () {
    console.log('Initializing Gemini Interface Integration...');

    function shouldEagerBoot() {
        try {
            const qs = new URLSearchParams(window.location.search || '');
            if (qs.get('geminiBoot') === 'eager') return true;
            return window.localStorage && window.localStorage.getItem('eve.geminiBoot') === 'eager';
        } catch (e) {
            return false;
        }
    }

    function requestGeminiBoot(reason) {
        window.__GEMINI_BOOT_REQUESTED = true;

        if (typeof window.__loadGeminiScriptsNow === 'function') {
            window.__loadGeminiScriptsNow();
            return;
        }

        // Script_Loader may not be parsed yet; retry once shortly.
        window.setTimeout(function () {
            if (typeof window.__loadGeminiScriptsNow === 'function') {
                window.__loadGeminiScriptsNow();
            } else {
                console.log(`Gemini Init: Boot requested (${reason || 'manual'}), waiting for Script_Loader.`);
            }
        }, 250);
    }

    function bindOnDemandBoot(container) {
        if (!container || container.dataset.geminiBootBound === '1') return;
        container.dataset.geminiBootBound = '1';

        const trigger = function () {
            requestGeminiBoot('ui-interaction');
        };

        container.addEventListener('pointerdown', trigger, { once: true, passive: true });
        container.addEventListener('focusin', trigger, { once: true });
        container.addEventListener('keydown', trigger, { once: true });
    }

    function injectGeminiUI() {
        if (document.getElementById('gemini-ui-root')) {
            return;
        }

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
        geminiContainer.style.marginBottom = '20px';
        geminiContainer.tabIndex = 0;

        geminiContainer.innerHTML = `
            <div id="app-loading-state" style="display: flex; justify-content: center; align-items: center; height: 100%; width: 100%; font-family: 'Roboto', sans-serif; color: #666; flex-grow: 1;">
                <div style="text-align: center;">
                    <h3>Loading Gemini Interface...</h3>
                    <p>Status: Modules load on demand to keep startup fast.</p>
                </div>
            </div>
        `;

        let target = document.getElementById('gemini-placeholder');
        if (target) {
            target.appendChild(geminiContainer);
            console.log('Gemini Init: UI injected into placeholder.');
        } else {
            const indicatorContent = document.querySelector('#loadingIndicator .indicator-content');
            if (!indicatorContent || !indicatorContent.querySelector('.indicator-title')) {
                console.log('Gemini Init: Search Monitor structure not ready, waiting...');
                setTimeout(injectGeminiUI, 500);
                return;
            }
            const title = indicatorContent.querySelector('.indicator-title');
            if (title && title.nextSibling) {
                indicatorContent.insertBefore(geminiContainer, title.nextSibling);
            } else {
                indicatorContent.prepend(geminiContainer);
            }
            console.log('Gemini Init: UI injected using fallback order logic.');
        }

        bindOnDemandBoot(geminiContainer);

        if (shouldEagerBoot()) {
            requestGeminiBoot('eager-setting');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectGeminiUI);
    } else {
        injectGeminiUI();
    }
})();
