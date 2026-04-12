/**
 * Loading Indicator DOM Helpers
 */
window.LoadingIndicatorModules = window.LoadingIndicatorModules || {};

(function () {
    window.LoadingIndicatorModules.createDomHelpers = function createDomHelpers(ctx) {
        const state = ctx?.state || {};
        const api = ctx?.api || {};

        function setCompact(value) {
            state.compact = !!value;
            api._loadingIndicatorCompact = !!value;
        }

        function setupEventListeners() {
            if (state.listenersReady) return;

            const indicator = document.getElementById('loadingIndicator');
            if (indicator) {
                indicator.addEventListener('click', (event) => {
                    if (state.compact) {
                        api.expand();
                        event.stopPropagation();
                    }
                });
            }

            state.boundHandleOutsideClick = handleOutsideClick;
            state.listenersReady = true;
        }

        function ensureIndicatorStructure(indicator) {
            const content = indicator.querySelector('.indicator-content');
            if (!content) return;

            if (!content.querySelector('#gemini-placeholder')) {
                const title = content.querySelector('.indicator-title');
                const placeholder = document.createElement('div');
                placeholder.id = 'gemini-placeholder';
                if (title && title.nextSibling) {
                    content.insertBefore(placeholder, title.nextSibling);
                } else {
                    content.prepend(placeholder);
                }
            }

            if (!content.querySelector('.status-group')) {
                const placeholder = content.querySelector('#gemini-placeholder');
                const statusGroup = document.createElement('div');
                statusGroup.className = 'status-group';
                statusGroup.innerHTML = `
                    <div class="status-text">Idle</div>
                    <div class="wave-container"><div class="wave"></div></div>
                `;
                if (placeholder && placeholder.nextSibling) {
                    content.insertBefore(statusGroup, placeholder.nextSibling);
                } else {
                    content.appendChild(statusGroup);
                }
            }

            if (!indicator.querySelector('.expanded-content')) {
                const expanded = document.createElement('div');
                expanded.className = 'expanded-content';
                expanded.innerHTML = `
                    <div class="stats-row"><span class="stats-label">Status:</span><span class="stats-value" id="searchStatus">Idle</span></div>
                    <div class="stats-row"><span class="stats-label">Wikis Searched:</span><span class="stats-value" id="wikisSearched">0/0</span></div>
                    <div class="stats-row"><span class="stats-label">Results Found:</span><span class="stats-value" id="resultsFound">0</span></div>
                `;
                content.appendChild(expanded);
            }
        }

        function createLoadingIndicator() {
            if (!document.body) {
                console.log('DOM not ready yet, skipping loading indicator creation');
                return;
            }

            let indicator = document.getElementById('loadingIndicator');
            if (!indicator) {
                indicator = document.getElementById('loading');
                if (indicator) {
                    console.log('Found legacy #loading, but expected #loadingIndicator');
                    return;
                }

                console.log('Creating loading indicator (fallback)');
                const loadingDiv = document.createElement('div');
                loadingDiv.id = 'loadingIndicator';
                loadingDiv.className = 'loading-indicator compact visible';
                loadingDiv.innerHTML = `
                    <div class="dot"></div>
                    <div class="indicator-content">
                        <div class="indicator-title">Search Monitor</div>
                        <div id="gemini-placeholder"></div>
                        <div class="status-group">
                            <div class="status-text">Idle</div>
                            <div class="wave-container">
                                <div class="wave"></div>
                            </div>
                        </div>
                        <div class="expanded-content">
                            <div class="stats-row">
                                <span class="stats-label">Status:</span>
                                <span class="stats-value" id="searchStatus">Idle</span>
                            </div>
                            <div class="stats-row">
                                <span class="stats-label">Wikis Searched:</span>
                                <span class="stats-value" id="wikisSearched">0/0</span>
                            </div>
                            <div class="stats-row">
                                <span class="stats-label">Results Found:</span>
                                <span class="stats-value" id="resultsFound">0</span>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(loadingDiv);
                indicator = loadingDiv;
            } else {
                ensureIndicatorStructure(indicator);
            }

            if (indicator && document.body.lastElementChild !== indicator) {
                document.body.appendChild(indicator);
                console.log('Moved #loadingIndicator to end of body for z-index stacking');
            }

            setupEventListeners();
            ensureWideToggle(indicator);
        }

        function ensureTopLevel() {
            const indicator = document.getElementById('loadingIndicator');
            if (indicator && document.body && document.body.lastElementChild !== indicator) {
                document.body.appendChild(indicator);
            }
        }

        function expand() {
            ensureTopLevel();
            const indicator = document.getElementById('loadingIndicator');
            if (!indicator) return;

            setCompact(false);
            indicator.classList.remove('compact');
            indicator.classList.add('visible');
            document.addEventListener('click', state.boundHandleOutsideClick);
            ensureWideToggle(indicator);

            // Restore wide mode preference
            try {
                if (localStorage.getItem('searchMonitorWide') === 'true') {
                    indicator.classList.add('wide-mode');
                }
            } catch (e) { /* ignore */ }
        }

        function collapse() {
            const indicator = document.getElementById('loadingIndicator');
            if (!indicator) return;

            setCompact(true);
            indicator.classList.add('compact');
            document.removeEventListener('click', state.boundHandleOutsideClick);
        }

        function handleOutsideClick(event) {
            const indicator = document.getElementById('loadingIndicator');
            if (indicator && !indicator.contains(event.target)) {
                collapse();
            }
        }

        function toggleCompactMode() {
            if (state.compact) {
                expand();
            } else {
                collapse();
            }
        }

        function ensureWideToggle(indicator) {
            if (indicator.dataset.togglesWired) return;
            indicator.dataset.togglesWired = 'true';

            // Wide Mode Toggle
            let wideBtn = indicator.querySelector('.monitor-wide-toggle');
            if (!wideBtn) {
                wideBtn = document.createElement('button');
                wideBtn.className = 'monitor-wide-toggle';
                wideBtn.title = 'Toggle wide view';
                wideBtn.setAttribute('aria-label', 'Toggle wide view');
                wideBtn.innerHTML = '⇔';
                indicator.insertBefore(wideBtn, indicator.firstChild);
            }

            wideBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isWide = indicator.classList.toggle('wide-mode');
                if (isWide) {
                    indicator.classList.remove('fullscreen-mode');
                }
                try { localStorage.setItem('searchMonitorWide', isWide ? 'true' : 'false'); } catch (ex) { /* ignore */ }
            });

            // Fullscreen Toggle
            let fsBtn = indicator.querySelector('.monitor-fullscreen-toggle');
            if (!fsBtn) {
                fsBtn = document.createElement('button');
                fsBtn.className = 'monitor-fullscreen-toggle';
                fsBtn.title = 'Toggle full screen';
                fsBtn.setAttribute('aria-label', 'Toggle full screen');
                fsBtn.innerHTML = '⛶';
                indicator.insertBefore(fsBtn, indicator.firstChild);
            }

            fsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isFs = indicator.classList.toggle('fullscreen-mode');
                if (isFs) {
                    indicator.classList.remove('wide-mode'); // Turn off wide so they don't conflict
                }
            });
        }

        return {
            setupEventListeners,
            createLoadingIndicator,
            _ensureTopLevel: ensureTopLevel,
            expand,
            collapse,
            handleOutsideClick,
            toggleCompactMode
        };
    };
})();
