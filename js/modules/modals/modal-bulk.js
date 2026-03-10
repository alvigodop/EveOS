// --- BULK IMPORT ---

function getBulkMode() {
    if (document.getElementById('bulkModeFile')?.checked) return 'file';
    return document.getElementById('bulkModeName')?.checked ? 'name' : 'url';
}

function updateBulkModeUi() {
    const mode = getBulkMode();
    const text = document.getElementById('bulkText');
    const fileInput = document.getElementById('bulkFileInput');
    const hint = document.getElementById('bulkModeHint');
    if (!text || !hint) return;

    if (mode === 'file') {
        text.style.display = 'none';
        if (fileInput) fileInput.style.display = 'block';
        hint.textContent = "Smart Extract mode: Upload .txt files. It auto-detects URLs, Names, or Library data.";
    } else {
        if (fileInput) fileInput.style.display = 'none';
        text.style.display = 'block';
        if (mode === 'name') {
            text.placeholder = "One name per line...";
            hint.textContent = "Names-only mode: each line becomes a bookmark title and URL is a Google search link.";
        } else {
            text.placeholder = "One URL per line...";
            hint.textContent = "URL mode: each line should be a URL.";
        }
    }
}

function initBulkModeUi() {
    const url = document.getElementById('bulkModeUrl');
    const name = document.getElementById('bulkModeName');
    const file = document.getElementById('bulkModeFile');
    if (url) url.onchange = updateBulkModeUi;
    if (name) name.onchange = updateBulkModeUi;
    if (file) file.onchange = updateBulkModeUi;
    updateBulkModeUi();
}

function openBulkModal() {
    refreshCategoryDatalist();
    document.getElementById('bulkModal').style.display = 'flex';
    initBulkModeUi();
    document.getElementById('bulkText').focus();
}

function clearBulkInput() {
    document.getElementById('bulkText').value = '';
    const fileInput = document.getElementById('bulkFileInput');
    if (fileInput) fileInput.value = '';
    document.getElementById('bulkText').focus();
}

