import { MISSION_ACCURACY_PROFILES } from "./refinement-mission-store.js";

function option(value, label) {
  const element = document.createElement("option");
  element.value = value; element.textContent = label; return element;
}

export function createRefinementMissionView() {
  const overlay = document.createElement("div");
  overlay.className = "mission-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="mission-shell" role="dialog" aria-modal="true" aria-labelledby="missionTitle">
      <header class="mission-header">
        <div>
          <p class="mission-eyebrow">One guided World Portal → Orogen → Eve loop</p>
          <h2 id="missionTitle">Refinement Mission</h2>
          <p id="missionWorld">Active world</p>
        </div>
        <button class="mission-close" type="button" aria-label="Close Refinement Mission">×</button>
      </header>
      <div class="mission-layout">
        <main class="mission-main">
          <section class="mission-card mission-card--hero">
            <div class="mission-state-row">
              <div>
                <span class="mission-stage" id="missionStage">Mission not created</span>
                <h3 id="missionName">Create a refinement mission</h3>
                <p id="missionNextText">World Portal will track the baseline, Orogen run, Eve review, accepted changes, and next input.</p>
              </div>
              <span class="mission-pass-badge" id="missionPass">Pass 0</span>
            </div>
            <button class="mission-primary-action" id="missionPrimaryAction" type="button">Create Refinement Mission</button>
            <input id="missionOrogenFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden />
          </section>

          <section class="mission-card">
            <div class="mission-section-heading">
              <h3>Mission evidence</h3>
              <span id="missionEvidenceCount">0 linked layers</span>
            </div>
            <div class="mission-metrics" id="missionMetrics"></div>
            <pre class="mission-comparison" id="missionComparison">No Orogen result comparison prepared.</pre>
          </section>

          <section class="mission-card mission-candidates" id="missionCandidatesCard">
            <div class="mission-section-heading">
              <h3>Review candidates</h3>
              <span id="missionCandidateCount">No candidates</span>
            </div>
            <p class="small-note">Clean, Hybrid, and Feature-Preserving results remain provisional until you choose one.</p>
            <label><span>Candidate</span><select id="missionCandidateSelect"></select></label>
            <pre class="mission-comparison" id="missionCandidateSummary">Generate candidates through an Eve plan or Evidence Assimilation.</pre>
            <div class="button-row">
              <button id="missionPreviewCandidate" type="button">Open candidate in Lab</button>
              <button id="missionSelectCandidate" type="button">Select for finalization</button>
            </div>
          </section>

          <section class="mission-card">
            <div class="mission-section-heading">
              <h3>Pass lineage</h3>
              <span>Nothing is overwritten</span>
            </div>
            <ol class="mission-timeline" id="missionTimeline"></ol>
          </section>
        </main>

        <aside class="mission-sidebar">
          <section class="mission-card">
            <h3>Accuracy and context</h3>
            <label><span>Mission accuracy</span><select id="missionAccuracy"></select></label>
            <p class="small-note" id="missionAccuracyDescription"></p>
            <label class="toggle-row"><input id="missionIncludeFull" type="checkbox" /><span>Include recommended full-resolution evidence for Eve</span></label>
            <label class="toggle-row"><input id="missionStrictMatching" type="checkbox" checked /><span>Require matching baseline dimensions before auto-attachment</span></label>
          </section>

          <section class="mission-card">
            <h3>Mission controls</h3>
            <div class="mission-button-stack">
              <button id="missionOpenForge" type="button">Open Heightmap Forge</button>
              <button id="missionOpenLab" type="button">Open Refinement Lab</button>
              <button id="missionOpenEve" type="button">Open Eve Guided Mode</button>
              <button id="missionReturnCheckpoint" type="button">Return to Previous Accepted Pass</button>
            </div>
          </section>

          <section class="mission-card">
            <h3>Expected Orogen return</h3>
            <ul class="mission-expected">
              <li>Land mask</li><li>Land heightmap</li><li>Satellite map</li><li>Climate map</li>
            </ul>
            <p class="small-note">Drop the files together. Filename tokens, roles, dimensions, and mission lineage are matched automatically; uncertain files remain reviewable.</p>
          </section>
          <p class="mission-status" id="missionStatus" aria-live="polite">Ready.</p>
        </aside>
      </div>
    </section>`;
  document.body.appendChild(overlay);
  const byId = (id) => overlay.querySelector(`#${id}`);
  const accuracy = byId("missionAccuracy");
  accuracy.replaceChildren(...Object.values(MISSION_ACCURACY_PROFILES).map((profile) => option(profile.id, profile.label)));
  return {
    overlay,
    close: overlay.querySelector(".mission-close"),
    world: byId("missionWorld"), stage: byId("missionStage"), name: byId("missionName"),
    pass: byId("missionPass"), nextText: byId("missionNextText"), primary: byId("missionPrimaryAction"),
    files: byId("missionOrogenFiles"), evidenceCount: byId("missionEvidenceCount"),
    metrics: byId("missionMetrics"), comparison: byId("missionComparison"), timeline: byId("missionTimeline"),
    candidateCard: byId("missionCandidatesCard"), candidateCount: byId("missionCandidateCount"),
    candidateSelect: byId("missionCandidateSelect"), candidateSummary: byId("missionCandidateSummary"),
    previewCandidate: byId("missionPreviewCandidate"), selectCandidate: byId("missionSelectCandidate"),
    accuracy, accuracyDescription: byId("missionAccuracyDescription"), includeFull: byId("missionIncludeFull"),
    strictMatching: byId("missionStrictMatching"), openForge: byId("missionOpenForge"),
    openLab: byId("missionOpenLab"), openEve: byId("missionOpenEve"),
    returnCheckpoint: byId("missionReturnCheckpoint"), status: byId("missionStatus"),
  };
}
