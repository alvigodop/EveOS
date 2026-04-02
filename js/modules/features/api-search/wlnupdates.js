window.EveOS = window.EveOS || {};

(function () {
    async function searchWlnUpdates(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const body = {
            mode: 'search-title',
            title: query
        };

        try {
            const result = await Core.fetchDirectThenProxy(Core.WLNUPDATES_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }, 'WlnUpdates Search failed');
            return result || { data: [] };
        } catch (e) {
            console.warn('WlnUpdates Search failed', e);
            return { data: [] };
        }
    }

    window.EveOS.API.WlnUpdates = {
        searchWlnUpdates
    };
})();
