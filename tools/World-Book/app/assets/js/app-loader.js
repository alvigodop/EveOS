window.WorldBookAppReady = (async function () {
  const base = "assets/js/app/chains/";
  const manifest = await fetch(`${base}manifest.json`, { cache: "no-store" }).then(response => {
    if (!response.ok) throw new Error("Could not load the app chain manifest.");
    return response.json();
  });
  const sources = [];
  for (const name of manifest) {
    const response = await fetch(`${base}${name}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load app layer: ${name}`);
    sources.push(`\n/* app-chain:${name} */\n${await response.text()}`);
  }
  Function(sources.join("\n"))();
})();
