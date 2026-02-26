window.EveOS = window.EveOS || {};

(function () {
    async function searchAniList(searchQuery) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: { Page: { media: [] } } }; }

        const query = `
        query ($search: String) {
            Page(page: 1, perPage: 2) {
                media(search: $search, type: MANGA, sort: POPULARITY_DESC) {
                    id
                    title { romaji english }
                    synonyms
                    description
                    coverImage { large }
                    startDate { year month day }
                    endDate { year month day }
                    status
                    chapters
                    volumes
                    genres
                    averageScore
                    format
                    tags { name }
                    staff {
                        edges {
                            role
                            node {
                                name { full }
                                primaryOccupations
                            }
                        }
                    }
                }
            }
        }`;

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                variables: {
                    search: searchQuery
                }
            })
        };

        const result = await Core.safeFetch(Core.ANILIST_API, options, 'AniList Search failed');
        return result || { data: { Page: { media: [] } } };
    }

    window.EveOS.API.AniList = {
        searchAniList
    };
})();
