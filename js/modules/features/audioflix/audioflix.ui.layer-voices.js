window.EveAudioflixLayerVoices = window.EveAudioflixLayerVoices || {};

(function (ns) {
    'use strict';
    if (ns.ready) return;

    const snapshots = new Map();
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
    const formatTime = (seconds) => {
        const safe = Math.max(0, Number(seconds) || 0);
        return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
    };

    function renderHost(host, voices) {
        if (!host) return;
        const active = Array.isArray(voices) ? voices : [];
        host.dataset.count = String(active.length);
        host.style.setProperty('--af-layer-height', `${Math.max(12, 24 - Math.floor(Math.max(0, active.length - 1) * 1.4))}px`);
        host.innerHTML = active.map((voice, index) => {
            const progress = Math.max(0, Math.min(1, Number(voice.progress) || 0));
            const elapsed = formatTime(voice.currentTime);
            const duration = voice.duration > 0 ? formatTime(voice.duration) : '--:--';
            const remaining = voice.duration > 0 ? `-${formatTime(voice.remaining)}` : 'live';
            // Labels describe the current stack, while voice IDs retain stable transport identity.
            const number = index + 1;
            const label = `Layer ${number}: ${elapsed} of ${duration}, ${remaining} remaining`;
            return `<div class="audioflix-layer-voice" title="${escapeHtml(label)}" style="--af-layer-progress:${(progress * 100).toFixed(2)}%"><span>Layer ${number}</span><b>${elapsed}</b><em>${remaining}</em></div>`;
        }).join('');
    }

    function render(root = document) {
        root?.querySelectorAll?.('[data-af-layer-voices]')?.forEach(host => {
            renderHost(host, snapshots.get(String(host.dataset.afLayerVoices || '')) || []);
        });
    }

    window.addEventListener('eve:audioflix-layer-voices', event => {
        const id = String(event.detail?.itemId || '');
        const voices = Array.isArray(event.detail?.voices) ? event.detail.voices : [];
        if (voices.length) snapshots.set(id, voices);
        else snapshots.delete(id);
        document.querySelectorAll?.('[data-af-layer-voices]')?.forEach(host => {
            if (String(host.dataset.afLayerVoices || '') === id) renderHost(host, voices);
        });
    });

    Object.assign(ns, { ready: true, render, snapshots });
})(window.EveAudioflixLayerVoices);
