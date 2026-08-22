import { describeStatus, initializationHint } from "./outer-tool-registry.js";

export function renderOuterToolPanel({ panel, registry, onOpen }) {
  if (!panel.list) return;
  const tools = registry.getTools();
  panel.list.innerHTML = "";
  if (panel.count) panel.count.textContent = `${registry.availableCount()} available`;
  for (const tool of tools) {
    const status = describeStatus(tool);
    const card = document.createElement("article");
    card.className = `outer-tool-card outer-tool-card--${status.state}`;
    const head = document.createElement("div");
    head.className = "outer-tool-card__head";
    const name = document.createElement("strong");
    name.textContent = tool.name;
    const badge = document.createElement("span");
    badge.className = `outer-tool-badge outer-tool-badge--${status.state}`;
    badge.textContent = status.label;
    head.append(name, badge);
    const meta = document.createElement("span");
    meta.className = "outer-tool-card__meta";
    meta.textContent = tool.commit ? `${tool.path} @ ${tool.commitShort}` : tool.path;
    const license = document.createElement("span");
    license.className = "outer-tool-card__meta";
    license.textContent = tool.license
      ? `${tool.license} · isolated page and realm`
      : "isolated page and realm";
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = "Open port";
    action.disabled = !tool.available;
    action.addEventListener("click", () => onOpen(tool.id));
    card.append(head, meta, license);
    if (!tool.available) {
      const hint = document.createElement("em");
      hint.className = "outer-tool-card__hint";
      hint.textContent = initializationHint(tool);
      card.appendChild(hint);
    }
    card.appendChild(action);
    panel.list.appendChild(card);
  }
  if (panel.summary) {
    panel.summary.textContent = tools.length
      ? "Outer tools exchange world-keyed, revisioned data through the port."
      : "No outer tools registered.";
  }
}
