window.EveAudioflixTransport = window.EveAudioflixTransport || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixTransport;
    if (ns.ready) return;

    function formatTime(value) {
        const seconds = Math.max(0, Math.floor(Number(value || 0) || 0));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const tail = String(seconds % 60).padStart(2, '0');
        return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
    }

    function render(item, type, escapeHtml) {
        const esc = escapeHtml || ((value) => String(value || ''));
        const volume = window.EveAudioflixState.normalizeVolume(item?.volume, 1);
        const id = esc(item?.id || '');
        const safeType = esc(type || 'sound');
        return `<div class="audioflix-item-transport" data-af-transport-id="${id}"><span class="audioflix-time-current">0:00</span><input type="range" class="audioflix-seek-slider" min="0" max="1" step="0.05" value="0" data-af-id="${id}" aria-label="Seek ${esc(item?.title || 'audio')}" disabled><span class="audioflix-time-duration">--:--</span></div><div class="audioflix-item-volume-wrapper" title="Volume"><input type="range" class="audioflix-volume-slider" min="0" max="1" step="0.01" value="${volume}" data-af-type="${safeType}" data-af-id="${id}" style="--vol: ${volume * 100}%"><span class="audioflix-volume-label">${Math.round(volume * 100)}%</span></div>`;
    }

    function preview(slider) {
        if (!slider) return;
        slider.dataset.afSeeking = 'true';
        const wrapper = slider.closest('.audioflix-item-transport');
        const duration = Number(slider.max || 0) || 0;
        const current = Math.max(0, Number(slider.value || 0) || 0);
        slider.style.setProperty('--seek', `${duration > 0 ? (current / duration) * 100 : 0}%`);
        const label = wrapper?.querySelector('.audioflix-time-current');
        if (label) label.textContent = formatTime(current);
    }

    function sync(root, playbackState) {
        if (!root) return;
        const playback = playbackState?.item
            ? playbackState
            : (window.EveAudioflixAudio?.getPlaybackState?.() || {});
        const activeId = String(playback.item?.id || '');
        const duration = Math.max(0, Number(playback.duration || 0) || 0);
        const current = Math.max(0, Math.min(duration || Infinity, Number(playback.currentTime || 0) || 0));

        root.querySelectorAll('[data-af-transport-id]').forEach((transport) => {
            const isCurrent = !!activeId && transport.dataset.afTransportId === activeId;
            const card = transport.closest('.audioflix-item-card');
            card?.classList.toggle('is-current', isCurrent);
            const slider = transport.querySelector('.audioflix-seek-slider');
            if (!slider) return;
            slider.disabled = !isCurrent || duration <= 0;
            slider.max = String(duration || 1);
            if (slider.dataset.afSeeking !== 'true') {
                slider.value = String(isCurrent ? current : 0);
                slider.style.setProperty('--seek', `${isCurrent && duration > 0 ? (current / duration) * 100 : 0}%`);
                const currentLabel = transport.querySelector('.audioflix-time-current');
                if (currentLabel) currentLabel.textContent = formatTime(isCurrent ? current : 0);
            }
            const durationLabel = transport.querySelector('.audioflix-time-duration');
            if (durationLabel) durationLabel.textContent = isCurrent && duration > 0 ? formatTime(duration) : '--:--';
        });
    }

    function finishSeek(slider) {
        if (slider) delete slider.dataset.afSeeking;
    }

    Object.assign(ns, { ready: true, render, preview, sync, finishSeek, formatTime });
})();
