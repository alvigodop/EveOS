// --- Sources Component ---
// Handles source list management and rendering for the Add/Edit Link Modal.

(function () {
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function getPrimarySourceUrl(source) {
        const providerUrl = String(source?.providerUrl || "").trim();
        if (providerUrl) return providerUrl;
        return String(source?.url || "").trim();
    }

    function getSourceIdentity(source) {
        const provider = String(source?.source || "").trim().toLowerCase();
        const url = getPrimarySourceUrl(source).toLowerCase();
        if (provider && url) return `provider-url:${provider}|${url}`;
        if (url) return `url:${url}`;

        const title = String(source?.title || "").trim().toLowerCase();
        const mediaType = String(source?.mediaType || "").trim().toLowerCase();
        return `meta:${provider}|${title}|${mediaType}`;
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

    function getPreviewGenres(source) {
        return uniqStrings(toArray(source?.genres)).join(", ");
    }

    function getPreviewTags(source) {
        return uniqStrings(toArray(source?.tags)).join(", ");
    }

    function getPreviewSynonyms(source) {
        return uniqStrings(toArray(source?.synonyms)).join(", ");
    }

    function searchLinkName() {
        const nameInput = document.getElementById("newTitle");
        const resultsDiv = document.getElementById("edit-link-search-results");
        const categoryInput = document.getElementById("newCategory");
        const query = nameInput.value.trim();

        if (!query) return showToast("Enter a name to search", "warning");

        if (window.EveOS && window.EveOS.API && window.EveOS.API.Manager) {
            const categoryName = (categoryInput ? categoryInput.value.trim() : '')
                || window.currentCategoryCtx
                || '';

            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div style="padding:10px; opacity:0.7;">Searching cached sources...</div>';

            // Bookmark search should always use cache-first (file:// CORS blocks most live APIs)
            const loadingCallback = window.SearchUIRenderer
                ? SearchUIRenderer.showLoading.bind(SearchUIRenderer)
                : null;

            // Notify search monitor that a search is starting
            if (loadingCallback) {
                loadingCallback(true, 'edit-link-search-results', `Searching for "${query}"...`, { statusPhase: 'cache' });
            }

            window.EveOS.API.Manager.runSearch(query, resultsDiv, (data) => {
                return addSource(data);
            }, {
                categoryName: categoryName,
                liveResults: false,
                hybridResults: true,
                loadingCallback: loadingCallback
            });
        } else {
            showToast("Search API not ready", "error");
        }
    }

    function addSource(data) {
        if (!window.tempSources) window.tempSources = [];

        const incomingIdentity = getSourceIdentity(data);
        if (window.tempSources.some(source => getSourceIdentity(source) === incomingIdentity)) {
            showToast("Source already added", "info");
            return false;
        }

        window.tempSources.push(data);
        renderSourcesList();
        showToast("Source Added", "success");
        return true;
    }

    function removeSource(index) {
        if (!window.tempSources) return;
        window.tempSources.splice(index, 1);
        renderSourcesList();
    }

    function extractSourceMetadata(index) {
        if (typeof window.applySourceMetadataFromAttachedSource === "function") {
            window.applySourceMetadataFromAttachedSource(index);
            return;
        }
        showToast("Metadata extractor is not ready", "warning");
    }

    function renderSourcesList() {
        const container = document.getElementById("link-sources-container");
        if (!container) return;

        if (!window.tempSources || window.tempSources.length === 0) {
            container.innerHTML = '<div style="opacity:0.5; font-size:0.9rem;">No sources attached.</div>';
            return;
        }

        container.innerHTML = window.tempSources.map((source, index) => {
            const sourceName = escapeHtml(source.source || "Source");
            const mediaType = escapeHtml(source.mediaType || "");
            const score = escapeHtml(source.score ?? "-");
            const title = escapeHtml(source.title || "Untitled");
            const safeUrl = escapeHtml(getPrimarySourceUrl(source) || "#");
            const coverUrl = escapeHtml(source.coverUrl || "");
            const author = escapeHtml(source.author || "");
            const artist = escapeHtml(source.artist || "");
            const genres = escapeHtml(getPreviewGenres(source));
            const tags = escapeHtml(getPreviewTags(source));
            const synonyms = escapeHtml(getPreviewSynonyms(source));
            const status = escapeHtml(source.status || "");
            const statusPart = status ? ` • ${status}` : "";
            const mediaTypePart = mediaType ? ` • ${mediaType}` : "";
            const extraParts = [
                author ? `Author: ${author}` : "",
                artist ? `Artist: ${artist}` : "",
                genres ? `Genre: ${genres}` : "",
                tags ? `Tags: ${tags}` : "",
                synonyms ? `Synonyms: ${synonyms}` : ""
            ].filter(Boolean).join(" • ");

            return `
                <div class="source-item">
                    <img src="${coverUrl}" onerror="if(window.setupProxiedImage){window.setupProxiedImage(this,'${coverUrl.replace(/'/g, "\\'")}','https://via.placeholder.com/40')}else{this.src='https://via.placeholder.com/40'}" class="source-thumb">
                    <div class="source-details">
                        <div class="source-title">${title}</div>
                        <div class="source-meta"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="source-provider-link">${sourceName}</a>${mediaTypePart} • Score: ${score}${statusPart}</div>
                        ${extraParts ? `<div class="source-extra">${extraParts}</div>` : ""}
                    </div>
                    <div class="source-actions">
                        <button class="source-meta-btn" onclick="extractSourceMetadataFromSource(${index})" title="Extract metadata into library fields">Use Meta</button>
                        <button class="remove-source-btn" onclick="removeSource(${index})">&times;</button>
                    </div>
                </div>
            `;
        }).join("");
    }

    window.searchLinkName = searchLinkName;
    window.addSource = addSource;
    window.removeSource = removeSource;
    window.extractSourceMetadataFromSource = extractSourceMetadata;
    window.renderSourcesList = renderSourcesList;
})();
