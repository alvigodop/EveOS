/* js/modules/gemini/gemini-init.js */
(function () {
    function shouldDebugBootLogs() {
        try {
            const qs = new URLSearchParams(window.location.search || '');
            if (qs.get('debugGeminiBoot') === '1') return true;
            return window.localStorage && window.localStorage.getItem('eve.debugGeminiBoot') === '1';
        } catch (e) {
            return false;
        }
    }

    function debugBootLog() {
        if (!shouldDebugBootLogs()) return;
        console.log.apply(console, arguments);
    }

    debugBootLog('Initializing Gemini Interface Integration...');

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
                debugBootLog(`Gemini Init: Boot requested (${reason || 'manual'}), waiting for Script_Loader.`);
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
        geminiContainer.className = 'gemini-monitor-shell';
        geminiContainer.tabIndex = 0;

        geminiContainer.innerHTML = `
            <div id="app-loading-state" class="gemini-monitor-card">
                <div class="gemini-monitor-head">
                    <div>
                        <div class="gemini-monitor-kicker">Gemini Link</div>
                        <h3 class="gemini-monitor-title">Search Monitor Assistant</h3>
                    </div>
                    <div class="gemini-monitor-pill">Lazy Boot</div>
                </div>
                <div class="gemini-monitor-body">
                    <p class="gemini-monitor-copy">Wake Gemini from the Search Monitor when you need active context or chat controls.</p>
                    <p class="gemini-monitor-meta">Modules load on demand to keep startup light and preserve dashboard responsiveness.</p>
                </div>
            </div>
        `;

        let target = document.getElementById('gemini-placeholder');
        if (target) {
            target.appendChild(geminiContainer);
            debugBootLog('Gemini Init: UI injected into placeholder.');
        } else {
            const indicatorContent = document.querySelector('#loadingIndicator .indicator-content');
            if (!indicatorContent || !indicatorContent.querySelector('.indicator-title')) {
                debugBootLog('Gemini Init: Search Monitor structure not ready, waiting...');
                setTimeout(injectGeminiUI, 500);
                return;
            }
            const title = indicatorContent.querySelector('.indicator-title');
            if (title && title.nextSibling) {
                indicatorContent.insertBefore(geminiContainer, title.nextSibling);
            } else {
                indicatorContent.prepend(geminiContainer);
            }
            debugBootLog('Gemini Init: UI injected using fallback order logic.');
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
