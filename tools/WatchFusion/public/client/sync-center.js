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

  // Health and reported timeline precision are separate; no speaker timing is measured.
  function recoveryLabel(peer) {
    const raw = peer.hostRecovery?.outcome ?? (peer.member===state?.hostId && isHost() ? window.WatchFusionHostPeerRecovery?.diagnostics?.()?.outcome : null);
    return raw === 'source-not-trusted' ? 'Reference not qualified for host recovery'
      : raw === 'no-healthy-peer-witness' ? 'No qualified peer witness' : raw;
  }
  // v13.8: status reflects actual drift and actuation, not merely PLAYING.
  function classifyPeer(peer) {
    if (!peer.ready) return 'Loading';
    if (peer.buffering) return 'Buffering';
    if (peer.correcting === true) return 'Correcting';
    if (!peer.playing) return 'Paused';
    const errorMs = Number.isFinite(peer.positionMs) && Number.isFinite(peer.targetPositionMs)
      ? Math.abs(peer.positionMs - peer.targetPositionMs) : null;
    return window.WatchFusionPrecisionPolicy?.label?.({ready:peer.ready,buffering:peer.buffering,playing:peer.playing,correcting:peer.correcting,errorMs,reason:peer.recentCorrection||peer.hostRecovery?.outcome}) || (errorMs===null?'Timing unavailable':errorMs>50?'Playing · offset reported':'Locked');
  }

  // Group agreement uses reported PLAYER-TIMELINE progression; speaker output is not measured.
  let groupHistory = {key: '', since: 0, samples: 0, last: null};
  function groupAligned(peers, now, gap) {
    const clear = () => { groupHistory = {key: '', since: 0, samples: 0, last: null}; return false; };
    if (peers.length < 2 || peers.length > 8 || !Number.isFinite(gap) || gap > 50) return clear();
    const sorted = [...peers].sort((a, b) => a.member.localeCompare(b.member));
    if (!sorted.every(p => p.ready && p.playing && !p.buffering && !p.correcting &&
      !/^(?:rejoin-|hold-|rate-started|rate-converging|zero-converging|host-zero-centering|host-peer-rejoin|decoder-recovery|viewer-stalled-while-playing|stall-recovery-exhausted|auto-correction-suspended)/.test(p.recentCorrection || '') &&
      Number.isFinite(p.sampledAt) && Math.abs(now - p.sampledAt) < 1500 &&
      Number.isFinite(p.positionMs) && Number.isFinite(p.roomPositionMs))) return clear();
    const key = [state?.presentationEpoch, state?.playoutSegment, sorted.map(p => p.member).join(',')].join(':');
    const rows = sorted.map(p => ({t:p.sampledAt, position:p.positionMs}));
    if (groupHistory.key !== key || now < groupHistory.since) {
      groupHistory = {key, since:now, samples:1, last:rows}; return false;
    }
    const previous = groupHistory.last;
    let progressed = 0;
    for (let i = 0; i < rows.length; i++) {
      const elapsed = rows[i].t - previous[i].t, moved = rows[i].position - previous[i].position;
      if (elapsed < 0 || moved < -100) return clear();
      if (elapsed >= 200) {
        if (moved < elapsed * .35 || moved > elapsed * 1.65 + 200) return clear();
        progressed++;
      }
    }
    if (progressed === rows.length) { groupHistory.last = rows; groupHistory.samples++; }
    else if (now - groupHistory.since > 5000 && groupHistory.samples < 3) return clear();
    return groupHistory.samples >= 3 && now - groupHistory.since >= 1600;
  }

  function renderPeers(list, peers, members) {
    const names = new Map(members.map(({id, name}) => [id, name]));
    const signed = value => (value > 0 ? '+' : '') + Math.round(value) + ' ms';
    const now = typeof estimatedServerNow === 'function' ? estimatedServerNow() : Date.now();
    const roomOffsets = peers.filter(p => p.ready && p.playing && !p.buffering
      && Number.isFinite(p.positionMs) && Number.isFinite(p.roomPositionMs)
      && Number.isFinite(p.sampledAt) && Math.abs(now - p.sampledAt) < 2000)
      .map(p => p.positionMs - p.roomPositionMs);
    const gap = roomOffsets.length >= 2 ? Math.round(Math.max(...roomOffsets) - Math.min(...roomOffsets)) : null;
    const aligned = groupAligned(peers, now, gap);
    const cards = [...peers].sort((a, b) => a.member.localeCompare(b.member)).map((peer, index) => ({
      name: names.get(peer.member) || 'Viewer',
      status: aligned ? 'Group aligned' : classifyPeer(peer),
      metrics: [
        // v13.10.8e: a signed player-vs-room number, not audible desync. The room clock is the muted source tab.
        ['Player vs room', peer.ready && Number.isFinite(peer.targetPositionMs) ? signed(peer.positionMs - peer.targetPositionMs) : null],
        ['Reported player spread (not audio)', index === 0 && gap !== null ? gap + ' ms' : null],
        ['Group evidence', index === 0 && aligned ? 'Advancing players within 50 ms; audio not measured' : null],
        ['Room offset', peer.ready ? signed(peer.positionMs - peer.roomPositionMs) : null],
        ['Timing adjustment', peer.ready && Math.abs(peer.adjustmentMs || 0) >= 1 ? signed(peer.adjustmentMs) : null],
        ['Round trip', peer.rttMs == null ? null : Math.round(peer.rttMs) + ' ms'],
        ['Source sample age', peer.sourceAgeMs == null ? null : Math.round(peer.sourceAgeMs) + ' ms'],
        ['Timing reference', peer.timingReference ?? null],
        ['Host correction', peer.hostCorrection ?? null],
        ['Host recovery gate', recoveryLabel(peer)],
        ['Precision action', peer.recentCorrection ?? null],
        ['Peer witnesses', peer.hostRecovery?.peerCount ? String(peer.hostRecovery.peerCount) : null],
        ['Video frame', peer.videoFrameOffsetMs == null ? null : signed(peer.videoFrameOffsetMs)],
        ['Corrections', peer.corrections == null ? null : String(peer.corrections)],
        ['Local viewer seeks', peer.member === session?.publicId ? (window.watchFusionSyncDiagnostics?.()?.arbiter?.seeks ?? null) : null],
        ['Position read held', Number.isFinite(peer.sensor?.heldMs) && peer.sensor.heldMs > 0 ? Math.round(peer.sensor.heldMs) + ' ms' : null],
        ['Audible output', ({player: 'This player', 'source-tab': 'Source tab, not this player', both: 'Player and source tab (double audio)', none: 'Muted'})[peer.sensor?.audibleOutput] ?? null],
        ['Clock bound', peer.sensor?.clockState === 'bounded' && Number.isFinite(peer.sensor.clockBoundMs) ? 'within ±' + peer.sensor.clockBoundMs + ' ms (estimated)' : peer.sensor?.clockState && peer.sensor.clockState !== 'unknown' ? 'Unbounded (' + peer.sensor.clockState + ')' : null],
        ['Speaker phase', peer.ready ? 'Not measured' : null]
      ].filter(([, value]) => value !== null)
    }));
    const nextCards = JSON.stringify(cards);
    if (nextCards === lastCards) return;
    lastCards = nextCards;
    list.replaceChildren(...cards.map(({name, status, metrics}) => {
      const row = element('li', 'sync-peer-card');
      const heading = element('div', 'sync-peer-head');
      const stateClass = status === 'Correcting' || status === 'Recovery stalled' || status === 'Buffering' ? ' is-buffering' : status === 'Paused' ? ' is-idle' : '';
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
