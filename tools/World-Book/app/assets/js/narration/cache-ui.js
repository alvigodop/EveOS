(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const confirmations = new Map();

  function humanBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }

  function humanDuration(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    if (!value) return "duration unknown";
    const minutes = Math.floor(value / 60);
    const remainder = Math.round(value % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function relativeTime(timestamp) {
    if (!timestamp) return "unknown";
    const elapsed = Math.max(0, Date.now() - Number(timestamp));
    if (elapsed < 60000) return "just now";
    if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
    if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h ago`;
    return `${Math.floor(elapsed / 86400000)}d ago`;
  }

  function badge(label, status, title = label) {
    const output = document.createElement("span");
    output.className = "narration-cache-badge";
    output.dataset.status = status;
    output.textContent = label;
    output.title = title;
    return output;
  }

  function confirm(button, key, label, action) {
    const prior = confirmations.get(key);
    if (!prior || Date.now() - prior > 5000) {
      confirmations.set(key, Date.now());
      button.textContent = label.startsWith("Clear") ? "Clear now" : "Remove now";
      window.setTimeout(() => {
        if (!button.isConnected || !confirmations.has(key)) return;
        confirmations.delete(key);
        button.textContent = label;
      }, 5100);
      return;
    }
    confirmations.delete(key);
    button.disabled = true;
    void Promise.resolve(action()).finally(() => {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = label;
      }
    });
  }

  function passageRow(record, refresh) {
    const inspection = WB.Narration.inspectCachedRecord(record);
    const clipNumber = record.passageIndex + 1;
    const clipTotal = record.passageCount || "?";
    const row = document.createElement("li");
    row.className = "narration-cache-passage";
    row.dataset.readingStatus = inspection.reading.status;
    row.title = `Clip ${clipNumber} of ${clipTotal} · ${inspection.reading.label}`;

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `Clip ${clipNumber} of ${clipTotal} / ${record.voice || "Gemini"}`;
    const detail = document.createElement("small");
    detail.textContent = [
      WB.NarrationIntegrity.shortModel(record.model),
      humanDuration(record.durationSec),
      humanBytes(record.size),
      `used ${relativeTime(record.lastUsed)}`,
      record.narrationPolicy,
    ].join(" / ");
    const checks = document.createElement("div");
    checks.className = "narration-cache-checks";
    checks.append(
      badge(inspection.reading.label, inspection.reading.status),
      badge(inspection.source.label, inspection.source.status),
      badge(
        inspection.transcript.similarity === null
          ? inspection.transcript.label
          : `${inspection.transcript.label} (${Math.round(inspection.transcript.similarity * 100)}%)`,
        inspection.transcript.status,
      ),
    );
    const preview = document.createElement("p");
    preview.textContent = record.passagePreview || "Legacy cached passage";
    copy.append(title, detail, checks, preview);

    const actions = document.createElement("div");
    actions.className = "narration-cache-actions";
    const goTo = document.createElement("button");
    goTo.type = "button";
    goTo.className = "button button-small";
    goTo.textContent = "Go to";
    goTo.title = `Go to clip ${clipNumber} in the active reader source`;
    goTo.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("eve:world-book-narration-go-to", { detail: record }));
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-small";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => confirm(remove, record.key, "Remove", async () => {
      await WB.Narration.deleteCachedAudio(record.key);
      await refresh();
    }));
    actions.append(goTo, remove);
    row.append(copy, actions);
    return row;
  }

  function sourceCard(sourceId, records, refresh) {
    const card = document.createElement("details");
    card.className = "narration-cache-source";
    card.open = String(WB.Narration.source?.id || "") === String(sourceId);
    const summary = document.createElement("summary");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = records[0]?.sourceTitle || "Unknown source";
    const locatorText = WB.NarrationIntegrity.compactLocator(records[0]?.sourceLocator);
    if (locatorText) {
      const locator = document.createElement("small");
      locator.className = "narration-cache-locator";
      locator.textContent = locatorText;
      locator.title = records[0].sourceLocator;
      copy.append(title, locator);
    } else copy.append(title);
    const size = records.reduce((sum, record) => sum + record.size, 0);
    const detail = document.createElement("small");
    detail.textContent = `${records.length} clip${records.length === 1 ? "" : "s"} / ${humanBytes(size)}`;
    copy.append(detail);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "button button-small";
    clear.textContent = "Clear source";
    clear.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      confirm(clear, `source:${sourceId}`, "Clear source", async () => {
        await WB.Narration.clearSourceCache(sourceId);
        await refresh();
      });
    });
    summary.append(copy, clear);
    const list = document.createElement("ul");
    list.className = "narration-cache-passages";
    records
      .sort((a, b) => a.passageIndex - b.passageIndex)
      .forEach(record => list.append(passageRow(record, refresh)));
    card.append(summary, list);
    return card;
  }

  async function refresh() {
    const list = document.getElementById("reader-cache-list");
    if (!list) return;
    const records = await WB.NarrationStore.inventory();
    list.replaceChildren();
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "narration-empty";
      empty.textContent = "No generated narration is cached yet.";
      list.append(empty);
      return;
    }
    const grouped = new Map();
    records.forEach(record => {
      const bucket = grouped.get(record.sourceId) || [];
      bucket.push(record);
      grouped.set(record.sourceId, bucket);
    });
    grouped.forEach((rows, sourceId) => list.append(sourceCard(sourceId, rows, refresh)));
  }

  WB.NarrationCacheUI = { refresh, humanBytes };
})();
