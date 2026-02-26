/**
 * Dropdown Handler Module
 * 
 * Handles dropdown interactions (e.g. Modules menu)
 * Extracted from ScraperTest.html
 */

(function () {
    window.toggleModulesDropdown = function (e) {
        e.stopPropagation();
        const dropdown = document.getElementById('modulesDropdown');
        if (dropdown) {
            dropdown.classList.toggle('show');
        }
    };

    // Close dropdown when clicking outside
    window.addEventListener('click', function (e) {
        // Ignore programmatic clicks from the freeze detector
        if (e.target.id === 'freeze-detector-button') return;

        // Check if the click is outside the dropdown button
        // Use closest() to handle clicks on child elements (like icons)
        if (!e.target.closest('.dropdown-btn')) {
            const dropdowns = document.getElementsByClassName("dropdown-content");
            for (let i = 0; i < dropdowns.length; i++) {
                const openDropdown = dropdowns[i];
                if (openDropdown.classList.contains('show')) {
                    openDropdown.classList.remove('show');
                }
            }
        }
    });
})();
