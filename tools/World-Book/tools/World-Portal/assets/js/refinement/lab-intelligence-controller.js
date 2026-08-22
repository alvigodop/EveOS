import { ensureLayerAssets } from "../world/world-layer-store.js";
import { downloadBlob, slugify } from "./image-layer-utils.js";
import {
  buildComparisonMatrix, buildLabIntelligence, createLabIntelligenceZip,
} from "./lab-intelligence-builder.js";
import { buildEveBriefing } from "../eve/eve-briefing.js";

const CLIPBOARD_LIMIT = 8 * 1024 * 1024;

function bytesLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function selectedIds(select) {
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
}

function jsonBlob(value) {
  return new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
}

function rowCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value ?? "—";
  return cell;
}

function renderOverview(container, snapshot, filter = "all", sort = "name") {
  container.replaceChildren();
  if (!snapshot?.layers?.length) {
    container.textContent = "No layer intelligence is available.";
    return;
  }
  let visible = snapshot.layers.filter((layer) => {
    if (filter === "all") return true;
    if (["mask", "heightmap", "visual"].includes(filter)) return layer.domain === filter;
    if (filter === "canonical") return layer.isCanonical;
    if (filter === "candidate") return !!layer.candidate;
    if (filter === "anomaly") return !!layer.anomalyFlags?.length;
    return true;
  });
  const score = (layer) => Math.max(...Object.values(layer.evidence?.trust || {}).map(Number), 0);
  visible = [...visible].sort((a, b) => {
    if (sort === "trust") return score(b) - score(a);
    if (sort === "land") return Number(b.keyStatistics?.landPixelCount || b.keyStatistics?.nonzeroPixelCount || 0) - Number(a.keyStatistics?.landPixelCount || a.keyStatistics?.nonzeroPixelCount || 0);
    if (sort === "components") return Number(b.keyStatistics?.componentCount || 0) - Number(a.keyStatistics?.componentCount || 0);
    if (sort === "status") return String(a.status).localeCompare(String(b.status));
    return String(a.name).localeCompare(String(b.name));
  });
  const table = document.createElement("table");
  table.className = "lab-intelligence-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Layer", "Role", "Resolution", "State", "Trust", "Key statistics", "Candidate", "Cache"].forEach((label) => {
    const cell = document.createElement("th"); cell.textContent = label; headRow.append(cell);
  });
  head.append(headRow); table.append(head);
  const body = document.createElement("tbody");
  for (const layer of visible) {
    const stats = layer.keyStatistics || {};
    const trust = layer.evidence?.trust || {};
    const trustText = `C ${Math.round((trust.coastline || 0) * 100)} · H ${Math.round((trust.height || 0) * 100)} · V ${Math.round((trust.visual || 0) * 100)} · Cl ${Math.round((trust.climate || 0) * 100)}`;
    const key = layer.domain === "mask"
      ? `${Number(stats.landPixelCount || 0).toLocaleString()} land · ${stats.componentCount || 0} components`
      : layer.domain === "heightmap"
        ? `${stats.minimumElevation ?? "?"}–${stats.maximumElevation ?? "?"} elevation`
        : `${stats.equirectangularStatus || "visual"} · entropy ${Number(stats.colorEntropy || 0).toFixed(2)}`;
    const row = document.createElement("tr");
    row.append(
      rowCell(layer.name),
      rowCell(layer.type),
      rowCell(`${layer.width || "?"} × ${layer.height || "?"}`),
      rowCell(`${layer.status}${layer.isCanonical ? " · canonical" : ""}${layer.anomalyFlags?.length ? " · anomaly" : ""}`),
      rowCell(trustText),
      rowCell(key),
      rowCell(layer.candidate ? `${layer.candidate.candidateStyle}${layer.candidate.selected ? " · selected" : ""}` : "—"),
      rowCell(layer.cacheState),
    );
    body.append(row);
  }
  table.append(body); container.append(table);
}

