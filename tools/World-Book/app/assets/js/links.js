(function () {
  const WB = window.WorldBook;
  const DIRECTIONS = new Set(["all", "outgoing", "incoming"]);

  function cleanLink(raw) {
    if (!raw || typeof raw !== "object") return null;
    const targetId = String(raw.targetId || "").trim();
    if (!targetId) return null;
    return {
      id: String(raw.id || WB.makeId("link")),
      targetType: "virtual",
      targetId,
      relationshipType: String(raw.relationshipType || "related-to"),
      label: String(raw.label || "").trim(),
      provenance: raw.provenance && typeof raw.provenance === "object" ? raw.provenance : {},
      createdAt: raw.createdAt || WB.nowISO(),
      updatedAt: raw.updatedAt || raw.createdAt || WB.nowISO()
    };
  }

  function normalizeDirection(value) {
    const direction = String(value || "all");
    return DIRECTIONS.has(direction) ? direction : "all";
  }

  WB.Links = {
    normalizeList(value) {
      return Array.isArray(value) ? value.map(cleanLink).filter(Boolean) : [];
    },
    normalizeState(state) {
      let changed = false;
      state.fileMeta = state.fileMeta || {};
      Object.values(state.fileMeta).forEach(meta => {
        if (meta) meta.links = this.normalizeList(meta.links);
      });
      if (state.virtualRoot) {
        WB.walkVirtual(state.virtualRoot, node => {
          node.links = this.normalizeList(node.links);
        });
      }
      return changed;
    },
    resolveTarget(state, link) {
      if (!link || link.targetType !== "virtual") return null;
      return WB.findVirtual(state.virtualRoot, link.targetId);
    },
    targetPath(state, link) {
      const target = this.resolveTarget(state, link);
      return target
        ? WB.virtualPath(state.virtualRoot, target.id).map(item => item.name).join(" › ")
        : "Missing World Book target";
    },
    relationLabel(state, link) {
      const definition = WB.Canon?.relationDefinition(state, link.relationshipType);
      return link._incoming
        ? (definition?.inverse || definition?.name || "related to")
        : (definition?.name || "related to");
    },
    displayLabel(state, link) {
      const target = this.resolveTarget(state, link);
      return String(link.label || target?.name || "Missing link");
    },
    collectTargets(state, excludeId) {
      const output = [];
      WB.walkVirtual(state.virtualRoot, node => {
        if (node.id !== excludeId && node.nodeRole !== "reference") {
          output.push({
            id: node.id,
            name: node.name,
            type: node.type,
            path: WB.virtualPath(state.virtualRoot, node.id).map(item => item.name).join(" › ")
          });
        }
      });
      return output;
    },
    forEntry(state, nodeId) {
      const node = WB.findVirtual(state.virtualRoot, nodeId);
      const outgoing = this.normalizeList(node?.links).map(link => ({ ...link, _incoming: false }));
      const incoming = [];
      WB.walkVirtual(state.virtualRoot, source => {
        if (source.id === nodeId || source.nodeRole === "reference") return;
        this.normalizeList(source.links).forEach(link => {
          if (link.targetId !== nodeId) return;
          incoming.push({
            ...link,
            _incoming: true,
            _sourceId: source.id,
            targetId: source.id,
            label: source.name
          });
        });
      });
      return [...outgoing, ...incoming];
    }
  };

  WB.LinkPanel = class {
    constructor(elements, callbacks) {
      this.el = elements;
      this.callbacks = callbacks;
      elements.add.addEventListener("click", callbacks.onAdd);
      elements.back.addEventListener("click", callbacks.onBack);
      elements.toggle.addEventListener("click", callbacks.onToggle);
      elements.filter.addEventListener("change", () => callbacks.onDirectionChange(elements.filter.value));
    }

    render(state, links, options) {
      const opts = options || {};
      const disabled = Boolean(opts.disabled);
      const backLabel = String(opts.backLabel || "");
      const collapsed = Boolean(opts.collapsed);
      const direction = normalizeDirection(opts.direction);
      const normalized = Array.isArray(links) ? links : [];
      const outgoingCount = normalized.filter(link => !link._incoming).length;
      const incomingCount = normalized.filter(link => link._incoming).length;
      const visible = normalized.filter(link => {
        if (direction === "incoming") return Boolean(link._incoming);
        if (direction === "outgoing") return !link._incoming;
        return true;
      });

      this.el.section.hidden = false;
      this.el.section.classList.toggle("is-collapsed", collapsed);
      this.el.toggle.textContent = collapsed ? "Expand" : "Collapse";
      this.el.toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      this.el.add.hidden = disabled;
      this.el.back.hidden = !backLabel;
      this.el.back.textContent = backLabel ? `← ${backLabel}` : "Back";
      this.el.filter.value = direction;
      this.el.list.innerHTML = "";
      this.el.count.textContent = `${outgoingCount} from here · ${incomingCount} to here`;

      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "link-empty";
        if (direction === "incoming") {
          empty.textContent = "No World Book files or folders link to this entry yet.";
        } else if (direction === "outgoing") {
          empty.textContent = disabled
            ? "No outgoing links were captured for this entry."
            : "No links leave this entry yet. Add one to connect it to another World Book source.";
        } else {
          empty.textContent = disabled
            ? "No links were captured for this entry."
            : "No links yet. Connect this entry to a character, faction, location, chapter, or other World Book source.";
        }
        this.el.list.appendChild(empty);
        return;
      }

      visible.forEach(link => {
        const target = WB.Links.resolveTarget(state, link);
        const row = document.createElement("div");
        row.className = `link-card${target ? "" : " missing"}${link._incoming ? " incoming" : " outgoing"}`;

        const open = document.createElement("button");
        open.type = "button";
        open.className = "link-card-main";
        open.disabled = !target;
        open.title = target
          ? (link._incoming ? "Open the entry that links here" : "Open linked World Book entry")
          : "This target no longer exists";
        open.addEventListener("click", () => this.callbacks.onOpen(link));

        const icon = document.createElement("span");
        icon.className = "link-card-icon";
        icon.textContent = target?.type === "folder" ? "📁" : target ? "📄" : "⚠";

        const text = document.createElement("span");
        text.className = "link-card-text";

        const title = document.createElement("strong");
        title.textContent = `${WB.Links.relationLabel(state, link)} → ${WB.Links.displayLabel(state, link)}`;

        const path = document.createElement("small");
        path.textContent = WB.Links.targetPath(state, link);

        const directionBadge = document.createElement("span");
        directionBadge.className = `link-direction-badge ${link._incoming ? "incoming" : "outgoing"}`;
        directionBadge.textContent = link._incoming ? "Links to here" : "From here";

        text.append(title, path, directionBadge);
        open.append(icon, text);
        row.appendChild(open);

        if (!disabled && !link._incoming) {
          const actions = document.createElement("div");
          actions.className = "link-card-actions";

          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "mini-link";
          edit.textContent = "Edit";
          edit.addEventListener("click", () => this.callbacks.onEdit(link));

          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "mini-link danger-link";
          remove.textContent = "Remove";
          remove.addEventListener("click", () => this.callbacks.onRemove(link));

          actions.append(edit, remove);
          row.appendChild(actions);
        }

        this.el.list.appendChild(row);
      });
    }
  };
})();
