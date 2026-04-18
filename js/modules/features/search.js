function handleOmniboxKey(e) {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            const q = document.getElementById('search')?.value || '';
            openExpandedSearchFromMain(!!q.trim());
        }
        else performWebSearch();
    }
}

function hardenSearchInputAutofill() {
    const input = document.getElementById('search');
    if (!input) return;

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-1p-ignore', 'true');

    input.addEventListener('input', function markUserInput() {
        input.dataset.userEdited = '1';
    }, { once: true });

    input.addEventListener('input', function reRenderOnInput() {
        if (typeof renderDashboard === 'function') renderDashboard();
    });

    function clearIfAutoFilled() {
        if (!input.dataset.userEdited && input.value) {
            input.value = '';
        }
    }

    clearIfAutoFilled();
    setTimeout(clearIfAutoFilled, 250);
    setTimeout(clearIfAutoFilled, 1200);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hardenSearchInputAutofill);
} else {
    hardenSearchInputAutofill();
}
