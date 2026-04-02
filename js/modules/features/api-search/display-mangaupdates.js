window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    function inferCountryFromFormat(format) {
        const normalized = String(format || '').trim().toLowerCase();
        if (normalized === 'manga') return 'JP';
        if (normalized === 'manhwa') return 'KR';
        if (normalized === 'manhua') return 'CN';
        return '';
    }

    function extractNamedValues(internalsRef, entries, keyName) {
        return internalsRef.uniqStrings(
            internalsRef.toArray(entries).map((entry) => {
                if (typeof entry === 'string') return entry;
                return entry?.[keyName] || entry?.name || entry?.title || '';
            })
        );
    }

    function extractTypedPeople(internalsRef, entries, typeName) {
        const targetType = String(typeName || '').toLowerCase();
        return internalsRef.uniqStrings(
            internalsRef.toArray(entries)
                .filter((entry) => {
                    if (!entry || typeof entry === 'string') return false;
                    return String(entry.type || '').toLowerCase() === targetType;
                })
                .map((entry) => entry?.name)
        );
    }

    internals.getMangaUpdatesMeta = function (item) {
        const record = item?.record || {};
        const details = item?._fullDetails || {};
        const cleanText = internals.cleanText || ((text) => text || '');
        const toArray = internals.toArray || ((value) => Array.isArray(value) ? value : []);
        const uniqStrings = internals.uniqStrings || ((values) => [...new Set(values)]);
        const limitList = internals.limitList || ((values, max) => (values || []).slice(0, max));

        const title = details.title || record.title || 'No Title';
        const description = cleanText(details.description || record.description || record.synopsis, 240);
        const coverUrl = details.image?.url?.original
            || record.image?.url?.original
            || 'https://via.placeholder.com/120x180?text=No+Cover';

        const genres = uniqStrings(toArray(details.genres || record.genres).map((entry) => entry?.genre || entry));
        const tags = uniqStrings(toArray(details.categories || record.categories).map((entry) => entry?.category || entry));
        const synonyms = uniqStrings(toArray(details.associated).map((entry) => entry?.title || entry));

        const authorsFromTyped = extractTypedPeople(internals, details.authors, 'author');
        const artistsFromTyped = extractTypedPeople(internals, details.authors, 'artist');
        const authors = authorsFromTyped.length
            ? authorsFromTyped
            : extractNamedValues(internals, record.authors, 'name');
        const artists = artistsFromTyped.length
            ? artistsFromTyped
            : extractNamedValues(internals, details.artists, 'name');

        const format = details.type || record.type || 'Manga';
        const statusSummary = details.status_summary || {};
        const status = details.status || record.status || statusSummary.status || '';
        const year = String(details.year || record.year || '');
        const score = details.bayesian_rating || record.bayesian_rating
            ? String(details.bayesian_rating || record.bayesian_rating)
            : 'N/A';

        const rankWeek = details.rank?.position?.week ? `#${details.rank.position.week}` : '';
        const popularity = details.rank?.position?.month ? `#${details.rank.position.month}` : '';
        const listReading = details.rank?.lists?.reading ? `${details.rank.lists.reading}` : '';
        const listWish = details.rank?.lists?.wish ? `${details.rank.lists.wish}` : '';
        const listCompleted = details.rank?.lists?.completed ? `${details.rank.lists.completed}` : '';
        const providerUrl = details.url || record.url || (record.series_id ? `https://www.mangaupdates.com/series/${record.series_id}` : '');

        const publications = extractNamedValues(internals, details.publications, 'publication_name');
        const publishers = extractNamedValues(internals, details.publishers, 'publisher_name');
        const groups = extractNamedValues(internals, details.groups_scanlating, 'group_name');
        const related = toArray(details.related_series)
            .slice(0, 5)
            .map((entry) => {
                const name = String(entry?.related_series_name || entry?.title || '').trim();
                const relation = String(entry?.relation_type || '').trim();
                if (!name) return '';
                return relation ? `${name} (${relation})` : name;
            })
            .filter(Boolean);
        const latestRelease = uniqStrings(toArray(details.latest_releases)).slice(0, 2);

        const combinedGenres = uniqStrings([
            ...genres,
            ...limitList(tags, 12),
            format
        ]);

        const metaTags = uniqStrings([
            ...limitList(tags, 100),
            details.licensed ? 'Licensed (EN)' : '',
            details.completed ? `Scanlated: ${details.completed}` : '',
            publications.length ? `Serialization: ${publications.join(', ')}` : '',
            publishers.length ? `Publishers: ${publishers.join(', ')}` : '',
            groups.length ? `Groups: ${groups.join(', ')}` : '',
            latestRelease.length ? `Latest: ${latestRelease.join(' | ')}` : '',
            listReading ? `Reading: ${listReading}` : '',
            listWish ? `Wish: ${listWish}` : '',
            listCompleted ? `Completed: ${listCompleted}` : ''
        ]);

        return {
            source: 'MangaUpdates',
            mediaType: format === 'Novel' ? 'Novel' : 'Manga',
            title,
            coverUrl,
            author: authors.join(', '),
            artist: artists.join(', '),
            studios: [],
            producers: [],
            synonyms,
            description,
            status,
            score,
            rank: rankWeek,
            popularity,
            members: listReading ? `${listReading} active` : '',
            favorites: listWish,
            chapters: details.chapters || statusSummary.chapters || record.chapters || '?',
            volumes: details.volumes || statusSummary.volumes || record.volumes || '?',
            episodes: '',
            duration: '',
            genres: combinedGenres,
            tags: metaTags,
            year,
            season: '',
            format,
            sourceMaterial: '',
            countryOfOrigin: details.country_of_origin || inferCountryFromFormat(format),
            contentRating: '',
            startDate: year,
            endDate: '',
            url: providerUrl,
            providerUrl,
            externalLinks: related.map((text) => ({ label: 'Related', url: '#', note: text }))
        };
    };
})(window.EveOS.API.DisplayInternals);
