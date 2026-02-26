/**
 * Discovery UI Interface Module
 * Handles rendering of the search interface structure
 */
const DUIInterface = {};

/**
 * Renders a Google-like search interface for Fandom wikis
 * @param {string} searchTerm - The search term
 * @param {HTMLElement} container - The container to render in
 */
DUIInterface.renderGoogleSearchInterface = function (searchTerm, container) {
    if (!container) {
        console.error('No container provided for Google search interface');
        return;
    }

    // Clear the container
    container.innerHTML = '';

    // Create the Google search header
    const googleHeader = document.createElement('div');
    googleHeader.className = 'google-search-header';

    // Add Google logo
    const googleLogo = document.createElement('div');
    googleLogo.className = 'google-logo';
    googleLogo.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 272 92" width="120">
            <path fill="#EA4335" d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"/>
            <path fill="#FBBC05" d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"/>
            <path fill="#4285F4" d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z"/>
            <path fill="#34A853" d="M225 3v65h-9.5V3h9.5z"/>
            <path fill="#EA4335" d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z"/>
            <path fill="#4285F4" d="M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z"/>
        </svg>
    `;
    googleHeader.appendChild(googleLogo);

    // Add search bar
    const googleSearchBar = document.createElement('div');
    googleSearchBar.className = 'google-search-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.value = searchTerm;
    searchInput.className = 'google-search-input';

    // Add search button
    const searchButton = document.createElement('button');
    searchButton.className = 'google-search-button';
    searchButton.innerHTML = `
        <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
        </svg>
    `;

    googleSearchBar.appendChild(searchInput);
    googleSearchBar.appendChild(searchButton);
    googleHeader.appendChild(googleSearchBar);

    // Add header to container
    container.appendChild(googleHeader);

    // Create navigation tabs
    const navTabs = document.createElement('div');
    navTabs.className = 'google-nav-tabs';

    // Create a container for each type of results
    const allResultsContainer = document.createElement('div');
    allResultsContainer.className = 'google-search-results-container all-results';
    allResultsContainer.style.display = 'none';

    const fandomResultsContainer = document.createElement('div');
    fandomResultsContainer.className = 'google-search-results-container fandom-results';
    fandomResultsContainer.style.display = 'block';

    const tabs = [
        {
            name: 'All',
            icon: '<svg focusable="false" viewBox="0 0 24 24"><path fill="#34a853" d="M10 2v2a6 6 0 0 1 6 6h2a8 8 0 0 0-8-8"></path><path fill="#ea4335" d="M10 4V2a8 8 0 0 0-8 8h2c0-3.3 2.7-6 6-6"></path><path fill="#fbbc04" d="M4 10H2a8 8 0 0 0 8 8v-2c-3.3 0-6-2.69-6-6"></path><path fill="#4285f4" d="M22 20.59l-5.69-5.69A7.96 7.96 0 0 0 18 10h-2a6 6 0 0 1-6 6v2c1.85 0 3.52-.64 4.88-1.68l5.69 5.69L22 20.59"></path></svg>',
            container: allResultsContainer,
            active: false
        },
        {
            name: 'Fandom Wikis',
            icon: '<svg focusable="false" viewBox="0 0 24 24"><path d="M12 11h6v2h-6v-2zm-6 6h12v-2H6v2zm0-4h4V7H6v6zm16-7.22v12.44c0 1.54-1.34 2.78-3 2.78H5c-1.64 0-3-1.25-3-2.78V5.78C2 4.26 3.36 3 5 3h14c1.64 0 3 1.25 3 2.78zM19.99 12V5.78c0-.42-.46-.78-1-.78H5c-.54 0-1 .36-1 .78v12.44c0 .42.46.78 1 .78h14c.54 0 1-.36 1-.78V12zM12 9h6V7h-6v2z"></path></svg>',
            container: fandomResultsContainer,
            active: true
        }
    ];

    // Create and add the tabs
    tabs.forEach(tab => {
        const tabElement = document.createElement('div');
        tabElement.className = 'google-tab';
        tabElement.innerHTML = `
            <div class="tab-icon">${tab.icon}</div>
            <span>${tab.name}</span>
        `;

        // Set active tab
        if (tab.active) {
            tabElement.classList.add('active');
        }

        // Add click handler to switch between tabs
        tabElement.addEventListener('click', () => {
            // Remove active class from all tabs
            navTabs.querySelectorAll('.google-tab').forEach(t => {
                t.classList.remove('active');
            });

            // Add active class to clicked tab
            tabElement.classList.add('active');

            // Hide all result containers
            tabs.forEach(t => {
                t.container.style.display = 'none';
            });

            // Show the selected container
            tab.container.style.display = 'block';
        });

        navTabs.appendChild(tabElement);
    });

    container.appendChild(navTabs);

    // Create main results container
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'google-search-results';

    // Add search stats to both containers
    tabs.forEach(tab => {
        const searchStats = document.createElement('div');
        searchStats.className = 'google-search-stats';
        searchStats.textContent = `About {results-count} results (0.{random} seconds)`;
        tab.container.appendChild(searchStats);
    });

    // Add the result containers to the main container
    resultsContainer.appendChild(allResultsContainer);
    resultsContainer.appendChild(fandomResultsContainer);
    container.appendChild(resultsContainer);

    // Return the Fandom results container for populating with actual results
    return fandomResultsContainer;
};

// Ensure global availability
window.DUIInterface = DUIInterface;
console.log('[DUIInterface] Loaded');
