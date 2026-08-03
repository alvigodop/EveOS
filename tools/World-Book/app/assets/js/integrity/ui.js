(function () {
  const WB = window.WorldBook;
  const SEVERITY_LABELS = {
    all: "All findings", error: "Errors", review: "Needs review",
    opportunity: "Opportunities", info: "Informational", ignored: "Ignored"
  };
  const ACTION_LABELS = {
    "repair-reference": "Repair or remove the shortcut",
    "clean-reference": "Move its data back to the canonical source",
    "repair-link": "Repair or remove the broken link",
    "deduplicate-link": "Keep one authoritative relationship",
    "type-link": "Choose a more specific relationship type",
    "repair-identity": "Assign separate canonical identities",
    "compare-duplicates": "Compare before merging or shortcutting",
    "create-relationship": "Replace mirrored prose with one typed relationship",
    "review-prose": "Keep only character-specific context in prose",
    "convert-to-shortcut": "Convert the lens copy into a reference shortcut",
    "move-facts-to-owner": "Move stable facts into the canonical owner",
    "convert-to-smart-collection": "Generate this list from typed links",
    "mark-scaffolding": "Mark this branch as intentional scaffolding",
    "populate-provenance": "Add source chapter and confirmation metadata"
  };

  function button(label, className, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className || "button button-small";
    element.textContent = label;
    element.addEventListener("click", handler);
    return element;
  }

  function option(value, label) {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
  }

  class Dashboard {
    constructor(elements, callbacks) {
      this.el = elements;
      this.callbacks = callbacks;
      this.state = null;
      this.report = { findings: [], counts: {} };
      this.search = "";
      this.sidebarSeverity = "all";
      this.el.refresh.addEventListener("click", () => this.scan(true));
      this.el.severity.addEventListener("change", () => this.updatePreference("severity", this.el.severity.value));
      this.el.type.addEventListener("change", () => this.updatePreference("type", this.el.type.value));
      this.el.showIgnored.addEventListener("change", () => this.updatePreference("showIgnored", this.el.showIgnored.checked));
    }

    setState(state) {
      this.state = state;
      WB.Integrity.normalizeState(state);
      const preferences = state.integrity.preferences;
      this.el.severity.value = preferences.severity || "all";
      this.el.showIgnored.checked = Boolean(preferences.showIgnored);
      this.sidebarSeverity = preferences.sidebarSeverity || "all";
      this.scan(false);
    }

    updatePreference(name, value) {
      if (!this.state) return;
      this.state.integrity.preferences[name] = value;
      this.callbacks.onChange();
      this.render();
      this.callbacks.onSidebarChange();
    }

    scan(persist) {
      if (!this.state) return;
      this.report = WB.Integrity.scan(this.state);
      this.populateTypes();
      this.render();
      this.callbacks.onSidebarChange();
      if (persist) this.callbacks.onChange();
    }

    populateTypes() {
      const current = this.state.integrity.preferences.type || "all";
      const types = [...new Set(this.report.findings.map(finding => finding.type))].sort();
      this.el.type.replaceChildren(option("all", "All issue types"));
      types.forEach(type => this.el.type.appendChild(option(type, type.replaceAll("-", " "))));
      this.el.type.value = types.includes(current) ? current : "all";
      this.state.integrity.preferences.type = this.el.type.value;
    }

    setSearch(value) {
      this.search = String(value || "").trim().toLowerCase();
      this.render();
    }

    setSidebarSeverity(value) {
      this.sidebarSeverity = value;
      this.state.integrity.preferences.sidebarSeverity = value;
      this.callbacks.onChange();
      this.render();
      this.callbacks.onSidebarChange();
    }

    visibleFindings() {
      const preferences = this.state.integrity.preferences;
      const severity = this.sidebarSeverity !== "all" ? this.sidebarSeverity : (preferences.severity || "all");
      const type = preferences.type || "all";
      const showIgnored = Boolean(preferences.showIgnored) || severity === "ignored";
      return this.report.findings.filter(finding => {
        if (severity === "ignored" && !finding.ignored) return false;
        if (!["all", "ignored"].includes(severity) && finding.severity !== severity) return false;
        if (!showIgnored && finding.ignored) return false;
        if (type !== "all" && finding.type !== type) return false;
        if (!this.search) return true;
        const haystack = [finding.title, finding.summary, finding.type, ...(finding.evidence || []), ...(finding.paths || [])]
          .join(" ").toLowerCase();
        return haystack.includes(this.search);
      });
    }

    renderSidebar(container) {
      container.innerHTML = "";
      const counts = this.report.counts || {};
      const items = [
        ["all", counts.total || 0], ["error", counts.error || 0], ["review", counts.review || 0],
        ["opportunity", counts.opportunity || 0], ["info", counts.info || 0], ["ignored", counts.ignored || 0]
      ];
      const list = document.createElement("div");
      list.className = "integrity-sidebar-list";
      items.forEach(([key, count]) => {
        const row = button("", `integrity-sidebar-item${this.sidebarSeverity === key ? " active" : ""}`, () => this.setSidebarSeverity(key));
        const label = document.createElement("span");
        label.textContent = SEVERITY_LABELS[key];
        const badge = document.createElement("strong");
        badge.textContent = String(count);
        row.append(label, badge);
        list.appendChild(row);
      });
      container.appendChild(list);
    }

    renderSummary() {
      const counts = this.report.counts || {};
      const values = {
        total: counts.total || 0, error: counts.error || 0, review: counts.review || 0,
        opportunity: counts.opportunity || 0, ignored: counts.ignored || 0
      };
      Object.entries(values).forEach(([key, value]) => {
        const element = this.el.summary[key];
        if (element) element.textContent = String(value);
      });
      const intentional = this.state.integrity.intentionalScaffoldingIds.length;
      this.el.lastScan.textContent = `Scanned ${new Date(this.report.scannedAt).toLocaleString()} · ${intentional} intentional scaffolding branch${intentional === 1 ? "" : "es"}`;
    }

    render() {
      if (!this.state) return;
      this.renderSummary();
      const findings = this.visibleFindings();
      this.el.count.textContent = `${findings.length} finding${findings.length === 1 ? "" : "s"} shown`;
      this.el.list.innerHTML = "";
      if (!findings.length) {
        const empty = document.createElement("div");
        empty.className = "integrity-empty";
        empty.innerHTML = "<strong>No findings in this view.</strong><span>Change the filters or refresh the scan after editing the World Book.</span>";
        this.el.list.appendChild(empty);
        return;
      }
      findings.forEach(finding => this.el.list.appendChild(this.renderFinding(finding)));
    }

    renderFinding(finding) {
      const card = document.createElement("article");
      card.className = `integrity-finding severity-${finding.severity}${finding.ignored ? " is-ignored" : ""}`;
      const heading = document.createElement("div");
      heading.className = "integrity-finding-heading";
      const titleWrap = document.createElement("div");
      const eyebrow = document.createElement("div");
      eyebrow.className = "integrity-finding-eyebrow";
      eyebrow.innerHTML = `<span class="integrity-severity">${WB.escapeHTML(finding.severity)}</span><span>${WB.escapeHTML(finding.type.replaceAll("-", " "))}</span>`;
      const title = document.createElement("h3");
      title.textContent = finding.title;
      titleWrap.append(eyebrow, title);
      if (finding.count > 1) {
        const count = document.createElement("span");
        count.className = "pill";
        count.textContent = `${finding.count} affected`;
        heading.append(titleWrap, count);
      } else heading.append(titleWrap);

      const summary = document.createElement("p");
      summary.className = "integrity-finding-summary";
      summary.textContent = finding.summary;
      const recommendation = document.createElement("p");
      recommendation.className = "integrity-recommendation";
      recommendation.textContent = ACTION_LABELS[finding.action] || "Review this finding before changing canonical structure.";
      const evidence = document.createElement("div");
      evidence.className = "integrity-evidence";
      (finding.evidence || []).forEach(line => {
        const item = document.createElement("span");
        item.textContent = line;
        evidence.appendChild(item);
      });
      const actions = document.createElement("div");
      actions.className = "integrity-finding-actions";
      finding.targetIds.slice(0, 3).forEach((id, index) => {
        const node = WB.findVirtual(this.state.virtualRoot, id);
        if (!node) return;
        actions.appendChild(button(index ? `Open related: ${node.name}` : `Open: ${node.name}`, "button button-small", () => this.callbacks.onOpen(id)));
      });
      if (finding.action === "mark-scaffolding" && !finding.ignored) {
        actions.appendChild(button("Mark intentional scaffolding", "button button-small", () => this.markScaffolding(finding)));
      }
      actions.appendChild(finding.ignored
        ? button("Restore finding", "mini-link", () => this.restoreFinding(finding))
        : button("Ignore finding", "mini-link", () => this.ignoreFinding(finding)));
      card.append(heading, summary, recommendation, evidence, actions);
      return card;
    }

    ignoreFinding(finding) {
      this.state.integrity.ignored[finding.fingerprint] = { ignoredAt: WB.nowISO(), type: finding.type, title: finding.title };
      this.callbacks.onChange();
      this.scan(false);
    }

    restoreFinding(finding) {
      delete this.state.integrity.ignored[finding.fingerprint];
      this.callbacks.onChange();
      this.scan(false);
    }

    markScaffolding(finding) {
      const id = finding.targetIds[0];
      if (!id) return;
      const list = this.state.integrity.intentionalScaffoldingIds;
      if (!list.includes(id)) list.push(id);
      delete this.state.integrity.ignored[finding.fingerprint];
      this.callbacks.onChange();
      this.scan(false);
    }
  }

  WB.Integrity.createDashboard = function (elements, callbacks) {
    return new Dashboard(elements, callbacks);
  };
})();
