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

  function wordRanges(text) {
    const value = String(text || "");
    if (!value) return [];
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
      return [...segmenter.segment(value)]
        .filter(segment => segment.isWordLike)
        .map(segment => ({ start: segment.index, end: segment.index + segment.segment.length }));
    }
    return [...value.matchAll(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu)]
      .map(match => ({ start: match.index, end: match.index + match[0].length }));
  }

  function sentenceRanges(text) {
    const value = String(text || "");
    if (!value) return [];
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
      return [...segmenter.segment(value)]
        .map(segment => ({ start: segment.index, end: segment.index + segment.segment.length }));
    }
    const ranges = [];
    const matcher = /[^.!?]+(?:[.!?]+["'\u201d\u2019)\]]*|$)/gu;
    for (const match of value.matchAll(matcher)) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    return ranges.length ? ranges : [{ start: 0, end: value.length }];
  }

  function nearestRange(ranges, index) {
    return ranges.find(range => index >= range.start && index < range.end)
      || ranges.find(range => range.start >= index)
      || ranges[ranges.length - 1]
      || { start: 0, end: 0 };
  }

  function markerRange(text, boundary = {}) {
    const value = String(text || "");
    if (!value) return { sentenceStart: 0, sentenceEnd: 0, wordStart: 0, wordEnd: 0 };
    const rawIndex = typeof boundary === "number" ? boundary : boundary.charIndex;
    const index = Math.min(value.length - 1, Math.max(0, Number(rawIndex) || 0));
    const words = wordRanges(value);
    const word = nearestRange(words, index);
    const explicitLength = Math.max(0, Number(boundary?.charLength) || 0);
    const wordStart = words.length ? word.start : index;
    const wordEnd = words.length
      ? Math.max(word.end, explicitLength ? Math.min(value.length, index + explicitLength) : word.end)
      : Math.min(value.length, index + Math.max(1, explicitLength));
    const sentence = nearestRange(sentenceRanges(value), wordStart);
    return {
      sentenceStart: sentence.start,
      sentenceEnd: sentence.end,
      wordStart,
      wordEnd,
    };
  }

  function progressMarker(text, ratio) {
    const value = String(text || "");
    const words = wordRanges(value);
    if (!words.length) return markerRange(value, 0);
    const progress = Math.min(1, Math.max(0, Number(ratio) || 0));
    const word = words[Math.min(words.length - 1, Math.floor(progress * words.length))];
    return markerRange(value, { charIndex: word.start, charLength: word.end - word.start });
  }

  function offsetForRatio(text, ratio) {
    const value = String(text || "");
    const ranges = wordRanges(value);
    if (!ranges.length) return Math.min(value.length, Math.max(0, Math.floor(value.length * (Number(ratio) || 0))));
    const progress = Math.min(1, Math.max(0, Number(ratio) || 0));
    if (progress >= 1) return value.length;
    return ranges[Math.min(ranges.length - 1, Math.floor(progress * ranges.length))].start;
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
    return {
      id: `entry:${(code >>> 0).toString(36)}`,
      title,
      text,
      kind,
      locator: breadcrumb || path || `World Book / ${title}`,
    };
  }

  WB.NarrationText = {
    MAX_CHARS,
    narratableText,
    split,
    markerRange,
    progressMarker,
    offsetForRatio,
    editorSource,
  };
})();
