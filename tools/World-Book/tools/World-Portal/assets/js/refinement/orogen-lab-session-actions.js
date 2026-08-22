import { clearOrogenLabImages, countClearableLabLayers } from "./orogen-lab-cleanup.js";
import { importOrogenSession } from "./orogen-session-importer.js";

function resetImportForm(view) {
  view.files.value = "";
  view.sessionName.value = "";
  view.sourceVersion.value = "";
  view.sessionNotes.value = "";
}

export function createOrogenLabSessionActions({
  record, view, engine, autosave, setStatus, runTask,
  setActiveSession, clearCandidate, refresh,
}) {
  async function importFiles(files, options = {}) {
    let imported = null;
    await runTask("Importing World Orogen outputs…", async () => {
      const typedSourceVersion = view.sourceVersion.value.trim();
      const targetRecord = record();
      imported = await importOrogenSession({
        record: targetRecord,
        files,
        name: options.name ?? view.sessionName.value.trim(),
        notes: options.notes ?? view.sessionNotes.value,
        sourceVersion: options.sourceVersion ?? (typedSourceVersion || null),
        missionId: options.missionId || null,
        missionPassId: options.missionPassId || null,
        inputLayerIds: options.inputLayerIds || [],
        expectedBaselineId: options.expectedBaselineId || null,
        expectedBaseline: options.expectedBaseline || null,
        provenance: options.provenance || null,
        expectedWorldId: options.expectedWorldId || options.provenance?.worldId || targetRecord.id,
        isWorldCurrent: options.isWorldCurrent || null,
        engine,
        onProgress(fraction, message) {
          setStatus(`${message} · ${Math.round(fraction * 100)}%`);
        },
      });
      setActiveSession(imported.session.id);
      resetImportForm(view);
      await autosave.flush("Orogen analysis session imported");
      setStatus(`${imported.layers.length} Orogen layers imported into ${imported.session.name}.`);
      refresh();
    });
    return imported;
  }

  async function clearImages() {
    const count = countClearableLabLayers(record());
    if (!count) {
      setStatus("No removable lab images are present.");
      return null;
    }
    const noun = count === 1 ? "image" : "images";
    const confirmed = window.confirm(
      `Clear ${count} imported or provisional lab ${noun}? The original map and canonical baseline are preserved.`,
    );
    if (!confirmed) return null;
    const result = clearOrogenLabImages(record());
    clearCandidate();
    engine.clearCache();
    await autosave.flush("Orogen lab images cleared");
    refresh();
    setStatus(`${result.removedLayers} lab images cleared together.`);
    return result;
  }

  return { importFiles, clearImages };
}
