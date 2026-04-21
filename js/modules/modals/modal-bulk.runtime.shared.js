window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    if (api.runtimeSharedReady) return;

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
        const categoryWrapper = document.getElementById('bulkCategoryWrapper');
        const latentPanel = document.getElementById('bulkLatentCardsPanel');
        const latentList = document.getElementById('bulkLatentCardsList');

        if (!text || !hint) return;

        if (fileDropZone) fileDropZone.style.display = 'none';
        if (folderDropZone) folderDropZone.style.display = 'none';
        if (autoLineBreakBtn) autoLineBreakBtn.style.display = 'none';
        if (textToolsHint) textToolsHint.style.display = 'none';
        if (categoryWrapper) categoryWrapper.style.display = 'block';
        if (latentPanel) latentPanel.style.display = 'none';

        if (mode === 'folder' || mode === 'card') {
            text.style.display = 'none';

            if (mode === 'card') {
                if (categoryWrapper) categoryWrapper.style.display = 'none';
                if (latentPanel) latentPanel.style.display = 'flex';
                hint.textContent = 'Cards mode: Upload main folders. The main folders become Cards, internal content maps to them.';
            } else {
                hint.textContent = 'Folder mode: Upload a folder. Structure will be maintained via bookmark folders within the target Card.';
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

                        api._accumulatedFolderFiles.forEach(file => {
                            const relativePath = file.customRelativePath || file.webkitRelativePath || file.name;
                            const parts = relativePath.split('/');
                            if (parts.length > 1) rootFolders.add(parts[0]);
                        });

                        if (rootFolders.size > 0) {
                            api._latentCardMap = api._latentCardMap || {};
                            rootFolders.forEach(rootName => {
                                if (!api._latentCardMap[rootName]) {
                                    api._latentCardMap[rootName] = rootName;
                                }

                                const row = document.createElement('div');
                                row.style.display = 'flex';
                                row.style.alignItems = 'center';
                                row.style.gap = '8px';

                                const icon = document.createElement('span');
                                icon.textContent = '\u{1F5C2}\uFE0F';

                                const label = document.createElement('span');
                                label.style.fontSize = '0.85rem';
                                label.style.flexShrink = '0';
                                label.style.maxWidth = '160px';
                                label.style.display = 'inline-block';
                                label.style.overflow = 'hidden';
                                label.style.textOverflow = 'ellipsis';
                                label.style.whiteSpace = 'nowrap';
                                label.textContent = rootName + ' ->';

                                const input = document.createElement('input');
                                input.type = 'text';
                                input.value = api._latentCardMap[rootName];
                                input.style.flex = '1';
                                input.style.padding = '6px 8px';
                                input.style.border = '1px solid #444';
                                input.style.borderRadius = '4px';
                                input.style.backgroundColor = '#1a1a1a';
                                input.style.color = '#fff';
                                input.oninput = (event) => {
                                    api._latentCardMap[rootName] = event.target.value.trim() || rootName;
                                };

                                row.appendChild(icon);
                                row.appendChild(label);
                                row.appendChild(input);
                                latentList.appendChild(row);
                            });
                        } else {
                            latentList.innerHTML = '<div style="color:#777; font-size:0.85rem; font-style:italic;">No directories detected. Did you upload flat files?</div>';
                        }
                    }
                } else {
                    dropText.textContent = 'Click to select or drag & drop folder(s)';
                    folderDropZone.style.borderColor = '#444';
                    folderDropZone.style.color = '#aaa';
                    if (latentList) {
                        latentList.innerHTML = '<div style="color:#777; font-size:0.85rem; font-style:italic;">Drop folders above to preview latent cards.</div>';
                    }
                }
            }
            return;
        }

        if (mode === 'file') {
            text.style.display = 'none';
            if (fileDropZone) {
                fileDropZone.style.display = 'flex';
                const fileInput = document.getElementById('bulkFileInput');
                const dropText = document.getElementById('bulkFileDropText');
                if (fileInput && fileInput.files && fileInput.files.length > 0) {
                    if (typeof api.maybeAutofillSmartExtractCategory === 'function') {
                        api.maybeAutofillSmartExtractCategory(fileInput.files);
                    }
                    dropText.textContent = `${fileInput.files.length} file(s) selected`;
                    fileDropZone.style.borderColor = '#00a8ff';
                    fileDropZone.style.color = '#fff';
                } else {
                    dropText.textContent = 'Click to select or drag & drop .txt files here';
                    fileDropZone.style.borderColor = '#444';
                    fileDropZone.style.color = '#aaa';
                }
            }
            hint.textContent = 'Smart Extract mode: Upload .txt files. It auto-detects URLs, Names, or Library data.';
            return;
        }

        text.style.display = 'block';
        if (mode === 'name') {
            text.placeholder = 'One name per line...';
            hint.textContent = 'Names-only mode: each line becomes a bookmark title and URL is a Google search link.';
            if (autoLineBreakBtn) {
                autoLineBreakBtn.textContent = 'Auto Line Break Names';
                autoLineBreakBtn.style.display = 'inline-flex';
            }
            if (textToolsHint) {
                textToolsHint.textContent = 'Splits pasted name blobs into separate lines.';
                textToolsHint.style.display = 'block';
            }
            return;
        }

        text.placeholder = 'One URL per line...';
        hint.textContent = 'URL mode: each line should be a URL.';
        if (autoLineBreakBtn) {
            autoLineBreakBtn.textContent = 'Auto Line Break URLs';
            autoLineBreakBtn.style.display = 'inline-flex';
        }
        if (textToolsHint) {
            textToolsHint.textContent = 'Splits pasted URL blobs into one URL per line.';
            textToolsHint.style.display = 'block';
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
            .replace(/\s*[\u2022\u25CF\u25AA\u25E6]+\s*/g, '\n')
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
        autoLineBreakBulkNames
    });

    api.runtimeSharedReady = true;
})();
