// Provider-health presentation only. The library facade owns durable health and preferences.
(function () {
    'use strict';
    const ns = window.EveAudioflixLibraryHealthView = window.EveAudioflixLibraryHealthView || {};
    if (ns.ready) return;
    const PROVIDER_HEALTH_TTL_MS = 6 * 60 * 60 * 1000;

    function create({ text, health, prefs, providerFor, now = () => Date.now() }) {
        function providerManagedHealth(item) {
            if (providerFor(item) !== 'spotify') return null;
            return { status: 'provider', provider: 'spotify', source: 'spotify-provider', mediaUrl: '' };
        }
        function effectiveHealth(item) {
            const stored = health(item?.id);
            const managed = providerManagedHealth(item);
            if (!managed) return stored;
            if (!stored) return managed;
            const status = text(stored.status).toLowerCase();
            const source = text(stored.source).toLowerCase();
            const verified = source === 'spotify-playback' && ['live', 'healthy', 'stale'].includes(status);
            const failed = source === 'spotify-provider-error' && ['down', 'error', 'stale'].includes(status);
            const checking = source === 'spotify-playback-start' && status === 'checking';
            // Old generic URL probes/import metadata are not provider playback evidence.
            if (!verified && !failed && !checking) return { ...stored, ...managed };
            if (status === 'live') return { ...stored, status: 'healthy', provider: 'spotify', source: text(stored.source, 'spotify-playback') };
            if (['healthy', 'down', 'error', 'checking', 'stale'].includes(status)) {
                const checkedAt = Number(stored.checkedAt || stored.lastCheckedAt || 0);
                if (status !== 'checking' && status !== 'stale' && checkedAt > 0 && now() - checkedAt > PROVIDER_HEALTH_TTL_MS) {
                    return { ...stored, status: 'stale', provider: 'spotify', staleFrom: status };
                }
                return { ...stored, provider: 'spotify' };
            }
            return { ...stored, ...managed };
        }
        function markerDescriptor(item) {
            const h = effectiveHealth(item);
            if (!h) return null;
            const p = prefs(item?.id);
            const managed = providerFor(item) === 'spotify';
            if (managed) {
                if (!p.showProviderHealthOnCard) return null;
                if (h.status === 'healthy') return { className: 'eve-url-health-badge is-healthy', title: 'Spotify playback was verified by a successful EveOS playback event', text: '● Spotify Healthy' };
                if (h.status === 'checking') return { className: 'eve-url-health-badge is-checking', title: 'Spotify playback is starting; health is not verified yet', text: '◐ Spotify Checking' };
                if (h.status === 'down' || h.status === 'error') return { className: 'eve-url-health-badge is-error', title: 'Spotify\'s official player reported a playback failure', text: '● Spotify Down' };
                if (h.status === 'stale') return { className: 'eve-url-health-badge is-stale', title: 'Spotify playback was verified previously, but the health result is now stale', text: '○ Spotify Stale' };
                return { className: 'eve-url-health-badge is-provider', title: 'Spotify is the playback provider; health has not been verified by playback yet', text: '○ Spotify Unverified' };
            }
            if (h.status === 'down') return p.hideDown ? null : { className: 'eve-url-health-badge is-down', title: 'URL checked when played and is currently unavailable', text: '● URL Down' };
            if (h.status === 'live' && p.showLive) return { className: 'eve-url-health-badge is-live', title: 'URL checked when played and is currently live', text: '● Live URL' };
            return null;
        }
        function marker(item) {
            const descriptor = markerDescriptor(item);
            if (!descriptor) return '';
            return `<span class="${descriptor.className}" title="${descriptor.title}">${descriptor.text}</span>`;
        }
        return { providerManagedHealth, effectiveHealth, markerDescriptor, marker };
    }
    Object.assign(ns, { ready: true, create });
})();
