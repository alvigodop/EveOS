window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    if (api.runtimeUiReady || !api.runtimeSharedReady) return;

    function deriveSmartExtractCategoryTitle(fileList) {
        const files = Array.from(fileList || [])
            .filter((file) => file && /\.txt$/i.test(String(file.name || '').trim()));
        if (files.length !== 1) return '';

        const normalizeTitle = typeof api.normalizeImportedFileTitle === 'function'
            ? api.normalizeImportedFileTitle
            : (fileName) => String(fileName || '').replace(/\.txt$/i, '').trim();

        return normalizeTitle(files[0].name);
    }

    function maybeAutofillSmartExtractCategory(fileList) {
        const categoryInput = document.getElementById('bulkCategory');
        if (!categoryInput) return;

        const nextTitle = deriveSmartExtractCategoryTitle(fileList);
        if (!nextTitle) return;

        const currentValue = String(categoryInput.value || '').trim();
        const previousAutoValue = String(api._smartExtractAutoCategory || '').trim();
        if (currentValue && currentValue !== previousAutoValue) return;

        categoryInput.value = nextTitle;
        api._smartExtractAutoCategory = nextTitle;
    }

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
        const currentPath = path || '';
        if (item.isFile) {
            try {
                const file = await new Promise((resolve, reject) => {
                    try {
                        item.file(resolve, reject);
                    } catch (error) {
                        reject(error);
                    }
                });
                Object.defineProperty(file, 'customRelativePath', {
                    value: currentPath + file.name,
                    writable: false
                });
                array.push(file);
            } catch (error) {
                console.warn(`Failed to read file entry: ${item.name}`, error);
            }
            return;
        }

        if (!item.isDirectory) return;

        try {
            const dirReader = item.createReader();
            const entries = await readAllEntries(dirReader);
            for (let index = 0; index < entries.length; index += 1) {
                await traverseFileTree(entries[index], currentPath + item.name + '/', array);
            }
        } catch (error) {
            console.warn(`Failed to read directory entry: ${item.name}`, error);
        }
    }

    async function traverseHandle(handle, path, array) {
        const currentPath = path || '';
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            Object.defineProperty(file, 'customRelativePath', {
                value: currentPath + file.name,
                writable: false
            });
            array.push(file);
            return;
        }

        if (handle.kind !== 'directory') return;
        for await (const [, childHandle] of handle.entries()) {
            await traverseHandle(childHandle, currentPath + handle.name + '/', array);
        }
    }

    function initBulkModeUi() {
        api._accumulatedFolderFiles = api._accumulatedFolderFiles || [];

        if (api._bulkUiInitialized) {
            api.updateBulkModeUi();
            return;
        }
        api._bulkUiInitialized = true;

        const url = document.getElementById('bulkModeUrl');
        const name = document.getElementById('bulkModeName');
        const file = document.getElementById('bulkModeFile');
        const folder = document.getElementById('bulkModeFolder');
        const card = document.getElementById('bulkModeCard');
        if (url) url.onchange = api.updateBulkModeUi;
        if (name) name.onchange = api.updateBulkModeUi;
        if (file) file.onchange = api.updateBulkModeUi;
        if (folder) folder.onchange = api.updateBulkModeUi;
        if (card) card.onchange = api.updateBulkModeUi;

        const fileInput = document.getElementById('bulkFileInput');
        const fileDropZone = document.getElementById('bulkFileDropZone');
        if (fileInput && fileDropZone) {
            fileInput.addEventListener('change', api.updateBulkModeUi);
            fileInput.addEventListener('dragenter', () => {
                fileDropZone.style.borderColor = '#00a8ff';
                fileDropZone.style.backgroundColor = '#1a1a1a';
            });
            fileInput.addEventListener('dragleave', () => {
                if (!fileInput.files || fileInput.files.length === 0) {
                    fileDropZone.style.borderColor = '#444';
                    fileDropZone.style.backgroundColor = '#111';
                }
            });
            fileInput.addEventListener('drop', () => {
                fileDropZone.style.backgroundColor = '#111';
                setTimeout(api.updateBulkModeUi, 50);
            });
        }

        const folderInput = document.getElementById('bulkFolderInput');
        const folderDropZone = document.getElementById('bulkFolderDropZone');
        if (folderInput && folderDropZone) {
            folderDropZone.addEventListener('click', (event) => {
                if (event.target !== folderInput) {
                    folderInput.click();
                }
            });

            folderInput.addEventListener('change', () => {
                if (folderInput.files && folderInput.files.length > 0) {
                    api._accumulatedFolderFiles = [];
                    for (let index = 0; index < folderInput.files.length; index += 1) {
                        api._accumulatedFolderFiles.push(folderInput.files[index]);
                    }
                    setTimeout(() => {
                        folderInput.value = '';
                    }, 0);
                }
                api.updateBulkModeUi();
            });

            const preventDefaults = (event) => {
                event.preventDefault();
                event.stopPropagation();
            };

            folderDropZone.addEventListener('dragenter', (event) => {
                preventDefaults(event);
                folderDropZone.style.borderColor = '#00a8ff';
                folderDropZone.style.backgroundColor = '#1a1a1a';
            });
            folderDropZone.addEventListener('dragover', (event) => {
                preventDefaults(event);
                folderDropZone.style.borderColor = '#00a8ff';
                folderDropZone.style.backgroundColor = '#1a1a1a';
            });
            folderDropZone.addEventListener('dragleave', (event) => {
                preventDefaults(event);
                if (!api._accumulatedFolderFiles || api._accumulatedFolderFiles.length === 0) {
                    folderDropZone.style.borderColor = '#444';
                    folderDropZone.style.backgroundColor = '#111';
                }
            });
            folderDropZone.addEventListener('drop', async (event) => {
                preventDefaults(event);
                folderDropZone.style.backgroundColor = '#111';
                api._accumulatedFolderFiles = [];

                if (event.dataTransfer && event.dataTransfer.items) {
                    const items = Array.from(event.dataTransfer.items);
                    let useModernApi = false;

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
                                for (const handle of handles) {
                                    await traverseHandle(handle, '', api._accumulatedFolderFiles);
                                }
                                api.updateBulkModeUi();
                            }
                        } catch (error) {
                            console.warn('Modern File System Access API failed, falling back', error);
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
                                } catch (error) {
                                    console.error('Failed to traverse entry', entry, error);
                                }
                            }
                            api.updateBulkModeUi();
                        })();
                    }
                } else if (event.dataTransfer && event.dataTransfer.files) {
                    for (let index = 0; index < event.dataTransfer.files.length; index += 1) {
                        api._accumulatedFolderFiles.push(event.dataTransfer.files[index]);
                    }
                    api.updateBulkModeUi();
                } else {
                    setTimeout(api.updateBulkModeUi, 50);
                }
            });
        }

        api.updateBulkModeUi();
    }

    function openBulkModal() {
        if (!document.getElementById('bulkModal') && typeof initModals === 'function') {
            initModals();
        }
        const bulkModal = document.getElementById('bulkModal');
        const bulkText = document.getElementById('bulkText');
        if (!bulkModal || !bulkText) {
            console.warn('EveBulkImport: bulk modal template is not ready');
            return;
        }
        if (typeof refreshCategoryDatalist === 'function') {
            refreshCategoryDatalist({ scope: 'editor' });
        }
        bulkModal.style.display = 'flex';
        initBulkModeUi();
        bulkText.focus();
    }

    function clearBulkInput() {
        document.getElementById('bulkText').value = '';
        const fileInput = document.getElementById('bulkFileInput');
        if (fileInput) fileInput.value = '';
        const folderInput = document.getElementById('bulkFolderInput');
        if (folderInput) folderInput.value = '';
        api._accumulatedFolderFiles = [];
        api.updateBulkModeUi();
        document.getElementById('bulkText').focus();
    }

    Object.assign(api, {
        deriveSmartExtractCategoryTitle,
        maybeAutofillSmartExtractCategory,
        readAllEntries,
        traverseFileTree,
        traverseHandle,
        initBulkModeUi,
        openBulkModal,
        clearBulkInput
    });

    api.runtimeUiReady = true;
})();
