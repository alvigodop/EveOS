export function createOuterToolPortView() {
  const overlay = document.createElement("div");
  overlay.className = "outer-port-overlay outer-port-overlay--parked";
  overlay.id = "outerToolPortOverlay";
  overlay.inert = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <section class="outer-port" role="dialog" aria-modal="true" aria-labelledby="outerPortTitle">
      <header class="outer-port__header">
        <div>
          <p class="outer-port__eyebrow">Outer tool port</p>
          <h2 id="outerPortTitle">World Orogen</h2>
          <p id="outerPortSubtitle">Send the canonical pair out, bring results back as evidence.</p>
        </div>
        <button id="closeOuterPort" class="outer-port__close" type="button" aria-label="Close outer tool port">×</button>
      </header>

      <div class="outer-port__sync" id="outerPortSyncRow">
        <label class="outer-port__switch">
          <input id="outerPortSync" type="checkbox" />
          <span>World sync</span>
        </label>
        <p class="outer-port__sync-state" id="outerPortSyncState">Checking world sync…</p>
        <button id="outerPortMirrorPlanet" class="outer-port__open" type="button" disabled>Mirror Planet</button>
        <button id="outerPortReloadTool" class="outer-port__open" type="button">Reload tool</button>
        <button id="outerPortPopOut" class="outer-port__open" type="button">Open in tab ↗</button>
      </div>

      <p class="outer-port__provenance" id="outerPortProvenance"></p>
      <div class="outer-port__update">
        <button id="outerPortCheckUpdate" class="outer-port__open" type="button">Check Orogen revision</button>
        <p id="outerPortUpdateState">Not checked. This never changes the pinned checkout.</p>
      </div>

      <div class="outer-port__frame-wrap" id="outerPortFrameWrap">
        <p class="outer-port__frame-state" id="outerPortFrameState">Loading the tool…</p>
      </div>

      <div class="outer-port__stages">
        <article class="outer-port__stage" id="outerPortSendStage">
          <h3>1 · Send</h3>
          <p class="outer-port__hint">Finalize the pair and open the tool.</p>
          <label>
            <span>Land mask</span>
            <select id="outerPortMask" aria-label="Land mask to send"></select>
          </label>
          <label>
            <span>Heightmap</span>
            <select id="outerPortHeightmap" aria-label="Heightmap to send"></select>
          </label>
          <p class="outer-port__pair" id="outerPortPairState"></p>
          <div class="button-row">
            <button id="outerPortSend" type="button">Finalize and open</button>
          </div>
          <label class="outer-port__check">
            <input id="outerPortDownload" type="checkbox" />
            <span id="outerPortDownloadLabel">Download files to disk</span>
          </label>
        </article>

        <article class="outer-port__stage" id="outerPortWorkStage">
          <h3>2 · Work</h3>
          <p class="outer-port__hint">The tool runs unmodified in its own embedded page.</p>
          <ol class="outer-port__steps">
            <li>Choose <strong id="outerPortSentFile">the heightmap file</strong> in the tool's import field — not the land mask.</li>
            <li><strong>Click the tool's Import button.</strong> Choosing a file only previews it; the planet does not rebuild until Import is pressed.</li>
            <li>Adjust terrain and climate, then export the layers you want back.</li>
          </ol>
          <div class="button-row">
            <button id="outerPortReopen" type="button">Import view</button>
            <button id="outerPortOpenGenerator" type="button">Generator view</button>
          </div>
          <p class="outer-port__note" id="outerPortWorkNote">World Portal relays only audited camera gestures; settings remain in this port.</p>
        </article>

        <article class="outer-port__stage" id="outerPortReturnStage">
          <h3>3 · Return</h3>
          <p class="outer-port__hint">Results land as provisional evidence.</p>
          <label>
            <span>Exported files from the tool</span>
            <input id="outerPortReturnFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple />
          </label>
          <ul class="outer-port__roles" id="outerPortRolePreview"></ul>
          <div class="button-row">
            <button id="outerPortImport" type="button">Import as evidence</button>
          </div>
          <p class="outer-port__note">Promotion to canonical stays a separate, explicit decision.</p>
        </article>
      </div>

      <p class="outer-port__status" id="outerPortStatus" aria-live="polite">Port ready.</p>
    </section>
  `;
  document.body.appendChild(overlay);

  const byId = (id) => overlay.querySelector(`#${id}`);
  const setOpen = (open) => {
    overlay.classList.toggle("outer-port-overlay--parked", !open);
    overlay.inert = !open;
    overlay.setAttribute("aria-hidden", String(!open));
  };
  return {
    overlay,
    setOpen,
    isOpen: () => !overlay.classList.contains("outer-port-overlay--parked"),
    title: byId("outerPortTitle"),
    subtitle: byId("outerPortSubtitle"),
    provenance: byId("outerPortProvenance"),
    maskSelect: byId("outerPortMask"),
    heightmapSelect: byId("outerPortHeightmap"),
    pairState: byId("outerPortPairState"),
    send: byId("outerPortSend"),
    downloadFiles: byId("outerPortDownload"),
    downloadLabel: byId("outerPortDownloadLabel"),
    syncToggle: byId("outerPortSync"),
    syncState: byId("outerPortSyncState"),
    syncRow: byId("outerPortSyncRow"),
    mirrorPlanet: byId("outerPortMirrorPlanet"),
    reloadTool: byId("outerPortReloadTool"),
    popOut: byId("outerPortPopOut"),
    checkUpdate: byId("outerPortCheckUpdate"),
    updateState: byId("outerPortUpdateState"),
    frameWrap: byId("outerPortFrameWrap"),
    frameState: byId("outerPortFrameState"),
    workNote: byId("outerPortWorkNote"),
    sentFile: byId("outerPortSentFile"),
    reopen: byId("outerPortReopen"),
    openGenerator: byId("outerPortOpenGenerator"),
    returnFiles: byId("outerPortReturnFiles"),
    rolePreview: byId("outerPortRolePreview"),
    importButton: byId("outerPortImport"),
    status: byId("outerPortStatus"),
    closeButton: byId("closeOuterPort"),
    sendStage: byId("outerPortSendStage"),
    workStage: byId("outerPortWorkStage"),
    returnStage: byId("outerPortReturnStage"),
  };
}

export function createOuterToolPanelView() {
  return {
    panel: document.getElementById("outerToolsPanel"),
    list: document.getElementById("outerToolList"),
    count: document.getElementById("outerToolCount"),
    summary: document.getElementById("outerToolSummary"),
  };
}
