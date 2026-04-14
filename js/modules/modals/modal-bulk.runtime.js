window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};

const BULK_IMPORT_BATCH_SIZE = 12;
const BULK_URL_MATCH_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

async function runBatched(items, worker, batchSize = BULK_IMPORT_BATCH_SIZE) {
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);
        await Promise.all(batch.map((item, index) => worker(item, i + index)));
    }
}

function getBulkMode() {
    if (document.getElementById('bulkModeCard')?.checked) return 'card';
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
    const autoLineBreakBtn = document.getElementById('bulkAutoLineBreakBtn');
    const textToolsHint = document.getElementById('bulkTextToolsHint');
    
    // UI mapping
    const categoryWrapper = document.getElementById('bulkCategoryWrapper');
    const latentPanel = document.getElementById('bulkLatentCardsPanel');
    const latentList = document.getElementById('bulkLatentCardsList');

    if (!text || !hint) return;

    if (fileDropZone) fileDropZone.style.display = 'none';
    if (folderDropZone) folderDropZone.style.display = 'none';
    if (autoLineBreakBtn) autoLineBreakBtn.style.display = 'none';
    if (textToolsHint) textToolsHint.style.display = 'none';
    
    // Visibility resets
    if (categoryWrapper) categoryWrapper.style.display = 'block';
    if (latentPanel) latentPanel.style.display = 'none';

    if (mode === 'folder' || mode === 'card') {
        text.style.display = 'none';
        
        if (mode === 'card') {
             if (categoryWrapper) categoryWrapper.style.display = 'none';
             if (latentPanel) latentPanel.style.display = 'flex';
             hint.textContent = "Cards mode: Upload main folders. The main folders become Cards, internal content maps to them.";
        } else {
             hint.textContent = "Folder mode: Upload a folder. Structure will be maintained via bookmark folders within the target Card.";
        }

        if (folderDropZone) {
            folderDropZone.style.display = 'flex';
            const dropText = document.getElementById('bulkFolderDropText');
            if (api._accumulatedFolderFiles && api._accumulatedFolderFiles.length > 0) {
                dropText.textContent = `${api._accumulatedFolderFiles.length} file(s) accumulated from selected folder(s)`;
                folderDropZone.style.borderColor = '#00a8ff';
                folderDropZone.style.color = '#fff';
                
                if (mode === 'card' && latentList) {
                    latentList.innerHTML = '';
                    const rootFolders = new Set();
                    
                    api._accumulatedFolderFiles.forEach(f => {
                         const relativePath = f.customRelativePath || f.webkitRelativePath || f.name;
                         const parts = relativePath.split('/');
                         if (parts.length > 1) { 
                             rootFolders.add(parts[0]);
                         }
                    });
                    
                    if (rootFolders.size > 0) {
                        api._latentCardMap = api._latentCardMap || {};
                        rootFolders.forEach(rootName => {
                            if (!api._latentCardMap[rootName]) {
                                api._latentCardMap[rootName] = rootName;
                            }
                            
                            const div = document.createElement('div');
                            div.style.display = 'flex';
                            div.style.alignItems = 'center';
                            div.style.gap = '8px';
                            
                            const icon = document.createElement('span');
                            icon.textContent = '🗂️';
                            
                            const strongTxt = document.createElement('span');
                            strongTxt.style.fontSize = '0.85rem';
                            strongTxt.style.flexShrink = '0';
                            strongTxt.style.maxWidth = '160px';
                            strongTxt.style.display = 'inline-block';
                            strongTxt.style.overflow = 'hidden';
                            strongTxt.style.textOverflow = 'ellipsis';
                            strongTxt.style.whiteSpace = 'nowrap';
                            strongTxt.textContent = rootName + " →";
                            
                            const input = document.createElement('input');
                            input.type = 'text';
                            input.value = api._latentCardMap[rootName];
                            input.style.flex = '1';
                            input.style.padding = '6px 8px';
                            input.style.border = '1px solid #444';
                            input.style.borderRadius = '4px';
                            input.style.backgroundColor = '#1a1a1a';
                            input.style.color = '#fff';
                            input.oninput = (e) => {
                                api._latentCardMap[rootName] = e.target.value.trim() || rootName;
                            };
                            
                            div.appendChild(icon);
                            div.appendChild(strongTxt);
                            div.appendChild(input);
                            latentList.appendChild(div);
                        });
                    } else {
                        latentList.innerHTML = '<div style="color:#777; font-size:0.85rem; font-style:italic;">No directories detected. Did you upload flat files?</div>';
                    }
                }
            } else {
                dropText.textContent = 'Click to select or drag & drop folder(s)';
                folderDropZone.style.borderColor = '#444';
                folderDropZone.style.color = '#aaa';
                if (latentList) latentList.innerHTML = '<div style="color:#777; font-size:0.85rem; font-style:italic;">Drop folders above to preview latent cards.</div>';
            }
        }
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
            if (autoLineBreakBtn) {
                autoLineBreakBtn.textContent = 'Auto Line Break Names';
                autoLineBreakBtn.style.display = 'inline-flex';
            }
            if (textToolsHint) {
                textToolsHint.textContent = 'Splits pasted name blobs into separate lines.';
                textToolsHint.style.display = 'block';
            }
        } else {
            text.placeholder = "One URL per line...";
            hint.textContent = "URL mode: each line should be a URL.";
            if (autoLineBreakBtn) {
                autoLineBreakBtn.textContent = 'Auto Line Break URLs';
                autoLineBreakBtn.style.display = 'inline-flex';
            }
            if (textToolsHint) {
                textToolsHint.textContent = 'Splits pasted URL blobs into one URL per line.';
                textToolsHint.style.display = 'block';
            }
        }
    }
}

