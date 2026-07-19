window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexSearchCompact) return;
    const recordCache = new WeakMap();

    function normalizeSource(value) {
        let source = String(value == null ? '' : value).trim().toLowerCase();
        try { source = decodeURIComponent(source); } catch { /* retain malformed/custom URLs */ }
        try { source = source.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch { /* old browser */ }
        return source;
    }

    function compact(value) {
        return normalizeSource(value).replace(/[^a-z0-9]+/g, '');
    }

    function tokenizeNormalized(value) {
        return value.split(/[^a-z0-9]+/g).filter(Boolean);
    }

    function tokenize(value) {
        return tokenizeNormalized(normalizeSource(value));
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

    function getRecordCache(record) {
        if (!record || typeof record !== 'object') return { fields: [], coverageTokens: [] };
        const cached = recordCache.get(record);
        if (cached) return cached;
        const fields = recordFields(record);
        const parts = normalizeSource(fields.concat(record?.searchableText).join('\u0000')).split('\u0000');
        const analysis = {
            fields: parts.slice(0, fields.length),
            coverageTokens: Array.from(new Set(parts.reduce(function (all, part) {
                return all.concat(tokenizeNormalized(part));
            }, [])))
        };
        recordCache.set(record, analysis);
        return analysis;
    }

    function prepare(query) {
        const needle = compact(query);
        return {
            needle,
            tokens: Array.from(new Set(tokenize(query))),
            bridgePattern: needle.length >= 3
                ? new RegExp('(?:^|[^a-z0-9])' + needle.split('').join('[^a-z0-9]*'))
                : null
        };
    }

    function matchesPrepared(record, prepared) {
        const needle = prepared?.needle || '';
        if (needle.length < 3) return false;
        return getRecordCache(record).fields.some(function (field) {
            return field.includes(needle) || prepared.bridgePattern?.test(field);
        });
    }

    function matchesRecord(record, query) {
        return matchesPrepared(record, prepare(query));
    }

    ns.IndexSearchCompact = {
        prepare,
        matchesPrepared,
        matchesRecord,
        getCoverageTokens(record) {
            return getRecordCache(record).coverageTokens;
        }
    };
})();
