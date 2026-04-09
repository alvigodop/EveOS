/* EveOS IndexedDB Wrapper */
(function() {
    'use strict';
    
    const DB_NAME = 'EveOS_DataStore';
    const DB_VERSION = 1;
    const STORE_NAME = 'keyval';

    const IDBStore = {
        _db: null,
        _ready: null,
        _available: null,
        _lastError: null,
        
        init: function() {
            if (this._ready) return this._ready;
            if (typeof indexedDB === 'undefined') {
                this._available = false;
                this._lastError = new Error('IndexedDB not supported');
                return Promise.reject(new Error('IndexedDB not supported'));
            }

            this._ready = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                request.onsuccess = (event) => {
                    this._db = event.target.result;
                    this._available = true;
                    this._lastError = null;
                    resolve(this._db);
                };
                request.onerror = (event) => {
                    this._available = false;
                    this._lastError = event.target.error || new Error('IndexedDB init failed');
                    console.error('IndexedDB init error:', event.target.error);
                    reject(event.target.error);
                };
            });
            return this._ready;
        },

        get: async function(key) {
            try {
                const db = await this.init();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            } catch (error) {
                this._available = false;
                this._lastError = error;
                console.warn('IDBStore.get failed:', error);
                return undefined;
            }
        },

        set: async function(key, value) {
            try {
                const db = await this.init();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.put(value, key);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => reject(req.error);
                });
            } catch (error) {
                this._available = false;
                this._lastError = error;
                console.warn('IDBStore.set failed:', error);
                return false;
            }
        },

        remove: async function(key) {
            try {
                const db = await this.init();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.delete(key);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => reject(req.error);
                });
            } catch (error) {
                this._available = false;
                this._lastError = error;
                console.warn('IDBStore.remove failed:', error);
                return false;
            }
        },

        clear: async function() {
            try {
                const db = await this.init();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.clear();
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => reject(req.error);
                });
            } catch (error) {
                this._available = false;
                this._lastError = error;
                console.warn('IDBStore.clear failed:', error);
                return false;
            }
        },

        keys: async function() {
            try {
                const db = await this.init();
                return await new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.getAllKeys();
                    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
                    req.onerror = () => reject(req.error);
                });
            } catch (error) {
                this._available = false;
                this._lastError = error;
                console.warn('IDBStore.keys failed:', error);
                return [];
            }
        },

        isAvailable: function() {
            return this._available === true;
        },

        getStatus: function() {
            return {
                available: this._available === true,
                ready: !!this._ready,
                lastError: this._lastError ? String(this._lastError.message || this._lastError) : ''
            };
        }
    };

    // Auto-init to catch errors early
    IDBStore.init().catch(e => console.warn('IndexedDB early init skip:', e));

    window.IDBStore = IDBStore;
})();
