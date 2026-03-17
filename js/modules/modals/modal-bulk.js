// --- BULK IMPORT ---

function getBulkMode() {
    if (document.getElementById('bulkModeFolder')?.checked) return 'folder';
    if (document.getElementById('bulkModeFile')?.checked) return 'file';
    return document.getElementById('bulkModeName')?.checked ? 'name' : 'url';
}

function updateBulkModeUi() {
    const mode = getBulkMode();
    const text = document.getElementById('bulkText');
    const fileDropZone = document.getElementById('bulkFileDropZone');
    const folderDropZone = document.getElementById('bulkFolderDropZone');
    const hint = document.getElementById('bulkModeHint');
    if (!text || !hint) return;

    if (fileDropZone) fileDropZone.style.display = 'none';
    if (folderDropZone) folderDropZone.style.display = 'none';

    if (mode === 'folder') {
        text.style.display = 'none';
        if (folderDropZone) {
            folderDropZone.style.display = 'flex';
            const folderInput = document.getElementById('bulkFolderInput');
            const dropText = document.getElementById('bulkFolderDropText');
            if (folderInput && folderInput.files && folderInput.files.length > 0) {
                dropText.textContent = `${folderInput.files.length} file(s) selected from folder`;
                folderDropZone.style.borderColor = '#00a8ff';
                folderDropZone.style.color = '#fff';
            } else {
                dropText.textContent = 'Click to select a folder';
                folderDropZone.style.borderColor = '#444';
                folderDropZone.style.color = '#aaa';
            }
        }
        hint.textContent = "Folder mode: Upload a folder. Structure will be maintained via bookmark folders.";
    } else if (mode === 'file') {
        text.style.display = 'none';
        if (fileDropZone) {
            fileDropZone.style.display = 'flex';
            const fileInput = document.getElementById('bulkFileInput');
            const dropText = document.getElementById('bulkFileDropText');
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                dropText.textContent = `${fileInput.files.length} file(s) selected`;
                fileDropZone.style.borderColor = '#00a8ff';
                fileDropZone.style.color = '#fff';
            } else {
                dropText.textContent = 'Click to select or drag & drop .txt files here';
                fileDropZone.style.borderColor = '#444';
                fileDropZone.style.color = '#aaa';
            }
        }
        hint.textContent = "Smart Extract mode: Upload .txt files. It auto-detects URLs, Names, or Library data.";
    } else {
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
    const folder = document.getElementById('bulkModeFolder');
    if (url) url.onchange = updateBulkModeUi;
    if (name) name.onchange = updateBulkModeUi;
    if (file) file.onchange = updateBulkModeUi;
    if (folder) folder.onchange = updateBulkModeUi;

    const fileInput = document.getElementById('bulkFileInput');
    const dropZone = document.getElementById('bulkFileDropZone');

    if (fileInput && dropZone) {
        fileInput.addEventListener('change', updateBulkModeUi);

        // Drag and drop styles
        fileInput.addEventListener('dragenter', () => {
            dropZone.style.borderColor = '#00a8ff';
            dropZone.style.backgroundColor = '#1a1a1a';
        });

        fileInput.addEventListener('dragleave', () => {
            if (!fileInput.files || fileInput.files.length === 0) {
                dropZone.style.borderColor = '#444';
                dropZone.style.backgroundColor = '#111';
            }
        });

        fileInput.addEventListener('drop', () => {
            dropZone.style.backgroundColor = '#111';
            setTimeout(updateBulkModeUi, 50); // slight delay to allow files to populate
        });
    }

    const folderInput = document.getElementById('bulkFolderInput');
    const folderDropZone = document.getElementById('bulkFolderDropZone');

    if (folderInput && folderDropZone) {
        folderInput.addEventListener('change', updateBulkModeUi);

        folderInput.addEventListener('dragenter', () => {
            folderDropZone.style.borderColor = '#00a8ff';
            folderDropZone.style.backgroundColor = '#1a1a1a';
        });

        folderInput.addEventListener('dragleave', () => {
            if (!folderInput.files || folderInput.files.length === 0) {
                folderDropZone.style.borderColor = '#444';
                folderDropZone.style.backgroundColor = '#111';
            }
        });

        folderInput.addEventListener('drop', () => {
            folderDropZone.style.backgroundColor = '#111';
            setTimeout(updateBulkModeUi, 50);
        });
    }

    updateBulkModeUi();
}

function openBulkModal() {
    refreshCategoryDatalist({ scope: 'editor' });
    document.getElementById('bulkModal').style.display = 'flex';
    initBulkModeUi();
    document.getElementById('bulkText').focus();
}

