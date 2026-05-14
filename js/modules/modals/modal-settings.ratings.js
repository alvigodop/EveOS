// --- SETTINGS RATING ACTIONS ---
// All 10 providers supported by the Library Ratings engine, grouped by the
// media category they primarily cover. The settings UI is rendered from this
// list so adding a future provider only needs one entry here + the matching
// engine support.
const RATING_PROVIDER_GROUPS = [
    {
        id: 'manga-anime',
        label: 'Manga & Anime',
        providers: [
            { key: 'anilist', label: 'AniList' },
            { key: 'myanimelist', label: 'MyAnimeList' },
            { key: 'mangadex', label: 'MangaDex' },
            { key: 'kitsu', label: 'Kitsu' },
            { key: 'mangaupdates', label: 'MangaUpdates' },
            { key: 'comick', label: 'ComicK' }
        ]
    },
    {
        id: 'books-novels',
        label: 'Books & Novels',
        providers: [
            { key: 'openlibrary', label: 'Open Library' },
            { key: 'wlnupdates', label: 'WLN Updates' }
        ]
    },
    {
        id: 'films-tv',
        label: 'Films & TV',
        providers: [
            { key: 'tvmaze', label: 'TVmaze' },
            { key: 'itunes', label: 'iTunes' }
        ]
    }
];

const RATING_PROVIDER_KEYS = RATING_PROVIDER_GROUPS.flatMap((g) => g.providers.map((p) => p.key));

function ratingProviderInputIds(key) {
    return {
        enabled: `ratingProviderEnabled_${key}`,
        weight: `ratingProviderWeight_${key}`
    };
}

function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

function getRatingSettings() {
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    if (window.EveLibrary?.Ratings?.getSettings) {
        return window.EveLibrary.Ratings.getSettings(config);
    }
    // Defensive fallback (engine not loaded yet) — assume all providers on.
    const enabled = {};
    const weights = {};
    RATING_PROVIDER_KEYS.forEach((key) => { enabled[key] = true; weights[key] = 1; });
    return {
        activeScale: 'hybrid',
        personalWeight: 0.5,
        enabledProviders: enabled,
        providerWeights: weights
    };
}

function ensureRatingProvidersContainer() {
    const container = document.getElementById('ratingProvidersContainer');
    if (!container) return null;
    if (container.dataset.populated !== '1') {
        container.innerHTML = buildRatingProviderRowsHtml();
        container.dataset.populated = '1';
    }
    return container;
}

function loadRatingSettingsInputs() {
    ensureRatingProvidersContainer();
    const settings = getRatingSettings();
    const scale = document.getElementById('ratingScaleModeSelect');
    const personalWeight = document.getElementById('ratingPersonalWeight');
    if (scale) scale.value = settings.activeScale || 'hybrid';
    if (personalWeight) personalWeight.value = Math.round((settings.personalWeight ?? 0.5) * 100);

    RATING_PROVIDER_KEYS.forEach((key) => {
        const ids = ratingProviderInputIds(key);
        const enabledEl = document.getElementById(ids.enabled);
        if (enabledEl) enabledEl.checked = settings.enabledProviders?.[key] !== false;
        const weightEl = document.getElementById(ids.weight);
        if (weightEl) weightEl.value = settings.providerWeights?.[key] ?? 1;
    });
}

function saveDerivedRatingSettingsFromInputs() {
    const current = getRatingSettings();
    const scale = document.getElementById('ratingScaleModeSelect')?.value || current.activeScale || 'hybrid';
    const personalWeightPercent = clampNumber(
        document.getElementById('ratingPersonalWeight')?.value ?? (current.personalWeight * 100),
        0,
        100
    );

    const enabledProviders = {};
    const providerWeights = {};
    RATING_PROVIDER_KEYS.forEach((key) => {
        const ids = ratingProviderInputIds(key);
        const enabledEl = document.getElementById(ids.enabled);
        const weightEl = document.getElementById(ids.weight);
        enabledProviders[key] = enabledEl ? !!enabledEl.checked : (current.enabledProviders?.[key] !== false);
        const fallbackWeight = current.providerWeights?.[key] ?? 1;
        providerWeights[key] = clampNumber(weightEl?.value ?? fallbackWeight, 0, 100);
    });

    config.ratingSettings = {
        ...current,
        activeScale: scale,
        personalWeight: personalWeightPercent / 100,
        enabledProviders,
        providerWeights
    };
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    saveConfig();
}

function saveRatingSettingsScale() { saveDerivedRatingSettingsFromInputs(); }
function saveRatingSettingsPersonalWeight() { saveDerivedRatingSettingsFromInputs(); }
function saveRatingProviderSettings() { saveDerivedRatingSettingsFromInputs(); }

// Build the provider rows HTML used inside the Library Derived Ratings
// section of tpl-settings.js. Called at modal-init time before the template
// concatenation so the markup is data-driven from RATING_PROVIDER_GROUPS.
function buildRatingProviderRowsHtml() {
    return RATING_PROVIDER_GROUPS.map((group) => {
        const rows = group.providers.map((p) => {
            const ids = ratingProviderInputIds(p.key);
            return (
                `<div class="rating-provider-row" style="display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center;">`
                + `<label style="display:flex; gap:6px; align-items:center;">`
                + `<input type="checkbox" id="${ids.enabled}" onchange="saveRatingProviderSettings()">`
                + `<span>${p.label}</span>`
                + `</label>`
                + `<div></div>`
                + `<input type="number" id="${ids.weight}" min="0" max="100" step="0.5" `
                + `onchange="saveRatingProviderSettings()" style="width:76px;" title="${p.label} Weight">`
                + `</div>`
            );
        }).join('');
        return (
            `<div class="rating-provider-group" data-rating-group="${group.id}" style="display:flex; flex-direction:column; gap:6px;">`
            + `<h5 style="margin:8px 0 2px 0; font-size:0.78rem; letter-spacing:0.8px; opacity:0.78; text-transform:uppercase;">${group.label}</h5>`
            + `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:6px 12px;">${rows}</div>`
            + `</div>`
        );
    }).join('');
}
window.buildRatingProviderRowsHtml = buildRatingProviderRowsHtml;
