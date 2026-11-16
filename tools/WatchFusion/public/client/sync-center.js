/* UI bindings for the Sync Center. Playback and timing reports keep their existing owners. */
(() => {
  const center = $('watchSyncCenter');
  const more = $('syncCenterMore');
  const manual = $('devicePlaybackTiming');
  const diagnostics = $('presentationPanel');
  const slider = $('deviceTimingSlider');
  const numeric = $('deviceTimingInput');
  let lastCards = '';

  function setVisible(visible) {
    if (!center || center.hidden === !visible) return;
    center.hidden = !visible;
    if (!visible) {
      center.open = false;
      more.open = false;
      manual.open = false;
      diagnostics.open = false;
    }
  }

  function renderOffset(offset, text) {
    if (slider) {
      slider.value = String(offset);
      slider.setAttribute('aria-valuetext', text);
    }
    if (numeric && document.activeElement !== numeric) numeric.value = String(offset);
  }

  function bindOffset(stage, readDraft) {
    if (!numeric) return;
    numeric.addEventListener('input', () => {
      if (Number.isFinite(numeric.valueAsNumber)) stage(numeric.valueAsNumber);
    });
    // Normalize the field to the saved 5 ms step, including when it was cleared.
    numeric.addEventListener('blur', () => { numeric.value = String(readDraft()); });
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // v13.8: status reflects actual drift and actuation, not merely PLAYING.
  function classifyPeer(peer) {
    if (!peer.ready) return 'Loading';
    if (peer.buffering) return 'Buffering';
    if (peer.correcting === true || peer.recentCorrection === 'rate-correction') return 'Correcting';
    if (!peer.playing) return 'Paused';
    const errorMs = Number.isFinite(peer.positionMs) && Number.isFinite(peer.targetPositionMs)
      ? Math.abs(peer.positionMs - peer.targetPositionMs) : null;
    return window.WatchFusionPrecisionPolicy?.label?.({ready:peer.ready,buffering:peer.buffering,playing:peer.playing,correcting:peer.correcting,errorMs,reason:peer.recentCorrection||peer.hostRecovery?.outcome}) || (errorMs>100?'Recovery needed':errorMs>50?'Refining':'Locked');
  }

  function renderPeers(list, peers, members) {
    const names = new Map(members.map(({id, name}) => [id, name]));
    const signed = value => (value > 0 ? '+' : '') + Math.round(value) + ' ms';
    const cards = [...peers].sort((a, b) => a.member.localeCompare(b.member)).map(peer => ({
      name: names.get(peer.member) || 'Viewer',
      status: classifyPeer(peer),
      metrics: [
        ['Target error', peer.ready && Number.isFinite(peer.targetPositionMs) ? signed(peer.positionMs - peer.targetPositionMs) : null],
        ['Room offset', peer.ready ? signed(peer.positionMs - peer.roomPositionMs) : null],
        ['Timing adjustment', peer.ready && Math.abs(peer.adjustmentMs || 0) >= 1 ? signed(peer.adjustmentMs) : null],
        ['Round trip', peer.rttMs == null ? null : Math.round(peer.rttMs) + ' ms'],
        ['Source sample age', peer.sourceAgeMs == null ? null : Math.round(peer.sourceAgeMs) + ' ms'],
        ['Timing reference', peer.timingReference ?? null],
        ['Host correction', peer.hostCorrection ?? null],
        ['Host recovery gate', peer.hostRecovery?.outcome ?? (peer.member===state?.hostId && isHost() ? window.WatchFusionHostPeerRecovery?.diagnostics?.()?.outcome : null)],
        ['Precision action', peer.recentCorrection ?? null],
        ['Peer witnesses', peer.hostRecovery?.peerCount ? String(peer.hostRecovery.peerCount) : null],
        ['Video frame', peer.videoFrameOffsetMs == null ? null : signed(peer.videoFrameOffsetMs)],
        ['Corrections', peer.corrections == null ? null : String(peer.corrections)]
      ].filter(([, value]) => value !== null)
    }));
    const nextCards = JSON.stringify(cards);
    if (nextCards === lastCards) return;
    lastCards = nextCards;
    list.replaceChildren(...cards.map(({name, status, metrics}) => {
      const row = element('li', 'sync-peer-card');
      const heading = element('div', 'sync-peer-head');
      const stateClass = status === 'Correcting' || status === 'Recovery needed' || status === 'Buffering' ? ' is-buffering' : status === 'Paused' ? ' is-idle' : '';
      heading.append(element('strong', 'sync-peer-name', name), element('span', 'sync-peer-state' + stateClass, status));
      const figures = element('div', 'sync-peer-metrics');
      for (const [label, value] of metrics) {
        const metric = element('span', 'sync-peer-metric');
        metric.append(element('span', '', label), element('b', '', value));
        figures.append(metric);
      }
      row.append(heading, figures);
      return row;
    }));
  }

  center?.addEventListener('toggle', () => { if (!center.open) more.open = false; });
  more?.addEventListener('toggle', () => {
    if (!more.open && diagnostics) diagnostics.open = false;
  });
  window.watchFusionSyncCenter = {setVisible, renderOffset, bindOffset, renderPeers, classifyPeer};
})();
