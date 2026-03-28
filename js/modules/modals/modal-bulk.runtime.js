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
    if (!text || !hint) return;

    if (fileDropZone) fileDropZone.style.display = 'none';
    if (folderDropZone) folderDropZone.style.display = 'none';
    if (autoLineBreakBtn) autoLineBreakBtn.style.display = 'none';
    if (textToolsHint) textToolsHint.style.display = 'none';

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
