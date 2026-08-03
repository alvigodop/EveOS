(function () {
  const WB = window.WorldBook;

  WB.TagDashboard = class TagDashboard {
    constructor(elements, callbacks) {
      this.el = elements;
      this.callbacks = callbacks;
      this.state = null;
      this.physicalEntries = [];
      this.entries = [];
      this.selectedTags = [];
      this.search = "";
      this.availableDefinitions = [];

      this.filterPicker = new WB.TagPicker({
        chips: elements.filterChips,
        input: elements.filterInput,
        suggestions: elements.filterSuggestions,
        getDefinitions: () => this.availableDefinitions,
        onCreate: name => callbacks.onCreateTag(name),
        onChange: tags => {
          this.selectedTags = tags;
          this.render();
          this.callbacks.onFilterChange();
        }
      });

      elements.matchMode.addEventListener("change", () => this.render());
      elements.sort.addEventListener("change", () => this.render());
      elements.clear.addEventListener("click", () => this.selectTags([]));
      elements.manageTags.addEventListener("click", callbacks.onManageTags);
      elements.manageStatuses.addEventListener("click", callbacks.onManageStatuses);
    }

    setData(state, physicalEntries) {
      this.state = state;
      this.physicalEntries = (physicalEntries || []).map(entry => ({
        source: "physical",
        key: `physical:${entry.relativePath}`,
        name: entry.name,
        path: entry.relativePath,
        relativePath: entry.relativePath,
        kind: entry.kind,
        tags: entry.tags || [],
        status: entry.status || "draft",
        updatedAt: [entry.modifiedAt, entry.metaUpdatedAt].sort().at(-1) || "",
        modifiedAt: entry.modifiedAt || "",
        metaUpdatedAt: entry.metaUpdatedAt || "",
        missing: entry.missing
      }));
      this.entries = [...this.physicalEntries, ...WB.Taxonomy.virtualTaggedEntries(state)];

      const definitionMap = new Map();
      (state.tagDefinitions || []).forEach(definition => definitionMap.set(definition.name.toLowerCase(), definition));
      this.entries.forEach(entry => {
        (entry.tags || []).forEach(tag => {
          const key = tag.toLowerCase();
          if (!definitionMap.has(key)) definitionMap.set(key, { id: `effective:${key}`, name: tag, dynamic: true });
        });
      });
      this.availableDefinitions = [...definitionMap.values()].sort((a, b) => a.name.localeCompare(b.name));
      this.filterPicker.setValues(this.selectedTags.filter(tag =>
        this.availableDefinitions.some(definition => definition.name.toLowerCase() === tag.toLowerCase())
      ));
      this.render();
    }

    setSearch(query) {
      this.search = cleanName(query).toLowerCase();
      this.render();
    }

    selectOnlyTag(name) {
      this.selectTags([name]);
    }

    selectTags(tags) {
      this.selectedTags = WB.normalizeTags(tags);
      this.filterPicker.setValues(this.selectedTags);
      this.render();
      this.callbacks.onFilterChange();
    }

    matches(entry) {
      const entryTags = (entry.tags || []).map(tag => tag.toLowerCase());
      const selected = this.selectedTags.map(tag => tag.toLowerCase());
      const tagMatch = !selected.length
        ? true
        : this.el.matchMode.value === "all"
          ? selected.every(tag => entryTags.includes(tag))
          : selected.some(tag => entryTags.includes(tag));
      if (!tagMatch) return false;
      if (!this.search) return true;
      const haystack = [entry.name, entry.path, entry.status, ...entry.tags].join(" ").toLowerCase();
      return haystack.includes(this.search);
    }

    filteredEntries() {
      const entries = this.entries.filter(entry => this.matches(entry));
      const sort = this.el.sort.value;
      entries.sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "oldest") return String(a.updatedAt).localeCompare(String(b.updatedAt));
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
      return entries;
    }

    usage() {
      if (!this.state) return [];
      const map = new Map();
      this.availableDefinitions.forEach(definition => {
        map.set(definition.name.toLowerCase(), {
          definition,
          count: 0,
          latest: ""
        });
      });
      this.entries.forEach(entry => {
        entry.tags.forEach(tag => {
          const key = tag.toLowerCase();
          if (!map.has(key)) {
            map.set(key, { definition: { name: tag }, count: 0, latest: "" });
          }
          const item = map.get(key);
          item.count += 1;
          if (String(entry.updatedAt) > String(item.latest)) item.latest = entry.updatedAt;
        });
      });
      return [...map.values()].sort((a, b) => b.count - a.count || a.definition.name.localeCompare(b.definition.name));
    }

    renderSidebar(panel) {
      panel.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "tag-sidebar-list";
      this.usage().forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = this.selectedTags.length === 1 && this.selectedTags[0].toLowerCase() === item.definition.name.toLowerCase()
          ? "tag-sidebar-item active"
          : "tag-sidebar-item";
        button.innerHTML = `<span># ${WB.escapeHTML(item.definition.name)}</span><strong>${item.count}</strong>`;
        button.addEventListener("click", () => this.selectOnlyTag(item.definition.name));
        wrap.appendChild(button);
      });
      panel.appendChild(wrap);
    }

    render() {
      if (!this.state) return;
      const filtered = this.filteredEntries();
      this.el.resultCount.textContent = `${filtered.length.toLocaleString()} entr${filtered.length === 1 ? "y" : "ies"}`;
      this.renderOverview();
      this.renderResults(filtered);
    }

    renderOverview() {
      this.el.overview.innerHTML = "";
      this.usage().forEach(item => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "tag-overview-card";
        card.innerHTML = `
          <span class="tag-overview-name"># ${WB.escapeHTML(item.definition.name)}</span>
          <strong>${item.count.toLocaleString()}</strong>
          <small>${item.latest ? `Latest ${this.relativeTime(item.latest)}` : "No attached entries"}</small>
        `;
        card.addEventListener("click", () => this.selectOnlyTag(item.definition.name));
        this.el.overview.appendChild(card);
      });
    }

    renderResults(entries) {
      this.el.results.innerHTML = "";
      if (!entries.length) {
        this.el.results.innerHTML = '<div class="tag-empty">No entries match these tags.</div>';
        return;
      }
      entries.forEach(entry => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "tag-result-row";
        const chips = entry.tags.map(tag => `<span class="tag-chip static">${WB.escapeHTML(tag)}</span>`).join("");
        row.innerHTML = `
          <div class="tag-result-main">
            <div class="tag-result-title-line">
              <strong>${WB.escapeHTML(entry.name)}</strong>
              <span class="pill">${WB.escapeHTML(entry.source)}</span>
              ${entry.missing ? '<span class="pill warning">missing</span>' : ""}
            </div>
            <span class="tag-result-path">${WB.escapeHTML(entry.path)}</span>
            <div class="tag-result-chips">${chips}</div>
          </div>
          <div class="tag-result-meta">
            <strong>${WB.escapeHTML(WB.Taxonomy.statusName(this.state, entry.status))}</strong>
            <span>${entry.updatedAt ? this.formatDate(entry.updatedAt) : "No date"}</span>
            <small>${entry.updatedAt ? this.relativeTime(entry.updatedAt) : ""}</small>
          </div>
        `;
        row.addEventListener("click", () => this.callbacks.onOpenEntry(entry));
        this.el.results.appendChild(row);
      });
    }

    formatDate(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
    }

    relativeTime(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "unknown";
      const seconds = Math.round((date.getTime() - Date.now()) / 1000);
      const absolute = Math.abs(seconds);
      const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      if (absolute < 60) return formatter.format(seconds, "second");
      if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
      if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
      if (absolute < 2592000) return formatter.format(Math.round(seconds / 86400), "day");
      return formatter.format(Math.round(seconds / 2592000), "month");
    }
  };

})();
