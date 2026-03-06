window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    window.EveOS.SearchAdvanced.Modules.createUiResultHelpers = function createUiResultHelpers(formHelpers) {
        const byId = formHelpers.byId;
        const setMeta = formHelpers.setMeta;

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function renderResults(data) {
            const results = byId('esResults');
            if (!results) return;
            const items = Array.isArray(data?.items) ? data.items : [];

            if (items.length === 0) {
                results.innerHTML = '<p class="es-empty">No results found.</p>';
                setMeta('No results found.', false);
                return;
            }

            const total = data?.searchInformation?.formattedTotalResults || String(items.length);
            const time = data?.searchInformation?.formattedSearchTime || '';
            setMeta(`Results: ${total}${time ? ` in ${time}s` : ''}`, false);

            results.innerHTML = items.map(function (item) {
                const title = escapeHtml(item.title || 'Untitled');
                const url = escapeHtml(item.link || '#');
                const displayUrl = escapeHtml(item.formattedUrl || item.link || '');
                const snippet = escapeHtml(item.snippet || '');
                return `
<article class="es-result-item">
    <h4 class="es-result-title"><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></h4>
    <div class="es-result-url">${displayUrl}</div>
    <p class="es-result-snippet">${snippet}</p>
</article>`;
            }).join('');
        }

        return {
            escapeHtml,
            renderResults
        };
    };
})();