function splitBulkUrlsToLines(rawValue) {
    const urlMatches = String(rawValue || '').match(BULK_URL_MATCH_REGEX) || [];
    const rewritten = urlMatches
        .map(url => url.replace(/[),.;!?]+$/g, '').trim())
        .filter(Boolean)
        .join('\n');
    return {
        count: urlMatches.length,
        rewritten
    };
}

function maybeNormalizeBulkUrlBlob(rawValue) {
    const source = String(rawValue || '');
    const { count, rewritten } = splitBulkUrlsToLines(source);
    if (count < 2 || !rewritten) {
        return source;
    }

    const residue = source
        .replace(BULK_URL_MATCH_REGEX, ' ')
        .replace(/[\s,;|()[\]{}<>]+/g, ' ')
        .trim();

    return residue ? source : rewritten;
}

function splitBulkNamesToLines(rawValue) {
    const source = String(rawValue || '').replace(/\r/g, '').trim();
    if (!source) {
        return {
            count: 0,
            rewritten: ''
        };
    }

    let candidate = source
        .replace(/\s*[•●▪◦]+\s*/g, '\n')
        .replace(/\s*[;|]+\s*/g, '\n')
        .replace(/\t+/g, '\n')
        .replace(/\s+(?=\d+\.\s+)/g, '\n');

    if (!candidate.includes('\n')) {
        const commaParts = candidate
            .split(/\s*,\s*/g)
            .map(part => part.trim())
            .filter(Boolean);
        if (commaParts.length > 1) {
            candidate = commaParts.join('\n');
        }
    }

    const parts = candidate
        .split(/\n+/g)
        .map(part => part.trim())
        .filter(Boolean);

    return {
        count: parts.length,
        rewritten: parts.join('\n')
    };
}

