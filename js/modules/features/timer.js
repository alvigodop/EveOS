// --- TIMER MODULE ---
// Variables declared in core.js (timerInterval, timerSeconds, timerRunning) to avoid collisions

window.initTimer = function () {
    const timerArea = document.getElementById('timer-area');
    if (!timerArea) return;

    if (config.timerEnabled) {
        timerArea.style.display = 'flex';
        updateTimerButton();
    } else {
        timerArea.style.display = 'none';
        if (timerRunning) toggleTimer();
    }
}

// Ensure these functions are globally available
// Core variables expected: timerSeconds (current), timerDuration (saved preference)
if (typeof timerDuration === 'undefined') window.timerDuration = 1500;

window.toggleTimer = function () {
    const btn = document.getElementById('timer-toggle-btn');
    if (timerRunning) {
        clearInterval(timerInterval);
        timerRunning = false;
    } else {
        if (timerSeconds <= 0) timerSeconds = timerDuration;
        timerInterval = setInterval(() => {
            if (timerSeconds > 0) {
                timerSeconds--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                showToast("⏰ Time's Up!", 'success');
                timerRunning = false;
                updateTimerButton();
            }
        }, 1000);
        timerRunning = true;
    }
    updateTimerButton();
}

window.resetTimer = function () {
    clearInterval(timerInterval);
    timerRunning = false;
    timerSeconds = timerDuration; // Reset to user preference
    updateTimerDisplay();
    updateTimerButton();
}

window.editTimer = function () {
    if (timerRunning) return;

    const display = document.getElementById('timer-display');
    if (!display) return;

    // Turn into input
    const currentMinutes = Math.floor(timerSeconds / 60);
    display.innerHTML = `<input type="number" id="timer-input" value="${currentMinutes}" style="width:50px; background:transparent; border:none; color:inherit; font:inherit; text-align:center;">`;

    const input = document.getElementById('timer-input');
    input.focus();
    input.select();

    const save = () => {
        let val = parseInt(input.value);
        if (!isNaN(val) && val > 0) {
            timerDuration = val * 60; // Save preference
            timerSeconds = timerDuration;
            showToast(`Timer set to ${val} mins`, 'success');
        }
        updateTimerDisplay(); // Re-render span
    };

    input.onblur = save;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') { input.blur(); }
    };
}

window.updateTimerButton = function () {
    const btn = document.getElementById('timer-toggle-btn');
    if (btn) {
        btn.innerHTML = timerRunning ? '⏸' : '▶';
        btn.title = timerRunning ? 'Pause' : 'Start';
    }
}

window.updateTimerDisplay = function () {
    const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
    const s = (timerSeconds % 60).toString().padStart(2, '0');
    const display = document.getElementById('timer-display');
    if (display) display.innerText = `${m}:${s}`;
}
