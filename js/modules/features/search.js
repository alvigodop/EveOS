function handleOmniboxKey(e) {
    if (e.key === 'Enter') performWebSearch();
    else if (typeof renderDashboard === 'function') renderDashboard();
}

function performWebSearch() {
    const q = document.getElementById('search').value;
    if (q) {
        const engine = (typeof config !== 'undefined' && config.searchEngine)
            ? config.searchEngine
            : "https://www.google.com/search?q=";
        window.open(`${engine}${encodeURIComponent(q)}`, '_blank');
    }
}
