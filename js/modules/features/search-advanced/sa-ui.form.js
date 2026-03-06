window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    window.EveOS.SearchAdvanced.Modules.createUiFormHelpers = function createUiFormHelpers(deps) {
        const onRunSearch = typeof deps?.onRunSearch === 'function' ? deps.onRunSearch : function () {};
        const onClearFilters = typeof deps?.onClearFilters === 'function' ? deps.onClearFilters : function () {};

        function byId(id) {
            return document.getElementById(id);
        }

        function bindEvents() {
            const runBtn = byId('esRunBtn');
            const clearBtn = byId('esClearBtn');
            const queryInput = byId('esQuery');
            if (runBtn) runBtn.onclick = onRunSearch;
            if (clearBtn) clearBtn.onclick = onClearFilters;
            if (queryInput) {
                queryInput.addEventListener('keypress', function (event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        onRunSearch();
                    }
                });
            }
        }

        function createModalIfNeeded() {
            if (byId('expandedSearchModal')) return;

            const html = `
<div class="modal-overlay" id="expandedSearchModal">
    <div class="modal es-modal">
        <h2>Expanded Search</h2>
        <div class="es-grid es-grid-main">
            <label class="es-field es-field-full">Query
                <input type="text" id="esQuery" placeholder="Search query">
            </label>
            <label class="es-field">Google API Key
                <input type="password" id="esApiKey" placeholder="Google API key">
            </label>
            <label class="es-field">Search Engine ID (CX)
                <input type="text" id="esCx" placeholder="Programmable Search Engine ID">
            </label>
        </div>

        <div class="es-grid">
            <label class="es-field">Sort
                <select id="esSort">
                    <option value="">Relevance (Default)</option>
                    <option value="date">Date</option>
                </select>
            </label>
            <label class="es-field">Site Restrict
                <input type="text" id="esSite" placeholder="example.com">
            </label>
            <label class="es-field">Language
                <select id="esLanguage">
                    <option value="">Any</option>
                    <option value="lang_en">English</option>
                    <option value="lang_es">Spanish</option>
                    <option value="lang_fr">French</option>
                    <option value="lang_de">German</option>
                    <option value="lang_ja">Japanese</option>
                    <option value="lang_ko">Korean</option>
                    <option value="lang_zh-CN">Chinese (Simplified)</option>
                    <option value="lang_zh-TW">Chinese (Traditional)</option>
                </select>
            </label>
            <label class="es-field">Country
                <select id="esCountry">
                    <option value="">Any</option>
                    <option value="countryUS">United States</option>
                    <option value="countryCA">Canada</option>
                    <option value="countryGB">United Kingdom</option>
                    <option value="countryAU">Australia</option>
                    <option value="countryDE">Germany</option>
                    <option value="countryFR">France</option>
                    <option value="countryJP">Japan</option>
                </select>
            </label>
            <label class="es-field">File Type
                <select id="esFileType">
                    <option value="">Any</option>
                    <option value="pdf">PDF</option>
                    <option value="doc">DOC</option>
                    <option value="docx">DOCX</option>
                    <option value="xls">XLS</option>
                    <option value="xlsx">XLSX</option>
                    <option value="ppt">PPT</option>
                    <option value="pptx">PPTX</option>
                    <option value="txt">TXT</option>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                    <option value="gif">GIF</option>
                </select>
            </label>
            <label class="es-field">Date Range
                <select id="esDateRestrict">
                    <option value="">Any Time</option>
                    <option value="d[1]">Past 24 hours</option>
                    <option value="w[1]">Past week</option>
                    <option value="m[1]">Past month</option>
                    <option value="m[6]">Past 6 months</option>
                    <option value="y[1]">Past year</option>
                </select>
            </label>
            <label class="es-field">SafeSearch
                <select id="esSafe">
                    <option value="">Default</option>
                    <option value="active">Strict</option>
                    <option value="off">Off</option>
                </select>
            </label>
            <label class="es-field">Usage Rights
                <select id="esRights">
                    <option value="">Any</option>
                    <option value="cc_publicdomain">Public Domain</option>
                    <option value="cc_attribute">Attribution</option>
                    <option value="cc_sharealike">Share Alike</option>
                    <option value="cc_noncommercial">Non-Commercial</option>
                    <option value="cc_nonderived">No Derivatives</option>
                </select>
            </label>
            <label class="es-field">Results Per Page
                <select id="esNum">
                    <option value="10">10 (Max)</option>
                    <option value="5">5</option>
                    <option value="3">3</option>
                    <option value="1">1</option>
                </select>
            </label>
            <label class="es-field">Exact Phrase
                <input type="text" id="esExactTerms" placeholder="Exact phrase">
            </label>
            <label class="es-field">Exclude Words
                <input type="text" id="esExcludeTerms" placeholder="Words to exclude">
            </label>
        </div>

        <div class="es-actions">
            <button class="btn-primary" id="esRunBtn">Search</button>
            <button id="esClearBtn">Clear Filters</button>
            <button onclick="closeModals()">Close</button>
        </div>

        <div class="es-meta" id="esMeta">Set API Key + CX, then search.</div>
        <div class="es-results" id="esResults"></div>
    </div>
</div>`;

            document.body.insertAdjacentHTML('beforeend', html);
            bindEvents();
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
            createModalIfNeeded,
            setLoading,
            setMeta,
            collectSettings,
            applySettingsToForm,
            resetFilters
        };
    };
})();