export function createLabIntelligenceController({ portal, view, engine, autosave, setStatus, getActiveSessionId }) {
  let snapshot = null;
  let matrix = [];
  let busy = false;
  const record = () => portal.getActiveRecord();

  function setBusy(value) {
    busy = !!value;
    view.intelligencePanel.classList.toggle("is-busy", busy);
  }

  function refreshLayerChoices() {
    const assets = ensureLayerAssets(record());
    const sessionId = getActiveSessionId?.() || "";
    const source = sessionId
      ? assets.layers.filter((layer) => layer.sessionId === sessionId)
      : assets.layers;
    const prior = new Set(selectedIds(view.intelligenceLayers));
    view.intelligenceLayers.replaceChildren(...source.map((layer) => {
      const option = document.createElement("option");
      option.value = layer.id;
      option.textContent = `${layer.name} · ${layer.type}`;
      option.selected = prior.has(layer.id);
      return option;
    }));
    view.intelligenceCounts.textContent = `${assets.layers.length} layers · ${assets.analysisSessions.length} sessions · ${assets.refinementPasses.length} passes`;
  }

  async function copyValue(value, label) {
    const format = view.intelligenceCopyFormat.value;
    const base = typeof value === "string"
      ? value
      : JSON.stringify(value, null, format === "compact" ? 0 : 2);
    const text = format === "markdown" ? `\`\`\`json\n${base}\n\`\`\`` : base;
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > CLIPBOARD_LIMIT) {
      throw new Error(`${label} is ${bytesLabel(bytes)}. Use compact JSON or download the complete intelligence ZIP; nothing was truncated.`);
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied as structured JSON.`);
    } catch {
      downloadBlob(new Blob([text], { type: "application/json" }), `${slugify(record().name)}-${slugify(label)}.json`);
      setStatus("Clipboard access was unavailable, so the JSON was downloaded instead.");
    }
  }

  async function build({ selectedOnly = false, comparisons = false } = {}) {
    const layerIds = selectedOnly ? selectedIds(view.intelligenceLayers) : [];
    setBusy(true);
    try {
      snapshot = await buildLabIntelligence({
        record: record(),
        engine,
        layerIds,
        mode: view.intelligenceMode.value,
        includeComparisons: comparisons,
        onProgress(progress, label) {
          setStatus(`${label} · ${Math.round(progress * 100)}%`);
        },
      });
      matrix = snapshot.comparisons || [];
      const assets = ensureLayerAssets(record());
      assets.labIntelligence = {
        generatedAt: snapshot.createdAt,
        mode: snapshot.mode,
        includedLayerIds: snapshot.layers.map((layer) => layer.id),
        comparisonCount: matrix.length,
      };
      autosave.schedule("Lab intelligence refreshed");
      renderOverview(view.intelligenceOverview, snapshot, view.intelligenceFilter.value, view.intelligenceSort.value);
      view.intelligenceSummary.textContent = snapshot.eveBriefing.plainLanguageBrief;
      view.intelligenceCounts.textContent = `${snapshot.layers.length} layers · ${snapshot.candidates.length} candidates · ${matrix.length} comparisons`;
      setStatus("Lab intelligence overview ready.");
      return snapshot;
    } finally {
      setBusy(false);
    }
  }

  async function requireSnapshot() {
    return snapshot || build();
  }

  async function comparisonMatrix() {
    const ids = selectedIds(view.intelligenceLayers);
    if (ids.length < 2) throw new Error("Select at least two compatible layers for a comparison matrix.");
    setBusy(true);
    try {
      matrix = await buildComparisonMatrix(record(), engine, ids, (progress, label) => {
        setStatus(`${label} · ${Math.round(progress * 100)}%`);
      });
      if (snapshot) snapshot.comparisons = matrix;
      setStatus(`${matrix.length} compatible layer comparisons generated.`);
      return matrix;
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() { return copyValue(await requireSnapshot(), "All layer intelligence"); }
  async function copySelected() {
    const ids = selectedIds(view.intelligenceLayers);
    if (!ids.length) throw new Error("Select one or more layers first.");
    const data = await buildLabIntelligence({
      record: record(), engine, layerIds: ids, mode: view.intelligenceMode.value,
      onProgress(progress, label) { setStatus(`${label} · ${Math.round(progress * 100)}%`); },
    });
    return copyValue(data, "Selected layer intelligence");
  }
  async function copySession() {
    const data = await requireSnapshot();
    const sessionId = getActiveSessionId?.() || data.sessions.at(-1)?.id || null;
    const session = data.sessions.find((item) => item.id === sessionId) || null;
    const layers = data.layers.filter((layer) => layer.sessionId === sessionId);
    return copyValue({ session, layers }, "Current session intelligence");
  }
  async function copyCandidates() {
    const data = await requireSnapshot();
    return copyValue(data.candidates, "Candidate intelligence");
  }
  async function copyMission() {
    const data = await requireSnapshot();
    return copyValue({ missions: data.missions, candidates: data.candidates, exportAudits: data.exportAudits }, "Mission intelligence");
  }
  async function copyMatrix() { return copyValue(matrix.length ? matrix : await comparisonMatrix(), "Comparison matrix"); }
  async function copyAudit() {
    const data = await requireSnapshot();
    return copyValue(data.exportAudits.at(-1) || { status: "no-export-audit" }, "Export audit");
  }
  async function copyBriefing() {
    const data = await requireSnapshot();
    const briefing = buildEveBriefing({ record: record(), comparisonSummary: data.comparisons, settings: data.currentSettings, mode: data.mode });
    briefing.availableCapabilities = data.eveBriefing.availableCapabilities;
    briefing.parameterRanges = data.eveBriefing.parameterRanges;
    return copyValue(briefing, "Agent briefing");
  }

  async function downloadSnapshot() {
    const data = await requireSnapshot();
    downloadBlob(jsonBlob(data), `${slugify(record().name)}-lab-intelligence.json`);
    setStatus("Complete lab intelligence JSON downloaded.");
  }
  async function downloadBriefing() {
    const data = await requireSnapshot();
    downloadBlob(jsonBlob(data.eveBriefing), `${slugify(record().name)}-agent-briefing.json`);
    setStatus("Agent briefing JSON downloaded.");
  }
  async function downloadAudit() {
    const data = await requireSnapshot();
    downloadBlob(jsonBlob(data.exportAudits.at(-1) || { status: "no-export-audit" }), `${slugify(record().name)}-export-audit.json`);
    setStatus("Export audit JSON downloaded.");
  }
  async function downloadZip() {
    const data = await requireSnapshot();
    setBusy(true);
    try {
      const result = await createLabIntelligenceZip({
        record: record(),
        snapshot: data,
        mode: view.intelligenceMode.value,
        includeFullResolution: view.intelligenceFull.checked,
        onProgress(progress, label) { setStatus(`${label} · ${Math.round(progress * 100)}%`); },
      });
      downloadBlob(result.blob, `${slugify(record().name)}-lab-intelligence.zip`);
      view.intelligenceCounts.textContent = `${result.counts.layers} layers · ${result.counts.previews} previews · ${result.counts.fullResolutionAssets} full assets · ${result.validation.valid ? "valid" : "invalid"}`;
      setStatus("Complete agent-ready lab intelligence + skill ZIP downloaded.");
    } finally {
      setBusy(false);
    }
  }

  const actions = [
    [view.buildIntelligence, () => build()],
    [view.copyBriefing, copyBriefing],
    [view.copyAllIntelligence, copyAll],
    [view.copySessionIntelligence, copySession],
    [view.copySelectedIntelligence, copySelected],
    [view.copyMissionIntelligence, copyMission],
    [view.copyCandidateIntelligence, copyCandidates],
    [view.copyComparisonMatrix, copyMatrix],
    [view.copyExportAudit, copyAudit],
    [view.downloadBriefing, downloadBriefing],
    [view.downloadAllIntelligence, downloadSnapshot],
    [view.downloadExportAudit, downloadAudit],
    [view.downloadIntelligenceZip, downloadZip],
    [view.sendIntelligenceToEve, downloadZip],
  ];
  for (const [button, action] of actions) button.addEventListener("click", async () => {
    if (busy) return;
    try { await action(); } catch (error) { console.error(error); setStatus(error?.message || String(error), true); }
  });
  view.intelligenceMode.addEventListener("change", () => { snapshot = null; });
  for (const control of [view.intelligenceFilter, view.intelligenceSort]) {
    control.addEventListener("change", () => {
      if (snapshot) renderOverview(view.intelligenceOverview, snapshot, view.intelligenceFilter.value, view.intelligenceSort.value);
    });
  }
  refreshLayerChoices();
  return {
    refresh() {
      refreshLayerChoices();
      if (snapshot) renderOverview(view.intelligenceOverview, snapshot, view.intelligenceFilter.value, view.intelligenceSort.value);
    },
    clearCache() { snapshot = null; matrix = []; },
  };
}
