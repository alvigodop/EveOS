(function () {
  const WB = window.WorldBook;
  const cleanName = value => String(value || "").trim();

  WB.TagPicker = class TagPicker {
    constructor(options) {
      this.chips = options.chips;
      this.input = options.input;
      this.suggestions = options.suggestions;
      this.getDefinitions = options.getDefinitions;
      this.onChange = options.onChange;
      this.onCreate = options.onCreate;
      this.values = [];
      this.disabled = false;

      this.input.addEventListener("input", () => this.renderSuggestions());
      this.input.addEventListener("focus", () => this.renderSuggestions());
      this.input.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          this.commitInput();
        } else if (event.key === "Backspace" && !this.input.value && this.values.length) {
          this.remove(this.values.at(-1));
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

    setValues(values) {
      this.values = WB.normalizeTags(values);
      this.render();
    }

    setDisabled(disabled) {
      this.disabled = Boolean(disabled);
      this.input.disabled = this.disabled;
      if (this.disabled) this.hideSuggestions();
      this.render();
    }

    commitInput() {
      if (this.disabled) return;
      const raw = cleanName(this.input.value.replace(/,+$/, ""));
      if (!raw) return;
      const definitions = this.getDefinitions();
      const existing = definitions.find(item => item.name.toLowerCase() === raw.toLowerCase());
      const canonical = existing ? existing.name : this.onCreate(raw);
      if (canonical && !this.values.some(tag => tag.toLowerCase() === canonical.toLowerCase())) {
        this.values.push(canonical);
        this.onChange([...this.values]);
      }
      this.input.value = "";
      this.render();
      this.renderSuggestions();
    }

    add(name) {
      if (this.disabled) return;
      const clean = cleanName(name);
      if (!clean || this.values.some(tag => tag.toLowerCase() === clean.toLowerCase())) return;
      this.values.push(clean);
      this.onChange([...this.values]);
      this.input.value = "";
      this.render();
      this.hideSuggestions();
    }

    remove(name) {
      if (this.disabled) return;
      this.values = this.values.filter(tag => tag.toLowerCase() !== name.toLowerCase());
      this.onChange([...this.values]);
      this.render();
      this.renderSuggestions();
    }

    render() {
      this.chips.innerHTML = "";
      this.values.forEach(tag => {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = tag;
        chip.appendChild(label);
        if (!this.disabled) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.setAttribute("aria-label", `Remove ${tag}`);
          remove.textContent = "×";
          remove.addEventListener("click", () => this.remove(tag));
          chip.appendChild(remove);
        }
        this.chips.appendChild(chip);
      });
    }

    renderSuggestions() {
      if (this.disabled) return;
      const query = cleanName(this.input.value).toLowerCase();
      const available = this.getDefinitions()
        .filter(item => !this.values.some(tag => tag.toLowerCase() === item.name.toLowerCase()))
        .filter(item => !query || item.name.toLowerCase().includes(query))
        .slice(0, 50);

      this.suggestions.innerHTML = "";
      available.forEach(definition => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = definition.name;
        button.addEventListener("pointerdown", event => {
          event.preventDefault();
          this.add(definition.name);
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
