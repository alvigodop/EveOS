// --- STORAGE RUNTIME IO ---
(function () {
    const runtime = window.EveStorageRuntime = window.EveStorageRuntime || {};
    if (runtime.ioReady) return;

    const coreStorage = runtime.coreStorage;
    if (!coreStorage) return;

    const cloneStoredValue = runtime.cloneStoredValue || function (value) { return value; };
    const themeBootKey = String(runtime.EVE_THEME_BOOT_KEY || 'eveV22ThemeBoot');

    function hasStoredContent(value) {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        return value !== undefined && value !== null && String(value || '').trim() !== '';
    }

    function readFirstLegacyJson(storage, legacyKeys, defaultValue) {
        for (let index = 0; index < legacyKeys.length; index += 1) {
            const legacyKey = legacyKeys[index];
            if (!legacyKey) continue;
            try {
                if (localStorage.getItem(legacyKey) == null) continue;
            } catch (error) {
                continue;
            }
            return {
                found: true,
                value: storage._readLocalJson(legacyKey, defaultValue)
            };
        }
        return { found: false, value: cloneStoredValue(defaultValue) };
    }

    Object.assign(coreStorage, {
        saveJson: async function (key, value, options = {}) {
            const storageKey = String(key || '').trim();
            if (!storageKey) return false;

            const cleanupLocalKeys = Array.isArray(options.cleanupLocalKeys) && options.cleanupLocalKeys.length
                ? options.cleanupLocalKeys.slice()
                : [options.localFallbackKey || storageKey];
            const mirrorLocalKey = String(options.mirrorLocalKey || '').trim() || null;
            const mirrorValue = options.mirrorValue;
            const localFallbackKey = String(options.localFallbackKey || storageKey).trim();

            return await this._enqueueWrite(storageKey, async () => {
                const clonedValue = cloneStoredValue(value);
                const canUseIdb = await this.canUseIndexedDb();

                if (canUseIdb) {
                    try {
                        const saved = await window.IDBStore.set(this._idbKey(storageKey), clonedValue);
                        if (saved !== false) {
                            this._setStatus({
                                backend: 'indexeddb',
                                indexeddbAvailable: true,
                                degraded: false,
                                reason: ''
                            });
                            delete this._memoryFallback[storageKey];
                            if (mirrorLocalKey) {
                                this._writeLocalJson(mirrorLocalKey, mirrorValue, options.mirrorPruneRatio || 0.1);
                            }
                            this._removeLocalKeys(cleanupLocalKeys.filter(function (localKey) {
                                return localKey && localKey !== mirrorLocalKey;
                            }));
                            return true;
                        }
                    } catch (error) {
                        this._setStatus({
                            backend: 'localstorage',
                            indexeddbAvailable: false,
                            degraded: true,
                            reason: String(error?.message || error || 'IndexedDB write failed')
                        });
                        this._warnFallback('localstorage', error?.message || error);
                    }
                }

                const wroteFallback = this._writeLocalJson(localFallbackKey, clonedValue, options.localPruneRatio || 0.5);
                if (mirrorLocalKey && mirrorLocalKey !== localFallbackKey) {
                    this._writeLocalJson(mirrorLocalKey, mirrorValue, options.mirrorPruneRatio || 0.1);
                }

                if (wroteFallback) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: this._status.reason || 'IndexedDB unavailable'
                    });
                    this._warnFallback('localstorage', this._status.reason);
                    return true;
                }

                this._memoryFallback[storageKey] = clonedValue;
                this._setStatus({
                    backend: 'memory',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: 'Persistent storage unavailable'
                });
                this._warnFallback('memory', 'Persistent storage unavailable');
                return false;
            });
        },

        loadJson: async function (key, defaultValue, options = {}) {
            const storageKey = String(key || '').trim();
            if (!storageKey) return cloneStoredValue(defaultValue);
            const legacyKeys = Array.isArray(options.legacyKeys) && options.legacyKeys.length
                ? options.legacyKeys.slice()
                : [options.localFallbackKey || storageKey];

            if (Object.prototype.hasOwnProperty.call(this._memoryFallback, storageKey)) {
                return cloneStoredValue(this._memoryFallback[storageKey]);
            }

            const canUseIdb = await this.canUseIndexedDb();
            if (canUseIdb) {
                try {
                    const value = await window.IDBStore.get(this._idbKey(storageKey));
                    if (value !== undefined) {
                        if (options.preferNonEmptyLegacy && !hasStoredContent(value)) {
                            const legacy = readFirstLegacyJson(this, legacyKeys, defaultValue);
                            if (legacy.found && hasStoredContent(legacy.value)) {
                                void this.saveJson(storageKey, legacy.value, {
                                    localFallbackKey: options.localFallbackKey || storageKey,
                                    cleanupLocalKeys: legacyKeys,
                                    mirrorLocalKey: options.mirrorLocalKey,
                                    mirrorValue: options.mirrorValue
                                });
                                return cloneStoredValue(legacy.value);
                            }
                        }
                        return cloneStoredValue(value);
                    }
                } catch (error) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: String(error?.message || error || 'IndexedDB read failed')
                    });
                    this._warnFallback('localstorage', error?.message || error);
                }
            }

            const legacy = readFirstLegacyJson(this, legacyKeys, defaultValue);
            const found = legacy.found;
            const localValue = legacy.value;

            if (found) {
                if (canUseIdb && options.migrateLegacy !== false) {
                    void this.saveJson(storageKey, localValue, {
                        localFallbackKey: options.localFallbackKey || storageKey,
                        cleanupLocalKeys: legacyKeys,
                        mirrorLocalKey: options.mirrorLocalKey,
                        mirrorValue: options.mirrorValue
                    });
                } else if (!canUseIdb) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: this._status.reason || 'IndexedDB unavailable'
                    });
                }
                return cloneStoredValue(localValue);
            }

            return cloneStoredValue(defaultValue);
        },

        saveText: async function (key, value, options = {}) {
            const storageKey = String(key || '').trim();
            if (!storageKey) return false;

            return await this._enqueueWrite(storageKey, async () => {
                const textValue = String(value || '');
                const localFallbackKey = String(options.localFallbackKey || storageKey).trim();
                const canUseIdb = await this.canUseIndexedDb();

                if (canUseIdb) {
                    try {
                        const saved = await window.IDBStore.set(this._idbKey(storageKey), textValue);
                        if (saved !== false) {
                            delete this._memoryFallback[storageKey];
                            this._removeLocalKeys([localFallbackKey]);
                            return true;
                        }
                    } catch (error) {
                        this._setStatus({
                            backend: 'localstorage',
                            indexeddbAvailable: false,
                            degraded: true,
                            reason: String(error?.message || error || 'IndexedDB write failed')
                        });
                        this._warnFallback('localstorage', error?.message || error);
                    }
                }

                if (this._writeLocalText(localFallbackKey, textValue, options.localPruneRatio || 0.1)) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: this._status.reason || 'IndexedDB unavailable'
                    });
                    this._warnFallback('localstorage', this._status.reason);
                    return true;
                }

                this._memoryFallback[storageKey] = textValue;
                this._setStatus({
                    backend: 'memory',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: 'Persistent storage unavailable'
                });
                this._warnFallback('memory', 'Persistent storage unavailable');
                return false;
            });
        },

        loadText: async function (key, defaultValue = '', options = {}) {
            const storageKey = String(key || '').trim();
            if (!storageKey) return String(defaultValue || '');

            if (Object.prototype.hasOwnProperty.call(this._memoryFallback, storageKey)) {
                return String(this._memoryFallback[storageKey] || '');
            }

            const canUseIdb = await this.canUseIndexedDb();
            if (canUseIdb) {
                try {
                    const value = await window.IDBStore.get(this._idbKey(storageKey));
                    if (value !== undefined) {
                        return String(value || '');
                    }
                } catch (error) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: String(error?.message || error || 'IndexedDB read failed')
                    });
                    this._warnFallback('localstorage', error?.message || error);
                }
            }

            const legacyKey = String(options.localFallbackKey || storageKey).trim();
            let hasLegacy = false;
            try {
                hasLegacy = localStorage.getItem(legacyKey) != null;
            } catch (error) {
                hasLegacy = false;
            }

            if (hasLegacy) {
                const textValue = this._readLocalText(legacyKey, defaultValue);
                if (canUseIdb && options.migrateLegacy !== false) {
                    void this.saveText(storageKey, textValue, {
                        localFallbackKey: legacyKey
                    });
                } else if (!canUseIdb) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: this._status.reason || 'IndexedDB unavailable'
                    });
                }
                return textValue;
            }

            return String(defaultValue || '');
        },

        getThemeBootConfig: function (nextConfig) {
            const configValue = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
            return {
                theme: configValue.theme || 'dark',
                accent: configValue.accent || '',
                background: configValue.background || '',
                bgColor: configValue.bgColor || '',
                cardColor: configValue.cardColor || '',
                popupColor: configValue.popupColor || ''
            };
        },

        syncThemeBootConfig: function (nextConfig) {
            this._writeLocalJson(themeBootKey, this.getThemeBootConfig(nextConfig), 0.05);
        },

        clearAll: async function () {
            this._memoryFallback = Object.create(null);
            this._writeQueue = Object.create(null);
            try {
                if (window.IDBStore && typeof window.IDBStore.clear === 'function') {
                    await window.IDBStore.clear();
                }
            } catch (error) {
                console.warn('Core Storage: Failed to clear IndexedDB store', error);
            }
        }
    });

    runtime.ioReady = true;
    window.EveCoreStorage = coreStorage;
})();
