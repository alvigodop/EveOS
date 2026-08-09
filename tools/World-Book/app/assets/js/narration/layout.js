(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const COLLAPSE_KEY = "eveWorldBookReaderLibraryCollapsed";

  function preference() {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (_error) { return false; }
  }

  function apply(collapsed, persist = true) {
    const layout = document.querySelector(".narration-layout");
    const toggle = document.getElementById("reader-library-toggle");
    if (!layout || !toggle) return false;
    layout.classList.toggle("is-library-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.title = collapsed ? "Show private documents" : "Hide private documents";
    toggle.querySelector(".narration-library-toggle-icon").textContent = collapsed ? "\u25b6" : "\u25c0";
    toggle.querySelector(".narration-library-toggle-label").textContent = collapsed
      ? "Show private documents"
      : "Hide private documents";
    if (persist) {
      try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch (_error) {}
    }
    return true;
  }

  function bind() {
    const toggle = document.getElementById("reader-library-toggle");
    toggle?.addEventListener("click", () => {
      const collapsed = document.querySelector(".narration-layout")?.classList.contains("is-library-collapsed");
      apply(!collapsed);
    });
    apply(preference(), false);
  }

  WB.NarrationLayout = { apply, bind, preference };
})();
