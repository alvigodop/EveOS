window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    const {
        getBulkMode,
        getSmartExtractImportMode,
        runBatched,
        processStructuredFile,
        maybeNormalizeBulkUrlBlob,
        looksLikeStructuredFileContent,
        looksLikeSingleEntryBulkFile,
        normalizeImportedFileTitle
    } = api;

    function isUnlabeledProgressToken(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        return /^(?:[\[\(\{]\s*)?\d+(?:\.\d+)?(?:\s*[\]\)\}])?$/.test(text);
    }

    function pushBulkLink(categoryName, title, rawUrl) {
        links.push({
            id: Date.now() + Math.random(),
            title: title,
            url: normalizeUrl(rawUrl),
            category: categoryName,
            workspace: config.activeWorkspace,
            icon: '',
            done: false
        });
    }

    function processSmartTextBlock(textToProcess, targetCategory) {
        const lines = String(textToProcess || '').split('\n');
        let addedCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i].trim();
            if (!raw) continue;

            let parsedUrl = '';
            let parsedTitle = '';

            const urlMatch = raw.match(/(https?:\/\/[^\s]+)/i);
            if (urlMatch) {
                parsedUrl = urlMatch[1];
                parsedTitle = raw.replace(parsedUrl, '').trim();
                parsedTitle = parsedTitle.replace(/^[\-\|:;\s]+|[\-\|:;\s]+$/g, '').trim();
            }

            if (!parsedUrl) {
                if (i + 1 < lines.length) {
                    const nextRaw = lines[i + 1].trim();
                    if (nextRaw) {
                        const nextUrlMatch = nextRaw.match(/^(https?:\/\/[^\s]+)$/i);
                        if (nextUrlMatch) {
                            parsedUrl = nextUrlMatch[1];
                            parsedTitle = raw;
                            i++;
                        }
                    }
                }
            }

            if (!parsedUrl) {
                parsedUrl = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
                parsedTitle = raw;
            } else if (!parsedTitle) {
                parsedTitle = parsedUrl;
            }

            pushBulkLink(targetCategory, parsedTitle, parsedUrl);
            addedCount++;
        }

        return addedCount;
    }

    function persistBulkLibraryState(options = {}) {
        const shouldSaveLibrary = !!options.saveLibrary;
        const shouldSaveConnections = !!options.saveConnections;
        if (!shouldSaveLibrary && !shouldSaveConnections) return true;

        let succeeded = true;

        if (shouldSaveLibrary && window.EveLibrary?.Storage?.saveLibrary) {
            try {
                window.EveLibrary.Storage.saveLibrary();
            } catch (error) {
                succeeded = false;
                console.error('Bulk import: failed to persist library state', error);
            }
        }

        if (shouldSaveConnections && window.EveLibrary?.ConnectionsCore?.saveConnections) {
            try {
                window.EveLibrary.ConnectionsCore.saveConnections();
            } catch (error) {
                succeeded = false;
                console.error('Bulk import: failed to persist library connections', error);
            }
        }

        if (!succeeded) {
            showToast('Imported items, but some library links could not be fully persisted.', 'warning');
        }

        return succeeded;
    }

