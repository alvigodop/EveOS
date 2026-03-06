window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    if (window.EveOS.SearchAdvanced.Modules.createUiFormTemplate) return;

    window.EveOS.SearchAdvanced.Modules.createUiFormTemplate = function createUiFormTemplate() {
        return `
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
    };
})();
