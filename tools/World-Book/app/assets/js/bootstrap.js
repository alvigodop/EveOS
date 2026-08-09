(async function () {
  const fragmentBase = "fragments/";
  const names = await fetch(`${fragmentBase}manifest.json`, { cache: "no-store" }).then(r => r.json());
  const host = document.getElementById("dialog-host");
  for (const name of names) {
    const response = await fetch(`${fragmentBase}${name}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load interface fragment: ${name}`);
    host.insertAdjacentHTML("beforeend", await response.text());
  }

  const scripts = [
    "assets/js/api.js",
    "assets/js/state.js",
    "assets/js/theme.js",
    "assets/js/header-collapse.js",
    "assets/js/links.js",
    "assets/js/canon.js",
    "assets/js/smart-collections.js",
    "assets/js/integrity/core.js",
    "assets/js/integrity/rules.js",
    "assets/js/integrity/ui.js",
    "assets/js/taxonomy/mentions.js",
    "assets/js/taxonomy/core.js",
    "assets/js/taxonomy/inline.js",
    "assets/js/taxonomy/picker.js",
    "assets/js/taxonomy/dashboard.js",
    "assets/js/tree.js",
    "assets/js/editor.js",
    "assets/js/app-loader.js",
    "assets/js/narration/text.js",
    "assets/js/narration/integrity.js",
    "assets/js/narration/store.js",
    "assets/js/narration/browser.js",
    "assets/js/narration/gemini.js",
    "assets/js/narration/controller.js",
    "assets/js/narration/cache-ui.js",
    "assets/js/narration/layout.js",
    "assets/js/narration/ui.js"
  ];

  for (const source of scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}`));
      document.body.appendChild(script);
    });
  }
  await window.WorldBookAppReady;
  const controllers = [
    "assets/js/integration/core.js",
    "assets/js/integration/operations.js",
    "assets/js/integration/planner.js",
    "assets/js/integration/guide.js",
    "assets/js/integration/ui.js",
    "assets/js/recovery.js"
  ];
  for (const source of controllers) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}.`));
      document.body.appendChild(script);
    });
  }
})().catch(error => {
  console.error(error);
  document.body.innerHTML = `<main class="bootstrap-error"><h1>Eve OS World Book could not start</h1><p>${String(error.message || error)}</p></main>`;
});
