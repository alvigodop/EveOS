// --- SETTINGS RATING ACTIONS ---
function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

function getRatingSettings() {
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    return window.EveLibrary?.Ratings?.getSettings
        ? window.EveLibrary.Ratings.getSettings(config)
        : {
            activeScale: "hybrid",
            personalWeight: 0.5,
            enabledProviders: { anilist: true, myanimelist: true, mangadex: true },
            providerWeights: { anilist: 1, myanimelist: 1, mangadex: 1 }
        };
}

function loadRatingSettingsInputs() {
    const settings = getRatingSettings();
    const scale = document.getElementById('ratingScaleModeSelect');
    const personalWeight = document.getElementById('ratingPersonalWeight');
    const anilistEnabled = document.getElementById('ratingProviderAniListEnabled');
    const malEnabled = document.getElementById('ratingProviderMALEnabled');
    const mangadexEnabled = document.getElementById('ratingProviderMangaDexEnabled');
    const anilistWeight = document.getElementById('ratingProviderAniListWeight');
    const malWeight = document.getElementById('ratingProviderMALWeight');
    const mangadexWeight = document.getElementById('ratingProviderMangaDexWeight');

    if (scale) scale.value = settings.activeScale || 'hybrid';
    if (personalWeight) personalWeight.value = Math.round((settings.personalWeight ?? 0.5) * 100);
    if (anilistEnabled) anilistEnabled.checked = settings.enabledProviders?.anilist !== false;
    if (malEnabled) malEnabled.checked = settings.enabledProviders?.myanimelist !== false;
    if (mangadexEnabled) mangadexEnabled.checked = settings.enabledProviders?.mangadex !== false;
    if (anilistWeight) anilistWeight.value = settings.providerWeights?.anilist ?? 1;
    if (malWeight) malWeight.value = settings.providerWeights?.myanimelist ?? 1;
    if (mangadexWeight) mangadexWeight.value = settings.providerWeights?.mangadex ?? 1;
}

function saveDerivedRatingSettingsFromInputs() {
    const current = getRatingSettings();
    const scale = document.getElementById('ratingScaleModeSelect')?.value || current.activeScale || 'hybrid';
    const personalWeightPercent = clampNumber(document.getElementById('ratingPersonalWeight')?.value ?? (current.personalWeight * 100), 0, 100);
    const enabledProviders = {
        anilist: !!document.getElementById('ratingProviderAniListEnabled')?.checked,
        myanimelist: !!document.getElementById('ratingProviderMALEnabled')?.checked,
        mangadex: !!document.getElementById('ratingProviderMangaDexEnabled')?.checked
    };
    const providerWeights = {
        anilist: clampNumber(document.getElementById('ratingProviderAniListWeight')?.value ?? current.providerWeights.anilist, 0, 100),
        myanimelist: clampNumber(document.getElementById('ratingProviderMALWeight')?.value ?? current.providerWeights.myanimelist, 0, 100),
        mangadex: clampNumber(document.getElementById('ratingProviderMangaDexWeight')?.value ?? current.providerWeights.mangadex, 0, 100)
    };

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
