function buildBulkUi() {
  const body = document.querySelector(".media-conversion-body");
  const singleForm = document.getElementById("youtubePianoForm");
  if (!body || !singleForm) return null;
  const mode = document.createElement("div");
  mode.className = "bulk-conversion-mode";
  mode.innerHTML = `<label><input id="bulkConversionMode" type="checkbox"> <strong>Bulk conversion</strong></label><span>Queue multiple media URLs without overwriting the Sheet Player.</span>`;
  singleForm.insertAdjacentElement("beforebegin", mode);
  const panel = document.createElement("section");
  panel.className = "bulk-conversion-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <textarea id="bulkConversionUrls" rows="5" spellcheck="false" placeholder="Paste multiple URLs — one per line, or comma-separated.\nhttps://youtu.be/...\nhttps://youtube.com/watch?v=..."></textarea>
    <div class="bulk-conversion-actions">
      <button type="button" class="primary" id="bulkQueueBtn">Queue conversions</button>
      <button type="button" class="ghost" id="bulkClearFinishedBtn">Clear finished</button>
      <span id="bulkQueueSummary">0 queued</span>
    </div>
    <div id="bulkConversionQueue" class="bulk-conversion-queue" aria-live="polite"></div>`;
  singleForm.insertAdjacentElement("afterend", panel);
  return { singleForm, mode, panel };
}

function urlsFrom(value) {
  const found = String(value || "").match(/https?:\/\/[^\s,]+/gi) || [];
  return [...new Set(found.map(url => url.trim()).filter(Boolean))];
}

function shortUrl(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`.slice(0, 90);
  } catch (_) {
    return String(value || "").slice(0, 90);
  }
}

export function setupBulkConversion({ youtubePiano, workspace }) {
  const ui = buildBulkUi();
  if (!ui) return { enqueue() {} };
  const toggle = document.getElementById("bulkConversionMode");
  const input = document.getElementById("bulkConversionUrls");
  const queueButton = document.getElementById("bulkQueueBtn");
  const clearButton = document.getElementById("bulkClearFinishedBtn");
  const summary = document.getElementById("bulkQueueSummary");
  const queueHost = document.getElementById("bulkConversionQueue");
  const jobs = [];
  let processing = false;

  function syncMode() {
    const enabled = toggle.checked;
    ui.panel.hidden = !enabled;
    ui.singleForm.hidden = enabled;
    ui.mode.classList.toggle("is-active", enabled);
    if (enabled) input.focus();
  }

  function renderSummary() {
    const waiting = jobs.filter(job => job.state === "queued").length;
    const active = jobs.filter(job => job.state === "working").length;
    const ready = jobs.filter(job => job.state === "ready").length;
    const review = jobs.filter(job => job.state === "review").length;
    summary.textContent = `${waiting} queued${active ? ` · ${active} converting` : ""}${ready ? ` · ${ready} ready` : ""}${review ? ` · ${review} review` : ""}`;
  }

  function updateCard(job) {
    if (!job.node) return;
    job.node.dataset.state = job.state;
    job.node.querySelector("[data-bulk-state]").textContent = job.message;
    job.node.querySelector("[data-bulk-spinner]").hidden = job.state !== "working";
    renderSummary();
  }

  function card(job, index) {
    const node = document.createElement("article"); node.className = "bulk-conversion-item"; node.dataset.state = job.state;
    const number = document.createElement("div"); number.className = "bulk-conversion-index"; number.textContent = String(index + 1);
    const copy = document.createElement("div"); copy.className = "bulk-conversion-copy";
    const title = document.createElement("strong"); title.textContent = shortUrl(job.url);
    const url = document.createElement("span"); url.textContent = job.url; url.title = job.url;
    const state = document.createElement("small"); state.dataset.bulkState = ""; state.textContent = job.message;
    const spinner = document.createElement("i"); spinner.dataset.bulkSpinner = ""; spinner.hidden = true;
    copy.append(title, url, state); node.append(number, copy, spinner); job.node = node; return node;
  }

  async function drain() {
    if (processing) return;
    processing = true;
    try {
      while (true) {
        const job = jobs.find(item => item.state === "queued");
        if (!job) break;
        job.state = "working"; job.message = "Converting…"; updateCard(job);
        const stagedBefore = workspace?.countStaged?.() || 0;
        try {
          await youtubePiano.transcribe(job.url, "", { allowFallback: true });
          const stagedAfter = workspace?.countStaged?.() || 0;
          if (stagedAfter > stagedBefore) {
            job.state = "ready"; job.message = "Ready in From Sheet Finder";
          } else {
            job.state = "review"; job.message = "Finished — review converter message / alternate source";
          }
        } catch (error) {
          job.state = "review"; job.message = error?.message || "Conversion needs attention";
        }
        updateCard(job);
      }
    } finally {
      processing = false; renderSummary();
    }
  }

  function enqueue(values) {
    const urls = Array.isArray(values) ? values : urlsFrom(values);
    if (!urls.length) {
      summary.textContent = "Paste at least one http(s) media URL.";
      return;
    }
    urls.forEach(url => {
      const job = { url, state: "queued", message: "Queued", node: null };
      jobs.push(job); queueHost.append(card(job, jobs.length - 1));
    });
    input.value = "";
    renderSummary();
    void drain();
  }

  toggle.addEventListener("change", syncMode);
  queueButton.addEventListener("click", () => enqueue(input.value));
  input.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") enqueue(input.value);
  });
  clearButton.addEventListener("click", () => {
    for (let index = jobs.length - 1; index >= 0; index -= 1) {
      if (!["ready", "review"].includes(jobs[index].state)) continue;
      jobs[index].node?.remove(); jobs.splice(index, 1);
    }
    renderSummary();
  });

  syncMode(); renderSummary();
  return { enqueue, jobs };
}
