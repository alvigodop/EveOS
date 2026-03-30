window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (ns.coverImagesReady) return;
    if (!Array.isArray(window.tempSources)) {
        window.tempSources = [];
    }

    function normalizeManualIcon(iconValue) {
        const value = String(iconValue || '').trim();
        const normalized = value.replace(/\uFE0F/g, '');
        if (!normalized) return '';
        if (normalized === '\u{1F517}') return '';
        return value;
    }

    function normalizeCoverImageUrl(urlValue) {
        const value = String(urlValue || '').trim();
        if (!value) return '';
        if (/^(?:https?:\/\/|file:\/\/|data:|blob:)/i.test(value)) return value;
        return normalizeUrl(value);
    }

    function parseCoverImagesValue(rawValue, primaryCoverImage) {
        const primary = String(primaryCoverImage || '').trim().toLowerCase();
        const seen = new Set();
        return String(rawValue || '')
            .split(/\r?\n/g)
            .map(normalizeCoverImageUrl)
            .filter(Boolean)
            .filter((value) => {
                const key = value.toLowerCase();
                if (key === primary) return false;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function getCoverImagesStore() { return document.getElementById('newCoverImages'); }
    function getCoverImagesList() { return document.getElementById('newCoverImagesList'); }
    function getCoverImageCandidateInput() { return document.getElementById('newCoverImageCandidate'); }
    function getCoverImageAddButton() { return document.getElementById('newCoverImageAddBtn'); }
    function getFixedCoverImageStore() { return document.getElementById('newFixedCoverImage'); }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function resetCoverImageCandidateEditor() {
        const input = getCoverImageCandidateInput();
        const button = getCoverImageAddButton();
        if (input) {
            input.value = '';
            input.dataset.editIndex = '';
        }
        if (button) button.textContent = 'Add';
    }

    function readStoredCoverImages() {
        const textarea = getCoverImagesStore();
        return String(textarea?.value || '');
    }

    function readStoredFixedCoverImage() {
        const input = getFixedCoverImageStore();
        return normalizeCoverImageUrl(input?.value || '');
    }

    function renderCoverImagesList() {
        const list = getCoverImagesList();
        const textarea = getCoverImagesStore();
        const fixedCoverInput = getFixedCoverImageStore();
        const summary = document.getElementById('newCoverImagesSummary');
        if (!textarea || !summary || !list) return [];
        const primary = normalizeCoverImageUrl(document.getElementById('newCoverImage')?.value || '');
        const values = parseCoverImagesValue(textarea.value, primary);
        let fixedCover = readStoredFixedCoverImage();
        if (fixedCover && !values.some((value) => value.toLowerCase() === fixedCover.toLowerCase())) {
            fixedCover = '';
            if (fixedCoverInput) fixedCoverInput.value = '';
        }
        textarea.value = values.join('\n');
        const count = values.length;
        summary.textContent = fixedCover
            ? `${count === 1 ? '1 extra' : `${count} extra`} • locked`
            : (count === 1 ? '1 extra' : `${count} extra`);
        if (!values.length) {
            list.innerHTML = '<div style="font-size:0.78rem; opacity:0.62;">No extra cover images yet.</div>';
            return values;
        }
        list.innerHTML = values.map((value, index) => {
            const safeValue = escapeHtml(value);
            const safeIndexLabel = escapeHtml(`Extra cover ${index + 1}`);
            const isFixed = !!fixedCover && fixedCover.toLowerCase() === value.toLowerCase();
            return ''
                + '<div style="display:flex; gap:10px; align-items:center; border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:8px 10px;">'
                +   '<div style="width:56px; height:56px; flex:0 0 56px; border-radius:8px; overflow:hidden; background:rgba(0,0,0,0.08); border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center;">'
                +     '<img src="' + safeValue + '" alt="' + safeIndexLabel + '" title="' + safeValue + '" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="if(window.setupProxiedImage){window.setupProxiedImage(this,\'' + safeValue.replace(/'/g, "\\'") + '\')}else{this.style.display=\'none\'; this.parentElement.innerHTML=\'<div style=&quot;font-size:0.68rem; opacity:0.7; text-align:center; padding:6px;&quot;>No Preview</div>\';}">'
                +   '</div>'
                +   '<div style="flex:1; min-width:0;">'
                +     '<div style="font-size:0.82rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + safeValue + '">' + safeIndexLabel + '</div>'
                +     '<div style="font-size:0.72rem; opacity:0.66;">' + (isFixed ? 'Locked as permanent image.' : 'Saved cover image. URL stays hidden until edit.') + '</div>'
                +   '</div>'
                +   '<button type="button" style="padding:4px 8px; font-size:0.76rem;" onclick="' + (isFixed ? 'clearBookmarkFixedCoverImage()' : 'setBookmarkFixedCoverImage(' + index + ')') + '">' + (isFixed ? 'Unset' : 'Set Permanent') + '</button>'
                +   '<button type="button" style="padding:4px 8px; font-size:0.76rem;" onclick="editBookmarkCoverImageCandidate(' + index + ')">Edit</button>'
                +   '<button type="button" style="padding:4px 8px; font-size:0.76rem; border-color:var(--danger); color:var(--danger);" onclick="removeBookmarkCoverImageCandidate(' + index + ')">X</button>'
                + '</div>';
        }).join('');
        return values;
    }

    function bindCoverImagesInputs() {
        const coverInput = document.getElementById('newCoverImage');
        const textarea = getCoverImagesStore();
        const input = getCoverImageCandidateInput();
        if (!coverInput || !textarea || !input || textarea.dataset.coverImagesBound === 'true') {
            renderCoverImagesList();
            return;
        }
        textarea.dataset.coverImagesBound = 'true';
        coverInput.addEventListener('input', renderCoverImagesList);
        textarea.addEventListener('input', renderCoverImagesList);
        input.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            window.addBookmarkCoverImageCandidate();
        });
        renderCoverImagesList();
    }

    ns.refreshCoverImagesSummary = renderCoverImagesList;
    ns.normalizeManualIcon = normalizeManualIcon;
    ns.normalizeCoverImageUrl = normalizeCoverImageUrl;
    ns.parseCoverImagesValue = parseCoverImagesValue;
    ns.bindCoverImagesInputs = bindCoverImagesInputs;
    ns.resetCoverImageCandidateEditor = resetCoverImageCandidateEditor;
    ns.ensureCoverImageElements = {
        getCoverImagesStore,
        getCoverImagesList,
        getCoverImageCandidateInput,
        getCoverImageAddButton,
        getFixedCoverImageStore,
        readStoredCoverImages,
        readStoredFixedCoverImage
    };

    window.addBookmarkCoverImageCandidate = function () {
        const input = getCoverImageCandidateInput();
        const textarea = getCoverImagesStore();
        const fixedCoverInput = getFixedCoverImageStore();
        if (!input || !textarea) return false;

        const primary = normalizeCoverImageUrl(document.getElementById('newCoverImage')?.value || '');
        const candidate = normalizeCoverImageUrl(input.value || '');
        if (!candidate) {
            showToast('Enter an image URL first', 'warning');
            return false;
        }
        if (candidate.toLowerCase() === primary.toLowerCase()) {
            showToast('That image is already the main cover URL', 'info');
            return false;
        }

        const values = parseCoverImagesValue(readStoredCoverImages(), primary);
        const editIndex = Number.parseInt(input.dataset.editIndex || '', 10);
        let previousValue = '';
        if (Number.isInteger(editIndex) && editIndex >= 0 && editIndex < values.length) {
            previousValue = values[editIndex];
            values[editIndex] = candidate;
        } else {
            values.push(candidate);
        }
        textarea.value = values.join('\n');
        if (fixedCoverInput && previousValue && readStoredFixedCoverImage().toLowerCase() === previousValue.toLowerCase()) {
            fixedCoverInput.value = candidate;
        }
        resetCoverImageCandidateEditor();
        renderCoverImagesList();
        return false;
    };

    window.editBookmarkCoverImageCandidate = function (index) {
        const input = getCoverImageCandidateInput();
        const button = getCoverImageAddButton();
        const values = renderCoverImagesList();
        const value = values[index];
        if (!input || !button || !value) return false;
        input.value = value;
        input.dataset.editIndex = String(index);
        button.textContent = 'Update';
        input.focus();
        input.select();
        return false;
    };

    window.removeBookmarkCoverImageCandidate = function (index) {
        const textarea = getCoverImagesStore();
        const fixedCoverInput = getFixedCoverImageStore();
        if (!textarea) return false;
        const primary = normalizeCoverImageUrl(document.getElementById('newCoverImage')?.value || '');
        const values = parseCoverImagesValue(readStoredCoverImages(), primary);
        if (index < 0 || index >= values.length) return false;
        const removedValue = values[index];
        values.splice(index, 1);
        textarea.value = values.join('\n');
        if (fixedCoverInput && readStoredFixedCoverImage().toLowerCase() === String(removedValue || '').toLowerCase()) {
            fixedCoverInput.value = '';
        }
        resetCoverImageCandidateEditor();
        renderCoverImagesList();
        return false;
    };

    window.setBookmarkFixedCoverImage = function (index) {
        const fixedCoverInput = getFixedCoverImageStore();
        const values = renderCoverImagesList();
        const value = values[index];
        if (!fixedCoverInput || !value) return false;
        fixedCoverInput.value = value;
        renderCoverImagesList();
        return false;
    };

    window.clearBookmarkFixedCoverImage = function () {
        const fixedCoverInput = getFixedCoverImageStore();
        if (!fixedCoverInput) return false;
        fixedCoverInput.value = '';
        renderCoverImagesList();
        return false;
    };

    ns.coverImagesReady = true;
})(window.EveLinkForm);
