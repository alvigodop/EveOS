const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
const sourceWindowId = Number(new URLSearchParams(location.search).get('windowId'));
async function currentSourceTab() {
  const windowFilter = Number.isInteger(sourceWindowId) && sourceWindowId > 0
    ? { windowId:sourceWindowId } : { currentWindow:true };
  const [tab] = await chrome.tabs.query({ active:true, ...windowFilter });
  return tab;
}
function sharingMessage(result, currentTabId) {
  if (result.sourcePlayerSilenced === true && currentTabId === result.sourceTabId) {
    return 'This tab is linked. Source player silence is on.';
  }
  if (result.tabMuted !== true) return currentTabId === result.sourceTabId
    ? 'This tab is linked. Browser mute could not be verified.'
    : 'A different tab is linked. Browser mute could not be verified.';
  return currentTabId === result.sourceTabId
    ? 'This tab is linked. Browser tab muted.'
    : 'A different tab is linked and muted. Connect this tab to switch.';
}
let sharingRevision = 0;
async function refreshSharing() {
  const revision = ++sharingRevision;
  try {
    const [result, tab] = await Promise.all([
      chrome.runtime.sendMessage({ to:'worker', type:'status', verifyMute:true }),
      currentSourceTab()
    ]);
    if (revision === sharingRevision) {
      const linked = result?.linked === true;
      $('stop').hidden = !linked;
      $('stats').hidden = !linked;
      const silence = $('sourcePlayerSilence');
      const playerSilenced = result?.sourcePlayerSilenced === true;
      silence.hidden = !(linked && tab?.id === result.sourceTabId);
      silence.dataset.enabled = String(playerSilenced);
      silence.textContent = playerSilenced ? 'Restore source player audio' : 'Silence source player';
      if (linked) status(sharingMessage(result, tab?.id));
    }
    return result;
  } catch {
    if (revision === sharingRevision) { $('stop').hidden = true; $('stats').hidden = true; $('sourcePlayerSilence').hidden = true; }
    return { linked:false };
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && Object.hasOwn(changes, 'sourceTab')) void refreshSharing();
});
chrome.runtime.onMessage.addListener((message, sender) => {
  const path = location.pathname.slice(1).replace(/popup\.html$/, 'offscreen.html');
  if (sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL(path)
      && message.to === 'popup' && message.type === 'capture-state') {
    sharingRevision++; $('stop').hidden = message.linked !== true;
  }
});

async function refreshRuntimeStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ to:'worker', type:'runtime-status' });
    $('runtimeMode').textContent = result?.mode || (result?.online ? 'Local' : 'Offline');
    $('runtimeMode').dataset.mode = result?.exposureMode || 'offline';
    return result;
  } catch {
    $('runtimeMode').textContent = 'Offline';
    $('runtimeMode').dataset.mode = 'offline';
    return { online:false };
  }
}

async function previewPairing(value) {
  const result = await chrome.runtime.sendMessage({ to: 'worker', type: 'preview-pairing', pairing: value });
  if (result?.error) throw new Error(result.error);
  if (!result?.base) throw new Error('That is not a WatchFusion source pairing link.');
  return result;
}

async function connectPairing(value, requestAccess = true) {
  const parsed = await previewPairing(value);
  if (requestAccess) {
    const granted = await chrome.permissions.request({ origins: [`${parsed.base}/*`] });
    if (!granted) throw new Error('Allow access to your WatchFusion server to connect.');
  } else if (!(await chrome.permissions.contains({ origins: [`${parsed.base}/*`] }))) {
    throw new Error('Press Connect once to approve access to this WatchFusion server.');
  }
  const tab = await currentSourceTab();
  status('Connecting…');
  const result = await chrome.runtime.sendMessage({
    to:'worker', type:'start-pairing', pairing:value, tabId:tab?.id, windowId:tab?.windowId
  });
  if (!result?.ok) throw new Error(result?.error || 'Could not link this tab.');
  $('pairing').value = '';
  await chrome.storage.local.set({ watchFusionLastBase: parsed.base });
  await chrome.storage.local.remove('watchFusionPendingPairing');
  if (!(await refreshSharing())?.linked) status('The source disconnected. Create a fresh pairing link in WatchFusion.');
}

$('connect').onclick = async () => {
  try { await connectPairing($('pairing').value.trim(), true); }
  catch (error) { status(error.message); }
};

$('sourcePlayerSilence').onclick = async () => {
  const button = $('sourcePlayerSilence');
  button.disabled = true;
  try {
    const tab = await currentSourceTab();
    const result = await chrome.runtime.sendMessage({
      to:'worker', type:'source-player-silence', tabId:tab?.id, enabled:button.dataset.enabled !== 'true'
    });
    if (!result?.ok) throw new Error(result?.error || 'Could not change source player audio.');
    await refreshSharing();
    if (result.sourcePlayerSilenced && !result.silencedMedia) status('Source player silence is on. Waiting for accessible audio or video.');
  } catch (error) { status(error.message); }
  finally { button.disabled = false; }
};

$('stats').onclick = async () => {
  try {
    const result = await refreshSharing();
    if (!result?.linked) throw new Error('No tab is currently linked.');
    const payload = JSON.stringify({
      tabMuted: result.tabMuted === true,
      sourcePlayerSilenced: result.sourcePlayerSilenced === true,
      thisTabLinked: (await currentSourceTab())?.id === result.sourceTabId,
      relayVideoMode: result.relayVideoMode || null,
      captureSettings: result.captureSettings || null,
      publisher: result.diagnostics || []
    }, null, 2);
    await navigator.clipboard.writeText(payload);
    status('Live publisher diagnostics copied.');
  } catch (error) { status(error.message); }
};

$('stop').onclick = async () => {
  try {
    const result = await chrome.runtime.sendMessage({ to: 'worker', type: 'stop' });
    if (result?.error) throw new Error(result.error);
    await refreshSharing(); status('Stopped sharing.');
  } catch (error) { status(error.message); }
};

$('siteAccess').onclick = async () => {
  try {
    const granted = await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
    if (granted) await chrome.runtime.sendMessage({ to: 'worker', type: 'refresh-probes' });
    status(granted
      ? 'Embedded-player access enabled. Cross-origin players can now expose their own media controls.'
      : 'Embedded-player access was not granted. Standalone active-tab linking still works.');
  } catch (error) { status(error.message); }
};

async function restorePreparedLink() {
  const saved = await chrome.storage.local.get('watchFusionPendingPairing');
  const value = String(saved.watchFusionPendingPairing || '');
  if (!value) return;
  $('pairing').value = value;
  try {
    const parsed = await previewPairing(value);
    const allowed = await chrome.permissions.contains({ origins: [`${parsed.base}/*`] });
    if (allowed) {
      await connectPairing(value, false);
      return;
    }
  } catch {}
  status('Prepared by EveOS Bridge. Press Connect once to approve this WatchFusion server.');
}

void refreshRuntimeStatus();
const runtimeStatusTimer = setInterval(() => void refreshRuntimeStatus(), 2000);
window.addEventListener('unload', () => clearInterval(runtimeStatusTimer));

void refreshSharing().then(result => {
  if (!result?.linked) return restorePreparedLink();
}).catch(() => restorePreparedLink());
