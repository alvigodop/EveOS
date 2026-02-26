// --- READOUT / HEADER ---

function updateTimeAndGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const display = document.getElementById('main-display');
    if (!display) return;

    let greetingText = "Good Morning";
    if (hour >= 12) greetingText = "Good Afternoon";
    if (hour >= 18) greetingText = "Good Evening";
    if (config.userName) greetingText += `, ${config.userName}`;
    const timeText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (config.headerMode === 'clock') {
        display.innerText = timeText;
        display.style.fontFamily = 'monospace';
    } else {
        display.innerText = greetingText;
        display.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }
    const dateArea = document.getElementById('date-area');
    if (dateArea) dateArea.innerText = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}


function toggleHeaderMode() {
    config.headerMode = config.headerMode === "greeting" ? "clock" : "greeting";
    saveConfig();
    updateTimeAndGreeting();
}