function autoLineBreakBulkUrls() {
    const text = document.getElementById('bulkText');
    if (!text) return;

    const rawValue = String(text.value || '');
    if (!rawValue.trim()) {
        showToast('Nothing to split', 'info');
        text.focus();
        return;
    }

    const { count, rewritten } = splitBulkUrlsToLines(rawValue);
    if (count === 0 || !rewritten) {
        showToast('No URLs found to split', 'warning');
        text.focus();
        return;
    }

    text.value = rewritten;
    text.focus();
    text.selectionStart = text.selectionEnd = text.value.length;
    showToast(`Split ${count} URL${count === 1 ? '' : 's'} into separate lines`, 'success');
}

function autoLineBreakBulkNames() {
    const text = document.getElementById('bulkText');
    if (!text) return;

    const rawValue = String(text.value || '');
    if (!rawValue.trim()) {
        showToast('Nothing to split', 'info');
        text.focus();
        return;
    }

    const { count, rewritten } = splitBulkNamesToLines(rawValue);
    if (count === 0 || !rewritten) {
        showToast('No names found to split', 'warning');
        text.focus();
        return;
    }

    text.value = rewritten;
    text.focus();
    text.selectionStart = text.selectionEnd = text.value.length;
    showToast(`Split ${count} name${count === 1 ? '' : 's'} into separate lines`, 'success');
}

function autoFormatBulkText() {
    if (getBulkMode() === 'name') {
        autoLineBreakBulkNames();
        return;
    }
    autoLineBreakBulkUrls();
}

