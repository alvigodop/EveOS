window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const State = window.EveOS.SearchAdvanced.State;
    const Api = window.EveOS.SearchAdvanced.Api;

    function byId(id) {
        return document.getElementById(id);
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

    function bindEvents() {
        const runBtn = byId('esRunBtn');
        const clearBtn = byId('esClearBtn');
        const queryInput = byId('esQuery');
        if (runBtn) runBtn.onclick = runSearch;
        if (clearBtn) clearBtn.onclick = clearFilters;
        if (queryInput) {
            queryInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch();
                }
            });
        }
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
        const s = settings || {};
        if (byId('esApiKey')) byId('esApiKey').value = s.apiKey || '';
        if (byId('esCx')) byId('esCx').value = s.cx || '';
        if (byId('esSort')) byId('esSort').value = s.sort || '';
        if (byId('esSite')) byId('esSite').value = s.siteSearch || '';
        if (byId('esLanguage')) byId('esLanguage').value = s.lr || '';
        if (byId('esCountry')) byId('esCountry').value = s.cr || '';
        if (byId('esFileType')) byId('esFileType').value = s.fileType || '';
        if (byId('esDateRestrict')) byId('esDateRestrict').value = s.dateRestrict || '';
        if (byId('esSafe')) byId('esSafe').value = s.safe || '';
        if (byId('esRights')) byId('esRights').value = s.rights || '';
        if (byId('esNum')) byId('esNum').value = s.num || '10';
        if (byId('esExactTerms')) byId('esExactTerms').value = s.exactTerms || '';
        if (byId('esExcludeTerms')) byId('esExcludeTerms').value = s.excludeTerms || '';
        if (byId('esQuery') && typeof query === 'string') byId('esQuery').value = query;
    }

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

        results.innerHTML = items.map(item => {
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

    async function runSearch() {
        const query = getFieldValue('esQuery');
        const settings = collectSettings();
        State.updateSettings(settings);

        try {
            setLoading(true);
            const data = await Api.runSearch(query, settings);
            renderResults(data);
        } catch (error) {
            setMeta(error.message || 'Search failed.', true);
            const results = byId('esResults');
            if (results) results.innerHTML = `<p class="es-empty es-error">${escapeHtml(error.message || 'Search failed.')}</p>`;
        } finally {
            setLoading(false);
        }
    }

    function clearFilters() {
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

        const results = byId('esResults');
        if (results) results.innerHTML = '';
        setMeta('Filters cleared.', false);

        State.updateSettings(collectSettings());
    }

    function openExpandedSearchModal(options) {
        createModalIfNeeded();
        const settings = State.getSettings();
        const queryFromOptions = typeof options?.query === 'string'
            ? options.query
            : (byId('search')?.value || '');
        applySettingsToForm(settings, queryFromOptions);

        const modal = byId('expandedSearchModal');
        if (modal) modal.style.display = 'flex';

        if (options?.autoSearch) {
            runSearch();
        } else {
            const queryInput = byId('esQuery');
            if (queryInput) queryInput.focus();
        }
    }

    window.openExpandedSearchModal = openExpandedSearchModal;
    window.EveOS.SearchAdvanced.UI = {
        openExpandedSearchModal,
        runSearch
    };
})();

