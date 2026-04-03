window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    function extractNames(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map((item) => {
            if (typeof item === 'string') return item;
            return item?.name || item?.title || item?.slug || item?.md_genres?.name || item?.md_tags?.name || item?.label || '';
        }).filter(Boolean);
    }

    function statusFromCode(code) {
        const statusMap = {
            1: 'Ongoing',
            2: 'Completed',
            3: 'Cancelled',
            4: 'Hiatus'
        };
        return statusMap[code] || '';
    }

    function translationLabel(detail, item) {
        const source = String(detail?.translationStatus || '').trim();
        if (source) return source;
        if (item.translation_completed === true) return 'Completed';
        if (item.translation_completed === false) return 'Ongoing';
        return '';
    }

    function mediaTypeFromItem(detail, item) {
        const origin = String(detail?.origination || '').trim();
        if (origin) return origin;
        if (item.country === 'kr') return 'Manhwa';
        if (item.country === 'cn') return 'Manhua';
        return 'Manga';
    }

    function countryFromItem(detail, item) {
        const origin = String(detail?.origination || '').trim().toLowerCase();
        if (origin === 'manhwa') return 'KR';
        if (origin === 'manhua') return 'CN';
        if (origin === 'manga') return 'JP';
        return item.country ? String(item.country).toUpperCase() : '';
    }

    function demographicLabel(detail, item) {
        const explicit = String(detail?.demographic || '').trim();
        if (explicit) return explicit;

        if (item.demographic) {
            const demoMap = {
                1: 'Shounen',
                2: 'Shoujo',
                3: 'Seinen',
                4: 'Josei'
            };
            return demoMap[item.demographic] || String(item.demographic);
        }

        return '';
    }

    internals.getComicKMeta = function (item) {
        const detail = item._detail || {};
        const title = detail.title || item.title || 'No Title';
        const description = internals.cleanText(detail.description || item.desc || '', 240);

        let coverUrl = 'https://via.placeholder.com/120x180?text=No+Cover';
        if (item.md_covers && item.md_covers.length > 0) {
            const cover = item.md_covers[0];
            if (cover.b2key) {
                coverUrl = `https://meo.comick.pictures/${cover.b2key}`;
            }
        }

        const score = item.rating ? String(item.rating) : 'N/A';
        const followers = detail.followCount
            ? String(detail.followCount)
            : (item.follow_count ? String(item.follow_count) : '');
        const year = detail.year ? String(detail.year) : (item.year ? String(item.year) : '');
        const chapters = detail.finalChapter
            ? String(detail.finalChapter)
            : (item.final_chapter ? String(item.final_chapter) : (item.last_chapter ? String(item.last_chapter) : '?'));
        const status = String(detail.statusText || '').trim() || statusFromCode(item.status);
        const providerUrl = `https://comick.dev/comic/${item.slug}`;

        const authors = extractNames(detail.authors?.length ? detail.authors : (item.authors || item.author));
        const artists = extractNames(detail.artists?.length ? detail.artists : (item.artists || item.artist));
        const publishers = extractNames(detail.publishers?.length ? detail.publishers : (item.publishers || item.publisher));

        const genreNames = extractNames([
            ...(item.md_comic_md_genres || []),
            ...(item.genres || []),
            ...(item.md_genres || [])
        ]);
        const themeNames = extractNames([
            ...(item.md_comic_md_tags || []),
            ...(item.tags || []),
            ...(item.md_tags || [])
        ]);

        const detailGenres = extractNames(detail.genres || []);
        const detailThemes = extractNames(detail.themes || []);
        const detailTags = extractNames(detail.tags || []);
        const detailFormats = extractNames(detail.formats || []);
        const synonyms = extractNames(item.md_titles || item.alt_titles || item.md_comic?.md_titles);

        const demographic = demographicLabel(detail, item);
        const translation = translationLabel(detail, item);
        const primaryGenres = internals.uniqStrings([
            ...detailGenres,
            ...genreNames,
            ...detailThemes,
            ...themeNames
        ]);
        const metadataTags = internals.limitList(internals.uniqStrings([
            ...detailTags,
            demographic ? `Demographic: ${demographic}` : '',
            translation ? `Translation: ${translation}` : '',
            ...detailFormats.map((format) => `Format: ${format}`),
            ...publishers.map((publisher) => `Publisher: ${publisher}`)
        ]), 64);

        const summaryFormat = detailFormats.length
            ? detailFormats.slice(0, 2).join(', ')
            : (translation ? `${translation} Translation` : '');

        return {
            source: 'ComicK',
            mediaType: mediaTypeFromItem(detail, item),
            title,
            coverUrl,
            author: authors.join(', '),
            artist: artists.join(', '),
            studios: publishers,
            producers: [],
            synonyms,
            description,
            status,
            score,
            rank: detail.rank ? `#${detail.rank}` : (item.rank ? String(item.rank) : ''),
            popularity: followers,
            members: followers,
            favorites: '',
            chapters,
            volumes: item.last_volume ? String(item.last_volume) : '?',
            episodes: '',
            duration: '',
            genres: primaryGenres,
            tags: metadataTags,
            year,
            season: '',
            format: summaryFormat,
            sourceMaterial: '',
            countryOfOrigin: countryFromItem(detail, item),
            contentRating: item.content_rating ? item.content_rating.charAt(0).toUpperCase() + item.content_rating.slice(1) : 'Safe',
            startDate: year,
            endDate: '',
            url: providerUrl,
            providerUrl
        };
    };
})(window.EveOS.API.DisplayInternals);
