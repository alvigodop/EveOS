(function () {
  const WB = window.WorldBook;

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, "-")
      .toLowerCase();
  }

  function candidates(state) {
    const names = [];
    (state.tagDefinitions || []).forEach(item => names.push(item.name));
    WB.walkVirtual(state.virtualRoot, node => {
      if (node.id !== state.virtualRoot.id && node.name) names.push(node.name);
    });
    return WB.normalizeTags(names).filter(name => name.trim().length >= 3);
  }

  WB.TagMentions = {
    find(state, text, excluded) {
      const haystack = normalizeText(text);
      if (!haystack.trim()) return [];
      const blocked = new Set((excluded || []).map(normalizeText));
      return candidates(state).filter(name => {
        const needle = normalizeText(name);
        if (blocked.has(needle)) return false;
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const edge = "[^\\p{L}\\p{N}]";
        return new RegExp(`(^|${edge})${escaped}(?=$|${edge})`, "u").test(haystack);
      });
    }
  };
})();
