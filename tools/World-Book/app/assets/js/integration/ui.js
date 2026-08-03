(function () {
  const WB = window.WorldBook;
  const Planner = WB.Integration.Planner;

  const el = {
    open: document.getElementById("integration-btn"),
    dialog: document.getElementById("integration-dialog"),
    loadFile: document.getElementById("integration-load-file-btn"),
    paste: document.getElementById("integration-paste-btn"),
    template: document.getElementById("integration-template-btn"),
    guide: document.getElementById("integration-guide-btn"),
    copyGuide: document.getElementById("integration-copy-guide-btn"),
    guidePanel: document.getElementById("integration-guide-panel"),
    guideContent: document.getElementById("integration-guide-content"),
    clear: document.getElementById("integration-clear-btn"),
    fileInput: document.getElementById("integration-file-input"),
    payload: document.getElementById("integration-payload"),
    preview: document.getElementById("integration-preview-btn"),
    previewStatus: document.getElementById("integration-preview-status"),
    planPanel: document.getElementById("integration-plan-panel"),
    planTitle: document.getElementById("integration-plan-title"),
    planSummary: document.getElementById("integration-plan-summary"),
    planCount: document.getElementById("integration-plan-count"),
    messages: document.getElementById("integration-plan-messages"),
    planList: document.getElementById("integration-plan-list"),
    historyCount: document.getElementById("integration-history-count"),
    historyList: document.getElementById("integration-history-list"),
    apply: document.getElementById("integration-apply-btn")
  };

  let currentPlan = null;

  function setPreviewStatus(message) {
    el.previewStatus.textContent = message;
  }

  function clearPreview() {
    currentPlan = null;
    el.apply.disabled = true;
    el.planPanel.hidden = true;
    el.messages.innerHTML = "";
    el.planList.innerHTML = "";
    setPreviewStatus("Nothing previewed");
  }

  function renderHistory() {
    const state = WB.AppBridge.getState();
    const records = state?.integrations?.applied || [];
    el.historyCount.textContent = `${records.length} applied`;
    el.historyList.innerHTML = "";
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "integration-message";
      empty.textContent = "No injections have been applied yet.";
      el.historyList.appendChild(empty);
      return;
    }
    records.slice(0, 30).forEach(record => {
      const row = document.createElement("div");
      row.className = "integration-history-row";
      const title = document.createElement("strong");
      title.textContent = `${record.title || record.id} · r${record.revision || 1}`;
      const meta = document.createElement("small");
      const when = record.appliedAt ? new Date(record.appliedAt).toLocaleString() : "unknown time";
      meta.textContent = `${record.changeCount || 0} changes · ${record.operationCount || 0} operations · ${when}`;
      row.append(title, meta);
      el.historyList.appendChild(row);
    });
  }

  function addMessage(text, kind) {
    const message = document.createElement("div");
    message.className = `integration-message${kind ? ` ${kind}` : ""}`;
    message.textContent = text;
    el.messages.appendChild(message);
  }

  function renderPlan(plan) {
    currentPlan = plan;
    el.planPanel.hidden = false;
    el.apply.disabled = false;
    el.planTitle.textContent = `${plan.injection.title} · revision ${plan.injection.revision}`;
    el.planSummary.textContent = `${plan.operationCount.toLocaleString()} operations from ${plan.injection.author}. Nothing is written until Apply injection is pressed.`;
    el.planCount.textContent = `${plan.changes.length.toLocaleString()} changes`;
    el.messages.innerHTML = "";
    el.planList.innerHTML = "";
    plan.warnings.forEach(warning => addMessage(warning, "warning"));
    if (!plan.warnings.length) addMessage("Validation passed. Protected user-owned entries remain untouched.");

    plan.changes.forEach(change => {
      const row = document.createElement("div");
      row.className = "integration-plan-row";
      const pill = document.createElement("span");
      pill.className = "integration-op-pill";
      pill.textContent = String(change.kind || "change").replaceAll("-", " ");
      const text = document.createElement("div");
      const path = document.createElement("strong");
      path.textContent = change.path || "World Book";
      const detail = document.createElement("small");
      detail.textContent = change.detail || "Planned change";
      text.append(path, detail);
      row.append(pill, text);
      el.planList.appendChild(row);
    });
    setPreviewStatus("Safe preview ready");
  }

  function previewPayload() {
    clearPreview();
    try {
      const text = el.payload.value.trim();
      if (!text) throw new Error("Paste or load an injection JSON first.");
      renderPlan(Planner.plan(WB.AppBridge.getState(), text));
    } catch (error) {
      el.planPanel.hidden = false;
      el.messages.innerHTML = "";
      el.planList.innerHTML = "";
      el.planTitle.textContent = "Injection cannot be applied";
      el.planSummary.textContent = "Correct the payload and preview it again.";
      el.planCount.textContent = "Invalid";
      addMessage(error.message, "error");
      setPreviewStatus("Preview failed");
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      window.alert("Injection JSON files are limited to 20 MB.");
      return;
    }
    el.payload.value = await file.text();
    clearPreview();
    setPreviewStatus(`Loaded ${file.name}`);
  }

  async function pasteClipboard() {
    try {
      el.payload.value = await navigator.clipboard.readText();
      clearPreview();
      setPreviewStatus("Pasted from clipboard");
    } catch (error) {
      window.alert(`Clipboard access failed: ${error.message}`);
    }
  }

  async function copyTemplate() {
    const text = JSON.stringify(Planner.template(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setPreviewStatus("Template copied");
    } catch (_error) {
      el.payload.value = text;
      clearPreview();
      setPreviewStatus("Template placed in the editor");
    }
  }


  function toggleGuide() {
    const opening = el.guidePanel.hidden;
    el.guidePanel.hidden = !opening;
    el.guide.textContent = opening ? "Hide guide" : "Injection guide";
    if (opening) el.guideContent.textContent = WB.Integration.Guide.text;
  }

  async function copyGuide() {
    const guide = WB.Integration.Guide.text;
    try {
      await navigator.clipboard.writeText(guide);
      setPreviewStatus("Fresh-context guide copied");
    } catch (_error) {
      el.guidePanel.hidden = false;
      el.guideContent.textContent = guide;
      setPreviewStatus("Guide opened for manual copying");
    }
  }

  async function applyPlan() {
    if (!currentPlan) return;
    const label = `${currentPlan.injection.title} revision ${currentPlan.injection.revision}`;
    const confirmed = window.confirm(`Apply ${currentPlan.changes.length.toLocaleString()} planned changes from “${label}”?\n\nA rollback is created first.`);
    if (!confirmed) return;

    el.apply.disabled = true;
    WB.AppBridge.setStatus("Creating injection rollback…");
    try {
      await WB.AppBridge.saveStateNow(true);
      const rollbackResult = await WB.API.createStateRollback(`before-eve-injection-${currentPlan.injection.id}-r${currentPlan.injection.revision}`);
      currentPlan.nextState.integrations.applied[0].appliedAt = WB.nowISO();
      WB.AppBridge.setStatus("Applying Eve injection…");
      await WB.API.saveState(currentPlan.nextState);
      await WB.AppBridge.reloadAfterRestore();
      WB.AppBridge.setStatus("Injection applied");
      el.dialog.close();
      currentPlan = null;
      const rollbackName = rollbackResult?.rollback?.name || "the automatic rollback file";
      window.alert(`Applied “${label}” safely.\n\nRollback: ${rollbackName}\nIt can be restored later through Import JSON.`);
    } catch (error) {
      console.error(error);
      WB.AppBridge.setStatus("Injection failed");
      el.apply.disabled = false;
      window.alert(`Injection failed before completion: ${error.message}`);
    }
  }

  el.open.addEventListener("click", () => {
    clearPreview();
    renderHistory();
    el.dialog.showModal();
  });
  el.loadFile.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", () => {
    loadFile(el.fileInput.files?.[0]);
    el.fileInput.value = "";
  });
  el.paste.addEventListener("click", pasteClipboard);
  el.template.addEventListener("click", copyTemplate);
  el.guide.addEventListener("click", toggleGuide);
  el.copyGuide.addEventListener("click", copyGuide);
  el.clear.addEventListener("click", () => {
    el.payload.value = "";
    clearPreview();
  });
  el.payload.addEventListener("input", clearPreview);
  el.preview.addEventListener("click", previewPayload);
  el.apply.addEventListener("click", applyPlan);
})();
