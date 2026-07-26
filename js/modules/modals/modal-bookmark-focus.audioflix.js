window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    'use strict';

    const focus = window.EveBookmarkFocus;
    const text = (value, fallback = '') => String(value ?? '').trim() || String(fallback ?? '').trim();
    const escapeHtml = focus._viewShared?.escapeHtml
        || ((value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char])));

    function scopeForLink(link) {
        return window.EveAudioflixLinks?.normalizeScope?.({
            scopeType: 'bookmark',
            workspaceId: link?.workspace || window.eveState?.config?.activeWorkspace || 'main',
            categoryName: link?.category || 'Unsorted',
            folderId: link?.folderId || '',
            bookmarkId: link?.id,
            label: link?.title || 'Bookmark'
        }) || null;
    }

    function currentLink() {
        const id = focus.getCurrentLinkId?.();
        return id ? focus.findLinkById?.(id) : null;
    }

    function notify(message, type) {
        if (typeof window.showToast === 'function') window.showToast(message, type);
    }

    function renderItem(item) {
        const subtitle = [item.artist, item.type === 'sound' ? 'Soundboard clip' : 'Music track']
            .filter(Boolean).join(' / ');
        return `<div class="bookmark-focus-audioflix-row">
            <div>
                <strong>${escapeHtml(item.title || 'Untitled Audio')}</strong>
                <span>${escapeHtml(subtitle)}</span>
            </div>
            <div class="bookmark-focus-audioflix-actions">
                <button type="button" data-audio-type="${escapeHtml(item.type)}" data-audio-id="${escapeHtml(item.id)}" onclick="bookmarkFocusPlayAudioflix(this.dataset.audioType,this.dataset.audioId)">Play</button>
                <button type="button" data-audio-type="${escapeHtml(item.type)}" data-audio-id="${escapeHtml(item.id)}" onclick="bookmarkFocusDetachAudioflix(this.dataset.audioType,this.dataset.audioId)">Detach</button>
            </div>
        </div>`;
    }

    function refreshAudioflixLinks(link) {
        const summary = document.getElementById('bookmarkFocusAudioflixSummary');
        const list = document.getElementById('bookmarkFocusAudioflixList');
        if (!summary || !list) return;
        const api = window.EveAudioflixLinks;
        const scope = scopeForLink(link);
        const capture = scope && api?.captureForScope
            ? api.captureForScope(scope, { directOnly: true })
            : { items: [], count: 0 };
        const items = Array.isArray(capture.items) ? capture.items : [];
        summary.textContent = `${items.length} linked`;
        list.innerHTML = items.length
            ? items.map(renderItem).join('')
            : '<div class="bookmark-focus-context-empty">No Audioflix items linked directly to this bookmark.</div>';
    }

    window.bookmarkFocusOpenAudioflixLinker = function () {
        const link = currentLink();
        const api = window.EveAudioflixLinks;
        const scope = scopeForLink(link);
        if (!link || !scope || !api?.setPendingScope) {
            notify('Audioflix links are not ready', 'error');
            return;
        }
        window.closeBookmarkFocusModal?.();
        api.setPendingScope(scope);
        if (typeof window.EveAudioflix?.openNexus === 'function') {
            window.EveAudioflix.openNexus('music');
            return;
        }
        window.EveAudioflix?.open?.();
    };

    window.bookmarkFocusPlayAudioflix = async function (audioType, audioId) {
        try {
            await window.EveAudioflixLinks?.play?.(audioType, audioId);
        } catch (error) {
            notify(error?.message || 'Audioflix playback failed', 'error');
        }
    };

    window.bookmarkFocusDetachAudioflix = function (audioType, audioId) {
        const link = currentLink();
        const scope = scopeForLink(link);
        if (!link || !scope) return;
        const result = window.EveAudioflixLinks?.remove?.([audioId], scope, audioType);
        refreshAudioflixLinks(link);
        notify(result?.removed ? 'Audioflix link detached' : 'No direct Audioflix link was found', result?.removed ? 'success' : 'warning');
    };

    window.addEventListener('eve:audioflix-state-changed', () => {
        const modal = document.getElementById(focus.MODAL_ID || 'bookmarkFocusModal');
        if (modal?.style.display !== 'flex') return;
        const link = currentLink();
        if (link) refreshAudioflixLinks(link);
    });

    Object.assign(focus, { refreshAudioflixLinks, scopeForAudioflixLink: scopeForLink });
})();
