
// --- Sources Component ---
// Handles source list management and rendering for the Add/Edit Link Modal

(function () {
    // Note: window.tempSources is expected to be managed by the parent form (link-form.js)
    // or we could manage it here if we expose getters/setters.
    // For now, we'll keep the existing pattern of reading/writing to window.tempSources
    // to minimize refactor friction, but in a real app this should be better encapsulated.

    function searchLinkName() {
        const nameInput = document.getElementById('newTitle');
        const resultsDiv = document.getElementById('edit-link-search-results');
        const query = nameInput.value.trim();

        if (!query) return showToast("Enter a name to search", "warning");

        if (window.EveOS && window.EveOS.API && window.EveOS.API.Manager) {
            window.EveOS.API.Manager.runSearch(query, resultsDiv, (data) => {
                // Function to add source
                addSource(data);
                resultsDiv.style.display = 'none';
                resultsDiv.innerHTML = '';
            });
        } else {
            showToast("Search API not ready", "error");
        }
    }

    function addSource(data) {
        // Check for duplicates (by URL)
        // Ensure tempSources is initialized
        if (!window.tempSources) window.tempSources = [];

        if (window.tempSources.some(s => s.url === data.url)) {
            return showToast("Source already added", "info");
        }
        window.tempSources.push(data);
        renderSourcesList();
        showToast("Source Added", "success");
    }

    function removeSource(index) {
        if (!window.tempSources) return;
        window.tempSources.splice(index, 1);
        renderSourcesList();
    }

    function renderSourcesList() {
        const container = document.getElementById('link-sources-container');
        if (!container) return; // Guard clause

        if (!window.tempSources || window.tempSources.length === 0) {
            container.innerHTML = '<div style="opacity:0.5; font-size:0.9rem;">No sources attached.</div>';
            return;
        }

        container.innerHTML = window.tempSources.map((s, index) => `
            <div class="source-item">
                <img src="${s.coverUrl || ''}" onerror="this.src='https://via.placeholder.com/40'" class="source-thumb">
                <div class="source-details">
                    <div class="source-title">${s.title}</div>
                    <div class="source-meta"><a href="${s.url}" target="_blank" class="source-provider-link">${s.source}</a> • ${s.score || '-'}</div>
                </div>
                <button class="remove-source-btn" onclick="removeSource(${index})">×</button>
            </div>
        `).join('');
    }

    // Expose functions globally as per existing codebase pattern
    window.searchLinkName = searchLinkName;
    window.addSource = addSource;
    window.removeSource = removeSource;
    window.renderSourcesList = renderSourcesList;

})();
