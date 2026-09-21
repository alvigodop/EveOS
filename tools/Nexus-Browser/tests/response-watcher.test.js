const test = require('node:test');
const assert = require('node:assert/strict');

function createWatcherStateMachine({ onEmit, onStop, getLatestText, isGeneratingNow }) {
  const state = {
    started: false,
    lastText: '',
    lastChangedAt: Date.now(),
    sawGenerating: false,
    generatingEndedAt: 0,
    stopped: false
  };

  function finalizeResponse() {
    const finalText = getLatestText() || state.lastText;
    onEmit({ type: 'response_final', text: finalText });
    state.stopped = true;
    if (onStop) onStop();
  }

  function sample(currentTime = Date.now()) {
    if (state.stopped) return;

    const isGenerating = isGeneratingNow();
    if (isGenerating) {
      state.sawGenerating = true;
      state.generatingEndedAt = 0;
    } else if (state.sawGenerating && !state.generatingEndedAt) {
      state.generatingEndedAt = currentTime;
    }

    const text = getLatestText();
    if (!text && !state.started) return;

    state.started = true;
    if (text !== state.lastText) {
      state.lastText = text;
      state.lastChangedAt = currentTime;
      onEmit({ type: 'response_partial', text });
      return;
    }

    if (isGenerating) return;

    const stableFor = currentTime - state.lastChangedAt;
    if (state.sawGenerating) {
      const timeSinceGenEnd = currentTime - state.generatingEndedAt;
      if (timeSinceGenEnd >= 1500 && stableFor >= 1500) {
        finalizeResponse();
        return;
      }
    }

    if (!state.sawGenerating && stableFor >= 15000) finalizeResponse();
  }

  return { state, sample };
}

test('Response Watcher State Machine Suite', async (t) => {
  await t.test('Does NOT finalize during a 7-second pause if generation is active', () => {
    const emitted = [];
    let currentText = 'Chunk 1...';
    let isGen = true;
    let now = 10000;
    const watcher = createWatcherStateMachine({
      onEmit: (event) => emitted.push(event),
      getLatestText: () => currentText,
      isGeneratingNow: () => isGen
    });

    watcher.sample(now);
    assert.equal(emitted[0].type, 'response_partial');
    now += 7000;
    watcher.sample(now);
    assert.equal(emitted.some((event) => event.type === 'response_final'), false);

    currentText = 'Chunk 1... Chunk 2!';
    now += 500;
    watcher.sample(now);
    assert.equal(emitted.at(-1).text, 'Chunk 1... Chunk 2!');

    isGen = false;
    now += 200;
    watcher.sample(now);
    assert.equal(emitted.some((event) => event.type === 'response_final'), false);

    now += 1600;
    watcher.sample(now);
    const finalEvent = emitted.find((event) => event.type === 'response_final');
    assert.ok(finalEvent);
    assert.equal(finalEvent.text, 'Chunk 1... Chunk 2!');
  });

  await t.test('Resamples latest settled text from DOM upon finalization', () => {
    const emitted = [];
    let text = 'Initial';
    let isGen = true;
    let now = 20000;
    const watcher = createWatcherStateMachine({
      onEmit: (event) => emitted.push(event),
      getLatestText: () => text,
      isGeneratingNow: () => isGen
    });

    watcher.sample(now);
    isGen = false;
    now += 200;
    watcher.sample(now);
    text = 'Initial and Settled Full Response!';
    now += 1600;
    watcher.sample(now);
    now += 1600;
    watcher.sample(now);

    const finalEvent = emitted.find((event) => event.type === 'response_final');
    assert.ok(finalEvent);
    assert.equal(finalEvent.text, 'Initial and Settled Full Response!');
  });

  await t.test('Conservative fallback triggers after 15 seconds if sawGenerating was false', () => {
    const emitted = [];
    let text = 'Silent text';
    const watcher = createWatcherStateMachine({
      onEmit: (event) => emitted.push(event),
      getLatestText: () => text,
      isGeneratingNow: () => false
    });

    let now = 30000;
    watcher.sample(now);
    now += 10000;
    watcher.sample(now);
    assert.equal(emitted.some((event) => event.type === 'response_final'), false);

    now += 5500;
    watcher.sample(now);
    const finalEvent = emitted.find((event) => event.type === 'response_final');
    assert.ok(finalEvent);
    assert.equal(finalEvent.text, text);
  });

  await t.test('Multi-block response aggregates all new markdown nodes in turn', () => {
    const allMarkdownNodes = ['Old turn answer'];
    const baselineCount = 1;
    const getTurnText = (nodes, baseline) => {
      if (!nodes.length) return '';
      const target = nodes.length > baseline ? nodes.slice(baseline) : [nodes[nodes.length - 1]];
      return target.join('\n\n');
    };

    allMarkdownNodes.push('Eastern: 3:13 PM\nPacific: 12:12 PM');
    assert.equal(
      getTurnText(allMarkdownNodes, baselineCount),
      'Eastern: 3:13 PM\nPacific: 12:12 PM'
    );

    allMarkdownNodes.push('All zones are currently observing Daylight Saving Time.');
    assert.equal(
      getTurnText(allMarkdownNodes, baselineCount),
      'Eastern: 3:13 PM\nPacific: 12:12 PM\n\nAll zones are currently observing Daylight Saving Time.'
    );
  });

  await t.test('Prunes nested/descendant markdown candidates to prevent duplication', () => {
    const nodeA = { id: 'outer', text: 'Full message text' };
    const nodeB = { id: 'inner', text: 'Inner fragment' };
    const candidates = [nodeA, nodeB];
    const contains = (parent, child) => parent.id === 'outer' && child.id === 'inner';
    const pruned = candidates.filter((candidate, candidateIndex, all) => {
      return !all.some((other, otherIndex) => otherIndex !== candidateIndex && contains(other, candidate));
    });

    assert.equal(pruned.length, 1);
    assert.equal(pruned[0].id, 'outer');
  });
});
