export function createEveGuidedView() {
  const overlay = document.createElement("div");
  overlay.className = "eve-guided-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="eve-guided" role="dialog" aria-modal="true" aria-labelledby="eveGuidedTitle">
      <header class="eve-guided__header">
        <div>
          <p class="eve-guided__eyebrow">Conversation-ready world intelligence</p>
          <h2 id="eveGuidedTitle">Eve Guided Mode</h2>
          <p id="eveGuidedWorld">Active world</p>
        </div>
        <button class="eve-guided__close" type="button" aria-label="Close Eve Guided Mode">×</button>
      </header>
      <div class="eve-guided__body">
        <section class="eve-guided__step">
          <span class="eve-guided__number">1</span>
          <div>
            <h3>Export World to Eve / Agent</h3>
            <p>Build one curated ZIP containing the world briefing, mission state, layer intelligence, provenance, evidence, previews, and the portable World Portal refinement skill.</p>
            <label><span>Context accuracy</span><select id="eveContextAccuracy">
              <option value="fast">Fast review</option><option value="balanced" selected>Balanced</option>
              <option value="high">High accuracy</option><option value="forensic">Forensic</option>
            </select></label>
            <p class="small-note" id="eveContextAccuracyDescription">Recommended context size and accuracy for normal refinement.</p>
            <label class="toggle-row"><input id="eveIncludeFullAssets" type="checkbox" /><span>Include recommended full-resolution canonical and mission evidence</span></label>
            <label class="toggle-row"><input id="eveIncludeAgentSkill" type="checkbox" checked /><span>Include portable World Portal Agent Skill</span></label>
            <button id="eveExportContext" type="button">Export World to Eve / Agent</button>
          </div>
        </section>
        <section class="eve-guided__step">
          <span class="eve-guided__number">2</span>
          <div>
            <h3>Import Agent plan</h3>
            <p>Plans are declarative JSON. The canonical format is <code>world-portal-agent-plan</code>; legacy Eve plans remain supported.</p>
            <label><span>Agent plan JSON</span><input id="evePlanFile" type="file" accept="application/json,.json,.eve-plan.json,.agent-plan.json" /></label>
            <div class="button-row">
              <button id="eveReviewPlan" type="button">Review Agent plan</button>
              <button id="eveApplyPlan" type="button" disabled>Apply validated plan</button>
            </div>
          </div>
        </section>
        <section class="eve-guided__step">
          <span class="eve-guided__number">3</span>
          <div>
            <h3>Build Selected Orogen Input</h3>
            <p>After candidate review, export the selected support-matched coastline mask, heightmap, and provenance manifest without remembering individual filenames.</p>
            <button id="eveBuildOrogenInput" type="button">Build Selected Orogen Input</button>
          </div>
        </section>
        <section class="eve-guided__step eve-agent-skill">
          <span class="eve-guided__number">A</span>
          <div>
            <h3>Agent Skill — Planetary Refinement</h3>
            <p>Portable, model-neutral instructions let a new AI conversation understand World Portal without inheriting this chat history.</p>
            <div class="button-grid">
              <button id="copyAgentInstructions" type="button">Copy Agent Instructions</button>
              <button id="copyCompactAgentInstructions" type="button">Copy Compact Instructions</button>
              <button id="copyModelStarterPrompt" type="button">Copy Model Starter Prompt</button>
              <button id="downloadAgentSkill" type="button">Download Agent Skill ZIP</button>
              <button id="downloadAgentSkillMarkdown" type="button">Download Skill Markdown</button>
              <button id="downloadAgentSkillJson" type="button">Download Skill JSON</button>
              <button id="downloadSkillContext" type="button">Download Skill + Current World Context</button>
            </div>
            <p class="small-note">Standalone skill exports contain no world-specific data. Context exports add the current world's briefing, evidence, and mission state separately.</p>
          </div>
        </section>
        <section class="eve-guided__review">
          <h3>Current bridge state</h3>
          <pre id="eveGuidedReview">No agent context has been exported in this session.</pre>
          <p id="eveGuidedStatus" aria-live="polite">Ready.</p>
        </section>
      </div>
    </section>`;
  document.body.appendChild(overlay);
  const byId = (id) => overlay.querySelector(`#${id}`);
  return {
    overlay,
    close: overlay.querySelector(".eve-guided__close"),
    world: byId("eveGuidedWorld"),
    includeFull: byId("eveIncludeFullAssets"),
    includeAgentSkill: byId("eveIncludeAgentSkill"),
    accuracy: byId("eveContextAccuracy"),
    accuracyDescription: byId("eveContextAccuracyDescription"),
    exportContext: byId("eveExportContext"),
    planFile: byId("evePlanFile"),
    reviewPlan: byId("eveReviewPlan"),
    applyPlan: byId("eveApplyPlan"),
    buildInput: byId("eveBuildOrogenInput"),
    copyAgentInstructions: byId("copyAgentInstructions"),
    copyCompactAgentInstructions: byId("copyCompactAgentInstructions"),
    copyModelStarterPrompt: byId("copyModelStarterPrompt"),
    downloadAgentSkill: byId("downloadAgentSkill"),
    downloadAgentSkillMarkdown: byId("downloadAgentSkillMarkdown"),
    downloadAgentSkillJson: byId("downloadAgentSkillJson"),
    downloadSkillContext: byId("downloadSkillContext"),
    review: byId("eveGuidedReview"),
    status: byId("eveGuidedStatus"),
  };
}
