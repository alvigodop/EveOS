// Task boundaries for non-interactive capture/persistence work. Never delay a playback command.
(function () {
    'use strict';
    if (window.EveCooperativeWork) return;

    function yieldTask() {
        if (typeof window.scheduler?.yield === 'function') return window.scheduler.yield();
        // A resolved Promise is not a browser task boundary. Retain a real fallback for
        // older engines; non-browser contract sandboxes have no render work to service.
        if (window.document && typeof window.setTimeout === 'function') {
            return new Promise(resolve => window.setTimeout(resolve, 0));
        }
        return Promise.resolve();
    }

    const clock = () => window.performance?.now?.() ?? Date.now();
    // Never split a surrogate pair: chunked UTF-8 must be byte-identical to one native conversion.
    function endOfChunk(text, start) {
        let end = Math.min(text.length, start + 262144);
        const code = text.charCodeAt(end - 1);
        if (end < text.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
        return end;
    }

    async function mapText(text, convert) {
        const parts = [];
        let mark = clock();
        for (let start = 0; start < text.length;) {
            const end = endOfChunk(text, start);
            parts.push(convert(text.slice(start, end)));
            start = end;
            if (clock() - mark >= 8) { await yieldTask(); mark = clock(); }
        }
        return parts;
    }

    async function encodeText(text, Encoder = window.TextEncoder) {
        const encoder = new Encoder();
        const chunks = await mapText(text, value => encoder.encode(value));
        const bytes = new Uint8Array(chunks.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return bytes;
    }

    async function jsonBody(text) {
        const BlobCtor = window.Blob;
        if (typeof BlobCtor !== 'function') return text;
        const chunks = await mapText(text, value => new BlobCtor([value]));
        return new BlobCtor(chunks, { type: 'application/json' });
    }

    window.EveCooperativeWork = Object.freeze({ yieldTask, encodeText, jsonBody });
})();
