import { downloadBlob } from "../refinement/image-layer-utils.js";
import {
  compactAgentInstructions, modelStarterPrompt,
} from "./agent-skill-runtime.js";
import {
  createAgentSkillZip, createSingleFileSkillJson, createSingleFileSkillMarkdown,
} from "./agent-skill-exporter.js";

function textBlob(text, type = "text/plain") { return new Blob([text], { type }); }

async function copyText(text, setStatus, label) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`${label} copied.`);
  } catch {
    downloadBlob(textBlob(text), "world-portal-agent-instructions.txt");
    setStatus("Clipboard access was unavailable, so the instructions were downloaded instead.");
  }
}

export function createAgentSkillController({ view, setStatus, exportWorldContext }) {
  let busy = false;
  async function run(action) {
    if (busy) return;
    busy = true;
    const controls = [
      view.copyAgentInstructions, view.copyCompactAgentInstructions, view.copyModelStarterPrompt,
      view.downloadAgentSkill, view.downloadAgentSkillMarkdown, view.downloadAgentSkillJson,
      view.downloadSkillContext,
    ].filter(Boolean);
    controls.forEach((control) => { control.disabled = true; });
    try { await action(); } catch (error) { console.error(error); setStatus(error?.message || String(error), true); }
    finally { busy = false; controls.forEach((control) => { control.disabled = false; }); }
  }

  view.copyAgentInstructions?.addEventListener("click", () => run(async () => {
    await copyText(await createSingleFileSkillMarkdown(), setStatus, "Agent instructions");
  }));
  view.copyCompactAgentInstructions?.addEventListener("click", () => run(async () => {
    await copyText(compactAgentInstructions(), setStatus, "Compact agent instructions");
  }));
  view.copyModelStarterPrompt?.addEventListener("click", () => run(async () => {
    await copyText(modelStarterPrompt(), setStatus, "Model starter prompt");
  }));
  view.downloadAgentSkill?.addEventListener("click", () => run(async () => {
    const result = await createAgentSkillZip();
    downloadBlob(result.blob, "world-portal-refinement-skill.zip");
    setStatus(`Portable agent skill downloaded (${result.entries} files).`);
  }));
  view.downloadAgentSkillMarkdown?.addEventListener("click", () => run(async () => {
    downloadBlob(textBlob(await createSingleFileSkillMarkdown(), "text/markdown"), "world-portal-agent-skill.md");
    setStatus("Single-file agent skill Markdown downloaded.");
  }));
  view.downloadAgentSkillJson?.addEventListener("click", () => run(async () => {
    downloadBlob(textBlob(JSON.stringify(await createSingleFileSkillJson(), null, 2), "application/json"), "world-portal-agent-skill.json");
    setStatus("Single-file agent skill JSON downloaded.");
  }));
  view.downloadSkillContext?.addEventListener("click", () => run(async () => {
    await exportWorldContext({ forceAgentSkill: true });
  }));

  return {
    get includeInContext() { return view.includeAgentSkill?.checked !== false; },
    starterPrompt: modelStarterPrompt,
  };
}
