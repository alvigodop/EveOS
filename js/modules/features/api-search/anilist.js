window.EveOS = window.EveOS || {};

(function () {
    function buildSearchQuery() {
        return `
        query ($search: String, $type: MediaType) {
            Page(page: 1, perPage: 2) {
                media(search: $search, type: $type, sort: POPULARITY_DESC) {
                    id
                    idMal
                    type
                    format
                    status
                    source
                    chapters
                    volumes
                    episodes
                    duration
                    season
                    seasonYear
                    startDate { year month day }
                    endDate { year month day }
                    countryOfOrigin
                    isAdult
                    popularity
                    favourites
                    averageScore
                    meanScore
                    title { romaji english native userPreferred }
                    synonyms
                    description
                    coverImage { large medium color }
                    bannerImage
                    genres
                    tags {
                        name
                        rank
                        category
                        isMediaSpoiler
                    }
                    rankings {
                        rank
                        type
                        allTime
                        context
                    }
                    studios {
                        nodes {
                            name
                            isAnimationStudio
                        }
                    }
                    staff {
                        edges {
                            role
                            node {
                                name { full }
                                primaryOccupations
                            }
                        }
                    }
                    siteUrl
                }
            }
        }`;
    }

    async function searchAniList(searchQuery, mediaType) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: { Page: { media: [] } } }; }

        const query = buildSearchQuery();
        const type = mediaType === 'ANIME' ? 'ANIME' : 'MANGA';

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                variables: {
                    search: searchQuery,
                    type
                }
            })
        };

        const url = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(Core.ANILIST_API)}`;
        const result = await Core.safeFetch(url, options, 'AniList Search failed');
        return result || { data: { Page: { media: [] } } };
    }

    async function searchAniListManga(searchQuery) {
        return searchAniList(searchQuery, 'MANGA');
    }

    async function searchAniListAnime(searchQuery) {
        return searchAniList(searchQuery, 'ANIME');
    }

    window.EveOS.API.AniList = {
        searchAniList,
        searchAniListManga,
        searchAniListAnime
    };
})();
