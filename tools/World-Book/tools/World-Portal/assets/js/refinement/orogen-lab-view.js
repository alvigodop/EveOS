function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

export const LAYER_TYPE_OPTIONS = [
  ["visual-map", "Visual map"],
  ["binary-land-mask", "Source land mask"],
  ["procedural-heightmap", "Source heightmap"],
  ["orogen-land-mask", "Orogen land mask"],
  ["orogen-land-heightmap", "Orogen land heightmap"],
  ["terrain", "Terrain / relief"],
  ["satellite", "Satellite"],
  ["climate", "Climate"],
  ["biome", "Biome"],
  ["classified-regions", "Classified regions"],
  ["repaired-mask", "Repaired mask"],
  ["composite-heightmap", "Composite heightmap"],
  ["confidence-map", "Confidence map"],
  ["custom", "Custom / unknown"],
];

export function createOrogenLabView() {
  const overlay = document.createElement("div");
  overlay.className = "orogen-lab-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="orogen-lab" role="dialog" aria-modal="true" aria-labelledby="orogenLabTitle">
      <header class="orogen-lab__header">
        <div>
          <p class="orogen-lab__eyebrow">World-owned planetary analysis</p>
          <h2 id="orogenLabTitle">Orogen Refinement Lab</h2>
          <p id="orogenLabWorld">Active world</p>
        </div>
        <button class="orogen-lab__close" type="button" aria-label="Close Orogen Refinement Lab">×</button>
      </header>
      <div class="orogen-lab__body">
        <aside class="orogen-lab__sidebar">
          <section>
            <h3>Analysis session</h3>
            <label><span>Current session</span><select id="orogenSessionSelect"></select></label>
            <label><span>New session name</span><input id="orogenSessionName" type="text" maxlength="100" placeholder="Genopgil Orogen Pass 1" /></label>
            <label><span>Orogen version or commit (optional)</span><input id="orogenSourceVersion" type="text" maxlength="80" placeholder="cc2662b4… or release tag" /></label>
            <label><span>Session notes</span><textarea id="orogenSessionNotes" rows="3" placeholder="Settings, purpose, or known problems"></textarea></label>
            <label><span>Import Orogen outputs</span><input id="orogenFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label>
            <button id="importOrogenSession" type="button">Import as analysis session</button>
            <p class="small-note">Filename roles are inferred, but every role remains editable. Unknown Orogen settings are recorded as incomplete.</p>
          </section>
          <section>
            <div class="orogen-section-title"><h3>World layer registry</h3><span id="orogenLayerCount">0 layers</span></div>
            <div class="button-row"><button id="clearOrogenLabImages" class="button--danger" type="button">Clear lab images</button></div>
            <p class="small-note">Clears imported Orogen runs and provisional refinement images together while preserving the original visual map and current canonical baseline.</p>
            <div class="orogen-layer-list" id="orogenLayerList"></div>
          </section>
        </aside>

        <main class="orogen-lab__workspace">
          <div class="orogen-compare-toolbar">
            <label><span>Layer A</span><select id="compareLayerA"></select></label>
            <label><span>Layer B</span><select id="compareLayerB"></select></label>
            <label><span>Compare mode</span><select id="compareMode">
              <option value="blend">Opacity blend</option>
              <option value="side-by-side">Side by side</option>
              <option value="swipe">Swipe</option>
              <option value="difference">Mask difference</option>
            </select></label>
            <label><span>Blend / swipe</span><input id="compareOpacity" type="range" min="0" max="1" step="0.01" value="0.5" /></label>
          </div>
          <figure class="orogen-compare-canvas">
            <canvas id="orogenCompareCanvas" width="1024" height="512"></canvas>
            <figcaption>
              <span id="orogenCompareCaption">Choose layers to compare.</span>
              <span class="orogen-difference-legend" id="orogenDifferenceLegend" hidden>
                <i class="shared"></i>Shared land <i class="source"></i>A only <i class="orogen"></i>B only
              </span>
            </figcaption>
          </figure>
          <div class="orogen-analysis-grid" id="orogenAnalysisGrid"></div>
          <details class="orogen-intelligence" open>
            <summary>Deep layer intelligence for Eve / chat</summary>
            <div class="button-row">
              <button id="copyLayerIntelligence" type="button">Copy layer report</button>
              <button id="downloadLayerIntelligence" type="button">Download report JSON</button>
            </div>
            <pre id="orogenAnalysisReport">Choose a layer to generate its full physical and provenance report.</pre>
          </details>
          <details class="orogen-intelligence lab-intelligence-panel" id="labIntelligencePanel" open>
            <summary>Lab Intelligence Overview and Agent export</summary>
            <div class="lab-intelligence-toolbar">
              <label><span>Briefing depth</span><select id="labIntelligenceMode">
                <option value="quick">Quick</option>
                <option value="balanced" selected>Balanced</option>
                <option value="forensic">Forensic</option>
              </select></label>
              <label><span>Copy format</span><select id="labIntelligenceCopyFormat">
                <option value="pretty" selected>Formatted JSON</option>
                <option value="compact">Compact JSON</option>
                <option value="markdown">Markdown JSON block</option>
              </select></label>
              <label><span>Overview filter</span><select id="labIntelligenceFilter">
                <option value="all" selected>All layers</option>
                <option value="mask">Masks</option>
                <option value="heightmap">Heightmaps</option>
                <option value="visual">Visual / satellite / terrain</option>
                <option value="canonical">Canonical only</option>
                <option value="candidate">Candidate layers</option>
                <option value="anomaly">Anomaly layers</option>
              </select></label>
              <label><span>Overview sort</span><select id="labIntelligenceSort">
                <option value="name" selected>Name</option>
                <option value="trust">Highest trust</option>
                <option value="land">Land pixels</option>
                <option value="components">Components</option>
                <option value="status">Status</option>
              </select></label>
              <label class="toggle-row"><input id="labIntelligenceFull" type="checkbox" /><span>Include recommended full-resolution assets in ZIP</span></label>
              <label><span>Layers for selected reports / comparison matrix</span><select id="labIntelligenceLayers" multiple size="7"></select></label>
            </div>
            <div class="button-grid lab-intelligence-actions">
              <button id="buildLabIntelligence" type="button">Build Intelligence Overview</button>
              <button id="copyEveBriefing" type="button">Copy Agent-Ready Briefing</button>
              <button id="copyAllLayerIntelligence" type="button">Copy All Layer Intelligence</button>
              <button id="copySessionIntelligence" type="button">Copy Current Session Intelligence</button>
              <button id="copySelectedLayerIntelligence" type="button">Copy Selected Layers</button>
              <button id="copyMissionIntelligence" type="button">Copy Mission Intelligence</button>
              <button id="copyCandidateIntelligence" type="button">Copy Candidate Intelligence</button>
              <button id="copyComparisonMatrix" type="button">Copy Comparison Matrix</button>
              <button id="copyExportAudit" type="button">Copy Export Audit</button>
              <button id="downloadEveBriefing" type="button">Download Agent Briefing JSON</button>
              <button id="downloadAllLayerIntelligence" type="button">Download Lab Intelligence JSON</button>
              <button id="downloadExportAudit" type="button">Download Export Audit JSON</button>
              <button id="downloadLabIntelligenceZip" type="button">Download Complete Intelligence ZIP</button>
              <button id="sendLabIntelligenceToEve" class="button--primary" type="button">Send Intelligence + Skill to Agent</button>
            </div>
            <p class="small-note" id="labIntelligenceCounts">No batch intelligence generated yet.</p>
            <p class="lab-intelligence-summary" id="labIntelligenceSummary">Build the overview to wrap the complete mission, evidence, candidates, comparisons, and export state into one agent-readable package.</p>
            <div class="lab-intelligence-overview" id="labIntelligenceOverview"></div>
          </details>
          <figure class="orogen-result-canvas" id="orogenResultShell" hidden>
            <canvas id="orogenResultCanvas" width="1024" height="512"></canvas>
            <figcaption id="orogenResultCaption">Provisional result</figcaption>
          </figure>
          <p class="orogen-lab__status" id="orogenLabStatus" aria-live="polite">Ready.</p>
        </main>

        <aside class="orogen-lab__tools">
          <details open>
            <summary>Mask repair and consensus</summary>
            <label><span>Pair merge mode</span><select id="maskMergeMode">
              <option value="union">Union — keep land from either</option>
              <option value="intersection">Intersection — shared land only</option>
              <option value="prefer-a">Prefer Layer A</option>
              <option value="prefer-b">Prefer Layer B</option>
            </select></label>
            <label><span>Tiny-island threshold</span><input id="refineTinyThreshold" type="number" min="1" max="100000" step="10" value="100" /></label>
            <div class="button-grid">
              <button id="buildMaskMerge" type="button">Merge A + B</button>
              <button id="buildConfidenceMap" type="button">Confidence map</button>
            </div>
            <label><span>Consensus votes</span><input id="consensusVotes" type="number" min="1" max="20" value="2" /></label>
            <button id="buildConsensusMask" type="button">Build session consensus mask</button>
            <p class="small-note">Majority consensus can reject a broken global-land pass while retaining coastlines supported by several Orogen runs.</p>
          </details>

          <details open class="evidence-assimilation-panel">
            <summary>Orogen evidence assimilation</summary>
            <p class="small-note">Keep the canonical world as the hard skeleton, then recover supported coastline character, nearby islands, ridges, terrain variation, and land-only visual evidence from provisional Orogen runs.</p>
            <label><span>Finalization style</span><select id="evidenceStylePreset">
              <option value="clean">Clean / Canonical</option>
              <option value="hybrid" selected>Hybrid / Balanced</option>
              <option value="feature">Feature-Preserving</option>
            </select></label>
            <label><span>Evidence scope</span><select id="evidenceScope">
              <option value="layer-b">Selected Layer B only</option>
              <option value="session" selected>Current analysis session</option>
              <option value="world">All trusted world evidence</option>
            </select></label>
            <div class="evidence-preset-note" id="evidencePresetNote"></div>
            <h4>Selected-layer trust</h4>
            <label><span>Evidence status</span><select id="evidenceStatus">
              <option value="canonical-safe">Canonical-safe</option>
              <option value="provisional">Provisional</option>
              <option value="anomalous-useful">Anomalous but useful</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select></label>
            <label><span>Coastline trust</span><input id="evidenceCoastlineTrust" type="range" min="0" max="1" step="0.05" value="0.75" /></label>
            <label><span>Height trust</span><input id="evidenceHeightTrust" type="range" min="0" max="1" step="0.05" value="0.8" /></label>
            <label><span>Visual trust</span><input id="evidenceVisualTrust" type="range" min="0" max="1" step="0.05" value="0.8" /></label>
            <label><span>Climate trust</span><input id="evidenceClimateTrust" type="range" min="0" max="1" step="0.05" value="0.8" /></label>
            <button id="saveEvidenceProfile" type="button">Save selected-layer trust</button>
            <h4>Coastline character</h4>
            <label><span>Coastline expansion limit (px)</span><input id="evidenceCoastlineExpansion" type="number" min="0" max="256" step="1" value="8" /></label>
            <label><span>Nearby-island distance (px)</span><input id="evidenceIslandDistance" type="number" min="0" max="1024" step="1" value="48" /></label>
            <label><span>Minimum preserved island area</span><input id="evidenceIslandArea" type="number" min="1" max="1000000" step="1" value="20" /></label>
            <label><span>Required evidence support</span><input id="evidenceSupport" type="range" min="0.05" max="1" step="0.05" value="0.45" /></label>
            <button id="buildFeatureMask" type="button">Build character-preserving mask</button>
            <h4>Interior terrain evidence</h4>
            <label><span>Evidence elevation influence</span><input id="evidenceHeightInfluence" type="range" min="0" max="1" step="0.05" value="0.58" /></label>
            <label><span>Interior detail recovery</span><input id="evidenceDetailStrength" type="range" min="0" max="2" step="0.05" value="0.75" /></label>
            <label><span>Ridge retention</span><input id="evidenceRidgeRetention" type="range" min="0" max="2" step="0.05" value="0.85" /></label>
            <label><span>Valley retention</span><input id="evidenceValleyRetention" type="range" min="0" max="2" step="0.05" value="0.65" /></label>
            <label><span>Evidence smoothing</span><input id="evidenceSmoothing" type="range" min="0" max="4" step="1" value="1" /></label>
            <label><span>Evidence contrast</span><input id="evidenceContrast" type="range" min="0.5" max="2" step="0.05" value="1.06" /></label>
            <div class="button-grid">
              <button id="buildEvidenceHeightmap" type="button">Build evidence heightmap</button>
              <button id="clipEvidenceHeightmap" type="button">Clip Layer B to coastline</button>
              <button id="extractClimateEvidence" type="button">Extract climate metadata</button>
              <button id="buildEnvironmentalZones" type="button">Build provisional environmental zones</button>
              <button id="buildLandOnlyVisual" type="button">Build land-only visual synthesis</button>
              <button id="buildEvidenceNextPass" class="button--primary" type="button">Build refined next-pass pair</button>
            </div>
            <p class="small-note">Remote specks are rejected by distance and area. Global-land masks are automatically excluded from coastline voting, while their height, climate, or satellite layers can remain useful inside the trusted coastline.</p>
          </details>

          <details open>
            <summary>Heightmap fusion</summary>
            <label><span>Orogen / Layer B influence</span><input id="heightBlendWeight" type="range" min="0" max="1" step="0.01" value="0.6" /></label>
            <label><span>Interior detail recovery</span><input id="heightDetailStrength" type="range" min="0" max="2" step="0.05" value="0.65" /></label>
            <label><span>Elevation contrast</span><input id="heightContrast" type="range" min="0.5" max="2" step="0.05" value="1" /></label>
            <label><span>Smoothing passes</span><input id="heightSmoothing" type="range" min="0" max="4" step="1" value="1" /></label>
            <label class="toggle-row"><input id="coastlineLock" type="checkbox" checked /><span>Lock canonical coastline</span></label>
            <label><span>Coastline mask</span><select id="coastlineMaskSelect"></select></label>
            <div class="button-grid">
              <button id="blendHeightmaps" type="button">Blend A + B heightmaps</button>
              <button id="medianHeightmaps" type="button">Median session heightmaps</button>
            </div>
          </details>

          <details open>
            <summary>Canonical texture synthesis</summary>
            <p class="small-note">Use Layer A as the original ocean texture, Layer B as an Orogen satellite or terrain reference, and the selected coastline mask to replace only the land.</p>
            <label><span>Derived land influence</span><input id="visualLandInfluence" type="range" min="0" max="1" step="0.01" value="1" /></label>
            <button id="synthesizeVisualMap" type="button">Synthesize refined visual map</button>
          </details>

          <details open>
            <summary>Version and promotion</summary>
            <label><span>Result name</span><input id="refinementResultName" type="text" maxlength="120" placeholder="Genopgil repaired mask" /></label>
            <label><span>Parent pass</span><select id="parentPassSelect"></select></label>
            <label><span>Pass notes</span><textarea id="refinementNotes" rows="3" placeholder="What changed and why"></textarea></label>
            <div class="button-grid">
              <button id="saveProvisionalLayer" type="button">Save provisional layer</button>
              <button id="createRefinementPass" type="button">Create refinement pass</button>
              <button id="markCanonicalLayer" type="button">Mark selected canonical</button>
              <button id="promoteVisualLayer" type="button">Use selected as visual map</button>
            </div>
          </details>

          <details>
            <summary>Export and interoperability</summary>
            <div class="button-grid">
              <button id="exportSelectedLayer" type="button">Export selected PNG</button>
              <button id="exportOrogenInputSet" type="button">Export Orogen input set</button>
            </div>
            <p class="small-note">The input set resolves the active mission candidate first, then accepted pass outputs, and uses canonical layers only as a fallback. The confirmation and manifest show the exact source IDs.</p>
          </details>
        </aside>
      </div>
    </section>`;
  document.body.appendChild(overlay);
  const byId = (id) => overlay.querySelector(`#${id}`);
  const view = {
    overlay,
    closeButton: overlay.querySelector(".orogen-lab__close"),
    worldLabel: byId("orogenLabWorld"),
    sessionSelect: byId("orogenSessionSelect"),
    sessionName: byId("orogenSessionName"),
    sourceVersion: byId("orogenSourceVersion"),
    sessionNotes: byId("orogenSessionNotes"),
    files: byId("orogenFiles"),
    importSession: byId("importOrogenSession"),
    layerCount: byId("orogenLayerCount"),
    clearImages: byId("clearOrogenLabImages"),
    layerList: byId("orogenLayerList"),
    compareA: byId("compareLayerA"),
    compareB: byId("compareLayerB"),
    compareMode: byId("compareMode"),
    compareOpacity: byId("compareOpacity"),
    compareCanvas: byId("orogenCompareCanvas"),
    compareCaption: byId("orogenCompareCaption"),
    differenceLegend: byId("orogenDifferenceLegend"),
    analysisGrid: byId("orogenAnalysisGrid"),
    analysisReport: byId("orogenAnalysisReport"),
    copyAnalysis: byId("copyLayerIntelligence"),
    downloadAnalysis: byId("downloadLayerIntelligence"),
    intelligencePanel: byId("labIntelligencePanel"),
    intelligenceMode: byId("labIntelligenceMode"),
    intelligenceCopyFormat: byId("labIntelligenceCopyFormat"),
    intelligenceFilter: byId("labIntelligenceFilter"),
    intelligenceSort: byId("labIntelligenceSort"),
    intelligenceFull: byId("labIntelligenceFull"),
    intelligenceLayers: byId("labIntelligenceLayers"),
    buildIntelligence: byId("buildLabIntelligence"),
    copyBriefing: byId("copyEveBriefing"),
    copyAllIntelligence: byId("copyAllLayerIntelligence"),
    copySessionIntelligence: byId("copySessionIntelligence"),
    copySelectedIntelligence: byId("copySelectedLayerIntelligence"),
    copyMissionIntelligence: byId("copyMissionIntelligence"),
    copyCandidateIntelligence: byId("copyCandidateIntelligence"),
    copyComparisonMatrix: byId("copyComparisonMatrix"),
    copyExportAudit: byId("copyExportAudit"),
    downloadBriefing: byId("downloadEveBriefing"),
    downloadAllIntelligence: byId("downloadAllLayerIntelligence"),
    downloadExportAudit: byId("downloadExportAudit"),
    downloadIntelligenceZip: byId("downloadLabIntelligenceZip"),
    sendIntelligenceToEve: byId("sendLabIntelligenceToEve"),
    intelligenceCounts: byId("labIntelligenceCounts"),
    intelligenceSummary: byId("labIntelligenceSummary"),
    intelligenceOverview: byId("labIntelligenceOverview"),
    resultShell: byId("orogenResultShell"),
    resultCanvas: byId("orogenResultCanvas"),
    resultCaption: byId("orogenResultCaption"),
    status: byId("orogenLabStatus"),
    evidenceStyle: byId("evidenceStylePreset"),
    evidenceScope: byId("evidenceScope"),
    evidencePresetNote: byId("evidencePresetNote"),
    evidenceStatus: byId("evidenceStatus"),
    evidenceCoastlineTrust: byId("evidenceCoastlineTrust"),
    evidenceHeightTrust: byId("evidenceHeightTrust"),
    evidenceVisualTrust: byId("evidenceVisualTrust"),
    evidenceClimateTrust: byId("evidenceClimateTrust"),
    saveEvidenceProfile: byId("saveEvidenceProfile"),
    evidenceCoastlineExpansion: byId("evidenceCoastlineExpansion"),
    evidenceIslandDistance: byId("evidenceIslandDistance"),
    evidenceIslandArea: byId("evidenceIslandArea"),
    evidenceSupport: byId("evidenceSupport"),
    buildFeatureMask: byId("buildFeatureMask"),
    evidenceHeightInfluence: byId("evidenceHeightInfluence"),
    evidenceDetailStrength: byId("evidenceDetailStrength"),
    evidenceRidgeRetention: byId("evidenceRidgeRetention"),
    evidenceValleyRetention: byId("evidenceValleyRetention"),
    evidenceSmoothing: byId("evidenceSmoothing"),
    evidenceContrast: byId("evidenceContrast"),
    buildEvidenceHeightmap: byId("buildEvidenceHeightmap"),
    clipEvidenceHeightmap: byId("clipEvidenceHeightmap"),
    extractClimateEvidence: byId("extractClimateEvidence"),
    buildEnvironmentalZones: byId("buildEnvironmentalZones"),
    buildLandOnlyVisual: byId("buildLandOnlyVisual"),
    buildEvidenceNextPass: byId("buildEvidenceNextPass"),
    maskMergeMode: byId("maskMergeMode"),
    tinyThreshold: byId("refineTinyThreshold"),
    buildMaskMerge: byId("buildMaskMerge"),
    buildConfidence: byId("buildConfidenceMap"),
    consensusVotes: byId("consensusVotes"),
    buildConsensus: byId("buildConsensusMask"),
    heightWeight: byId("heightBlendWeight"),
    heightDetail: byId("heightDetailStrength"),
    heightContrast: byId("heightContrast"),
    heightSmoothing: byId("heightSmoothing"),
    coastlineLock: byId("coastlineLock"),
    coastlineMask: byId("coastlineMaskSelect"),
    blendHeightmaps: byId("blendHeightmaps"),
    medianHeightmaps: byId("medianHeightmaps"),
    visualInfluence: byId("visualLandInfluence"),
    synthesizeVisual: byId("synthesizeVisualMap"),
    resultName: byId("refinementResultName"),
    parentPass: byId("parentPassSelect"),
    notes: byId("refinementNotes"),
    saveProvisional: byId("saveProvisionalLayer"),
    createPass: byId("createRefinementPass"),
    markCanonical: byId("markCanonicalLayer"),
    promoteVisual: byId("promoteVisualLayer"),
    exportSelected: byId("exportSelectedLayer"),
    exportInputSet: byId("exportOrogenInputSet"),
  };
  view.typeOptions = () => LAYER_TYPE_OPTIONS.map(([value, label]) => option(value, label));
  return view;
}
