// --- STORAGE RUNTIME BACKEND ---
(function () {
    const runtime = window.EveStorageRuntime = window.EveStorageRuntime || {};
    if (runtime.backendReady) return;

    const cloneStoredValue = runtime.cloneStoredValue || function (value) { return value; };
    const smartCompress = runtime.smartCompress || function (value) {
        return typeof value === 'string' ? value : JSON.stringify(value);
    };
    const smartDecompress = runtime.smartDecompress || function (value, fallback) {
        return value == null ? fallback : value;
    };
    const idbPrefix = String(runtime.EVE_CORE_IDB_PREFIX || 'core_');

    const coreStorage = runtime.coreStorage || {
        _memoryFallback: Object.create(null),
        _writeQueue: Object.create(null),
        _idbCheckPromise: null,
        _warnedBackends: new Set(),
        _status: {
            backend: 'pending',
            indexeddbAvailable: null,
            degraded: false,
            reason: ''
        }
    };

    Object.assign(coreStorage, {
        _idbKey: function (key) {
            return `${idbPrefix}${String(key || '').trim()}`;
        },

        _emitStatus: function () {
            window.dispatchEvent(new CustomEvent('eve:storage-backend', {
                detail: { ...this._status }
            }));
        },

        _setStatus: function (patch) {
            const nextStatus = {
                ...this._status,
                ...(patch && typeof patch === 'object' ? patch : {})
            };
            const changed = JSON.stringify(nextStatus) !== JSON.stringify(this._status);
            this._status = nextStatus;
            if (changed) {
                this._emitStatus();
            }
            return { ...this._status };
        },

        _warnFallback: function (backend, reason) {
            const warningKey = `${backend}:${reason || ''}`;
            if (this._warnedBackends.has(warningKey)) return;
            this._warnedBackends.add(warningKey);

            const message = backend === 'memory'
                ? 'Persistent storage is unavailable. Changes will only survive for this session.'
                : 'IndexedDB is unavailable. EveOS is using localStorage fallback mode.';

            console.warn(`Core Storage: ${message}`, reason || '');
            if (typeof window.showToast === 'function') {
                window.showToast(message, 'warning');
            }
        },

        canUseIndexedDb: async function () {
            if (window.IDBStore && typeof window.IDBStore.isAvailable === 'function' && window.IDBStore.isAvailable()) {
                this._setStatus({
                    backend: 'indexeddb',
                    indexeddbAvailable: true,
                    degraded: false,
                    reason: ''
                });
                return true;
            }

            if (this._status.indexeddbAvailable === false) {
                return false;
            }

            if (!window.IDBStore || typeof window.IDBStore.init !== 'function') {
                this._setStatus({
                    backend: 'localstorage',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: 'IndexedDB wrapper unavailable'
                });
                this._warnFallback('localstorage', 'IndexedDB wrapper unavailable');
                return false;
            }

            if (!this._idbCheckPromise) {
                this._idbCheckPromise = Promise.resolve()
                    .then(() => window.IDBStore.init())
                    .then(() => {
                        this._setStatus({
                            backend: 'indexeddb',
                            indexeddbAvailable: true,
                            degraded: false,
                            reason: ''
                        });
                        return true;
                    })
                    .catch((error) => {
                        this._setStatus({
                            backend: 'localstorage',
                            indexeddbAvailable: false,
                            degraded: true,
                            reason: String(error?.message || error || 'IndexedDB init failed')
                        });
                        this._warnFallback('localstorage', error?.message || error);
                        return false;
                    })
                    .finally(() => {
                        this._idbCheckPromise = null;
                    });
            }

            return await this._idbCheckPromise;
        },

        getStatus: function () {
            return { ...this._status };
        },

        _removeLocalKeys: function (keys) {
            (Array.isArray(keys) ? keys : []).forEach(function (key) {
                if (!key) return;
                try {
                    localStorage.removeItem(key);
                } catch (error) {
                    console.warn(`Core Storage: Failed to remove legacy key [${key}]`, error);
                }
            });
        },

        _writeLocalRaw: function (key, serializedValue, pruneRatio = 0.5) {
            try {
                localStorage.setItem(key, serializedValue);
                return true;
            } catch (error) {
                if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22)) {
                    console.warn(`Core Storage: Quota exceeded for [${key}]. Attempting emergency prune...`);
                    if (window.CCMaintenance && typeof window.CCMaintenance.emergencyPrune === 'function') {
                        window.CCMaintenance.emergencyPrune(pruneRatio);
                        try {
                            localStorage.setItem(key, serializedValue);
                            return true;
                        } catch (retryError) {
                            console.error(`Core Storage: Final localStorage write failure for [${key}]`, retryError);
                        }
                    }
                } else {
                    console.error(`Core Storage: Failed localStorage write for [${key}]`, error);
                }
                return false;
            }
        },

        _writeLocalJson: function (key, value, pruneRatio = 0.5) {
            return this._writeLocalRaw(key, smartCompress(value), pruneRatio);
        },

        _writeLocalText: function (key, value, pruneRatio = 0.1) {
            return this._writeLocalRaw(key, smartCompress(String(value || '')), pruneRatio);
        },

        _readLocalJson: function (key, defaultValue) {
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return cloneStoredValue(defaultValue);
                const decoded = smartDecompress(raw, null);
                if (decoded == null) return cloneStoredValue(defaultValue);
                return JSON.parse(decoded);
            } catch (error) {
                console.warn(`Core Storage: Failed to read local JSON key [${key}]`, error);
                return cloneStoredValue(defaultValue);
            }
        },

        _readLocalText: function (key, defaultValue = '') {
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return String(defaultValue || '');
                const decoded = smartDecompress(raw, defaultValue);
                return typeof decoded === 'string' ? decoded : String(defaultValue || '');
            } catch (error) {
                console.warn(`Core Storage: Failed to read local text key [${key}]`, error);
                return String(defaultValue || '');
            }
        },

        _enqueueWrite: function (key, task) {
            const queueKey = String(key || 'core');
            const previous = this._writeQueue[queueKey] || Promise.resolve();
            const next = previous
                .catch(function () { return null; })
                .then(task);

            this._writeQueue[queueKey] = next.finally(() => {
                if (this._writeQueue[queueKey] === next) {
                    delete this._writeQueue[queueKey];
                }
            });

            return next;
        }
    });

    runtime.coreStorage = coreStorage;
    runtime.backendReady = true;
    window.EveCoreStorage = coreStorage;
})();
