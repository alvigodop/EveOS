window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    const { getBulkMode, runBatched, processStructuredFile, maybeNormalizeBulkUrlBlob } = api;

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
                parentId,
                persist: false
            });

            if (newFolder) {
                createdFolders.set(dirPath, newFolder.id);
            }
        }

        // 2) Process files and place them in the correct folder
        let deferredLibraryPromotions = 0;

        await runBatched(filesToProcess, async ({ file, path, parts }) => {
            try {
                let parentFolderId = '';
                if (parts.length > 1) {
                    const parentPath = parts.slice(0, parts.length - 1).join('/');
                    parentFolderId = createdFolders.get(parentPath) || '';
                }

                const content = maybeNormalizeBulkUrlBlob(await file.text());
                const isStructured = content.match(/^(Title|URL|Episode|Ep|Chapter|Ch|Type|Notes|Finished Ep|Going To Ep)[\s:-]+/mi);
                const isMediaFile = file.name.match(/^(Was\s+|[\{\(]\d+[\}\)])/i);

                if (isStructured || isMediaFile) {
                    const promoted = processStructuredFile(content, file.name, targetCategory, parentFolderId, {
                        deferLibrarySave: true,
                        silent: true
                    });
                    if (promoted) deferredLibraryPromotions++;
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
        });

        if (folderInput) folderInput.value = '';
        saveData();
        if (deferredLibraryPromotions > 0 && window.EveLibrary?.Storage?.saveLibrary) {
            window.EveLibrary.Storage.saveLibrary();
        }
        if (deferredLibraryPromotions > 0 && window.EveLibrary?.ConnectionsCore?.saveConnections) {
            window.EveLibrary.ConnectionsCore.saveConnections();
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

        let deferredLibraryPromotions = 0;
        const selectedFiles = Array.from(fileInput.files || []);
        const fallbackTexts = new Array(selectedFiles.length);

        await runBatched(selectedFiles, async (file, index) => {
            try {
                const content = maybeNormalizeBulkUrlBlob(await file.text());
                // Check if the file contains structured library data fields, shorthands, or if the filename specifies a media entry
                const isStructured = content.match(/^(Title|URL|Episode|Ep|Chapter|Ch|Type|Notes|Finished Ep|Going To Ep)[\s:-]+/mi);
                const isMediaFile = file.name.match(/^(Was\s+|[\{\(]\d+[\}\)])/i);

                if (isStructured || isMediaFile) {
                    const promoted = processStructuredFile(content, file.name, targetCategory, '', {
                        deferLibrarySave: true,
                        silent: true
                    });
                    if (promoted) deferredLibraryPromotions++;
                    count++;
                } else {
                    // Not structured, append to generic text processor
                    fallbackTexts[index] = content;
                }
            } catch (e) {
                console.error("Failed to read file", file.name, e);
            }
        });
        textToProcess += fallbackTexts.filter(Boolean).join("\n");
        if (fileInput) fileInput.value = '';
        if (deferredLibraryPromotions > 0 && window.EveLibrary?.Storage?.saveLibrary) {
            window.EveLibrary.Storage.saveLibrary();
        }
        if (deferredLibraryPromotions > 0 && window.EveLibrary?.ConnectionsCore?.saveConnections) {
            window.EveLibrary.ConnectionsCore.saveConnections();
        }
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

    Object.assign(api, { processBulk });
})();
