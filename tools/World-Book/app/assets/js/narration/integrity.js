(function () {
  const WB = window.WorldBook = window.WorldBook || {};

  function hash(value) {
    const text = String(value || "");
    let code = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      code ^= text.charCodeAt(index);
      code = Math.imul(code, 16777619);
    }
    return (code >>> 0).toString(36);
  }

  function words(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu) || [];
  }

  function lcsLength(left, right) {
    if (!left.length || !right.length) return 0;
    const previous = new Uint16Array(right.length + 1);
    const current = new Uint16Array(right.length + 1);
    for (let row = 1; row <= left.length; row += 1) {
      for (let column = 1; column <= right.length; column += 1) {
        current[column] = left[row - 1] === right[column - 1]
          ? previous[column - 1] + 1
          : Math.max(previous[column], current[column - 1]);
      }
      previous.set(current);
      current.fill(0);
    }
    return previous[right.length];
  }

  function compareTranscript(sourceText, spokenText) {
    const source = words(sourceText);
    const spoken = words(spokenText);
    if (!spoken.length) {
      return { status: "unknown", similarity: null, label: "Transcript not captured" };
    }
    if (!source.length) {
      return { status: "unknown", similarity: null, label: "Source text unavailable" };
    }
    const similarity = lcsLength(source, spoken) / Math.max(source.length, spoken.length);
    if (similarity >= 0.85) return { status: "match", similarity, label: "Transcript matches source" };
    if (similarity >= 0.65) return { status: "drift", similarity, label: "Transcript may have drifted" };
    return { status: "diverged", similarity, label: "Transcript differs from source" };
  }

  function compactLocator(value, limit = 4) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const separator = raw.includes(" > ") ? " > " : raw.includes(" / ") ? " / " : /[\\/]/.test(raw) ? " / " : "";
    if (!separator) return raw;
    const parts = raw.split(separator === " / " ? /\s*[/\\]\s*/ : /\s*>\s*/).filter(Boolean);
    if (parts.length <= limit) return parts.join(" > ");
    return `\u2026 > ${parts.slice(-limit).join(" > ")}`;
  }

  function shortModel(value) {
    const model = String(value || "").replace(/^models\//, "").trim();
    return model || "Legacy / unknown model";
  }

  function inspectRecord(record, controller = WB.Narration) {
    const currentSource = controller?.source;
    const sameSource = Boolean(currentSource && String(currentSource.id) === String(record?.sourceId));
    const currentText = sameSource ? String(controller.passages?.[record.passageIndex] || "") : "";
    let source = { status: "unknown", label: "Open this source to check freshness" };
    if (sameSource) {
      if (!currentText) source = { status: "changed", label: "Passage no longer exists in source" };
      else if (!record.sourceHash) source = { status: "unknown", label: "Legacy clip has no source fingerprint" };
      else if (hash(currentText) === String(record.sourceHash)) source = { status: "current", label: "Source is current" };
      else source = { status: "changed", label: "Source changed after this clip was generated" };
    }
    return {
      source,
      transcript: compareTranscript(record?.sourceText || record?.passagePreview, record?.spokenText),
    };
  }

  WB.NarrationIntegrity = {
    hash,
    compareTranscript,
    compactLocator,
    shortModel,
    inspectRecord,
  };
})();
