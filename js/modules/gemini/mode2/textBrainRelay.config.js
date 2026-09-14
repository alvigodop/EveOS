window.EveGeminiMode2Config = Object.freeze({
    // The live capture showed valid Text Brain responses arriving right on the old
    // 20s boundary and losing a race with the client fallback timer. Keep the user
    // turn pending long enough for a late-but-valid extraction to reach Live.
    REQUEST_TIMEOUT_MS: 40000,
    HISTORY_LIMIT: 40,
    HISTORY_TEXT_LIMIT: 1200,
    CONTEXT_LIMIT: 80000,
    MIN_BRAIN_INTERVAL_MS: 10000,
    INJECT_MAX_CHARS: 2400,
    TEXT_BRAIN_DEFAULT_LABEL: 'gemini-3.5-flash-lite (default)',
    EVE_UPDATE_MAX_COUNT: 24,
    EVE_UPDATE_MAX_CHARS: 80000,
    HISTORY_EXCLUDE_MARKERS: Object.freeze([
        'BACKGROUND CONTEXT FROM TEXT BRAIN',
        'SILENT BACKGROUND CONTEXT',
        'MODE 2 VERIFIED EVEOS CONTEXT',
        'TEXT BRAIN → LIVE',
        'Text Brain is extracting',
        'Text Brain unavailable',
        'EVEOS CONTEXT SNAPSHOT',
        'EVEOS DATA STREAM UPDATE',
        'System Message:'
    ])
});
