const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAX_LINES = 450;
const TEXT_EXTENSIONS = new Set(['.js', '.css', '.html', '.md', '.json', '.bat']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(fullPath, out);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(fullPath);
  }
  return out;
}

function physicalLineCount(text) {
  if (!text) return 0;
  return text.split(/\r\n|\n|\r/).length;
}

test('first-party text files stay at or below 450 physical lines', () => {
  const violations = [];
  const files = collectFiles(ROOT);

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = physicalLineCount(text);
    if (lines > MAX_LINES) {
      violations.push(`${path.relative(ROOT, file)}: ${lines} lines`);
    }
  }

  assert.equal(
    violations.length,
    0,
    `Files over the ${MAX_LINES}-line hard cap:\n${violations.join('\n')}`
  );
});