async function processBulk() {
    const catInput = document.getElementById('bulkCategory');
    const targetCategory = (catInput && catInput.value.trim()) ? catInput.value.trim() : "Unsorted";
    const mode = getBulkMode();

    let textToProcess = "";
    let count = 0;
    let shouldPersistLibrary = false;
    let shouldPersistConnections = false;

    if (mode === 'folder' || mode === 'card') {
        const files = api._accumulatedFolderFiles || [];
        api._accumulatedFolderFiles = []; // Flush accumulator immediately to prevent double-click race conditions
        if (files.length === 0) {
            return showToast("No folder(s) selected", "warning");
        }

        const workspaceId = config.activeWorkspace;
        const folderManager = window.EveBookmarkFolders;
        if (!folderManager) {
            return showToast("Folder management system not available.", "error");
        }

        // Cache folder paths to folder IDs
        const createdFolders = new Map();

        // 1) First pass: identify unique directory paths and create them
        const dirPaths = new Map();
        const filesToProcess = [];
        const processedFileSignatures = new Set();
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const originalPath = file.customRelativePath || file.webkitRelativePath || file.name;
            
            // Deduplicate files natively to prevent OS drag-drop bugs providing duplicate system handles
            const fileSig = `${originalPath}-${file.name}-${file.size}-${file.lastModified}`;
            if (processedFileSignatures.has(fileSig)) continue;
            processedFileSignatures.add(fileSig);

            const parts = originalPath.split('/');
            
            let activeCategory = targetCategory;
            let activeParts = [...parts];
            
            if (mode === 'card') {
                if (parts.length > 1) {
                    const rootName = parts[0];
                    activeCategory = (api._latentCardMap && api._latentCardMap[rootName]) ? api._latentCardMap[rootName] : rootName;
                    activeParts = parts.slice(1);
                } else {
                    activeCategory = "Unsorted";
                    activeParts = parts;
                }
            }
            
            if (activeParts.length > 1) {
                let currentPath = '';
                for (let j = 0; j < activeParts.length - 1; j++) {
                    currentPath = currentPath ? currentPath + '/' + activeParts[j] : activeParts[j];
                    const fullKey = activeCategory + "::" + currentPath;
                    if (!dirPaths.has(fullKey)) {
                        dirPaths.set(fullKey, {
                            cardName: activeCategory,
                            path: currentPath,
                            parts: activeParts.slice(0, j + 1),
                            fullKey: fullKey
                        });
                    }
                }
            }
            filesToProcess.push({ file, path: originalPath, parts: activeParts, cardName: activeCategory });
        }

        // Sort paths by length so we create parents before children
        const sortedPaths = Array.from(dirPaths.values()).sort((a, b) => a.parts.length - b.parts.length);

        for (const meta of sortedPaths) {
            const folderName = meta.parts[meta.parts.length - 1];
            let parentId = '';
            
            if (meta.parts.length > 1) {
                const parentPath = meta.parts.slice(0, meta.parts.length - 1).join('/');
                const parentKey = meta.cardName + "::" + parentPath;
                parentId = createdFolders.get(parentKey) || '';
            }

            const newFolder = folderManager.createFolder({
                workspaceId,
                categoryName: meta.cardName,
                name: folderName,
                parentId,
                persist: false
            });

            if (newFolder) {
                createdFolders.set(meta.fullKey, newFolder.id);
            }
        }

        // 2) Process files and place them in the correct folder
        let deferredLibraryPromotions = 0;

        await runBatched(filesToProcess, async ({ file, path, parts, cardName }) => {
            try {
                let parentFolderId = '';
                if (parts.length > 1) {
                    const parentPath = parts.slice(0, parts.length - 1).join('/');
                    const parentKey = cardName + "::" + parentPath;
                    parentFolderId = createdFolders.get(parentKey) || '';
                }

                const content = maybeNormalizeBulkUrlBlob(await file.text());
                const isStructured = typeof looksLikeStructuredFileContent === 'function'
                    ? looksLikeStructuredFileContent(content, file.name)
                    : content.match(/^(Title|URL|Episode|Ep|Chapter|Ch|Type|Notes|Finished Ep|Going To Ep)[\s:-]+/mi);
                const isSingleEntryFile = typeof looksLikeSingleEntryBulkFile === 'function'
                    ? looksLikeSingleEntryBulkFile(content, file.name)
                    : false;
                const isMediaFile = file.name.match(/^(Was\s+|[\[\{\(]\d+[\]\}\)])/i);

                if (isStructured || isMediaFile || isSingleEntryFile) {
                    const promoted = processStructuredFile(content, file.name, cardName, parentFolderId, {
                        deferLibrarySave: true,
                        silent: true
                    });
                    if (promoted) deferredLibraryPromotions++;
                    count++;
                } else {
                    // Fallback to basic link reading per line
                    const fileUrls = new Set();
                    const lines = content.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        const raw = lines[i].trim();
                        if (!raw) continue;
                        
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
                            // Check if the next line is purely a URL, so we can pair them up
                            if (i + 1 < lines.length) {
                                const nextRaw = lines[i + 1].trim();
                                if (nextRaw) {
                                    const nextUrlMatch = nextRaw.match(/^(https?:\/\/[^\s]+)$/i);
                                    if (nextUrlMatch) {
                                        parsedUrl = nextUrlMatch[1];
                                        // Since the current line had no URL, its exact text should be the title
                                        parsedTitle = raw;
                                        const fallbackFileTitle = file.name.replace(/\.txt$/i, '').trim();
                                        if (isUnlabeledProgressToken(parsedTitle) && !isUnlabeledProgressToken(fallbackFileTitle)) {
                                            parsedTitle = fallbackFileTitle;
                                        }
                                        // Skip parsing the next line as a separate bookmark
                                        i++;
                                    }
                                }
                            }
                        }

                        if (!parsedUrl) {
                            parsedUrl = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
                            // If no URL was found, the whole line is likely the name, so we override the file name title
                            if (parsedTitle === file.name.replace(/\.txt$/i, '').trim()) {
                                parsedTitle = raw;
                            }
                        }

                        // Strictly deduplicate URLs within the same import session loop
                        const normalizedForSession = normalizeUrl(parsedUrl);
                        if (fileUrls.has(normalizedForSession)) continue;
                        fileUrls.add(normalizedForSession);

                        links.push({
                            id: Date.now() + Math.random(),
                            title: parsedTitle,
                            url: normalizeUrl(parsedUrl),
                            category: cardName,
                            workspace: workspaceId,
                            folderId: parentFolderId,
                            icon: '',
                            done: false
                        });
                        count++;
                    }
                }
            } catch (e) {
                console.error("Failed to read file in folder", file.name, e);
            }
        });

        const folderInput = document.getElementById('bulkFolderInput');
        if (folderInput) folderInput.value = '';
        api._accumulatedFolderFiles = [];
        saveData();
        shouldPersistLibrary = deferredLibraryPromotions > 0;
        shouldPersistConnections = deferredLibraryPromotions > 0;
        closeModals();
        persistBulkLibraryState({
            saveLibrary: shouldPersistLibrary,
            saveConnections: shouldPersistConnections
        });
        if (window.EveBookmarkFolders?.refreshEditorFolderSelect) {
            window.EveBookmarkFolders.refreshEditorFolderSelect();
        }
        
        let msg = `Imported ${count} items.`;
        if (mode === 'card') {
            msg = `Created Cards from folders and imported ${count} items.`;
        } else {
            msg = `Imported ${count} items and created structure in "${targetCategory}".`;
        }
        return showToast(msg, "success");

    } else if (mode === 'file') {
        const fileInput = document.getElementById('bulkFileInput');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            return showToast("No files selected", "warning");
        }

        let deferredLibraryPromotions = 0;
        const selectedFiles = Array.from(fileInput.files || []);
        const smartExtractImportMode = typeof getSmartExtractImportMode === 'function'
            ? getSmartExtractImportMode()
            : 'single-card';
        const fallbackTexts = new Array(selectedFiles.length);
        const cardNamesUsed = new Set();

        await runBatched(selectedFiles, async (file, index) => {
            try {
                const content = maybeNormalizeBulkUrlBlob(await file.text());
                const fileCategory = smartExtractImportMode === 'card-per-file'
                    ? (typeof api.resolveSmartExtractCardTitle === 'function'
                        ? api.resolveSmartExtractCardTitle(
                            file,
                            typeof normalizeImportedFileTitle === 'function'
                                ? (normalizeImportedFileTitle(file.name) || targetCategory)
                                : (String(file.name || '').replace(/\.txt$/i, '').trim() || targetCategory)
                        )
                        : (typeof normalizeImportedFileTitle === 'function'
                            ? (normalizeImportedFileTitle(file.name) || targetCategory)
                            : (String(file.name || '').replace(/\.txt$/i, '').trim() || targetCategory)))
                    : targetCategory;
                // Check if the file contains structured library data fields, shorthands, or if the filename specifies a media entry
                const isStructured = typeof looksLikeStructuredFileContent === 'function'
                    ? looksLikeStructuredFileContent(content, file.name)
                    : content.match(/^(Title|URL|Episode|Ep|Chapter|Ch|Type|Notes|Finished Ep|Going To Ep)[\s:-]+/mi);
                const isSingleEntryFile = typeof looksLikeSingleEntryBulkFile === 'function'
                    ? looksLikeSingleEntryBulkFile(content, file.name)
                    : false;
                const isMediaFile = file.name.match(/^(Was\s+|[\[\{\(]\d+[\]\}\)])/i);

                if (isStructured || isMediaFile || isSingleEntryFile) {
                    const promoted = processStructuredFile(content, file.name, fileCategory, '', {
                        deferLibrarySave: true,
                        silent: true
                    });
                    if (promoted) deferredLibraryPromotions++;
                    cardNamesUsed.add(fileCategory);
                    count++;
                } else if (smartExtractImportMode === 'card-per-file') {
                    count += processSmartTextBlock(content, fileCategory);
                    cardNamesUsed.add(fileCategory);
                } else {
                    // Not structured, append to generic text processor
                    fallbackTexts[index] = content;
                }
            } catch (e) {
                console.error("Failed to read file", file.name, e);
            }
        });
        if (smartExtractImportMode === 'card-per-file') {
            textToProcess = '';
        } else {
            textToProcess += fallbackTexts.filter(Boolean).join("\n");
        }
        if (fileInput) fileInput.value = '';
        shouldPersistLibrary = deferredLibraryPromotions > 0;
        shouldPersistConnections = deferredLibraryPromotions > 0;
        if (smartExtractImportMode === 'card-per-file') {
            if (count === 0) {
                return showToast("No entries found", "warning");
            }
            saveData();
            closeModals();
            persistBulkLibraryState({
                saveLibrary: shouldPersistLibrary,
                saveConnections: shouldPersistConnections
            });
            const cardCount = cardNamesUsed.size;
            const cardLabel = cardCount === 1 ? 'card' : 'cards';
            return showToast(`Imported ${count} items into ${cardCount} ${cardLabel}.`, "success");
        }
    } else {
        textToProcess = document.getElementById('bulkText').value;
    }

    if (!textToProcess && count === 0) return showToast("No entries found", "warning");

    if (textToProcess) {
        let effectiveMode = mode;
        if (mode === 'file') {
            effectiveMode = 'smart';
        }

        if (effectiveMode === 'smart') {
            count += processSmartTextBlock(textToProcess, targetCategory);
            textToProcess = '';
        }

        const lines = textToProcess.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i].trim();
            if (!raw) continue;

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
            }
            count++;
        }
    }

    saveData();
    closeModals();
    persistBulkLibraryState({
        saveLibrary: shouldPersistLibrary,
        saveConnections: shouldPersistConnections
    });
    showToast(`Imported ${count} items to "${targetCategory}"`, "success");
}

    Object.assign(api, { processBulk });
})();
