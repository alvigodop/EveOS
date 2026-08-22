export function createGeographyPanel({ onCountrySelect, onClear }) {
  const panel = document.getElementById("geographyPanel");
  const title = document.getElementById("geographyTitle");
  const summary = document.getElementById("geographySummary");
  const search = document.getElementById("countrySearch");
  const list = document.getElementById("countryList");
  const clearButton = document.getElementById("clearGeographySelection");
  let currentCountries = [];

  function render(query = "") {
    const normalized = query.trim().toLocaleLowerCase();
    list.replaceChildren();
    const filtered = currentCountries.filter((country) =>
      country.name.toLocaleLowerCase().includes(normalized),
    );
    for (const country of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "country-list__button";
      button.textContent = country.name;
      button.addEventListener("click", () => onCountrySelect(country));
      list.appendChild(button);
    }
  }

  search.addEventListener("input", () => render(search.value));
  clearButton.addEventListener("click", onClear);

  return {
    show(world, continent, countries) {
      currentCountries = countries;
      panel.hidden = false;
      title.textContent = `${world.name} › ${continent.name}`;
      summary.textContent = countries.length
        ? `${world.name} owns ${countries.length} countries and territories here. Click one to focus it.`
        : "Antarctica has no sovereign countries.";
      search.hidden = countries.length === 0;
      search.value = "";
      render();
    },
    hide() {
      panel.hidden = true;
      currentCountries = [];
      list.replaceChildren();
    },
  };
}
