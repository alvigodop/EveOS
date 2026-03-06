window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    if (window.EveOS.SearchAdvanced.Modules.createUiFormFields) return;

    window.EveOS.SearchAdvanced.Modules.createUiFormFields = function createUiFormFields() {
        function byId(id) {
            return document.getElementById(id);
        }

        function setLoading(isLoading) {
            const runBtn = byId('esRunBtn');
            const results = byId('esResults');
            if (runBtn) {
                runBtn.disabled = !!isLoading;
                runBtn.textContent = isLoading ? 'Searching...' : 'Search';
            }
            if (isLoading && results) {
                results.innerHTML = '<div class="es-loader"></div>';
            }
        }

        function setMeta(text, isError) {
            const meta = byId('esMeta');
            if (!meta) return;
            meta.textContent = text || '';
            meta.classList.toggle('is-error', !!isError);
        }

        function getFieldValue(id) {
            return (byId(id)?.value || '').trim();
        }

        function collectSettings() {
            return {
                apiKey: getFieldValue('esApiKey'),
                cx: getFieldValue('esCx'),
                sort: byId('esSort')?.value || '',
                siteSearch: getFieldValue('esSite'),
                lr: byId('esLanguage')?.value || '',
                cr: byId('esCountry')?.value || '',
                fileType: byId('esFileType')?.value || '',
                dateRestrict: byId('esDateRestrict')?.value || '',
                safe: byId('esSafe')?.value || '',
                rights: byId('esRights')?.value || '',
                num: byId('esNum')?.value || '10',
                exactTerms: getFieldValue('esExactTerms'),
                excludeTerms: getFieldValue('esExcludeTerms')
            };
        }

        function applySettingsToForm(settings, query) {
            const current = settings || {};
            if (byId('esApiKey')) byId('esApiKey').value = current.apiKey || '';
            if (byId('esCx')) byId('esCx').value = current.cx || '';
            if (byId('esSort')) byId('esSort').value = current.sort || '';
            if (byId('esSite')) byId('esSite').value = current.siteSearch || '';
            if (byId('esLanguage')) byId('esLanguage').value = current.lr || '';
            if (byId('esCountry')) byId('esCountry').value = current.cr || '';
            if (byId('esFileType')) byId('esFileType').value = current.fileType || '';
            if (byId('esDateRestrict')) byId('esDateRestrict').value = current.dateRestrict || '';
            if (byId('esSafe')) byId('esSafe').value = current.safe || '';
            if (byId('esRights')) byId('esRights').value = current.rights || '';
            if (byId('esNum')) byId('esNum').value = current.num || '10';
            if (byId('esExactTerms')) byId('esExactTerms').value = current.exactTerms || '';
            if (byId('esExcludeTerms')) byId('esExcludeTerms').value = current.excludeTerms || '';
            if (byId('esQuery') && typeof query === 'string') byId('esQuery').value = query;
        }

        function resetFilters() {
            if (byId('esSort')) byId('esSort').value = '';
            if (byId('esSite')) byId('esSite').value = '';
            if (byId('esLanguage')) byId('esLanguage').value = '';
            if (byId('esCountry')) byId('esCountry').value = '';
            if (byId('esFileType')) byId('esFileType').value = '';
            if (byId('esDateRestrict')) byId('esDateRestrict').value = '';
            if (byId('esSafe')) byId('esSafe').value = '';
            if (byId('esRights')) byId('esRights').value = '';
            if (byId('esNum')) byId('esNum').value = '10';
            if (byId('esExactTerms')) byId('esExactTerms').value = '';
            if (byId('esExcludeTerms')) byId('esExcludeTerms').value = '';
        }

        return {
            byId,
            setLoading,
            setMeta,
            collectSettings,
            applySettingsToForm,
            resetFilters
        };
    };
})();
