export function downloadOuterToolJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fillOuterToolSelect(select, layers, selectedId) {
  const previous = selectedId || select.value;
  select.innerHTML = "";
  if (!layers.length) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No layer available";
    select.appendChild(empty);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const layer of layers) {
    const option = document.createElement("option");
    option.value = layer.id;
    option.textContent = layer.isCanonical ? `${layer.name} (canonical)` : layer.name;
    select.appendChild(option);
  }
  if (previous && layers.some((layer) => layer.id === previous)) select.value = previous;
}
