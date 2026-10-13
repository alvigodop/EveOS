window.EveAudioflixInternalQueue = window.EveAudioflixInternalQueue || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixInternalQueue;
    if (ns.ready) return;

    function isVisible(stage) {
        return !!stage && !stage.hidden && !stage.classList.contains('is-transport-only')
            && !stage.classList.contains('is-collapsed');
    }

    function create(ensureStage) {
        let entries = [], currentIndex = 0, renderedSignature = null;
        function refresh() {
            const stage = ensureStage();
            const rows = stage.querySelector('.audioflix-provider-queue-list');
            // Retain semantic queue metadata, not invisible row nodes or a successful-render key.
            if (!isVisible(stage) || !entries.length) {
                if (rows.childNodes.length) rows.replaceChildren();
                renderedSignature = null;
                return false;
            }
            const signature = JSON.stringify([currentIndex,
                entries.map(entry => [String(entry?.id ?? ''), String(entry?.title || 'Untitled')])]);
            if (signature === renderedSignature && rows.childElementCount === entries.length) return false;
            rows.innerHTML = entries.map((entry, index) => {
                const title = String(entry?.title || 'Untitled');
                const safe = title.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                const state = index === currentIndex ? ' class="is-current"' : '';
                return `<li${state}><button type="button" data-url-player-action="queue-jump" data-queue-index="${index}">${index === currentIndex ? '▶ ' : ''}${safe}</button></li>`;
            }).join('');
            renderedSignature = signature;
            return true;
        }

        function setQueue(nextEntries, nextIndex) {
            const stage = ensureStage();
            entries = Array.isArray(nextEntries) ? nextEntries : [];
            currentIndex = Number(nextIndex) || 0;
            stage.querySelector('.audioflix-provider-queue').hidden = entries.length === 0;
            stage.querySelectorAll('.audioflix-provider-step').forEach(button => { button.hidden = entries.length === 0; });
            const repeatOne = window.EveAudioflix?.queueConnection?.snapshot?.()?.repeatOne === true;
            const repeat = stage.querySelector('[data-url-player-action="repeat-one"]');
            if (repeat) {
                repeat.setAttribute('aria-pressed', String(repeatOne));
                repeat.textContent = repeatOne ? '↻ Loop track on' : '↻ Loop track';
            }
            stage.querySelector('.audioflix-provider-tools')?.toggleAttribute('hidden', entries.length === 0);
            stage.querySelector('[data-url-player-action="prev"]').disabled = currentIndex <= 0;
            stage.querySelector('[data-url-player-action="next"]').disabled = currentIndex >= entries.length - 1;
            return refresh();
        }

        function reset() { entries = []; currentIndex = 0; renderedSignature = null; }
        return { setQueue, refresh, reset };
    }

    Object.assign(ns, { ready: true, create, isVisible });
})();
