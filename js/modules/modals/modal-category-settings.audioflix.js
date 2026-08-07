(function () {
    'use strict';

    const text = (value, fallback = '') => String(value ?? '').trim() || String(fallback ?? '').trim();

    function escapeHtml(value) {
        const helper = window.EveCategorySettingsModalCore?.escapeCategorySettingsHtml;
        if (typeof helper === 'function') return helper(value);
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function currentScope() {
        const categoryName = text(window.currentCategoryCtx);
        if (!categoryName) return null;
        const workspaceId = text(
            window.ctxWsId,
            window.EveCategorySettingsModalCore?.getCategorySettingsWorkspaceId?.()
                || window.eveState?.config?.activeWorkspace
                || 'main'
        );
        return window.EveAudioflixLinks?.normalizeScope?.({
            scopeType: 'card',
            workspaceId,
            categoryName,
            label: categoryName
        }) || null;
    }

    function renderItem(item) {
        const subtitle = [item.artist, item.type === 'sound' ? 'Soundboard clip' : 'Music track']
            .filter(Boolean).join(' / ');
        return `<div class="category-audioflix-row">
            <div>
                <strong>${escapeHtml(item.title || 'Untitled Audio')}</strong>
                <span>${escapeHtml(subtitle)}</span>
            </div>
            <div class="category-audioflix-actions">
                <button type="button" data-audio-type="${escapeHtml(item.type)}" data-audio-id="${escapeHtml(item.id)}" onclick="categorySettingsPlayAudioflix(this.dataset.audioType,this.dataset.audioId)">Play</button>
                <button type="button" data-audio-type="${escapeHtml(item.type)}" data-audio-id="${escapeHtml(item.id)}" onclick="categorySettingsDetachAudioflix(this.dataset.audioType,this.dataset.audioId)">Detach</button>
            </div>
        </div>`;
    }

    function refresh() {
        const summary = document.getElementById('categoryAudioflixSummary');
        const list = document.getElementById('categoryAudioflixList');
        if (!summary || !list) return;
        const scope = currentScope();
        const capture = scope && window.EveAudioflixLinks?.captureForScope
            ? window.EveAudioflixLinks.captureForScope(scope, { directOnly: true })
            : { items: [] };
        const items = Array.isArray(capture.items) ? capture.items : [];
        summary.textContent = `${items.length} linked`;
        list.innerHTML = items.length
            ? items.map(renderItem).join('')
            : '<div class="category-audioflix-empty">No Audioflix items linked directly to this card.</div>';
    }

    function notify(message, type) {
        if (typeof window.showToast === 'function') window.showToast(message, type);
    }

    window.categorySettingsOpenAudioflixLinker = function () {
        const scope = currentScope();
        const api = window.EveAudioflixLinks;
        if (!scope || !api?.setPendingScope) {
            notify('Audioflix links are not ready', 'error');
            return;
        }
        api.setPendingScope(scope);
        window.closeModals?.();
        if (typeof window.EveAudioflix?.openNexus === 'function') {
            window.EveAudioflix.openNexus('music');
            return;
        }
        window.EveAudioflix?.open?.();
    };

    window.categorySettingsPlayAudioflix = async function (audioType, audioId) {
        try {
            await window.EveAudioflixLinks?.play?.(audioType, audioId);
        } catch (error) {
            notify(error?.message || 'Audioflix playback failed', 'error');
        }
    };

    window.categorySettingsDetachAudioflix = function (audioType, audioId) {
        const scope = currentScope();
        if (!scope) return;
        const result = window.EveAudioflixLinks?.remove?.([audioId], scope, audioType);
        refresh();
        notify(result?.removed ? 'Audioflix link detached' : 'No direct Audioflix link was found', result?.removed ? 'success' : 'warning');
    };

    window.addEventListener('eve:audioflix-state-changed', () => {
        const modal = document.getElementById('categorySettingsModal');
        const generalTab = document.getElementById('cat-tab-general');
        if (modal?.style.display === 'flex' && generalTab?.style.display !== 'none') refresh();
    });

    window.EveCategorySettingsAudioflix = Object.assign(window.EveCategorySettingsAudioflix || {}, {
        currentScope,
        refresh
    });
})();
