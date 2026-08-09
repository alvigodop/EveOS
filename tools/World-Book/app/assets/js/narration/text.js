(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const MAX_CHARS = 600;
  const ABBREVIATIONS = [
    "Mr", "Mrs", "Ms", "Dr", "Prof", "Sr", "Jr", "St", "Mt", "Lt", "Sgt",
    "Capt", "Gen", "Rev", "Hon", "etc", "vs", "cf", "al", "Fig", "Eq", "No",
    "pp", "pg", "Vol", "Ch", "Sec", "Inc", "Ltd", "Corp", "Co", "Dept",
  ];
  const dividerRun = /[-=_*~+#|<>.\u2010-\u2015\u00b7\u2022\u25cf\u2500-\u257f]{3,}/gu;

  function narratableText(text) {
    return String(text || "").replace(dividerRun, " ").replace(/\s+/g, " ").trim();
  }

  function protect(text) {
    const values = [];
    const stash = value => {
      const key = `\uE000${values.length}\uE001`;
      values.push(value);
      return key;
    };
    let value = String(text || "");
    value = value.replace(/\b\d+\.\d+\b/g, stash);
    const abbreviation = new RegExp(`\\b(?:${ABBREVIATIONS.join("|")})\\.`, "gi");
    value = value.replace(abbreviation, stash);
    value = value.replace(/\b[A-Z]\.\s+[A-Z][\p{L}'-]+/gu, stash);
    return {
      value,
      restore: input => input.replace(/\uE000(\d+)\uE001/g, (_match, index) => values[Number(index)] || ""),
    };
  }

  function hardWrap(text, max) {
    const output = [];
    let rest = text.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max * 0.45) cut = max;
      output.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) output.push(rest);
    return output;
  }

  function pack(parts, max = MAX_CHARS) {
    const output = [];
    let current = "";
    for (const raw of parts) {
      const part = narratableText(raw);
      if (!/[\p{L}\p{N}]/u.test(part)) continue;
      if (part.length > max) {
        if (current) output.push(current);
        output.push(...hardWrap(part, max));
        current = "";
        continue;
      }
      const candidate = current ? `${current} ${part}` : part;
      if (candidate.length <= max) current = candidate;
      else {
        if (current) output.push(current);
        current = part;
      }
    }
    if (current) output.push(current);
    return output;
  }

  function split(text, max = MAX_CHARS) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!normalized) return [];
    const guarded = protect(normalized);
    const pieces = guarded.value
      .split(/(?<=[.!?]["'\u201d\u2019)\]]?)\s+|\n{2,}/u)
      .map(guarded.restore);
    return pack(pieces, max);
  }

  function editorSource() {
    const title = document.getElementById("entry-name")?.value?.trim() || "World Book entry";
    const kind = document.getElementById("entry-kind")?.textContent?.trim() || "entry";
    const path = document.getElementById("entry-path")?.textContent?.trim() || "";
    const breadcrumb = document.getElementById("breadcrumb")?.textContent?.trim() || "";
    const fileSection = document.getElementById("file-content-section");
    const fileText = document.getElementById("file-content")?.value || "";
    const notesText = document.getElementById("entry-notes")?.value || "";
    const text = fileSection && !fileSection.hidden && fileText.trim() ? fileText : notesText;
    const identity = `${kind}|${path}|${breadcrumb}|${title}`;
    let code = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
      code ^= identity.charCodeAt(index);
      code = Math.imul(code, 16777619);
    }
    return { id: `entry:${(code >>> 0).toString(36)}`, title, text };
  }

  WB.NarrationText = { MAX_CHARS, narratableText, split, editorSource };
})();
