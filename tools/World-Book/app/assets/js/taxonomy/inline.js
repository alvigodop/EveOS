(function () {
  const WB = window.WorldBook;
  const cleanName = value => String(value || "").trim();

  WB.EntryTagInline = class EntryTagInline {
    constructor(options) {
      this.chips = options.chips;
      this.input = options.input;
      this.suggestions = options.suggestions;
      this.summary = options.summary;
      this.getDefinitions = options.getDefinitions;
      this.onCreate = options.onCreate;
      this.onAdd = options.onAdd;
      this.onHide = options.onHide;
      this.info = WB.Taxonomy.simpleTagInfo([], []);
      this.disabled = false;

      this.input.addEventListener("input", () => this.renderSuggestions());
      this.input.addEventListener("focus", () => this.renderSuggestions());
      this.input.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          this.commitInput();
        } else if (event.key === "Escape") {
          this.hideSuggestions();
        }
      });
      document.addEventListener("pointerdown", event => {
        if (!this.suggestions.contains(event.target) && event.target !== this.input) {
          this.hideSuggestions();
        }
      });
    }

    setData(info, disabled) {
      this.info = info || WB.Taxonomy.simpleTagInfo([], []);
      this.disabled = Boolean(disabled);
      this.input.disabled = this.disabled;
      this.render();
      if (this.disabled) this.hideSuggestions();
    }

    commitInput() {
      if (this.disabled) return;
      const raw = cleanName(this.input.value.replace(/,+$/, ""));
      if (!raw) return;
      const definitions = this.getDefinitions();
      const existing = definitions.find(item => item.name.toLowerCase() === raw.toLowerCase());
      const canonical = existing ? existing.name : this.onCreate(raw);
      if (canonical) this.onAdd(canonical);
      this.input.value = "";
      this.hideSuggestions();
    }

    render() {
      this.chips.innerHTML = "";
      const visible = this.info.visible || [];
      if (!visible.length) {
        const empty = document.createElement("span");
        empty.className = "tag-inline-empty";
        empty.textContent = "No visible tags";
        this.chips.appendChild(empty);
      }

      visible.forEach(item => {
        const chip = document.createElement("span");
        const primary = item.sources[0]?.type || "manual";
        chip.className = `tag-chip tag-source-${primary}`;
        chip.title = item.sources.map(source => WB.Taxonomy.tagSourceLabel(source)).join(" • ");

        const label = document.createElement("span");
        label.textContent = item.name;
        chip.appendChild(label);

        if (!this.disabled) {
          const hide = document.createElement("button");
          hide.type = "button";
          hide.setAttribute("aria-label", `Hide ${item.name} from the compact tag view`);
          hide.title = "Hide from compact view; the tag remains attached";
          hide.textContent = "×";
          hide.addEventListener("click", () => this.onHide(item.name));
          chip.appendChild(hide);
        }
        this.chips.appendChild(chip);
      });

      if (this.summary) {
        const effectiveCount = this.info.effective?.length || 0;
        this.summary.textContent = `${visible.length} shown · ${effectiveCount} effective`;
      }
    }

    renderSuggestions() {
      if (this.disabled) return;
      const query = cleanName(this.input.value).toLowerCase();
      const manualSet = new Set((this.info.manual || []).map(tag => tag.toLowerCase()));
      const available = this.getDefinitions()
        .filter(item => !manualSet.has(item.name.toLowerCase()))
        .filter(item => !query || item.name.toLowerCase().includes(query))
        .slice(0, 50);

      this.suggestions.innerHTML = "";
      available.forEach(definition => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = definition.name;
        button.addEventListener("pointerdown", event => {
          event.preventDefault();
          this.onAdd(definition.name);
          this.input.value = "";
          this.hideSuggestions();
        });
        this.suggestions.appendChild(button);
      });

      if (query && !this.getDefinitions().some(item => item.name.toLowerCase() === query)) {
        const create = document.createElement("button");
        create.type = "button";
        create.className = "tag-suggestion-create";
        create.textContent = `Create “${this.input.value.trim()}”`;
        create.addEventListener("pointerdown", event => {
          event.preventDefault();
          this.commitInput();
        });
        this.suggestions.prepend(create);
      }
      this.suggestions.hidden = !this.suggestions.children.length;
    }

    hideSuggestions() {
      this.suggestions.hidden = true;
    }
  };


})();
