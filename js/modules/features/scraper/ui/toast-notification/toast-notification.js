/**
 * Toast Notification Module (Facade)
 * 
 * Delegates to:
 * - TNStyles: Animation and styling
 * 
 * @version 1.1.0-facade
 */

const ToastNotification = {
    version: '1.1.0-facade',
    _initialized: false,
    _currentToast: null,

    config: {
        duration: 3000,
        position: 'top-center',
        zIndex: 99999
    },

    init() {
        if (this._initialized) return this;
        console.log('ToastNotification module initializing...');
        if (window.TNStyles && typeof TNStyles.init === 'function') {
            TNStyles.init();
            TNStyles._initialized = true;
        }
        this._ensureAnimationStyles();
        this._initialized = true;
        console.log('ToastNotification module initialized');
        return this;
    },

    _ensureAnimationStyles() {
        if (window.TNStyles) {
            TNStyles.ensureAnimationStyles();
        }
    },

    _getPositionStyles(position) {
        if (window.TNStyles) {
            return TNStyles.getPositionStyles(position);
        }
        return { top: '20px', left: '50%', transform: 'translateX(-50%)' };
    },

    show(message, type = 'info', options = {}) {
        const duration = options.duration !== undefined ? options.duration : this.config.duration;
        const position = options.position || this.config.position;

        this.hide();

        const toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.textContent = message;

        const color = window.TNStyles ? TNStyles.getTypeColors(type) : { bg: '#2196F3', text: '#fff' };
        const posStyles = this._getPositionStyles(position);

        let cssText = `
            position: fixed;
            background-color: ${color.bg};
            color: ${color.text};
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: ${this.config.zIndex};
            pointer-events: none;
        `;

        Object.entries(posStyles).forEach(([key, value]) => {
            cssText += `${key}: ${value};`;
        });

        toast.style.cssText = cssText;
        this._ensureAnimationStyles();
        document.body.appendChild(toast);
        this._currentToast = toast;

        if (duration > 0) {
            setTimeout(() => this.hide(toast), duration);
        }

        return toast;
    },

    hide(toastElement) {
        const toast = toastElement || document.getElementById('app-toast');
        if (toast && toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }
        if (!toastElement) this._currentToast = null;
    },

    info(message, options) { return this.show(message, 'info', options); },
    success(message, options) { return this.show(message, 'success', options); },
    warning(message, options) { return this.show(message, 'warning', options); },
    error(message, options) { return this.show(message, 'error', options); }
};

ToastNotification.init();

if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ToastNotification', ToastNotification);
}

window.ToastNotification = ToastNotification;
console.log('ToastNotification module loaded');
