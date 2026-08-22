import { createStoredZip } from "../eve/zip-store.js";
import {
  AGENT_DIAGNOSTIC_CHECKLIST, CAPABILITY_INTENT_MAP, agentSkillManifest,
  capabilityIntentManifest, compactAgentInstructions, loadStaticSkillFile,
  modelStarterPrompt, parameterRangeManifest, staticSkillFiles,
} from "./agent-skill-runtime.js";
import { capabilityManifest } from "../eve/eve-capabilities.js";

function json(value) { return JSON.stringify(value, null, 2); }

function capabilityMarkdown() {
  const manifest = capabilityManifest();
  const lines = [
    "# Installed Capability Reference",
    "",
    "This section is generated from the installed World Portal capability manifest.",
    "If another document disagrees with this file, use this file.",
    "",
  ];
  for (const command of manifest.commands) {
    const parameters = Object.entries(command.parameters || {});
    lines.push(`## ${command.id}`, "", command.description || "No description.", "",
      `- Risk: ${command.risk || "low"}`,
      `- Confirmation: ${command.confirmation ? "required" : "not required"}`,
      `- Required inputs: ${(command.requiredInputs || []).join(", ") || "none"}`,
      `- Output: ${command.output || "implementation-defined structured result"}`);
    if (parameters.length) {
      lines.push("- Parameters:");
      for (const [name, rule] of parameters) {
        const range = rule.range ? ` [${rule.range[0]}, ${rule.range[1]}]` : "";
        const values = rule.values ? ` {${rule.values.join(", ")}}` : "";
        lines.push(`  - ${name}: ${rule.type || "value"}${range}${values}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function essentialSections() {
  const names = ["SKILL.md", "PLAN-AUTHORING.md", "WORLD-MODEL.md", "EVIDENCE-RULES.md", "MISSION-WORKFLOW.md", "SAFETY.md", "GLOSSARY.md"];
  const texts = await Promise.all(names.map(async (name) => ({ name, text: await loadStaticSkillFile(name) })));
  return texts;
}

export async function createSingleFileSkillMarkdown() {
  const sections = await essentialSections();
  const intentLines = CAPABILITY_INTENT_MAP.map((item) => (
    `- ${item.intent}: ${item.capabilities.join(", ")} · parameters: ${item.parameters.join(", ") || "none"}`
  ));
  return [
    "# World Portal Agent Skill — Portable Single-File Edition",
    "",
    `Starter prompt: ${modelStarterPrompt()}`,
    "",
    ...sections.flatMap((section) => [section.text.trim(), ""]),
    capabilityMarkdown(),
    "# Capability-to-Intent Map", "", ...intentLines, "",
    "# Diagnostic Checklist", "", ...AGENT_DIAGNOSTIC_CHECKLIST.map((item) => `- ${item}`), "",
  ].join("\n");
}

export async function createSingleFileSkillJson() {
  const sections = await essentialSections();
  return {
    format: "world-portal-agent-skill-single-file",
    version: 1,
    manifest: agentSkillManifest(),
    starterPrompt: modelStarterPrompt(),
    compactInstructions: compactAgentInstructions(),
    diagnosticChecklist: AGENT_DIAGNOSTIC_CHECKLIST,
    capabilityIntentMap: capabilityIntentManifest(),
    capabilities: capabilityManifest(),
    parameterRanges: parameterRangeManifest(),
    sections: Object.fromEntries(sections.map((section) => [section.name, section.text])),
  };
}

export async function createAgentSkillEntries({ prefix = "" } = {}) {
  const root = prefix ? `${String(prefix).replace(/\/+$/, "")}/` : "";
  const entries = [];
  for (const path of staticSkillFiles()) entries.push({ name: `${root}${path}`, data: await loadStaticSkillFile(path) });
  const manifest = agentSkillManifest();
  entries.push(
    { name: `${root}skill-manifest.json`, data: json(manifest) },
    { name: `${root}capabilities.json`, data: json(capabilityManifest()) },
    { name: `${root}parameter-ranges.json`, data: json(parameterRangeManifest()) },
    { name: `${root}intent-map.json`, data: json(capabilityIntentManifest()) },
    { name: `${root}diagnostic-checklist.json`, data: json({ format: "world-portal-agent-diagnostic-checklist", version: 1, items: AGENT_DIAGNOSTIC_CHECKLIST }) },
    { name: `${root}CAPABILITIES.md`, data: capabilityMarkdown() },
    { name: `${root}MODEL-STARTER-PROMPT.txt`, data: modelStarterPrompt() },
    { name: `${root}world-portal-agent-skill.md`, data: await createSingleFileSkillMarkdown() },
    { name: `${root}world-portal-agent-skill.json`, data: json(await createSingleFileSkillJson()) },
  );
  return { entries, manifest };
}

export async function createAgentSkillZip() {
  const { entries, manifest } = await createAgentSkillEntries();
  return { blob: await createStoredZip(entries), manifest, entries: entries.length };
}

export async function appendAgentSkillEntries(entries, { prefix = "agent-skill" } = {}) {
  const generated = await createAgentSkillEntries({ prefix });
  entries.push(...generated.entries);
  return generated;
}
