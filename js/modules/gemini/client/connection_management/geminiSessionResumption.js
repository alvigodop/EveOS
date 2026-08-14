/**
 * Tab-scoped Gemini Live session-resumption state.
 * Handles are transient transport credentials, so they stay out of localStorage and backups.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'eveGeminiLiveResumptionV1';
    const PENDING_KEY = 'eveGeminiLiveResumptionPendingV1';
    const HANDLE_TTL_MS = 110 * 60 * 1000;

    function readRecord() {
        try {
            const record = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
            if (!record?.handle || Date.now() - Number(record.savedAt || 0) > HANDLE_TTL_MS) {
                clear();
                return null;
            }
            return record;
        } catch (error) {
            clear();
            return null;
        }
    }

    function store(handle) {
        const value = String(handle || '').trim();
        if (!value) return false;
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                handle: value.slice(0, 16384),
                savedAt: Date.now()
            }));
            return true;
        } catch (error) {
            return false;
        }
    }

    function markPending() {
        if (!readRecord()) return false;
        try {
            sessionStorage.setItem(PENDING_KEY, String(Date.now()));
            return true;
        } catch (error) {
            return false;
        }
    }

    function pendingHandle() {
        const record = readRecord();
        if (!record) return '';
        try {
            if (!sessionStorage.getItem(PENDING_KEY)) return '';
        } catch (error) {
            return '';
        }
        return record.handle;
    }

    function completeResume() {
        try { sessionStorage.removeItem(PENDING_KEY); } catch (error) { /* optional storage */ }
    }

    function clear() {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(PENDING_KEY);
        } catch (error) { /* optional storage */ }
    }

    window.EveGeminiSessionResumption = {
        store,
        markPending,
        pendingHandle,
        completeResume,
        clear,
        hasHandle: () => !!readRecord()
    };
})();
