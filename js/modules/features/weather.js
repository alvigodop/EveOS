// --- WEATHER MODULE ---
function initWeather() {
    const el = document.getElementById('weather-span');
    if (!el) return;

    if (config.weatherEnabled) {
        el.style.display = 'inline-flex';
        fetchWeather();
    } else {
        el.style.display = 'none';
    }
}

async function fetchWeather() {
    const textEl = document.getElementById('weather-text');
    const iconEl = document.getElementById('weather-icon');
    if (!config.weatherEnabled) return;

    if (textEl) textEl.innerText = "Locating...";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current_weather=true`)
                .then(r => r.json())
                .then(d => {
                    const t = Math.round(d.current_weather.temperature);
                    const c = d.current_weather.weathercode;
                    let i = "☀️";
                    if (c > 2) i = "☁️";
                    if (c > 50) i = "🌧";
                    if (c > 70) i = "❄️";
                    if (c > 95) i = "⛈";

                    if (iconEl) iconEl.innerText = i;
                    if (textEl) textEl.innerText = `${t}°C`;
                })
                .catch(e => {
                    if (textEl) textEl.innerText = "Error";
                });
        }, () => {
            if (textEl) textEl.innerText = "Loc Denied";
        });
    } else {
        if (textEl) textEl.innerText = "No Geo";
    }
}