async function processBulk() {
    const catInput = document.getElementById('bulkCategory');
    const targetCategory = (catInput && catInput.value.trim()) ? catInput.value.trim() : "Unsorted";      
    const mode = getBulkMode();

    let textToProcess = "";
    let count = 0;

    if (mode === 'file') {
        const fileInput = document.getElementById('bulkFileInput');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            return showToast("No files selected", "warning");
        }

        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            try {
                const content = await file.text();
                // Check if the file contains structured library data fields
                if (content.match(/^(Title|URL|Episode|Chapter|Type|Notes)\s*:/mi)) {
                    processStructuredFile(content, file.name, targetCategory);
                    count++;
                } else {
                    // Not structured, append to generic text processor
                    textToProcess += content + "\n";
                }
            } catch (e) {
                console.error("Failed to read file", file.name, e);
            }
        }
        if (fileInput) fileInput.value = '';
    } else {
        textToProcess = document.getElementById('bulkText').value;
    }

    if (!textToProcess && count === 0) return showToast("No entries found", "warning");

    if (textToProcess) {
        const lines = textToProcess.split('\n');

        // Auto-detect mode if file content is loaded without structured key-value pairs
        let effectiveMode = mode;
        if (mode === 'file') {
            const validLines = lines.filter(l => l.trim().length > 0);
            const looksLikeUrls = validLines.length > 0 && validLines.every(l => l.trim().startsWith('http'));
            effectiveMode = looksLikeUrls ? 'url' : 'name';
        }

        lines.forEach(line => {
            const raw = line.trim();
            if (!raw) return;

            if (effectiveMode === 'name') {
                const title = raw;
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(title)}`;
                links.push({
                    id: Date.now() + Math.random(),
                    title,
                    url: searchUrl,
                    category: targetCategory,
                    workspace: config.activeWorkspace,
                    icon: '',
                    done: false
                });
            } else {
                const url = raw;
                links.push({
                    id: Date.now() + Math.random(),
                    title: url,
                    url: normalizeUrl(url),
                    category: targetCategory,
                    workspace: config.activeWorkspace,
                    icon: '',
                    done: false
                });
            }
            count++;
        });
    }

    saveData();
    if (window.EveLibrary?.Storage?.saveLibrary) {
        window.EveLibrary.Storage.saveLibrary();
    }
    closeModals();
    showToast(`Imported ${count} items to "${targetCategory}"`, "success");
}

function processStructuredFile(content, fileName, targetCategory) {
    const lines = content.split('\n');
    let title = fileName.replace(/\.txt$/i, '');
    let url = '';
    let episode = 0;
    let chapter = 0;
    let type = '';
    let notesArr = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
            const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
            const val = trimmed.slice(colonIdx + 1).trim();
            if (key === 'title' || key === 'name') { title = val; }
            else if (key === 'url' || key === 'link') { url = val; }
            else if (key === 'episode') { episode = parseInt(val, 10) || 0; }
            else if (key === 'chapter') { chapter = parseInt(val, 10) || 0; }
            else if (key === 'type' || key === 'category') { type = val.toLowerCase(); }
            else if (key === 'notes' || key === 'summary') { notesArr.push(val); }
            else { notesArr.push(trimmed); }
        } else {
            notesArr.push(trimmed);
        }
    });

    if (!url) {
        url = `https://www.google.com/search?q=${encodeURIComponent(title)}`;
    }

    const newLinkId = Date.now() + Math.random();
    const summaryText = notesArr.join('\\n');

    // Default bookmark creation
    const newBookmark = {
        id: newLinkId,
        title,
        url: normalizeUrl(url),
        category: targetCategory,
        workspace: config.activeWorkspace,
        icon: '',
        done: false,
        notes: summaryText
    };

    // Attempt Library Connection Integration
    if (window.EveLibrary?.State && window.EveLibrary?.Storage) {
        const lib = window.EveLibrary.State.getCategoryLibrary(targetCategory, config.activeWorkspace);
        let dataType = lib.dataType || 'graphicNovels';
        if (type.includes('film') || type.includes('show') || type.includes('anime')) dataType = 'films';
        else if (type.includes('novel')) dataType = 'novels';

        const libraryEntryId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const newEntry = {
            id: libraryEntryId,
            title: title || 'Untitled',
            mediaTypes: [dataType],
            author: '',
            authorAltNames: [],
            artist: '',
            genre: '',
            status: dataType === 'films' ? 'Plan to Watch' : 'Plan to Read',
            chapter: dataType !== 'films' ? chapter : 0,
            season: dataType === 'films' ? 1 : 0,
            episode: dataType === 'films' ? episode : 0,
            sourceUrl: url,
            summary: summaryText,
            rating: '',
            apiRatings: { anilist: null, myanimelist: null, mangadex: null },
            sourceStatus: '',
            sourceSignals: window.EveLibrary.Ratings?.createEmptySourceSignals ? window.EveLibrary.Ratings.createEmptySourceSignals() : null,
            derivedRatings: null,
            language: '',
            tags: [],
            dateAdded: new Date().toISOString(),
            lastEdited: new Date().toISOString(),
            favorite: false,
            image: ''
        };

        lib.entries.push(newEntry);

        // Link the bookmark via the core connections API
        const connection = {
            id: `conn-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,
            linkId: String(newLinkId),
            libraryEntryId: newEntry.id,
            categoryName: targetCategory,
            workspace: config.activeWorkspace,
            createdAt: new Date().toISOString()
        };

        if (window.EveLibrary.ConnectionsCore?.connections) {
           window.EveLibrary.ConnectionsCore.connections.push(connection);
           if (window.EveLibrary.ConnectionsCore.saveConnections) {
               window.EveLibrary.ConnectionsCore.saveConnections();
           }
        } else if (window.EveLibrary.ConnectionsAPI?.core?.connections) {
           window.EveLibrary.ConnectionsAPI.core.connections.push(connection);
           if (window.EveLibrary.ConnectionsAPI.core.saveConnections) {
               window.EveLibrary.ConnectionsAPI.core.saveConnections();
           }
        } else {
           console.warn('Could not securely inject Library Connection. Bookmark was added standalone.');
        }
    }

    links.push(newBookmark);
}
