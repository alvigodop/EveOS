window.initNotifications = function () {
    if (!document.getElementById('toast-container')) {
        document.body.insertAdjacentHTML('beforeend', window.Notifications.template);
    }
};

window.showToast = function (msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.background = 'var(--modal-bg)';
    toast.style.color = 'var(--text-main)';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '8px';
    toast.style.border = '1px solid var(--modal-border)';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    toast.style.pointerEvents = 'auto';

    let icon = '\u2139\uFE0F';
    if (type === 'success') icon = '\u2705';
    if (type === 'error') icon = '\u274C';
    if (type === 'warning') icon = '\u26A0\uFE0F';

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

if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.initNotifications();
} else {
    document.addEventListener('DOMContentLoaded', window.initNotifications);
}
