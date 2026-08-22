function option(value, label) {
  return `<option value="${value}">${label}</option>`;
}

export function createHeightmapForgeView() {
  const overlay = document.createElement("div");
  overlay.className = "heightmap-forge-overlay";
  overlay.id = "heightmapForgeOverlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="heightmap-forge" role="dialog" aria-modal="true" aria-labelledby="heightmapForgeTitle">
      <header class="heightmap-forge__header">
        <div>
          <p class="heightmap-forge__eyebrow">World Portal tool</p>
          <h2 id="heightmapForgeTitle">Heightmap Forge</h2>
          <p id="heightmapForgeWorld">Preparing the active world for World Orogen.</p>
        </div>
        <button id="closeHeightmapForge" class="heightmap-forge__close" type="button" aria-label="Close Heightmap Forge">×</button>
      </header>

      <div class="heightmap-forge__body">
        <div class="heightmap-forge__previews">
          <figure class="heightmap-preview heightmap-preview--source">
            <figcaption>
              <strong>Original visual map</strong>
              <span>Click ocean to sample its color</span>
            </figcaption>
            <canvas id="heightmapSourceCanvas" width="1024" height="512"></canvas>
          </figure>
          <div class="heightmap-preview-grid">
            <figure class="heightmap-preview">
              <figcaption><strong>Land mask</strong><span>White land · exact-black ocean</span></figcaption>
              <canvas id="heightmapMaskCanvas" width="512" height="256"></canvas>
            </figure>
            <figure class="heightmap-preview">
              <figcaption><strong>Elevation heightmap</strong><span>Brightness becomes elevation</span></figcaption>
              <canvas id="heightmapOutputCanvas" width="512" height="256"></canvas>
            </figure>
          </div>
          <p class="heightmap-forge__status" id="heightmapForgeStatus" aria-live="polite">Open the tool to load the active world.</p>
        </div>

        <aside class="heightmap-forge__controls">
          <details open>
            <summary>Source and normalization</summary>
            <dl class="heightmap-source-facts">
              <div><dt>World</dt><dd id="heightmapWorldName">—</dd></div>
              <div><dt>Source</dt><dd id="heightmapSourceDimensions">—</dd></div>
              <div><dt>Aspect</dt><dd id="heightmapAspectStatus">—</dd></div>
            </dl>
            <label><span>Output resolution</span>
              <select id="heightmapResolution">
                ${option("2048x1024", "2048 × 1024")}
                ${option("4096x2048", "4096 × 2048 · recommended")}
                ${option("8192x4096", "8192 × 4096 · high memory")}
              </select>
            </label>
            <label><span>When source is not 2:1</span>
              <select id="heightmapNormalizationMode">
                ${option("stretch", "Stretch to 2:1")}
                ${option("crop", "Crop center to 2:1")}
                ${option("pad", "Pad to 2:1")}
              </select>
            </label>
            <button id="heightmapReloadSource" type="button">Restore original source</button>
          </details>

          <details open>
            <summary>Land detection</summary>
            <label><span>Ocean reference color</span><input id="heightmapOceanColor" type="color" value="#075f94" /></label>
            <label><span>Ocean color tolerance <output id="heightmapToleranceValue">72</output></span>
              <input id="heightmapTolerance" type="range" min="0" max="220" step="1" value="72" />
            </label>
            <label class="toggle-row"><input id="heightmapConnectedOnly" type="checkbox" checked /><span>Connected ocean only</span></label>
            <label class="toggle-row"><input id="heightmapEdgeSeeds" type="checkbox" checked /><span>Use map edges as ocean seeds</span></label>
            <label class="toggle-row"><input id="heightmapInvertMask" type="checkbox" /><span>Invert land and ocean</span></label>
            <label><span>Remove islands smaller than</span><input id="heightmapMinIsland" type="number" min="0" max="1000000" step="10" value="250" /></label>
            <label class="toggle-row"><input id="heightmapKeepLargest" type="checkbox" /><span>Keep only largest landmass</span></label>
            <label><span>Fill land holes smaller than</span><input id="heightmapMaxHole" type="number" min="0" max="1000000" step="10" value="160" /></label>
            <label><span>Coast smoothing passes <output id="heightmapSmoothValue">1</output></span>
              <input id="heightmapSmooth" type="range" min="0" max="3" step="1" value="1" />
            </label>
          </details>

          <details open>
            <summary>Procedural elevation</summary>
            <label><span>Coast height <output id="heightmapCoastValue">16</output></span>
              <input id="heightmapCoast" type="range" min="1" max="64" step="1" value="16" />
            </label>
            <label><span>Inland elevation <output id="heightmapInlandValue">120</output></span>
              <input id="heightmapInland" type="range" min="0" max="230" step="1" value="120" />
            </label>
            <label><span>Coastal falloff <output id="heightmapFalloffValue">0.80</output></span>
              <input id="heightmapFalloff" type="range" min="0.2" max="3" step="0.05" value="0.8" />
            </label>
            <label><span>Terrain roughness <output id="heightmapRoughnessValue">24</output></span>
              <input id="heightmapRoughness" type="range" min="0" max="100" step="1" value="24" />
            </label>
            <label><span>Noise scale <output id="heightmapNoiseValue">28</output></span>
              <input id="heightmapNoise" type="range" min="2" max="128" step="1" value="28" />
            </label>
            <label><span>Deterministic seed</span><input id="heightmapSeed" type="number" step="1" value="1337" /></label>
            <button id="heightmapGeneratePreview" type="button">Generate preview</button>
          </details>

          <details open>
            <summary>Validation and output</summary>
            <div class="heightmap-validation" id="heightmapValidation">
              <strong>Not generated</strong>
              <span>Generate a preview to validate the mask and elevation.</span>
            </div>
            <div class="heightmap-output-actions">
              <button id="heightmapExport" type="button">Export heightmap PNG</button>
              <button id="heightmapExportMask" type="button">Export land mask PNG</button>
              <button id="heightmapSaveWorld" type="button">Save to active world</button>
              <button id="heightmapSendOrogen" type="button">Send to Orogen</button>
            </div>
            <p class="heightmap-license-note">
              Heightmap Forge is World Portal code. World Orogen remains an optional external GPLv3 module connected through an adapter boundary.
            </p>
          </details>
        </aside>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  const byId = (id) => overlay.querySelector(`#${id}`);
  return {
    overlay,
    closeButton: byId("closeHeightmapForge"),
    worldLabel: byId("heightmapForgeWorld"),
    worldName: byId("heightmapWorldName"),
    sourceDimensions: byId("heightmapSourceDimensions"),
    aspectStatus: byId("heightmapAspectStatus"),
    sourceCanvas: byId("heightmapSourceCanvas"),
    maskCanvas: byId("heightmapMaskCanvas"),
    outputCanvas: byId("heightmapOutputCanvas"),
    status: byId("heightmapForgeStatus"),
    resolution: byId("heightmapResolution"),
    normalizationMode: byId("heightmapNormalizationMode"),
    reloadSource: byId("heightmapReloadSource"),
    oceanColor: byId("heightmapOceanColor"),
    tolerance: byId("heightmapTolerance"),
    toleranceValue: byId("heightmapToleranceValue"),
    connectedOnly: byId("heightmapConnectedOnly"),
    edgeSeeds: byId("heightmapEdgeSeeds"),
    invertMask: byId("heightmapInvertMask"),
    minimumIslandArea: byId("heightmapMinIsland"),
    keepLargest: byId("heightmapKeepLargest"),
    maximumHoleArea: byId("heightmapMaxHole"),
    smoothPasses: byId("heightmapSmooth"),
    smoothValue: byId("heightmapSmoothValue"),
    coastHeight: byId("heightmapCoast"),
    coastValue: byId("heightmapCoastValue"),
    inlandStrength: byId("heightmapInland"),
    inlandValue: byId("heightmapInlandValue"),
    falloffExponent: byId("heightmapFalloff"),
    falloffValue: byId("heightmapFalloffValue"),
    roughness: byId("heightmapRoughness"),
    roughnessValue: byId("heightmapRoughnessValue"),
    noiseScale: byId("heightmapNoise"),
    noiseValue: byId("heightmapNoiseValue"),
    seed: byId("heightmapSeed"),
    generatePreview: byId("heightmapGeneratePreview"),
    validation: byId("heightmapValidation"),
    exportHeightmap: byId("heightmapExport"),
    exportMask: byId("heightmapExportMask"),
    saveWorld: byId("heightmapSaveWorld"),
    sendOrogen: byId("heightmapSendOrogen"),
  };
}
