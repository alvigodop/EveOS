window.refreshCategoryDatalist = function () {
    const dataList = document.getElementById('availableCategories');
    if (!dataList) return;
    dataList.innerHTML = '';
    // Assumes 'links' is globally available
    const categories = [...new Set(links.map(l => l.category || "Unsorted"))].sort();
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        dataList.appendChild(option);
    });
};
