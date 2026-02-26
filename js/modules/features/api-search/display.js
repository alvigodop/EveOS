window.EveOS = window.EveOS || {};

(function () {
    function displayResults(mangadexData, jikanData, anilistData, resultsDiv, onSelect) {
        resultsDiv.innerHTML = '';
        resultsDiv.classList.add('api-search-results-grid'); // Add class for styling

        // MangaDex Results
        if (mangadexData?.data?.length) {
            mangadexData.data.forEach(manga => {
                const coverRel = manga.relationships.find(rel => rel.type === 'cover_art');
                const coverFileName = coverRel?.attributes?.fileName;
                const coverUrl = coverFileName
                    ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}`
                    : 'https://via.placeholder.com/120x180?text=No+Cover';

                const authorRel = manga.relationships.find(rel => rel.type === 'author');
                const author = authorRel?.attributes?.name || 'Unknown Author';

                const title = manga.attributes.title.en || manga.attributes.altTitles?.[0]?.en || 'No Title';
                const desc = (manga.attributes.description.en || 'No description').substring(0, 150);

                createMangaCard({
                    source: 'MangaDex',
                    title: title,
                    coverUrl: coverUrl,
                    author: author,
                    description: desc,
                    status: manga.attributes.status || 'Unknown',
                    score: 'N/A',
                    chapters: manga.attributes.lastChapter || '?',
                    volumes: manga.attributes.lastVolume || '?',
                    genres: [],
                    url: `https://mangadex.org/title/${manga.id}`
                }, resultsDiv, onSelect);
            });
        }

        // Jikan Results
        if (jikanData?.data?.length) {
            jikanData.data.forEach(manga => {
                const genres = manga.genres?.map(g => g.name) || [];
                createMangaCard({
                    source: 'MyAnimeList',
                    title: manga.title,
                    coverUrl: manga.images?.jpg?.image_url,
                    author: manga.authors?.[0]?.name || 'Unknown',
                    description: (manga.synopsis || '').substring(0, 150),
                    status: manga.status,
                    score: manga.score,
                    chapters: manga.chapters,
                    volumes: manga.volumes,
                    genres: genres,
                    url: manga.url
                }, resultsDiv, onSelect);
            });
        }

        // AniList Results
        const anilistManga = anilistData?.data?.Page?.media;
        if (anilistManga && anilistManga.length > 0) {
            anilistManga.forEach(manga => {
                const title = manga.title.english || manga.title.romaji || 'No Title';
                const coverUrl = manga.coverImage?.large;
                const author = manga.staff?.edges?.[0]?.node?.name?.full || 'Unknown';
                const genres = manga.genres || [];

                createMangaCard({
                    source: 'AniList',
                    title: title,
                    coverUrl: coverUrl,
                    author: author,
                    description: (manga.description || '').replace(/<[^>]*>?/gm, '').substring(0, 150),
                    status: manga.status,
                    score: manga.averageScore,
                    chapters: manga.chapters,
                    volumes: manga.volumes,
                    genres: genres,
                    url: `https://anilist.co/manga/${manga.id}`
                }, resultsDiv, onSelect);
            });
        }

        if (resultsDiv.children.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:10px; opacity:0.7;">No results found from API providers.</div>';
        }
    }

    // Helper to call the external card creator
    function createMangaCard(data, resultsDiv, onSelect) {
        if (window.EveOS?.API?.CardUI?.createMangaCard) {
            window.EveOS.API.CardUI.createMangaCard(data, resultsDiv, onSelect);
        } else {
            console.error("CardUI module not loaded");
        }
    }

    window.EveOS.API.Display = {
        displayResults,
        createMangaCard
    };
})();
