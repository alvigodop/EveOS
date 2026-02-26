window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const State = window.EveOS.SearchAdvanced.State;

    async function runSearch(query, settings) {
        const url = State.buildUrl(query, settings);
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = data?.error?.message || response.statusText || 'Unknown API error';
            throw new Error(`API Error (${response.status}): ${message}`);
        }

        return data;
    }

    window.EveOS.SearchAdvanced.Api = {
        runSearch
    };
})();

