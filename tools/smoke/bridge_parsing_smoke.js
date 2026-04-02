function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

// Target Logic extraction from api-core.js (extracted for isolated test)
const tryParse = (text) => {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    
    // Try de-escaping if it looks like an escaped string
    if (text.includes('\\"')) {
        try {
            const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            return JSON.parse(unescaped);
        } catch (e) {}
    }

    // Extract using balanced markers
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const start = Math.min(firstBrace !== -1 ? firstBrace : Infinity, firstBracket !== -1 ? firstBracket : Infinity);
    if (start !== Infinity) {
        const lastBrace = text.lastIndexOf('}');
        const lastBracket = text.lastIndexOf(']');
        const end = Math.max(lastBrace, lastBracket);
        if (end > start) {
            const slice = text.substring(start, end + 1);
            try { return JSON.parse(slice); } catch (e) {}
            // Try unescaping the slice too
            if (slice.includes('\\"')) {
                try { return JSON.parse(slice.replace(/\\"/g, '"').replace(/\\\\/g, '\\')); } catch (e) {}
            }
        }
    }
    return null;
};

const fullExtractor = (rawData) => {
    // 1. Try raw
    let result = tryParse(rawData);
    if (result) return result;

    // 2. Try HTML entity decode
    const decoded = rawData.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    result = tryParse(decoded);
    if (result) return result;

    // 3. Try <pre> extraction
    const preMatch = rawData.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
        result = tryParse(preMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        if (result) return result;
    }

    // 4. Try DOM stripping
    try {
        const stripped = rawData.replace(/<[^>]*>/g, ''); // Simple mock stripping
        result = tryParse(stripped);
        if (result) return result;
    } catch (e) {}

    return null;
};

// Test 1: Representative bridge snapshot with leading/trailing HTML noise.
const realSnapshot = `
<!DOCTYPE html>
<html>
  <head><title>Snapshot</title></head>
  <body>
    <div>debug wrapper</div>
    [
      {
        "id": 42,
        "title": "Attack on Titan",
        "desc": "Humanity fights titans.",
        "md_covers": [{ "b2key": "shingeki-no-kyojin-cover.jpg" }],
        "translation_completed": true
      }
    ]
    <footer>done</footer>
  </body>
</html>`;
const result1 = fullExtractor(realSnapshot);

assert(Array.isArray(result1), 'Result 1 should be an array');
assert(result1.length === 1, 'Result 1 should contain one parsed item');
assert(result1[0].title === 'Attack on Titan', 'First item title mismatch');

console.log('Test 1: PASSED (Representative Snapshot)');

// Test 2: HTML pre-wrapped escaped JSON
const htmlSnapshot = '<html><body><pre>[{\\"id\\":42,\\"title\\":\\"Test\\"}]</pre></body></html>';
const result2 = fullExtractor(htmlSnapshot);
assert(Array.isArray(result2) && result2[0].id === 42, 'Result 2 should be correctly parsed');
console.log('Test 2: PASSED (HTML Escaped JSON)');

console.log('BRIDGE_PARSING_SMOKE_OK');
