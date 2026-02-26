window.initNotifications = function () {
    if (!document.getElementById('toast-container')) {
        document.body.insertAdjacentHTML('beforeend', window.Notifications.template);
    }
};

window.showToast = function (msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.background = 'var(--bg-secondary)';
    toast.style.color = 'var(--text-primary)';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '8px';
    toast.style.border = '1px solid var(--border-color)';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    toast.style.pointerEvents = 'auto';

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="margin-right:8px;">${icon}</span> ${msg}`;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Initialize on load if needed, but handled by script-loader usually.
// Explicit check for safety:
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.initNotifications();
} else {
    document.addEventListener('DOMContentLoaded', window.initNotifications);
}
