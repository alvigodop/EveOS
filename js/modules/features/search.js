function handleOmniboxKey(e) {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            const q = document.getElementById('search')?.value || '';
            openExpandedSearchFromMain(!!q.trim());
        }
        else performWebSearch();
    }
    else if (typeof renderDashboard === 'function') renderDashboard();
}

function performWebSearch() {
    const q = document.getElementById('search').value;
    const useExpanded = (typeof config !== 'undefined' && config.searchMode === 'expanded');
    if (useExpanded) {
        openExpandedSearchFromMain(!!(q && q.trim()));
        return;
    }

    if (q) {
        const engine = (typeof config !== 'undefined' && config.searchEngine)
            ? config.searchEngine
            : "https://www.google.com/search?q=";
        window.open(`${engine}${encodeURIComponent(q)}`, '_blank');
    }
}

function openExpandedSearchFromMain(autoSearch) {
    const query = document.getElementById('search')?.value || '';
    if (typeof window.openExpandedSearchModal === 'function') {
        window.openExpandedSearchModal({ query, autoSearch: !!autoSearch });
        return;
    }
    if (typeof showToast === 'function') {
        showToast('Expanded search is still loading. Try again.', 'warning');
    }
}
