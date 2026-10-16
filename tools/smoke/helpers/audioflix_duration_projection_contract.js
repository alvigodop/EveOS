'use strict';
const assert = require('assert');

// Real application/Chromium contract. Only the metadata result is supplied; the
// canonical store, persistence, index, queue owner, and mounted controls are real.
async function qualifyDurationProjection(page) {
    const proof = await page.evaluate(async () => {
        const store = window.EveAudioflixState, transport = window.EveAudioflixTransport;
        const queue = window.EveAudioflix.queueConnection, target = queue.snapshot().entries[1];
        store.updateItem('music', target.id, { duration: 0 });
        await store.flush('duration-contract-setup');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const card = document.querySelector('.audioflix-item-card');
        const slider = card.querySelector('.audioflix-volume-slider');
        const counters = () => window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0;
        const before = { renders: counters(), revision: store.getRevision(), queue: queue.snapshot() };
        const events = [], listener = event => events.push(event.detail);
        window.addEventListener('eve:audioflix-state-changed', listener);
        transport.persistDuration(store.ensure().music.find(item => item.id === target.id), 180, 'music');
        await store.flush('duration-contract-save');
        window.removeEventListener('eve:audioflix-state-changed', listener);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const index = window.EveAudioflixLibraryIndex.get(store.ensure(), 'music');
        return { before, after: { renders: counters(), revision: store.getRevision(), queue: queue.snapshot() },
            events, duration: index.getById(target.id).duration,
            sameCard: card.isConnected && card === document.querySelector('.audioflix-item-card'),
            sameSlider: slider.isConnected && slider === card.querySelector('.audioflix-volume-slider') };
    });
    assert.equal(proof.duration, 180, 'Metadata is normalized and retained in the canonical index');
    assert.ok(proof.after.revision > proof.before.revision, 'Duration remains a durable mutation');
    assert.deepEqual(proof.after.queue, proof.before.queue, 'Metadata cannot change the queue owner/run/order');
    assert.equal(proof.after.renders, proof.before.renders,
        'Learning a duration must not rebuild the unfiltered playing library');
    assert.equal(proof.sameCard, true); assert.equal(proof.sameSlider, true);
    assert.ok(proof.events.some(event => event.reasons.includes('audioflix-duration-music')),
        'Duration-only changes have a bounded metadata reason, not a generic edit');
}

module.exports = { qualifyDurationProjection };