function initBulkModeUi() {
    const url = document.getElementById('bulkModeUrl');
    const name = document.getElementById('bulkModeName');
    const file = document.getElementById('bulkModeFile');
    const folder = document.getElementById('bulkModeFolder');
    const card = document.getElementById('bulkModeCard');
    if (url) url.onchange = updateBulkModeUi;
    if (name) name.onchange = updateBulkModeUi;
    if (file) file.onchange = updateBulkModeUi;
    if (folder) folder.onchange = updateBulkModeUi;
    if (card) card.onchange = updateBulkModeUi;

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

    api._accumulatedFolderFiles = api._accumulatedFolderFiles || [];

    async function readAllEntries(dirReader) {
        let entries = [];
        let readEntries = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
        while (readEntries.length > 0) {
            entries.push(...readEntries);
            readEntries = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
        }
        return entries;
    }

    async function traverseFileTree(item, path, array) {
        path = path || "";
        if (item.isFile) {
            try {
                const file = await new Promise((resolve, reject) => {
                    try {
                        item.file(resolve, reject);
                    } catch (e) {
                        reject(e);
                    }
                });
                Object.defineProperty(file, 'customRelativePath', {
                    value: path + file.name,
                    writable: false
                });
                array.push(file);
            } catch (err) {
                console.warn(`Failed to read file entry: ${item.name}`, err);
            }
        } else if (item.isDirectory) {
            try {
                const dirReader = item.createReader();
                const entries = await readAllEntries(dirReader);
                for (let i = 0; i < entries.length; i++) {
                    await traverseFileTree(entries[i], path + item.name + "/", array);
                }
            } catch (err) {
                console.warn(`Failed to read directory entry: ${item.name}`, err);
            }
        }
    }

    if (folderInput && folderDropZone) {
        folderDropZone.addEventListener('click', (e) => {
            if (e.target !== folderInput) {
                folderInput.click();
            }
        });

        folderInput.addEventListener('change', (e) => {
            if (folderInput.files && folderInput.files.length > 0) {
                // Clear accumulator to prevent duplication if user selects/drops multiple times before hitting Import
                api._accumulatedFolderFiles = [];
                for (let i = 0; i < folderInput.files.length; i++) {
                    api._accumulatedFolderFiles.push(folderInput.files[i]);
                }
                setTimeout(() => {
                    if (folderInput) folderInput.value = '';
                }, 0);
            }
            updateBulkModeUi();
        });

        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        folderDropZone.addEventListener('dragenter', (e) => {
            preventDefaults(e);
            folderDropZone.style.borderColor = '#00a8ff';
            folderDropZone.style.backgroundColor = '#1a1a1a';
        });

        folderDropZone.addEventListener('dragover', (e) => {
            preventDefaults(e);
            folderDropZone.style.borderColor = '#00a8ff';
            folderDropZone.style.backgroundColor = '#1a1a1a';
        });

        folderDropZone.addEventListener('dragleave', (e) => {
            preventDefaults(e);
            if (!api._accumulatedFolderFiles || api._accumulatedFolderFiles.length === 0) {
                folderDropZone.style.borderColor = '#444';
                folderDropZone.style.backgroundColor = '#111';
            }
        });

        folderDropZone.addEventListener('drop', async (e) => {
            preventDefaults(e);
            folderDropZone.style.backgroundColor = '#111';
            
            // Clear accumulator to prevent duplication if user drops multiple times before hitting Import
            api._accumulatedFolderFiles = [];
            
            if (e.dataTransfer && e.dataTransfer.items) {
                const items = Array.from(e.dataTransfer.items);
                let useModernApi = false;
                
                // Try modern File System Access API first
                if (items[0] && typeof items[0].getAsFileSystemHandle === 'function') {
                    try {
                        const handlePromises = [];
                        for (const item of items) {
                            if (item.kind === 'file' || item.kind === 'directory') {
                                handlePromises.push(item.getAsFileSystemHandle());
                            }
                        }
                        
                        const handles = (await Promise.all(handlePromises)).filter(Boolean);
                        
                        if (handles.length > 0) {
                            useModernApi = true;
                            
                            async function traverseHandle(handle, path, array) {
                                if (handle.kind === 'file') {
                                    const file = await handle.getFile();
                                    Object.defineProperty(file, 'customRelativePath', {
                                        value: path + file.name,
                                        writable: false
                                    });
                                    array.push(file);
                                } else if (handle.kind === 'directory') {
                                    for await (const [name, childHandle] of handle.entries()) {
                                        await traverseHandle(childHandle, path + handle.name + "/", array);
                                    }
                                }
                            }
                            
                            for (const handle of handles) {
                                await traverseHandle(handle, '', api._accumulatedFolderFiles);
                            }
                            updateBulkModeUi();
                        }
                    } catch (err) {
                        console.warn("Modern File System Access API failed, falling back", err);
                        useModernApi = false;
                    }
                }
                
                if (!useModernApi) {
                    const entries = [];
                    for (const item of items) {
                        if (item.kind === 'file') {
                            const entry = item.webkitGetAsEntry();
                            if (entry) entries.push(entry);
                        }
                    }
                    
                    (async () => {
                        for (const entry of entries) {
                            try {
                                await traverseFileTree(entry, '', api._accumulatedFolderFiles);
                            } catch (err) {
                                console.error("Failed to traverse entry", entry, err);
                            }
                        }
                        updateBulkModeUi();
                    })();
                }
            } else if (e.dataTransfer && e.dataTransfer.files) {
                 for (let i = 0; i < e.dataTransfer.files.length; i++) {
                      api._accumulatedFolderFiles.push(e.dataTransfer.files[i]);
                 }
                 updateBulkModeUi();
            } else {
                setTimeout(updateBulkModeUi, 50);
            }
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
    api._accumulatedFolderFiles = [];
    updateBulkModeUi();
    document.getElementById('bulkText').focus();
}

    Object.assign(api, {
        BULK_IMPORT_BATCH_SIZE,
        BULK_URL_MATCH_REGEX,
        runBatched,
        getBulkMode,
        updateBulkModeUi,
        splitBulkUrlsToLines,
        maybeNormalizeBulkUrlBlob,
        splitBulkNamesToLines,
        autoFormatBulkText,
        autoLineBreakBulkUrls,
        autoLineBreakBulkNames,
        initBulkModeUi,
        openBulkModal,
        clearBulkInput
    });
})();
