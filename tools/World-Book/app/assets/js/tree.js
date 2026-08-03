(function () {
  const WB = window.WorldBook;

  function iconFor(node, source) {
    if (node.nodeRole === "reference") return "↗";
    if (node.nodeRole === "smart-collection") return "✦";
    if (node.kind === "folder" || node.type === "folder") return source === "import" ? "🗂️" : "📁";
    if (String(node.extension || "").toLowerCase() === ".docx") return "📝";
    return source === "import" ? "📦" : "📄";
  }

  function clearDropClasses(row) {
    row.classList.remove("drop-before", "drop-inside", "drop-after");
  }

  function virtualDropPosition(event, row, node) {
    if (node.id === "root") return "inside";
    const rect = row.getBoundingClientRect();
    const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    if (ratio < 0.27) return "before";
    if (ratio > 0.73) return "after";
    return node.type === "folder" ? "inside" : "after";
  }

  WB.Tree = {
    renderPhysical(rootNode, panel, selectedKey, handlers) {
      panel.innerHTML = "";
      const list = document.createElement("ul");
      list.appendChild(this.renderPhysicalNode(rootNode, selectedKey, handlers));
      panel.appendChild(list);
    },

    renderPhysicalNode(node, selectedKey, handlers) {
      const item = document.createElement("li");
      const row = document.createElement("div");
      const key = `physical:${node.relativePath || ""}`;
      row.className = `tree-row${selectedKey === key ? " selected" : ""}`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tree-toggle";

      if (node.kind === "folder") {
        toggle.textContent = node.open ? "▾" : "▸";
        toggle.addEventListener("click", event => {
          event.stopPropagation();
          handlers.onToggle(node);
        });
      } else {
        toggle.classList.add("placeholder");
        toggle.textContent = "•";
      }

      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "tree-entry";
      entry.title = node.relativePath || node.name;
      entry.addEventListener("click", () => handlers.onSelect(node));

      const icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.textContent = iconFor(node, "physical");

      const name = document.createElement("span");
      name.className = "tree-name";
      name.textContent = node.name;

      entry.append(icon, name);

      if (node.readable && node.kind === "file") {
        const badge = document.createElement("span");
        badge.className = "tree-badge";
        badge.textContent = "read";
        entry.appendChild(badge);
      }

      row.append(toggle, entry);
      item.appendChild(row);

      if (node.kind === "folder" && node.open) {
        if (node.loading) {
          const loading = document.createElement("div");
          loading.className = "tree-loading";
          loading.textContent = "Loading…";
          item.appendChild(loading);
        } else if (Array.isArray(node.children) && node.children.length) {
          const childList = document.createElement("ul");
          node.children.forEach(child => {
            childList.appendChild(this.renderPhysicalNode(child, selectedKey, handlers));
          });
          item.appendChild(childList);
        }
      }

      return item;
    },

    renderVirtual(root, panel, selectedKey, handlers) {
      panel.innerHTML = "";
      const list = document.createElement("ul");
      list.appendChild(this.renderVirtualNode(root, selectedKey, handlers));
      panel.appendChild(list);
    },

    renderVirtualNode(node, selectedKey, handlers) {
      const item = document.createElement("li");
      const row = document.createElement("div");
      const key = `virtual:${node.id}`;
      row.className = `tree-row virtual-tree-row${selectedKey === key ? " selected" : ""}`;
      row.dataset.virtualId = node.id;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tree-toggle";

      if (node.type === "folder") {
        toggle.textContent = node.open ? "▾" : "▸";
        toggle.addEventListener("click", event => {
          event.stopPropagation();
          handlers.onToggle(node);
        });
      } else {
        toggle.classList.add("placeholder");
        toggle.textContent = "•";
      }

      if (node.id !== "root" && node.nodeRole !== "reference") {
        const dragHandle = document.createElement("span");
        dragHandle.className = "tree-drag-handle";
        dragHandle.textContent = "⋮⋮";
        dragHandle.title = "Drag to move or reorder";
        dragHandle.setAttribute("aria-hidden", "true");
        row.appendChild(dragHandle);
        row.draggable = true;

        row.addEventListener("dragstart", event => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
          row.classList.add("dragging");
          handlers.onDragStart?.(node);
        });
        row.addEventListener("dragend", event => {
          event.stopPropagation();
          row.classList.remove("dragging");
          clearDropClasses(row);
          handlers.onDragEnd?.(node);
        });
      }

      row.addEventListener("dragover", event => {
        const draggedId = handlers.draggedId?.();
        if (!draggedId || draggedId === node.id) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const position = virtualDropPosition(event, row, node);
        clearDropClasses(row);
        row.classList.add(`drop-${position}`);
        handlers.onDragOver?.(node, position);
      });

      row.addEventListener("dragleave", event => {
        if (!row.contains(event.relatedTarget)) clearDropClasses(row);
      });

      row.addEventListener("drop", event => {
        const draggedId = handlers.draggedId?.() || event.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === node.id) return;
        event.preventDefault();
        event.stopPropagation();
        const position = virtualDropPosition(event, row, node);
        clearDropClasses(row);
        handlers.onDrop?.(draggedId, node, position);
      });

      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "tree-entry";
      entry.addEventListener("click", () => handlers.onSelect(node));

      const icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.textContent = iconFor(node, "virtual");

      const name = document.createElement("span");
      name.className = "tree-name";
      name.textContent = node.name;

      const badge = document.createElement("span");
      badge.className = `tree-badge status-${node.status || "draft"}`;
      badge.textContent = node.nodeRole === "reference" ? "shortcut" : node.nodeRole === "smart-collection" ? "smart" : (handlers.statusLabel ? handlers.statusLabel(node.status || "draft") : (node.status || "draft"));

      entry.append(icon, name, badge);
      row.append(toggle, entry);
      item.appendChild(row);

      if (node.type === "folder" && node.open && node.children.length) {
        const childList = document.createElement("ul");
        node.children.forEach(child => {
          childList.appendChild(this.renderVirtualNode(child, selectedKey, handlers));
        });
        item.appendChild(childList);
      }

      return item;
    },

    renderImports(imports, panel, selectedKey, handlers) {
      panel.innerHTML = "";

      if (!imports.length) {
        panel.innerHTML = '<p class="tree-loading">Imported snapshots will appear here.</p>';
        return;
      }

      const list = document.createElement("ul");
      imports.forEach(record => {
        const item = document.createElement("li");
        const row = document.createElement("div");
        row.className = "tree-row";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "tree-toggle";
        toggle.textContent = record.open ? "▾" : "▸";
        toggle.addEventListener("click", event => {
          event.stopPropagation();
          handlers.onToggleImport(record);
        });

        const entry = document.createElement("button");
        entry.type = "button";
        entry.className = "tree-entry";
        entry.addEventListener("click", () => handlers.onSelectImport(record));

        const icon = document.createElement("span");
        icon.className = "tree-icon";
        icon.textContent = "📦";

        const name = document.createElement("span");
        name.className = "tree-name";
        name.textContent = record.name;

        const badge = document.createElement("span");
        badge.className = "tree-badge";
        badge.textContent = String(record.entryCount || 0);

        entry.append(icon, name, badge);
        row.append(toggle, entry);
        item.appendChild(row);

        if (record.open && record.tree) {
          const childList = document.createElement("ul");
          record.tree.children.forEach(child => {
            childList.appendChild(this.renderSnapshotNode(child, selectedKey, handlers, record));
          });
          item.appendChild(childList);
        }

        list.appendChild(item);
      });

      panel.appendChild(list);
    },

    renderSnapshotNode(node, selectedKey, handlers, record) {
      const item = document.createElement("li");
      const row = document.createElement("div");
      const key = `snapshot:${record.id}:${node.relativePath}`;
      row.className = `tree-row${selectedKey === key ? " selected" : ""}`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tree-toggle";

      if (node.kind === "folder") {
        toggle.textContent = node.open ? "▾" : "▸";
        toggle.addEventListener("click", event => {
          event.stopPropagation();
          node.open = !node.open;
          handlers.onRender();
        });
      } else {
        toggle.classList.add("placeholder");
        toggle.textContent = "•";
      }

      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "tree-entry";
      entry.addEventListener("click", () => handlers.onSelectSnapshot(node, record));

      const icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.textContent = iconFor(node, "import");

      const name = document.createElement("span");
      name.className = "tree-name";
      name.textContent = node.name;

      entry.append(icon, name);
      row.append(toggle, entry);
      item.appendChild(row);

      if (node.kind === "folder" && node.open && node.children.length) {
        const childList = document.createElement("ul");
        node.children.forEach(child => {
          childList.appendChild(this.renderSnapshotNode(child, selectedKey, handlers, record));
        });
        item.appendChild(childList);
      }

      return item;
    }
  };
})();
