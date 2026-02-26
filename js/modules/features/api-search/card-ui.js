(function () {
    function createMangaCard(data, resultsDiv, onSelect) {
        const mangaDiv = document.createElement('div');
        mangaDiv.className = 'manga-item';

        const genresHtml = (data.genres && data.genres.length)
            ? data.genres.slice(0, 3).map(g => `<span class="genres-tag">${g}</span>`).join(' ')
            : `<span class="genres-tag">Unknown</span>`;

        mangaDiv.innerHTML = `
            <img 
                src="${data.coverUrl || 'https://via.placeholder.com/120x180?text=No+Cover'}" 
                alt="Cover" 
                onerror="this.src='https://via.placeholder.com/120x180?text=No+Cover';"
                class="manga-cover"
            >
            <div class="manga-info">
                <span class="source-tag">${data.source}</span>
                <h3 class="manga-title"><a href="${data.url}" target="_blank">${data.title}</a></h3>
                <div class="manga-meta">
                   <span>⭐ ${data.score || '-'}</span>
                   <span>📖 ${data.chapters || '?'}ch</span>
                </div>
            </div>
        `;

        if (typeof onSelect === 'function') {
            // Create Select Button
            const selectBtn = document.createElement('button');
            selectBtn.innerText = 'Select';
            selectBtn.style.cssText = 'background:var(--accent); color:#000; border:none; border-radius:4px; padding:5px 10px; cursor:pointer; font-weight:bold; align-self: center;';
            selectBtn.onclick = () => onSelect(data);
            mangaDiv.appendChild(selectBtn);
        }

        resultsDiv.appendChild(mangaDiv);
    }

    // Attach to API namespace
    window.EveOS = window.EveOS || {};
    window.EveOS.API = window.EveOS.API || {};
    window.EveOS.API.CardUI = {
        createMangaCard
    };

    // Also attach globally if needed or keep namespaced?
    // The display.js uses it locally, but we need to make sure display.js can access it.
    // display.js was calling it as a local function.
    // We'll attach it to window.EveOS.API.Display for backward compatibility if something else used it,
    // or just rely on the new namespace.
    // HOWEVER, display.js needs to be updated to call window.EveOS.API.CardUI.createMangaCard
    // OR we can assign it to the same place display.js was assigning it if we want to be safe.

    // Let's expose it so display.js can use it.
})();
