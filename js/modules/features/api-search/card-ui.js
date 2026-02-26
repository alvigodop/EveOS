(function () {
    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function uniqStrings(values) {
        const seen = new Set();
        const result = [];
        values.forEach(value => {
            const next = String(value || "").trim();
            if (!next) return;
            const key = next.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(next);
        });
        return result;
    }

    function formatScore(score, sourceName) {
        if (score === null || score === undefined || score === "" || score === "N/A") return "-";
        const numeric = Number(score);
        if (!Number.isFinite(numeric)) return String(score);
        if (sourceName === "AniList") return `${Math.round(numeric)}/100`;
        if (numeric % 1 !== 0) return numeric.toFixed(2);
        return String(numeric);
    }

    function formatCount(value, suffix) {
        if (value === null || value === undefined || value === "") return `? ${suffix}`;
        return `${value} ${suffix}`;
    }

    function renderChips(items, className) {
        return items.map(item => `<span class="${className}">${escapeHtml(item)}</span>`).join("");
    }

    function createMangaCard(data, resultsDiv, onSelect) {
        const mangaDiv = document.createElement("div");
        mangaDiv.className = "manga-item";

        const title = String(data.title || "No Title");
        const genres = uniqStrings(toArray(data.genres));
        const tags = uniqStrings(toArray(data.tags)).filter(
            tag => !genres.some(genre => genre.toLowerCase() === tag.toLowerCase())
        );
        const synonyms = uniqStrings(toArray(data.synonyms)).filter(
            synonym => synonym.toLowerCase() !== title.toLowerCase()
        );

        const coverUrl = data.coverUrl || "https://via.placeholder.com/120x180?text=No+Cover";
        const scoreLabel = formatScore(data.score, data.source);
        const chaptersLabel = formatCount(data.chapters, "ch");
        const volumesLabel = formatCount(data.volumes, "vol");
        const status = data.status || "Unknown";
        const author = data.author || "Unknown Author";
        const artist = data.artist || "";
        const showArtist = !!artist && artist.toLowerCase() !== author.toLowerCase();
        const description = String(data.description || "").trim();

        mangaDiv.innerHTML = `
            <img
                src="${escapeHtml(coverUrl)}"
                alt="Cover"
                onerror="this.src='https://via.placeholder.com/120x180?text=No+Cover';"
                class="manga-cover"
            >
            <div class="manga-info">
                <span class="source-tag">${escapeHtml(data.source || "Source")}</span>
                <h3 class="manga-title"><a href="${escapeHtml(data.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></h3>
                <div class="manga-meta">
                    <span>Score: ${escapeHtml(scoreLabel)}</span>
                    <span>Ch: ${escapeHtml(chaptersLabel)}</span>
                    <span>Vol: ${escapeHtml(volumesLabel)}</span>
                    <span>Status: ${escapeHtml(status)}</span>
                    ${data.year ? `<span>Year: ${escapeHtml(data.year)}</span>` : ""}
                    ${data.format ? `<span>Format: ${escapeHtml(data.format)}</span>` : ""}
                </div>
                <div class="manga-person">Author: ${escapeHtml(author)}</div>
                ${showArtist ? `<div class="manga-person">Artist: ${escapeHtml(artist)}</div>` : ""}
                ${genres.length ? `<div class="manga-chip-row manga-chip-row-genres">${renderChips(genres, "genres-tag")}</div>` : ""}
                ${tags.length ? `<div class="manga-chip-row manga-chip-row-tags">${renderChips(tags, "meta-tag")}</div>` : ""}
                ${synonyms.length ? `<div class="manga-synonyms"><span class="synonyms-label">Synonyms:</span><div class="manga-chip-row manga-chip-row-synonyms">${renderChips(synonyms, "synonym-tag")}</div></div>` : ""}
                ${description ? `<p class="manga-description">${escapeHtml(description)}</p>` : ""}
            </div>
        `;

        if (typeof onSelect === "function") {
            const selectBtn = document.createElement("button");
            selectBtn.innerText = "Select";
            selectBtn.className = "manga-select-btn";
            selectBtn.onclick = () => onSelect(data);
            mangaDiv.appendChild(selectBtn);
        }

        resultsDiv.appendChild(mangaDiv);
    }

    window.EveOS = window.EveOS || {};
    window.EveOS.API = window.EveOS.API || {};
    window.EveOS.API.CardUI = {
        createMangaCard
    };
})();
