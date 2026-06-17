window.LogInterfaceDisplay = window.LogInterfaceDisplay || {};
window.LogInterfaceDisplay.MessagingInterface = window.LogInterfaceDisplay.MessagingInterface || {};

window.LogInterfaceDisplay.MessagingInterface.ImageAttachments = (function () {
    const MAX_IMAGES = 6;
    const MAX_BYTES = 10 * 1024 * 1024;
    const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
    const state = {
        items: [],
        boundElement: null,
        previewRoot: null
    };

    function ensureStyles() {
        if (document.getElementById('geminiImageAttachmentStyles')) return;
        const style = document.createElement('style');
        style.id = 'geminiImageAttachmentStyles';
        style.textContent = `
.gemini-text-input-shell.gemini-image-drop-active {
    outline: 1px solid rgba(34, 211, 238, 0.65);
    box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.12);
}
.gemini-image-attachment-preview {
    display: none;
    grid-column: 1 / -1;
    gap: 8px;
    margin: 0 0 8px;
}
.gemini-image-attachment-preview.is-visible {
    display: flex;
    flex-wrap: wrap;
}
.gemini-image-attachment-tile {
    position: relative;
    width: 74px;
    height: 74px;
    border: 1px solid rgba(34, 211, 238, 0.32);
    border-radius: 14px;
    overflow: hidden;
    background: rgba(4, 12, 18, 0.82);
}
.gemini-image-attachment-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.gemini-image-attachment-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(4, 8, 12, 0.82);
    color: #e8f8ff;
    cursor: pointer;
    line-height: 18px;
    font-size: 14px;
}
.gemini-image-attachment-meta {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 4px;
    padding: 2px 4px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.62);
    color: rgba(232, 248, 255, 0.86);
    font-size: 9px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}`;
        document.head.appendChild(style);
    }

    function ensurePreviewRoot(textInput) {
        if (state.previewRoot && state.previewRoot.isConnected) return state.previewRoot;
        const shell = textInput?.closest?.('.gemini-text-input-shell') || document.querySelector('.gemini-text-input-shell');
        if (!shell) return null;
        const root = document.createElement('div');
        root.id = 'geminiImageAttachmentPreview';
        root.className = 'gemini-image-attachment-preview';
        root.setAttribute('aria-live', 'polite');
        shell.insertBefore(root, shell.firstChild);
        state.previewRoot = root;
        return root;
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes)) return '';
        if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function render() {
        const root = state.previewRoot || ensurePreviewRoot(document.getElementById('textInput'));
        if (!root) return;
        root.classList.toggle('is-visible', state.items.length > 0);
        root.innerHTML = state.items.map((item) => `
<div class="gemini-image-attachment-tile" data-id="${item.id}" title="${escapeHtml(item.name)}">
    <img src="${item.dataUrl}" alt="${escapeHtml(item.name)}">
    <button type="button" class="gemini-image-attachment-remove" data-remove-id="${item.id}" aria-label="Remove image">x</button>
    <span class="gemini-image-attachment-meta">${escapeHtml(formatBytes(item.bytes))}</span>
</div>`).join('');
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Image read failed'));
            reader.readAsDataURL(file);
        });
    }

    async function addFiles(fileList, source = 'drop') {
        const files = Array.from(fileList || []).filter((file) => file && file.type && file.type.startsWith('image/'));
        if (!files.length) return 0;

        let added = 0;
        for (const file of files) {
            if (state.items.length >= MAX_IMAGES) break;
            if (!SUPPORTED_TYPES.has(file.type)) {
                notify(`Image type ${file.type || 'unknown'} is not supported. Use PNG, JPEG, or WebP.`);
                continue;
            }
            if (file.size > MAX_BYTES) {
                notify(`${file.name || 'Image'} is too large (${formatBytes(file.size)}). Max is ${formatBytes(MAX_BYTES)}.`);
                continue;
            }
            const dataUrl = await readFileAsDataUrl(file);
            const comma = dataUrl.indexOf(',');
            const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
            state.items.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: file.name || `${source}-image`,
                mimeType: file.type,
                dataUrl,
                data,
                bytes: file.size || Math.ceil((data.length * 3) / 4),
                source
            });
            added += 1;
        }
        render();
        if (added) notify(`Attached ${added} image${added === 1 ? '' : 's'} for Gemini chat.`);
        return added;
    }

    function notify(message) {
        if (typeof window.displayMessage === 'function') {
            window.displayMessage(`System Message: ${message}`, true);
        } else {
            console.log(`[Gemini Images] ${message}`);
        }
    }

    function consume() {
        const copy = state.items.map((item) => ({
            name: item.name,
            mimeType: item.mimeType,
            data: item.data,
            bytes: item.bytes,
            source: item.source
        }));
        state.items = [];
        render();
        return copy;
    }

    function hasAttachments() {
        return state.items.length > 0;
    }

    function hasImageDrag(event) {
        const types = Array.from(event.dataTransfer?.types || []);
        return types.includes('Files');
    }

    function bind(textInput) {
        if (!textInput) return;
        if (state.boundElement === textInput && textInput.dataset.geminiImageAttachmentBound === '1') return;
        ensureStyles();
        ensurePreviewRoot(textInput);
        state.boundElement = textInput;
        textInput.dataset.geminiImageAttachmentBound = '1';

        const shell = textInput.closest('.gemini-text-input-shell') || textInput.parentElement;

        textInput.addEventListener('paste', async (event) => {
            const items = Array.from(event.clipboardData?.items || []);
            const files = items
                .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter(Boolean);
            if (!files.length) return;
            event.preventDefault();
            await addFiles(files, 'paste');
        });

        ['dragenter', 'dragover'].forEach((type) => {
            shell?.addEventListener(type, (event) => {
                if (!hasImageDrag(event)) return;
                event.preventDefault();
                shell.classList.add('gemini-image-drop-active');
            });
        });

        ['dragleave', 'drop'].forEach((type) => {
            shell?.addEventListener(type, () => {
                shell.classList.remove('gemini-image-drop-active');
            });
        });

        shell?.addEventListener('drop', async (event) => {
            if (!hasImageDrag(event)) return;
            event.preventDefault();
            await addFiles(event.dataTransfer?.files || [], 'drop');
        });

        state.previewRoot?.addEventListener('click', (event) => {
            const id = event.target?.dataset?.removeId;
            if (!id) return;
            state.items = state.items.filter((item) => item.id !== id);
            render();
            textInput.focus();
        });
    }

    return {
        bind,
        addFiles,
        consume,
        hasAttachments,
        get count() {
            return state.items.length;
        }
    };
})();