function clearBulkInput() {
    document.getElementById('bulkText').value = '';
    const fileInput = document.getElementById('bulkFileInput');
    if (fileInput) fileInput.value = '';
    const folderInput = document.getElementById('bulkFolderInput');
    if (folderInput) folderInput.value = '';
    document.getElementById('bulkText').focus();
}

async function processBulk() {
    const catInput = document.getElementById('bulkCategory');
    const targetCategory = (catInput && catInput.value.trim()) ? catInput.value.trim() : "Unsorted";
    const mode = getBulkMode();

    let textToProcess = "";
    let count = 0;

    if (mode === 'folder') {
        const folderInput = document.getElementById('bulkFolderInput');
        if (!folderInput || !folderInput.files || folderInput.files.length === 0) {
            return showToast("No folder selected", "warning");
        }

        const workspaceId = config.activeWorkspace;
        const folderManager = window.EveBookmarkFolders;
        if (!folderManager) {
            return showToast("Folder management system not available.", "error");
        }

        // Cache folder paths to folder IDs
        const createdFolders = new Map();

        // 1) First pass: identify unique directory paths and create them
        const dirPaths = new Set();
        const filesToProcess = [];
        
        for (let i = 0; i < folderInput.files.length; i++) {
            const file = folderInput.files[i];
            const relativePath = file.webkitRelativePath || file.name;
            const parts = relativePath.split('/');
            
            if (parts.length > 1) {
                let currentPath = '';
                for (let j = 0; j < parts.length - 1; j++) {
                    currentPath = currentPath ? currentPath + '/' + parts[j] : parts[j];
                    dirPaths.add(currentPath);
                }
            }
            filesToProcess.push({ file, path: relativePath, parts });
        }

        // Sort paths by length so we create parents before children
        const sortedPaths = Array.from(dirPaths).sort((a, b) => a.split('/').length - b.split('/').length);

        for (const dirPath of sortedPaths) {
            const parts = dirPath.split('/');
            const folderName = parts[parts.length - 1];
            let parentId = '';
            
            if (parts.length > 1) {
                const parentPath = parts.slice(0, parts.length - 1).join('/');
                parentId = createdFolders.get(parentPath) || '';
            }

            const newFolder = folderManager.createFolder({
                workspaceId,
                categoryName: targetCategory,
                name: folderName,
                parentId
            });

            if (newFolder) {
                createdFolders.set(dirPath, newFolder.id);
            }
        }

        // 2) Process files and place them in the correct folder
        for (const { file, path, parts } of filesToProcess) {
            try {
                let parentFolderId = '';
                if (parts.length > 1) {
                    const parentPath = parts.slice(0, parts.length - 1).join('/');
                    parentFolderId = createdFolders.get(parentPath) || '';
                }

                const content = await file.text();
                const isStructured = content.match(/^(Title|URL|Episode|Ep|Chapter|Ch|Type|Notes|Finished Ep|Going To Ep)[\s:-]+/mi);
                const isMediaFile = file.name.match(/^(Was\s+|[\{\(]\d+[\}\)])/i);

                if (isStructured || isMediaFile) {
                    processStructuredFile(content, file.name, targetCategory, parentFolderId);
                    count++;
                } else {
                    // Fallback to basic link reading per line
                    const lines = content.split('\n');
                    lines.forEach(line => {
                        const raw = line.trim();
                        if (!raw) return;
                        
                        let parsedUrl = '';
                        let parsedTitle = '';

                        // Look for a URL within the line
                        const urlMatch = raw.match(/(https?:\/\/[^\s]+)/i);
                        if (urlMatch) {
                            parsedUrl = urlMatch[1];
                            parsedTitle = raw.replace(parsedUrl, '').trim();
                            // Clean up trailing/leading separators if any
                            parsedTitle = parsedTitle.replace(/^[\-\|:;\s]+|[\-\|:;\s]+$/g, '').trim();
                        }

                        if (!parsedTitle) {
                            parsedTitle = file.name.replace(/\.txt$/i, '').trim();
                        }
                        
                        if (!parsedUrl) {
                            parsedUrl = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
                            // If no URL was found, the whole line is likely the name, so we override the file name title
                            if (parsedTitle === file.name.replace(/\.txt$/i, '').trim()) {
                                parsedTitle = raw;
                            }
                        }

                        links.push({
                            id: Date.now() + Math.random(),
                            title: parsedTitle,
                            url: normalizeUrl(parsedUrl),
                            category: targetCategory,
                            workspace: workspaceId,
                            folderId: parentFolderId,
                            icon: '',
                            done: false
                        });
                        count++;
                    });
                }
            } catch (e) {
                console.error("Failed to read file in folder", file.name, e);
            }
        }

        if (folderInput) folderInput.value = '';
        saveData();
        if (window.EveLibrary?.Storage?.saveLibrary) {
            window.EveLibrary.Storage.saveLibrary();
        }
        closeModals();
        if (window.EveBookmarkFolders?.refreshEditorFolderSelect) {
            window.EveBookmarkFolders.refreshEditorFolderSelect();
        }
        return showToast(`Imported ${count} items and created folder structure in "${targetCategory}"`, "success");

    } else if (mode === 'file') {
        const fileInput = document.getElementById('bulkFileInput');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            return showToast("No files selected", "warning");
        }

        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            try {
                const content = await file.text();
                // Check if the file contains structured library data fields, shorthands, or if the filename specifies a media entry
                const isStructured = content.match(/^(Title|URL|Episode|Ep|Chapter|Ch|Type|Notes|Finished Ep|Going To Ep)[\s:-]+/mi);
                const isMediaFile = file.name.match(/^(Was\s+|[\{\(]\d+[\}\)])/i);

                if (isStructured || isMediaFile) {
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
            effectiveMode = 'smart';
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
            } else if (effectiveMode === 'url') {
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
            } else { // smart mode
                let parsedUrl = '';
                let parsedTitle = '';

                const urlMatch = raw.match(/(https?:\/\/[^\s]+)/i);
                if (urlMatch) {
                    parsedUrl = urlMatch[1];
                    parsedTitle = raw.replace(parsedUrl, '').trim();
                    parsedTitle = parsedTitle.replace(/^[\-\|:;\s]+|[\-\|:;\s]+$/g, '').trim();
                }

                if (!parsedUrl) {
                    parsedUrl = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
                    parsedTitle = raw;
                } else if (!parsedTitle) {
                    parsedTitle = parsedUrl;
                }

                links.push({
                    id: Date.now() + Math.random(),
                    title: parsedTitle,
                    url: normalizeUrl(parsedUrl),
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

function processStructuredFile(content, fileName, targetCategory, folderId = '') {
    const lines = content.split('\n');

    // Clean filename: remove things like "_260228_000943.txt" and ".txt"
    let title = fileName.replace(/_\d{6}_\d{6}\.txt$/i, '').replace(/\.txt$/i, '').trim();
    let url = '';
    let episode = 0;
    let chapter = 0;
    let season = 0;
    let type = '';
    let status = '';
    let notesArr = [];

    // Clean legacy organizational prefixes from filename (e.g., "Was ", "{1}", "(24)")
    if (title.toLowerCase().startsWith('was ')) {
        title = title.substring(4).trim();
    }
    title = title.replace(/^[\{\(]\d+[\}\)]\s*/, '').trim();

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let processedAsCoreKey = false;
        const colonIdx = trimmed.indexOf(':');

        if (colonIdx > 0) {
            const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
            const val = trimmed.slice(colonIdx + 1).trim();

            if (key === 'title' || key === 'name') {
                title = val;
                processedAsCoreKey = true;
            } else if (key === 'url' || key === 'link' || key === 'read site' || key === 'site' || key === 'to watch site') {
                const rawVal = val.trim();
                const lowerVal = rawVal.toLowerCase();
                const isPlaceholder = /^[\-\.]+$/.test(rawVal) || lowerVal === 'n/a' || lowerVal === 'none';

                // Heuristic: Does this actually look like a real URL?
                // Real URLs usually have 'http', 'www', '://', or at least a '.' or '/' without generic spaces.
                const hasUrlHallmarks = lowerVal.includes('http') || lowerVal.includes('www.') || lowerVal.includes('://') || (!lowerVal.includes(' ') && (lowerVal.includes('.') || lowerVal.includes('/')));

                if (!isPlaceholder && hasUrlHallmarks) {
                    url = rawVal;
                } else if (rawVal && !isPlaceholder) {
                    // It's generic text like "-Put The Link-". Funnel it into notes so it isn't lost.
                    notesArr.push(`${key}: ${rawVal}`);
                }

                processedAsCoreKey = true;
            } else if (key === 'type' || key === 'category') {
                type = val.toLowerCase();
                processedAsCoreKey = true;
            } else if (key === 'status' || key === 'state') {
                status = val;
                processedAsCoreKey = true;
                notesArr.push(`${key}: ${val}`); // Keep in notes for raw context
            } else if (key === 'notes' || key === 'summary') {
                notesArr.push(val);
                processedAsCoreKey = true;
            }
        }

        // Match heuristic shorthands (now allowing spaces/hyphens/hashtags instead of just colons)
        const epMatch = trimmed.match(/^(?:Last\s+)?(?:Finished Ep|Going To Ep|Ep|Episode)[\s:\-#]*(\d+)/i);
        if (epMatch) {
            episode = Math.max(episode, parseInt(epMatch[1], 10));
            // Keep in notes as well to avoid losing context like "Finished Ep" vs "Going To Ep"
        }

        const chMatch = trimmed.match(/^(?:Last\s+)?(?:Ch|Chapter)[\s:\-#]*(\d+)/i);
        if (chMatch) {
            chapter = Math.max(chapter, parseInt(chMatch[1], 10));
        }

        if (!processedAsCoreKey) {
            notesArr.push(trimmed);
        }
    });

    // Extract Season from title (e.g., "Rick and Morty S5", "Rick and Morty S8 Spinoff")
    // This runs here so that if 'Title:' in the file text had 'S5', we catch it too.
    // It captures 'S#' and ALL trailing text to strip from the base title.
    const seasonMatch = title.match(/\b(?:S|Season\s*)(\d+)(.*)$/i);
    if (seasonMatch) {
        season = parseInt(seasonMatch[1], 10);
        notesArr.push(`Season: ${season}`);

        const trailingText = seasonMatch[2].trim();
        if (trailingText) {
            notesArr.push(`Title Note: ${trailingText}`);
        }

        title = title.substring(0, seasonMatch.index).trim();
    }

    if (!url) {
        url = `https://www.google.com/search?q=${encodeURIComponent(title)}`;
    }

    const newLinkId = Date.now() + Math.random();
    const summaryText = notesArr.join('\n');

    // Default bookmark creation
    const newBookmark = {
        id: newLinkId,
        title,
        url: normalizeUrl(url),
        category: targetCategory,
        workspace: config.activeWorkspace,
        folderId: folderId,
        icon: '',
        done: false,
        notes: summaryText
    };

    links.push(newBookmark);

    // Attempt Library Connection Integration
    if (window.EveLibrary?.ConnectionsAPI?.promoteLinkWithData) {
        let dataType = 'graphicNovels';

        // Infer type if not explicitly set
        if (type.includes('film') || type.includes('show') || type.includes('anime')) {
            dataType = 'films';
        } else if (type.includes('graphic') || type.includes('manga')) {
            dataType = 'graphicNovels';
        } else if (type.includes('novel')) {
            dataType = 'novels';
        } else if (type === '') {
            // Heuristic fallback based on parsed data
            if (episode > 0) {
                dataType = 'films';
            } else if (chapter > 0) {
                // If there is a chapter, strongly prefer graphicNovels since standard novels are rarely added
                dataType = 'graphicNovels';
            } else if (summaryText.toLowerCase().includes('manga') || summaryText.toLowerCase().includes('graphic')) {
                dataType = 'graphicNovels';
            } else if (summaryText.toLowerCase().includes('novel')) {
                dataType = 'novels';
            }
        }

        let mappedStatus = dataType === 'films' ? 'Plan to Watch' : 'Plan to Read';
        if (status) {
            const norm = status.toLowerCase();
            if (norm.includes('finish') || norm.includes('complete') || norm.includes('done')) {
                mappedStatus = 'Completed';
            } else if (norm.includes('drop') || norm.includes('cancel') || norm.includes('abandon')) {
                mappedStatus = 'Dropped';
            } else if (norm.includes('hiatus')) {
                mappedStatus = 'Hiatus';
            } else if (norm.includes('hold') || norm.includes('pause')) {
                mappedStatus = 'On Hold';
            } else if (norm.includes('read') || norm.includes('watch') || norm.includes('ongoing')) {
                mappedStatus = dataType === 'films' ? 'Watching' : 'Reading';
            } else if (norm.includes('plan') || norm.includes('want')) {
                mappedStatus = dataType === 'films' ? 'Plan to Watch' : 'Plan to Read';
            }
        }

        window.EveLibrary.ConnectionsAPI.promoteLinkWithData(newLinkId, {
            title: title || 'Untitled',
            mediaTypes: [dataType],
            status: mappedStatus,
            chapter: dataType !== 'films' ? chapter : 0,
            season: dataType === 'films' ? (season > 0 ? season : 1) : season,
            episode: dataType === 'films' ? episode : 0,
            sourceUrl: url,
            summary: summaryText
        });
    } else {
        console.warn('Library Connections API not found. Bookmark was added standalone.');
    }
}
