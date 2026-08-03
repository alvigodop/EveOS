(function () {
  const WB = window.WorldBook;
  const bridge = WB.AppBridge;
  if (!bridge) throw new Error("World Book app bridge was not initialized.");

  const els = {
    backupButton: document.getElementById("export-btn"),
    importButton: document.getElementById("import-btn"),
    importInput: document.getElementById("import-input"),
    center: document.getElementById("recovery-center-dialog"),
    portable: document.getElementById("portable-snapshot-btn"),
    full: document.getElementById("full-recovery-btn"),
    zipChoose: document.getElementById("choose-recovery-zip-btn"),
    zipInput: document.getElementById("recovery-zip-input"),
    zipStatus: document.getElementById("recovery-inspection-status"),
    restorePanel: document.getElementById("recovery-restore-panel"),
    restoreSummary: document.getElementById("recovery-restore-summary"),
    restoreMode: document.getElementById("recovery-restore-mode"),
    destination: document.getElementById("recovery-destination-path"),
    destinationRow: document.getElementById("recovery-destination-row"),
    conflict: document.getElementById("recovery-conflict-policy"),
    conflictRow: document.getElementById("recovery-conflict-row"),
    restore: document.getElementById("confirm-recovery-restore-btn"),
    jsonDialog: document.getElementById("json-import-dialog"),
    jsonSummary: document.getElementById("json-import-summary"),
    jsonMode: document.getElementById("json-import-mode"),
    jsonConfirm: document.getElementById("confirm-json-import-btn")
  };

  let inspectedUpload = null;
  let pendingJSON = null;

  function download(payload) {
    const url = URL.createObjectURL(payload.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function portableSnapshot() {
    bridge.setStatus("Preparing portable snapshot…");
    try {
      await bridge.saveStateNow(true);
      download(await WB.API.exportSnapshot());
      bridge.setStatus("Portable snapshot exported");
    } catch (error) {
      bridge.setStatus("Snapshot export failed");
      window.alert(error.message);
    }
  }

  async function fullRecoveryBackup() {
    bridge.setStatus("Building exact recovery backup…");
    els.full.disabled = true;
    try {
      await bridge.saveStateNow(true);
      download(await WB.API.exportRecoveryBackup());
      bridge.setStatus("Full recovery backup exported");
    } catch (error) {
      bridge.setStatus("Recovery backup failed");
      window.alert(error.message);
    } finally {
      els.full.disabled = false;
    }
  }

  function recoveryDestination(original) {
    const clean = String(original || "").replace(/[\\/]+$/, "");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    return clean ? `${clean}-Recovered-${stamp}` : `Eve-WorldBook-Recovered-${stamp}`;
  }

  function renderInspection(payload) {
    inspectedUpload = payload;
    const info = payload.inspection;
    const workspace = info.workspace || {};
    const skipped = (info.skipped || []).length;
    els.zipStatus.className = `recovery-status ${info.integrityOk ? "success" : "danger"}`;
    els.zipStatus.textContent = info.integrityOk
      ? `Verified ${info.verifiedFiles.toLocaleString()} exact files. ${skipped ? `${skipped} source items were skipped when this backup was made.` : "No source items were skipped."}`
      : `Integrity failed: ${(info.failures || []).join("; ")}`;
    els.restoreSummary.innerHTML = `
      <strong>${WB.escapeHTML(info.project?.title || "World Book")}</strong>
      <span>Created ${WB.escapeHTML(new Date(info.createdAt).toLocaleString())}</span>
      <span>${Number(workspace.fileCount || 0).toLocaleString()} files · ${Number(workspace.totalBytes || 0).toLocaleString()} bytes</span>
      <span>Original workspace: ${WB.escapeHTML(info.originalWorkspacePath || "Unknown")}</span>
    `;
    els.destination.value = recoveryDestination(info.originalWorkspacePath);
    els.restorePanel.hidden = !info.integrityOk;
    updateRestoreRows();
  }

  async function inspectZIP(file) {
    bridge.setStatus("Verifying recovery backup…");
    els.zipStatus.className = "recovery-status";
    els.zipStatus.textContent = "Reading manifest and verifying SHA-256 checksums…";
    els.restorePanel.hidden = true;
    try {
      const payload = await WB.API.inspectRecoveryBackup(file);
      renderInspection(payload);
      bridge.setStatus("Recovery backup verified");
    } catch (error) {
      inspectedUpload = null;
      els.zipStatus.className = "recovery-status danger";
      els.zipStatus.textContent = error.message;
      bridge.setStatus("Recovery verification failed");
    } finally {
      els.zipInput.value = "";
    }
  }

  function updateRestoreRows() {
    const mode = els.restoreMode.value;
    const needsFiles = mode === "physical" || mode === "everything";
    els.destinationRow.hidden = !needsFiles;
    els.conflictRow.hidden = !needsFiles;
  }

  async function restoreZIP() {
    if (!inspectedUpload) return;
    const mode = els.restoreMode.value;
    const warning = mode === "physical"
      ? "Restore the exact physical workspace files into the selected folder?"
      : "Restore active World Book data? A rollback JSON will be created first.";
    if (!window.confirm(warning)) return;
    bridge.setStatus("Restoring and verifying backup…");
    els.restore.disabled = true;
    try {
      const result = await WB.API.restoreRecoveryBackup({
        uploadId: inspectedUpload.uploadId,
        mode,
        destinationPath: els.destination.value.trim(),
        conflictPolicy: els.conflict.value
      });
      await bridge.reloadAfterRestore();
      els.center.close();
      bridge.setStatus("Recovery restore complete");
      window.alert(`${result.message}${result.destinationPath ? `\nRestored workspace: ${result.destinationPath}` : ""}`);
    } catch (error) {
      bridge.setStatus("Recovery restore failed");
      window.alert(error.message);
    } finally {
      els.restore.disabled = false;
    }
  }

  function classifyJSON(snapshot) {
    if (snapshot?.physicalSnapshot && snapshot?.worldBookState) return "full-snapshot";
    if (snapshot?.virtualRoot && snapshot?.fileMeta) return "state";
    if (snapshot?.root) return "legacy";
    return "unknown";
  }

  async function chooseJSON(file) {
    try {
      pendingJSON = JSON.parse(await file.text());
      const kind = classifyJSON(pendingJSON);
      if (kind === "unknown") throw new Error("Unrecognized World Book JSON format.");
      const project = pendingJSON.project || pendingJSON.worldBookState?.project || {};
      els.jsonSummary.textContent = `${project.title || "World Book"} · ${kind.replace("-", " ")}`;
      els.jsonMode.innerHTML = "";
      const options = kind === "full-snapshot"
        ? [["archive", "Archive under Imports"], ["restore-worldbook", "Restore active virtual World Book"], ["restore-state", "Restore complete app state"]]
        : [["restore-state", "Restore active app state"]];
      options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        els.jsonMode.appendChild(option);
      });
      els.jsonDialog.showModal();
    } catch (error) {
      pendingJSON = null;
      window.alert(`Import failed: ${error.message}`);
    } finally {
      els.importInput.value = "";
    }
  }

  async function confirmJSONImport() {
    if (!pendingJSON) return;
    const mode = els.jsonMode.value;
    if (mode !== "archive" && !window.confirm("Replace active World Book data with this JSON? A rollback copy will be saved first.")) return;
    bridge.setStatus("Importing JSON…");
    els.jsonConfirm.disabled = true;
    try {
      const result = await WB.API.importSnapshot(pendingJSON, mode);
      await bridge.reloadAfterRestore();
      pendingJSON = null;
      els.jsonDialog.close();
      bridge.setStatus("JSON import complete");
      window.alert(result.message || "Import complete.");
    } catch (error) {
      bridge.setStatus("JSON import failed");
      window.alert(error.message);
    } finally {
      els.jsonConfirm.disabled = false;
    }
  }

  els.backupButton.addEventListener("click", () => els.center.showModal());
  els.importButton.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", () => {
    const file = els.importInput.files?.[0];
    if (file) chooseJSON(file);
  });
  els.portable.addEventListener("click", portableSnapshot);
  els.full.addEventListener("click", fullRecoveryBackup);
  els.zipChoose.addEventListener("click", () => els.zipInput.click());
  els.zipInput.addEventListener("change", () => {
    const file = els.zipInput.files?.[0];
    if (file) inspectZIP(file);
  });
  els.restoreMode.addEventListener("change", updateRestoreRows);
  els.restore.addEventListener("click", restoreZIP);
  els.jsonConfirm.addEventListener("click", confirmJSONImport);
})();
