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

    function escapeJsString(value) {
        return String(value ?? "")
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n");
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

    function compactValue(value) {
        if (value === null || value === undefined) return "";
        const text = String(value).trim();
        return text;
    }

    function renderChips(items, className) {
        return items.map(item => `<span class="${className}">${escapeHtml(item)}</span>`).join("");
    }

    function renderMetaRow(data) {
        const scoreLabel = formatScore(data.score, data.source);
        const rows = [
            ["Score", scoreLabel],
            ["Rank", data.rank],
            ["Popularity", data.popularity],
            ["Members", data.members],
            ["Favorites", data.favorites],
            ["Status", data.status],
            ["Format", data.format],
            ["Year", data.year],
            ["Season", data.season],
            ["Chapters", data.chapters],
            ["Volumes", data.volumes],
            ["Episodes", data.episodes],
            ["Duration", data.duration],
            ["Source", data.sourceMaterial],
            ["Country", data.countryOfOrigin],
            ["Rating", data.contentRating]
        ]
            .map(([label, value]) => [label, compactValue(value)])
            .filter(([, value]) => value && value !== "?" && value !== "N/A");

        return rows.map(([label, value]) => `<span>${escapeHtml(label)}: ${escapeHtml(value)}</span>`).join("");
    }

    function renderPeopleRows(data) {
        const lines = [];
        const author = compactValue(data.author);
        const artist = compactValue(data.artist);
        const studios = uniqStrings(toArray(data.studios));
        const producers = uniqStrings(toArray(data.producers));

        if (author) lines.push(`<div class="manga-person">Author: ${escapeHtml(author)}</div>`);
        if (artist && artist.toLowerCase() !== author.toLowerCase()) lines.push(`<div class="manga-person">Artist: ${escapeHtml(artist)}</div>`);
        if (studios.length) lines.push(`<div class="manga-person">Studios: ${escapeHtml(studios.join(", "))}</div>`);
        if (producers.length) lines.push(`<div class="manga-person">Producers: ${escapeHtml(producers.join(", "))}</div>`);

        return lines.join("");
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
        const description = String(data.description || "").trim();
        const mediaType = String(data.mediaType || "").trim();
        const targetUrl = String(data.providerUrl || data.url || "").trim() || "#";
        const safeTargetUrl = escapeHtml(targetUrl);
        const sourceTagMarkup = targetUrl && targetUrl !== '#'
            ? `<a href="${safeTargetUrl}" rel="noopener noreferrer" class="source-tag source-tag-link" data-api-result-link="1" data-api-result-title="${escapeHtml(title)}">${escapeHtml(data.source || "Source")}</a>`
            : `<span class="source-tag">${escapeHtml(data.source || "Source")}</span>`;
        const titleMarkup = targetUrl && targetUrl !== '#'
            ? `<a href="${safeTargetUrl}" rel="noopener noreferrer" data-api-result-link="1" data-api-result-title="${escapeHtml(title)}">${escapeHtml(title)}</a>`
            : escapeHtml(title);

        mangaDiv.innerHTML = `
            <img
                src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                alt="Cover"
                class="manga-cover"
            >
            <div class="manga-info">
                <div class="manga-source-row">
                    ${sourceTagMarkup}
                    ${mediaType ? `<span class="media-type-tag">${escapeHtml(mediaType)}</span>` : ""}
                </div>
                <h3 class="manga-title">${titleMarkup}</h3>
                <div class="manga-meta">${renderMetaRow(data)}</div>
                ${renderPeopleRows(data)}
                ${genres.length ? `<div class="manga-chip-row manga-chip-row-genres">${renderChips(genres, "genres-tag")}</div>` : ""}
                ${tags.length ? `<div class="manga-chip-row manga-chip-row-tags">${renderChips(tags, "meta-tag")}</div>` : ""}
                ${synonyms.length ? `<div class="manga-synonyms"><span class="synonyms-label">Synonyms:</span><div class="manga-chip-row manga-chip-row-synonyms">${renderChips(synonyms, "synonym-tag")}</div></div>` : ""}
                ${description ? `<p class="manga-description">${escapeHtml(description)}</p>` : ""}
            </div>
        `;

        // Apply robust image loading
        const img = mangaDiv.querySelector('.manga-cover');
        if (typeof window.setupProxiedImage === 'function') {
            window.setupProxiedImage(img, coverUrl, "https://via.placeholder.com/120x180?text=No+Cover");
        } else {
            img.src = coverUrl;
            img.onerror = function() {
                this.src = 'https://via.placeholder.com/120x180?text=No+Cover';
            };
        }

        if (typeof onSelect === "function") {
            const selectBtn = document.createElement("button");

            // Check if this source is already attached
            const alreadyAttached = (function () {
                if (!Array.isArray(window.tempSources) || !window.tempSources.length) return false;
                const pUrl = String(data.providerUrl || data.url || "").trim().toLowerCase();
                const pSource = String(data.source || "").trim().toLowerCase();
                return window.tempSources.some(function (s) {
                    const sUrl = String(s.providerUrl || s.url || "").trim().toLowerCase();
                    const sSource = String(s.source || "").trim().toLowerCase();
                    if (pSource && sSource && pUrl && sUrl) return pSource === sSource && pUrl === sUrl;
                    if (pUrl && sUrl) return pUrl === sUrl;
                    return false;
                });
            })();

            if (alreadyAttached) {
                selectBtn.innerText = "Added";
                selectBtn.className = "manga-select-btn";
                selectBtn.style.opacity = "0.4";
                selectBtn.style.cursor = "default";
                selectBtn.disabled = true;
            } else {
                selectBtn.innerText = "Select";
                selectBtn.className = "manga-select-btn";
                selectBtn.onclick = () => onSelect(data);
            }
            mangaDiv.appendChild(selectBtn);
        }

        mangaDiv.querySelectorAll('[data-api-result-link="1"]').forEach((linkEl) => {
            linkEl.addEventListener('click', function (event) {
                const href = String(linkEl.getAttribute('href') || '').trim();
                const linkTitle = String(linkEl.getAttribute('data-api-result-title') || title).trim() || title;
                if (!href || href === '#') return;
                if (window.EveOS?.API?.Manager?.handleResultLinkClick) {
                    window.EveOS.API.Manager.handleResultLinkClick(event, href, linkTitle);
                }
            });
        });

        resultsDiv.appendChild(mangaDiv);
    }

    window.EveOS = window.EveOS || {};
    window.EveOS.API = window.EveOS.API || {};
    window.EveOS.API.CardUI = {
        createMangaCard
    };
})();
