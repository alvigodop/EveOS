(function () {

    const helpers = window.EveCategorySettingsModalHelpers || {};

    const renderCategoryHeaderButtonSettings = helpers.renderCategoryHeaderButtonSettings || function () {};

    const renderCategoryClickBehaviorSettings = helpers.renderCategoryClickBehaviorSettings || function () {};

    const renderCategoryPinSettings = helpers.renderCategoryPinSettings || function () {};

    function renderScraperBootState(container, message) {
        if (!container) return;
        container.innerHTML = `
            <div class="scraper-boot-card">
                <div class="scraper-boot-kicker">Scraper Workspace</div>
                <div class="scraper-boot-title">Loading scraper modules</div>
                <div class="scraper-boot-copy">${String(message || 'Preparing the card-scoped scraper workspace and updated provider controls.')}</div>
            </div>
        `;
    }

    function renderScraperWhenReady(scraperCont, modalInner) {
        if (!scraperCont) return;

        if (modalInner) {
            modalInner.style.width = '900px';
            modalInner.style.maxWidth = '95%';
        }

        if (window.CategoryScraperPanel && window.ScraperPanelTemplate) {
            window.CategoryScraperPanel.renderInModal(window.currentCategoryCtx, scraperCont);
            setTimeout(() => {
                const input = scraperCont.querySelector('.scraper-search-input, #searchInput');
                if (input) input.focus();
            }, 100);
            return;
        }

        renderScraperBootState(scraperCont);
        window.__RUSH_DEFERRED_LOAD = true;

        if (typeof window.__loadDeferredScriptsNow === 'function') {
            window.__loadDeferredScriptsNow();
        }

        const startedAt = Date.now();
        const poll = window.setInterval(function () {
            const scraperTab = document.getElementById('cat-tab-scraper');
            const stillVisible = scraperTab && scraperTab.style.display !== 'none';
            if (!stillVisible) {
                window.clearInterval(poll);
                return;
            }

            if (window.CategoryScraperPanel && window.ScraperPanelTemplate) {
                window.clearInterval(poll);
                window.CategoryScraperPanel.renderInModal(window.currentCategoryCtx, scraperCont);
                setTimeout(() => {
                    const input = scraperCont.querySelector('.scraper-search-input, #searchInput');
                    if (input) input.focus();
                }, 100);
                return;
            }

            if (Date.now() - startedAt > 20000) {
                window.clearInterval(poll);
                renderScraperBootState(scraperCont, 'Scraper modules are taking longer than expected. Keep this tab open for a moment or reload the page.');
            }
        }, 50);
    }



    window.openCategorySettings = function (categoryName, activeTab = 'general') {

        window.currentCategoryCtx = categoryName;
        // Persist context for reload recovery
        try {
            localStorage.setItem('eve_current_category_context', categoryName);
        } catch (e) {}

        window.ctxCatName = categoryName;

        if (window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
            window.StorageManager.setCategoryContext(categoryName);
        }



        const titleEl = document.getElementById('catSettingsTitle');

        if (titleEl) titleEl.innerText = `Settings: ${categoryName}`;



        const modal = document.getElementById('categorySettingsModal');

        if (modal) {

            modal.style.display = 'flex';

            const mapOverlay = document.getElementById('constellation-map-overlay');

            if (mapOverlay && mapOverlay.style.display !== 'none') {

                modal.style.zIndex = '10020';

            }

            switchCategoryTab(activeTab);

        }

    };



    window.switchCategoryTab = function (tabName) {

        document.querySelectorAll('#categorySettingsModal .tab-btn').forEach((button) => button.classList.remove('active'));

        const tabBtn = document.getElementById(`tab-btn-${tabName}`);

        if (tabBtn) tabBtn.classList.add('active');



        document.querySelectorAll('#categorySettingsModal .tab-content').forEach((content) => {

            content.style.display = 'none';

        });

        const tabContent = document.getElementById(`cat-tab-${tabName}`);

        if (tabContent) tabContent.style.display = 'block';



        const modalInner = document.querySelector('#categorySettingsModal .modal');

        if (modalInner) {

            modalInner.style.width = '500px';

            modalInner.style.maxWidth = '90%';

        }



        if (tabName === 'folders') {

            window.renderCategoryFolderManager();

            if (modalInner) {

                modalInner.style.width = '620px';

                modalInner.style.maxWidth = '94%';

            }

            return;

        }



        if (tabName === 'general') {

            renderCategoryHeaderButtonSettings();

            renderCategoryClickBehaviorSettings();

            renderCategoryPinSettings();

            // Populate True Value Sorting controls
            (function () {
                const cat = window.currentCategoryCtx;
                const wsId = String((window.config && window.config.activeWorkspace) || 'main');
                const tvApi = window.EveTrueValue;
                const toggle = document.getElementById('trueValueEnabledToggle');
                const scaleSelect = document.getElementById('trueValueScaleSelect');
                const slider = document.getElementById('trueValueInfluenceSlider');
                const label = document.getElementById('trueValueInfluenceLabel');

                if (toggle && tvApi) {
                    toggle.checked = tvApi.isEnabled(wsId, cat);
                    const settings = tvApi.getSettings(wsId, cat);
                    if (scaleSelect) scaleSelect.value = settings.ratingScale;
                    if (slider) {
                        slider.value = Math.round(settings.influenceWeight * 100);
                        if (label) label.textContent = slider.value + '%';
                    }
                }

                window._tvSettingsOnChange = function () {
                    if (!tvApi || !cat) return;
                    const key = tvApi.buildScopeKey(wsId, cat);
                    // Sync enabled state
                    const isOn = toggle ? toggle.checked : false;
                    if (!Array.isArray(config.trueValueEnabled)) config.trueValueEnabled = [];
                    const idx = config.trueValueEnabled.indexOf(key);
                    if (isOn && idx === -1) config.trueValueEnabled.push(key);
                    if (!isOn && idx !== -1) config.trueValueEnabled.splice(idx, 1);
                    // Sync settings
                    if (!config.trueValueSettings) config.trueValueSettings = {};
                    if (!config.trueValueSettings[key]) config.trueValueSettings[key] = {};
                    if (scaleSelect) config.trueValueSettings[key].ratingScale = scaleSelect.value;
                    if (slider) config.trueValueSettings[key].influenceWeight = parseInt(slider.value, 10) / 100;
                    saveConfig();
                    if (typeof renderDashboard === 'function') renderDashboard();
                };
            })();

            return;

        }



        if (tabName === 'search') {

            const searchCont = document.getElementById('modal-api-search-container');

            const resultsCont = document.getElementById('modal-api-results-container');

            if (window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
                window.StorageManager.setCategoryContext(window.currentCategoryCtx);
            }

            if (window.EveOS?.API?.Manager) {

                window.EveOS.API.Manager.renderSearchUI(searchCont, resultsCont, window.currentCategoryCtx);

                setTimeout(() => {

                    const input = searchCont.querySelector('input');

                    if (input) input.focus();

                }, 100);

            }

            return;

        }



        if (tabName === 'scraper') {

            const scraperCont = document.getElementById('modal-scraper-container');
            renderScraperWhenReady(scraperCont, modalInner);

        }

    };


})();

