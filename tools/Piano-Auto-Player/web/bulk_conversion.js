import { api } from "./api.js";

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
    <textarea id="bulkConversionUrls" rows="5" spellcheck="false" placeholder="Paste URLs however you have them — new lines, commas, spaces, or back-to-back http(s) links all work.\nhttps://youtu.be/...\nhttps://youtube.com/watch?v=..."></textarea>
    <input id="bulkConversionFile" type="file" accept=".txt,text/plain" hidden>
    <div class="bulk-conversion-actions">
      <button type="button" class="primary" id="bulkQueueBtn">Queue conversions</button>
      <button type="button" class="ghost" id="bulkFileBtn">Queue .txt file</button>
      <button type="button" class="ghost" id="bulkClearFinishedBtn">Clear finished</button>
      <span id="bulkQueueSummary">0 queued</span>
    </div>
    <div id="bulkConversionQueue" class="bulk-conversion-queue" aria-live="polite"></div>`;
  singleForm.insertAdjacentElement("afterend", panel);
  return { singleForm, mode, panel };
}

function urlsFrom(value) {
  const found = String(value || "").match(/https?:\/\/[^\s,]*?(?=https?:\/\/|[\s,]|$)/gi) || [];
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

function dependencyIssue(deps = {}) {
  const missing = [
    !deps.venv && "transcriber",
    !deps.basic_pitch && "Basic Pitch",
    !deps.ffmpeg && "FFmpeg",
    !deps.ffprobe && "FFprobe",
    !deps.js_runtime && (deps.js_runtime_issue || "YouTube JS runtime"),
  ].filter(Boolean);
  const detail = missing.length ? `: ${missing.join(" + ")}` : "";
  return `Media-to-Piano setup needs repair${detail}. Run setup-youtube-piano.bat once, then restart start.bat.`;
}

function converterMessage() {
  return String(document.getElementById("youtubePianoMessage")?.textContent || "").trim();
}

function isReviewMessage(value) {
  return /choose the matching recording|public recording.*found below|alternate public source/i.test(String(value || ""));
}

function isSuccessMessage(value) {
  return /^Loaded from the submitted source\b/i.test(String(value || "").trim());
}

export function setupBulkConversion({ youtubePiano, workspace }) {
  const ui = buildBulkUi();
  if (!ui) return { enqueue() {} };
  const toggle = document.getElementById("bulkConversionMode");
  const input = document.getElementById("bulkConversionUrls");
  const fileInput = document.getElementById("bulkConversionFile");
  const fileButton = document.getElementById("bulkFileBtn");
  const queueButton = document.getElementById("bulkQueueBtn");
  const clearButton = document.getElementById("bulkClearFinishedBtn");
  const summary = document.getElementById("bulkQueueSummary");
  const queueHost = document.getElementById("bulkConversionQueue");
  const jobs = [];
  let processing = false;
  let stagedReceipt = 0;

  // Sheet Workspace emits this only after it has accepted a real sheet/timed
  // performance. Unlike a staging-count delta, this receipt is monotonic even
  // if the user loads/discards older staged items while a long conversion runs.
  window.addEventListener("piano:workspace-staged", () => { stagedReceipt += 1; });

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
    const failed = jobs.filter(job => job.state === "error").length;
    summary.textContent = `${waiting} queued${active ? ` · ${active} converting` : ""}${ready ? ` · ${ready} ready` : ""}${review ? ` · ${review} review` : ""}${failed ? ` · ${failed} failed` : ""}`;
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

  async function dependencyBlocker() {
    try {
      const deps = await api.youtubeDependencies();
      return deps?.ready ? "" : dependencyIssue(deps);
    } catch (error) {
      return `Media-to-Piano dependency check failed: ${error?.message || "local service unavailable"}`;
    }
  }

  async function drain() {
    if (processing) return;
    processing = true;
    try {
      const blocker = await dependencyBlocker();
      if (blocker) {
        jobs.filter(job => job.state === "queued").forEach(job => {
          job.state = "error";
          job.message = `Blocked — ${blocker}`;
          updateCard(job);
        });
        return;
      }
      while (true) {
        const job = jobs.find(item => item.state === "queued");
        if (!job) break;
        job.state = "working"; job.message = "Converting…"; updateCard(job);
        const receiptBefore = stagedReceipt;
        try {
          await youtubePiano.transcribe(job.url, "", { allowFallback: true });
          const detail = converterMessage();
          if (stagedReceipt > receiptBefore && isSuccessMessage(detail)) {
            job.state = "ready"; job.message = "Ready in From Sheet Finder";
          } else {
            const fallbackDetail = detail || "Conversion returned without a staged sheet or timed performance.";
            job.state = isReviewMessage(fallbackDetail) ? "review" : "error";
            job.message = `${job.state === "review" ? "Needs review" : "Failed"} — ${fallbackDetail}`;
          }
        } catch (error) {
          job.state = "error";
          job.message = `Failed — ${error?.message || "Conversion needs attention"}`;
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
      summary.textContent = "Paste or upload at least one http(s) media URL.";
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

  async function queueTextFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const urls = urlsFrom(text);
      if (!urls.length) {
        summary.textContent = `${file.name}: no http(s) URLs found.`;
        return;
      }
      enqueue(urls);
    } catch (error) {
      summary.textContent = `Could not read ${file.name || "URL list"}: ${error?.message || "unknown error"}`;
    } finally {
      fileInput.value = "";
    }
  }

  toggle.addEventListener("change", syncMode);
  queueButton.addEventListener("click", () => enqueue(input.value));
  fileButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => void queueTextFile(fileInput.files?.[0]));
  input.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") enqueue(input.value);
  });
  clearButton.addEventListener("click", () => {
    for (let index = jobs.length - 1; index >= 0; index -= 1) {
      if (!["ready", "review", "error"].includes(jobs[index].state)) continue;
      jobs[index].node?.remove(); jobs.splice(index, 1);
    }
    renderSummary();
  });

  syncMode(); renderSummary();
  return { enqueue, jobs };
}
