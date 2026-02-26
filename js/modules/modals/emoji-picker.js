// --- EMOJI PICKER ---
const emojis = ["🏠", "🏢", "💼", "🎓", "🎮", "🎬", "🎵", "📷", "🎨", "📚", "💡", "🔥", "⭐", "❤️", "✅", "⚠️", "❌", "💻", "📱", "⌚", "⌨️", "🖱️", "💾", "💿", "📁", "📂", "📅", "📊", "📉", "📈", "📋", "📌", "📍", "📧", "📞", "💬", "☁️", "☀️", "🌧️", "❄️", "🌙", "🌍", "🚀", "✈️", "🚗", "🚲", "🛑", "⚓", "⛵", "⚽", "🏀", "🏈", "🎾", "🏆", "🥇", "🍔", "🍕", "🍣", "☕", "🍺", "🍷", "🍎", "🍓", "🥑", "🥦", "🐶", "🐱", "🐭", "🦊", "🐻", "🐼", "🦁", "🦄", "🐝", "🦋", "💐", "🌸", "🌹", "🌻", "🌲", "🌵", "⚛️", "☢️", "☣️", "☮️", "☯️", "🕉️", "✝️", "☪️", "🕎", "🔯", "♈", "♉", "♊", "♋", "♌", "♍", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤"];
let targetEmojiInput = null;

function openEmojiPicker(inputId) {
    targetEmojiInput = document.getElementById(inputId);
    const container = document.getElementById('emoji-picker-container');
    const grid = document.getElementById('emoji-grid');
    if (!container || !grid) return;

    grid.innerHTML = '';
    emojis.forEach(e => {
        const el = document.createElement('div');
        el.className = 'emoji-item';
        el.innerText = e;
        el.onclick = () => {
            if (targetEmojiInput) targetEmojiInput.value = e;
            closeEmojiModal();
        };
        grid.appendChild(el);
    });
    container.style.display = 'flex';
}

function closeEmojiModal() {
    const el = document.getElementById('emoji-picker-container');
    if (el) el.style.display = 'none';
}
