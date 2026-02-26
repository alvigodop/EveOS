window.currentCategoryCtx = null; // Track which category is being edited

window.openCategorySettings = function (categoryName, activeTab = 'general') {
    window.currentCategoryCtx = categoryName;

    // Update Title
    const titleEl = document.getElementById('catSettingsTitle');
    if (titleEl) titleEl.innerText = `Settings: ${categoryName}`;

    // Show Modal
    const modal = document.getElementById('categorySettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        switchCategoryTab(activeTab);
    }
};

window.switchCategoryTab = function (tabName) {
    // Buttons
    document.querySelectorAll('#categorySettingsModal .tab-btn').forEach(b => b.classList.remove('active'));
    const tabBtn = document.getElementById(`tab-btn-${tabName}`);
    if (tabBtn) tabBtn.classList.add('active');

    // Content
    document.querySelectorAll('#categorySettingsModal .tab-content').forEach(c => c.style.display = 'none');
    const tabContent = document.getElementById(`cat-tab-${tabName}`);
    if (tabContent) tabContent.style.display = 'block';

    // Special logic for Search Tab
    if (tabName === 'search') {
        const searchCont = document.getElementById('modal-api-search-container');
        const resultsCont = document.getElementById('modal-api-results-container');

        // Initialize Search if EveOS API is ready
        if (window.EveOS && window.EveOS.API && window.EveOS.API.Manager) {
            // Render UI
            window.EveOS.API.Manager.renderSearchUI(searchCont, resultsCont, window.currentCategoryCtx);

            // Auto-focus input
            setTimeout(() => {
                const input = searchCont.querySelector('input');
                if (input) input.focus();
            }, 100);
        }
    }

    // Special logic for Scraper Tab
    if (tabName === 'scraper') {
        const scraperCont = document.getElementById('modal-scraper-container');

        // Widen modal for Scraper view
        const modalInner = document.querySelector('#categorySettingsModal .modal');
        if (modalInner) {
            modalInner.style.width = '900px';
            modalInner.style.maxWidth = '95%';
        }

        if (scraperCont && window.CategoryScraperPanel) {
            // Render the scraper panel for this category
            CategoryScraperPanel.renderInModal(window.currentCategoryCtx, scraperCont);

            // Auto-focus input
            setTimeout(() => {
                const input = scraperCont.querySelector('.scraper-search-input');
                if (input) input.focus();
            }, 100);
        }
    } else {
        // Revert modal width for other tabs
        const modalInner = document.querySelector('#categorySettingsModal .modal');
        if (modalInner) {
            modalInner.style.width = '500px';
            modalInner.style.maxWidth = '90%';
        }
    }
};
