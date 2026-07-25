// Owns the WPL file <input>, deliberately OUTSIDE the Audioflix panel's markup.
//
// The picker used to be rendered inside the import form. Opening the OS dialog is async, and any
// rerender that landed while the dialog was still open (the server's wpl-read resolving, a
// FileReader finishing, the hotkey poll) replaced the form — and with it the very input the dialog
// belonged to. The user's pick then fired `change` on a node that was no longer in the document, so
// the panel's delegated listener never heard it and nothing happened. Pressing Browse a second time
// worked only because no async work was still in flight to yank the input away. Keeping one
// long-lived input on document.body, with its own direct listener, removes that race entirely.
window.EveAudioflixUiPicker = window.EveAudioflixUiPicker || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiPicker;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        const { rerender } = ctx;
        const V = ctx.view;
        let input = null;

        function applyFile(file) {
            const pathString = file.path || file.name || '';
            V.importFormValues = { ...V.importFormValues, wplUrl: pathString };
            rerender();

            // Read the bytes we already hold FIRST. Asking the server before doing this meant that
            // with the server off the import sat behind a ~7.5s probe timeout, and pressing Import
            // during that window fell through to a second timeout — it just looked frozen.
            const reader = new FileReader();
            reader.onload = (evt) => {
                V.importFormValues = { ...V.importFormValues, wplFileContent: evt.target?.result || '' };
                V.playbackStatus = `Selected WPL file "${file.name}". Specify target folder and click Import.`;
                rerender();
            };
            reader.onerror = () => {
                V.playbackStatus = `Could not read "${file.name}".`;
                rerender();
            };
            reader.readAsText(file);

            // Then, if a server is up, upgrade the bare filename a browser gives us to the real
            // absolute path — that is what a later re-sync needs. Purely an enhancement; the
            // import above already works without it.
            window.EveAudioflixNative?.readWplFile?.(pathString).then((readRes) => {
                if (!readRes?.ok || !readRes.path) return;
                V.importFormValues = { ...V.importFormValues, wplUrl: readRes.path };
                V.playbackStatus = `Selected WPL file "${readRes.path}". Specify target folder and click Import.`;
                rerender();
            }).catch(() => { /* no server: the local read above already covered us */ });
        }

        function ensureInput() {
            if (input) return input;
            input = Object.assign(document.createElement('input'), {
                type: 'file',
                accept: '.wpl,.xml',
                className: 'audioflix-wpl-file-picker'
            });
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', () => {
                const file = input.files?.[0];
                // Clear the value so re-picking the SAME file still fires `change` next time —
                // otherwise a second attempt at the same playlist is silently ignored.
                input.value = '';
                if (file) applyFile(file);
            });
            return input;
        }

        return { open: () => ensureInput().click() };
    };

    ns.ready = true;
})();
