// Pure snapshot serialization helpers. No store references or live state aliases.
(function () {
    'use strict';

    const VOLATILE_KEYS = new Set(['date', 'generatedAt', 'lastUpdated']);
    const LITERALS = ['true', 'false', 'null'];
    const MAX_DEPTH = 512;
    const DEPTH_ERROR = 'Snapshot JSON nesting exceeds ' + MAX_DEPTH;
    const TAG = Object.freeze({
        object: 65536, objectEnd: 65537, array: 65538, arrayEnd: 65539,
        string: 65540, stringEnd: 65541, number: 65542, numberEnd: 65543,
        true: 65544, false: 65545, null: 65546
    });
    // One generation only: immutable strings, never caller-owned Maps/objects.
    let sectionCache = new Map();

    class TokenHash {
        constructor() {
            this.first = 2166136261;
            this.second = 5381;
        }

        add(code) {
            this.first = Math.imul(this.first ^ code, 16777619);
            this.second = ((this.second << 5) + this.second) ^ code;
        }

        string(value) {
            this.add(TAG.string);
            for (let index = 0; index < value.length; index += 1) {
                this.add(value.charCodeAt(index));
            }
            this.add(TAG.stringEnd);
        }

        finish() {
            return 'sections-v1:' + (this.first >>> 0).toString(16).padStart(8, '0')
                + (this.second >>> 0).toString(16).padStart(8, '0');
        }
    }

    class Scanner {
        constructor(json, hash = null) {
            if (typeof json !== 'string') throw new TypeError('Snapshot JSON must be a string');
            this.json = json;
            this.index = 0;
            this.hash = hash;
        }

        fail() {
            throw new SyntaxError('Invalid snapshot JSON at offset ' + this.index);
        }

        space() {
            const json = this.json;
            while (this.index < json.length) {
                const code = json.charCodeAt(this.index);
                if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;
                this.index += 1;
            }
        }

        expect(character) {
            if (this.json[this.index] !== character) this.fail();
            this.index += 1;
        }

        string(emit, decode = false) {
            const start = this.index;
            this.expect('"');
            const hash = emit ? this.hash : null;
            if (hash) hash.add(TAG.string);
            let escaped = false;
            while (this.index < this.json.length) {
                let code = this.json.charCodeAt(this.index++);
                if (code === 34) {
                    if (hash) hash.add(TAG.stringEnd);
                    if (!decode) return undefined;
                    return escaped ? JSON.parse(this.json.slice(start, this.index))
                        : this.json.slice(start + 1, this.index - 1);
                }
                if (code < 32) this.fail();
                if (code === 92) {
                    escaped = true;
                    const escape = this.json[this.index++];
                    if (escape === 'u') {
                        code = 0;
                        for (let digit = 0; digit < 4; digit += 1) {
                            const hex = this.json.charCodeAt(this.index++);
                            const value = hex >= 48 && hex <= 57 ? hex - 48
                                : hex >= 65 && hex <= 70 ? hex - 55
                                    : hex >= 97 && hex <= 102 ? hex - 87 : -1;
                            if (value < 0) this.fail();
                            code = code * 16 + value;
                        }
                    } else if (escape === '"') code = 34;
                    else if (escape === '\\') code = 92;
                    else if (escape === '/') code = 47;
                    else if (escape === 'b') code = 8;
                    else if (escape === 'f') code = 12;
                    else if (escape === 'n') code = 10;
                    else if (escape === 'r') code = 13;
                    else if (escape === 't') code = 9;
                    else this.fail();
                }
                if (hash) hash.add(code);
            }
            this.fail();
        }

        number(emit) {
            const start = this.index;
            if (this.json[this.index] === '-') this.index += 1;
            if (this.json[this.index] === '0') this.index += 1;
            else {
                const first = this.json.charCodeAt(this.index);
                if (first < 49 || first > 57 || !Number.isFinite(first)) this.fail();
                this.digits();
            }
            if (this.json[this.index] === '.') {
                this.index += 1;
                if (!this.digits()) this.fail();
            }
            if (this.json[this.index] === 'e' || this.json[this.index] === 'E') {
                this.index += 1;
                if (this.json[this.index] === '+' || this.json[this.index] === '-') this.index += 1;
                if (!this.digits()) this.fail();
            }
            if (emit && this.hash) {
                this.hash.add(TAG.number);
                for (let index = start; index < this.index; index += 1) {
                    this.hash.add(this.json.charCodeAt(index));
                }
                this.hash.add(TAG.numberEnd);
            }
        }

        digits() {
            const start = this.index;
            while (this.index < this.json.length) {
                const code = this.json.charCodeAt(this.index);
                if (code < 48 || code > 57) break;
                this.index += 1;
            }
            return this.index > start;
        }

        value(emit = false, depth = 0) {
            if (depth > MAX_DEPTH) throw new RangeError(DEPTH_ERROR);
            this.space();
            const character = this.json[this.index];
            if (character === '{') return this.object(emit, depth);
            if (character === '[') return this.array(emit, depth);
            if (character === '"') return this.string(emit);
            for (const literal of LITERALS) {
                if (character !== literal[0]) continue;
                if (!this.json.startsWith(literal, this.index)) this.fail();
                this.index += literal.length;
                if (emit && this.hash) this.hash.add(TAG[literal]);
                return;
            }
            this.number(emit);
        }

        object(emit, depth, parts = null) {
            this.expect('{');
            if (emit && this.hash) this.hash.add(TAG.object);
            this.space();
            if (this.json[this.index] !== '}') {
                while (true) {
                    this.space();
                    const key = this.string(false, emit || !!parts);
                    this.space();
                    this.expect(':');
                    this.space();
                    const start = this.index;
                    const include = emit && !VOLATILE_KEYS.has(key);
                    if (include && this.hash) this.hash.string(key);
                    this.value(include, depth + 1);
                    if (parts) {
                        if (parts.has(key)) this.fail();
                        parts.set(key, this.json.slice(start, this.index));
                    }
                    this.space();
                    if (this.json[this.index] !== ',') break;
                    this.index += 1;
                }
            }
            this.expect('}');
            if (emit && this.hash) this.hash.add(TAG.objectEnd);
        }

        array(emit, depth) {
            this.expect('[');
            if (emit && this.hash) this.hash.add(TAG.array);
            this.space();
            if (this.json[this.index] !== ']') {
                while (true) {
                    this.value(emit, depth + 1);
                    this.space();
                    if (this.json[this.index] !== ',') break;
                    this.index += 1;
                }
            }
            this.expect(']');
            if (emit && this.hash) this.hash.add(TAG.arrayEnd);
        }

        end() {
            this.space();
            if (this.index !== this.json.length) this.fail();
        }
    }

    function isDepthError(error) {
        return error instanceof RangeError && error.message === DEPTH_ERROR;
    }

    // Exceptional deep snapshots use native validation and cursor frames. Only
    // active ancestors occupy the stack; wide arrays never enqueue every item.
    function hashParsedValue(value, hash) {
        const stack = [];
        let current = value;
        let pending = true;
        while (pending) {
            if (current === null) hash.add(TAG.null);
            else if (typeof current === 'string') hash.string(current);
            else if (typeof current === 'number') {
                hash.add(TAG.number);
                const number = String(current);
                for (let index = 0; index < number.length; index += 1) hash.add(number.charCodeAt(index));
                hash.add(TAG.numberEnd);
            } else if (typeof current === 'boolean') hash.add(current ? TAG.true : TAG.false);
            else {
                const array = Array.isArray(current);
                hash.add(array ? TAG.array : TAG.object);
                stack.push({ value: current, index: 0, keys: array ? null : Object.keys(current) });
            }
            pending = false;
            while (stack.length) {
                const frame = stack[stack.length - 1];
                if (frame.keys === null) {
                    if (frame.index < frame.value.length) {
                        current = frame.value[frame.index++];
                        pending = true;
                    }
                } else {
                    while (frame.index < frame.keys.length) {
                        const key = frame.keys[frame.index++];
                        if (VOLATILE_KEYS.has(key)) continue;
                        hash.string(key);
                        current = frame.value[key];
                        pending = true;
                        break;
                    }
                }
                if (pending) break;
                hash.add(frame.keys === null ? TAG.arrayEnd : TAG.objectEnd);
                stack.pop();
            }
        }
    }

    function splitObject(json) {
        const scanner = new Scanner(json);
        const parts = new Map();
        try {
            scanner.space();
            scanner.object(false, 0, parts);
            scanner.end();
            return parts;
        } catch (error) {
            if (!isDepthError(error)) throw error;
            const object = JSON.parse(json);
            if (!object || typeof object !== 'object' || Array.isArray(object)) {
                throw new TypeError('Snapshot JSON must contain a root object');
            }
            return new Map(Object.keys(object).map(key => [key, JSON.stringify(object[key])]));
        }
    }

    function hashSection(json, include) {
        if (typeof json !== 'string') throw new TypeError('Snapshot JSON must be a string');
        // Native validation plus the iterative token walk is faster than the JS
        // scanner for changed sections and remains bounded by active ancestors.
        const value = JSON.parse(json);
        return include ? hashValue(value) : '';
    }

    function hashValue(value) {
        const hash = new TokenHash();
        hashParsedValue(value, hash);
        return hash.finish();
    }

    function hashParts(parts) {
        if (!(parts instanceof Map)) throw new TypeError('Snapshot parts must be a Map');
        const keys = Array.from(parts.keys());
        if (keys.some(key => typeof key !== 'string')) throw new TypeError('Snapshot keys must be strings');
        keys.sort();
        const hash = new TokenHash();
        const nextCache = new Map();
        hash.add(TAG.object);
        for (const key of keys) {
            const json = parts.get(key);
            const include = !VOLATILE_KEYS.has(key);
            let cached = sectionCache.get(key);
            if (!cached || cached.json !== json) {
                cached = { json, digest: hashSection(json, include) };
            }
            nextCache.set(key, cached);
            if (include) {
                hash.string(key);
                hash.string(cached.digest);
            }
        }
        hash.add(TAG.objectEnd);
        sectionCache = nextCache;
        return hash.finish();
    }

    function hashState(object) {
        if (!object || typeof object !== 'object' || Array.isArray(object)) return '';
        try {
            return hashParts(splitObject(JSON.stringify(object)));
        } catch {
            return '';
        }
    }

    window.EveModularCaptureCodec = Object.freeze({ splitObject, hashParts, hashState, hashValue });
})();
