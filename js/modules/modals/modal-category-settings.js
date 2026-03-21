(function () {

    const helpers = window.EveCategorySettingsModalHelpers || {};

    const renderCategoryHeaderButtonSettings = helpers.renderCategoryHeaderButtonSettings || function () {};

    const renderCategoryClickBehaviorSettings = helpers.renderCategoryClickBehaviorSettings || function () {};

    const renderCategoryPinSettings = helpers.renderCategoryPinSettings || function () {};



    window.openCategorySettings = function (categoryName, activeTab = 'general') {

        window.currentCategoryCtx = categoryName;

        window.ctxCatName = categoryName;



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

            return;

        }



        if (tabName === 'search') {

            const searchCont = document.getElementById('modal-api-search-container');

            const resultsCont = document.getElementById('modal-api-results-container');

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

            if (modalInner) {

                modalInner.style.width = '900px';

                modalInner.style.maxWidth = '95%';

            }

            if (scraperCont && window.CategoryScraperPanel) {

                window.CategoryScraperPanel.renderInModal(window.currentCategoryCtx, scraperCont);

                setTimeout(() => {

                    const input = scraperCont.querySelector('.scraper-search-input');

                    if (input) input.focus();

                }, 100);

            }

        }

    };


})();

