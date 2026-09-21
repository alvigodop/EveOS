const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const muse = require('../extension/content/muse.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content', 'muse.js'), 'utf8');

test('Muse recognizes explicit async progress-only relay status', () => {
  const status = "Multi-artifact workload is running as one autonomous pass — 8–10 implementations, three artifacts plus hash sidecar, full re-verification before reporting. I'll return only the compact audit report when it lands.";
  assert.equal(muse.asyncProgressText(status), true);
  assert.equal(muse.isDexRelayPrompt('[DEX ROOM RELAY]\nRoom: Stress'), true);
});

test('Muse async progress guard stays narrow and respects explicit terminal markers', () => {
  assert.equal(muse.asyncProgressText('The workload is running.'), false);
  assert.equal(muse.asyncProgressText('I will return the final result tomorrow.'), false);
  assert.equal(muse.asyncProgressText("Still working; I'll return when it is done. [[DEX:NOTE]]"), false);
  assert.equal(muse.asyncProgressText('Completed verification and the final report is attached.'), false);
});

test('Muse watcher and recovery capture both preserve unfinished async work as active', () => {
  assert.match(source, /holdAsyncProgress: !!baseline\.holdAsyncProgress/);
  assert.match(source, /const deferredProgress = watcher\.holdAsyncProgress && asyncProgressText\(text\);/);
  assert.match(source, /const isGenerating = nativeGenerating \|\| deferredProgress;/);
  assert.match(source, /const isGenerating = nativeGenerating \|\| asyncProgressText\(text\);/);
  assert.match(source, /completenessHint: isGenerating \? 'unknown' : \(looksCompleteAssistantText\(text\) \? 'complete' : 'unknown'\)/);
});
test('Muse recognizes Recovery Test C explicit non-final progress status without a future-result clause', () => {
  const status = 'Progress (not final): Recovery Test C workload is underway and still active — 6-technique research plus the 120-marker artifact build in flight. No final audit yet; still working.';
  assert.equal(muse.asyncProgressText(status), true);
});

