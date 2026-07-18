window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexSearchCompact) return;

    function normalizeSource(value) {
        let source = String(value == null ? '' : value).trim().toLowerCase();
        try { source = decodeURIComponent(source); } catch { /* retain malformed/custom URLs */ }
        try { source = source.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch { /* old browser */ }
        return source;
    }

    function compact(value) {
        return normalizeSource(value).replace(/[^a-z0-9]+/g, '');
    }

    function tokenize(value) {
        return normalizeSource(value).split(/[^a-z0-9]+/g).filter(Boolean);
    }

    function recordFields(record) {
        return [
            record?.title,
            record?.description,
            record?.url,
            record?.displayUrl,
            record?.provider,
            record?.categoryName,
            record?.path?.workspaceLabel,
            record?.path?.pathLabel
        ];
    }

    function matchesField(field, needle) {
        const tokens = tokenize(field);
        if (tokens.some(token => token.includes(needle))) return true;

        return tokens.some(function (token, index) {
            if (token.length >= needle.length) return false;
            let joined = token;
            for (let next = index + 1; next < tokens.length && joined.length < needle.length; next += 1) {
                joined += tokens[next];
            }
            // Cross-separator matches must begin at a real token boundary. This keeps
            // Astro Boy -> astrob while rejecting Last Round -> lastround for astro.
            return joined.length >= needle.length && joined.startsWith(needle);
        });
    }

    function matchesRecord(record, query) {
        const needle = compact(query);
        if (needle.length < 3) return false;
        return recordFields(record).some(field => matchesField(field, needle));
    }

    ns.IndexSearchCompact = { matchesRecord };
})();
