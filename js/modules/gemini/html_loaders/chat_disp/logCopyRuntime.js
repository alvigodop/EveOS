/**
 * Shared copy controls for Gemini conversation/system logs.
 */
(function () {
    if (window.GeminiLogCopyRuntime?.ready) return;

    function getContainer(kind) {
        if (kind === 'system') return document.querySelector('#systemLog .system-messages-container');
        return document.querySelector('#chatLog .chat-messages-container');
    }

    function extractText(kind) {
        const container = getContainer(kind);
        if (!container) return '';
        const title = kind === 'system' ? 'EveOS Gemini System Messages' : 'EveOS Gemini Conversations';
        const text = Array.from(container.children)
            .map((node) => String(node.innerText || node.textContent || '').trim())
            .filter(Boolean)
            .join('\n\n');
        return `${title}\nGenerated: ${new Date().toISOString()}\n\n${text || '(empty)'}`;
    }

    async function copyText(value) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        return ok;
    }

    function pulse(button, label) {
        if (!button) return;
        const previous = button.dataset.copyLabel || button.textContent || 'Copy';
        button.dataset.copyLabel = previous;
        const text = button.querySelector('span');
        if (text) text.textContent = label;
        button.classList.add('is-copied');
        window.setTimeout(() => {
            if (text) text.textContent = 'Copy';
            button.classList.remove('is-copied');
        }, 1400);
    }

    async function handleClick(event) {
        const button = event.target.closest('[data-gemini-copy-log]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const kind = button.getAttribute('data-gemini-copy-log') || 'chat';
        try {
            await copyText(extractText(kind));
            pulse(button, 'Copied');
        } catch (error) {
            console.warn('[GeminiLogCopy] Copy failed:', error);
            pulse(button, 'Failed');
        }
    }

    document.addEventListener('click', handleClick, true);

    window.GeminiLogCopyRuntime = {
        ready: true,
        extractText,
        copyText
    };
})();
