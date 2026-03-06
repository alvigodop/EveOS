window.EveOS = window.EveOS || {};
window.EveOS.HeaderControls = window.EveOS.HeaderControls || {};

(function () {
    window.EveOS.HeaderControls.createUiFormHelpers = function createUiFormHelpers(deps) {
        const byId = deps?.byId;
        const fontOptions = deps?.fontOptions || [];

        function buildFontOptions(currentValue) {
            return fontOptions.map(option => {
                const selected = option.value === currentValue ? ' selected' : '';
                return `<option value="${option.value.replace(/"/g, '&quot;')}"${selected}>${option.label}</option>`;
            }).join('');
        }

        function updateRangeLabels() {
            const sizeValue = byId('hcFontSize')?.value || '56';
            const spacingValue = byId('hcLetterSpacing')?.value || '2';
            if (byId('hcFontSizeValue')) byId('hcFontSizeValue').textContent = `${sizeValue}px`;
            if (byId('hcLetterSpacingValue')) byId('hcLetterSpacingValue').textContent = `${spacingValue}px`;
        }

        function isHexColor(value) {
            return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
        }

        function readForm() {
            const modeValue = byId('hcMode')?.value === 'clock' ? 'clock' : 'greeting';
            const textColor = byId('hcTextColor')?.value || '';
            const effectColor = byId('hcEffectColor')?.value || '#00d4ff';

            return {
                mode: modeValue,
                settings: {
                    showDate: !!byId('hcShowDate')?.checked,
                    use24HourClock: !!byId('hcUse24h')?.checked,
                    includeName: !!byId('hcIncludeName')?.checked,
                    morningMessage: byId('hcMorning')?.value || '',
                    afternoonMessage: byId('hcAfternoon')?.value || '',
                    eveningMessage: byId('hcEvening')?.value || '',
                    fontFamily: byId('hcFont')?.value || '',
                    fontSize: Number(byId('hcFontSize')?.value || 56),
                    letterSpacing: Number(byId('hcLetterSpacing')?.value || 2),
                    textColor: isHexColor(textColor) ? textColor : '',
                    effect: byId('hcEffect')?.value || 'none',
                    effectColor: isHexColor(effectColor) ? effectColor : '#00d4ff'
                }
            };
        }

        function updatePreview() {
            const preview = byId('hcPreview');
            if (!preview) return;

            const payload = readForm();
            const now = new Date();
            let previewText = payload.mode === 'clock'
                ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !payload.settings.use24HourClock })
                : payload.settings.morningMessage;

            if (payload.mode !== 'clock') {
                const hour = now.getHours();
                if (hour >= 18) previewText = payload.settings.eveningMessage;
                else if (hour >= 12) previewText = payload.settings.afternoonMessage;
            }
            if (payload.settings.includeName && config.userName) {
                previewText = `${previewText}, ${config.userName}`;
            }

            preview.textContent = previewText;
            preview.style.fontFamily = payload.settings.fontFamily;
            preview.style.fontSize = `${payload.settings.fontSize}px`;
            preview.style.letterSpacing = `${payload.settings.letterSpacing}px`;
            preview.style.color = payload.settings.textColor || 'var(--accent)';
            preview.style.setProperty('--header-effect-color', payload.settings.effectColor || '#00d4ff');

            preview.classList.remove(
                'hc-effect-rainbow',
                'hc-effect-glow',
                'hc-effect-bounce',
                'hc-effect-wave',
                'hc-effect-fade',
                'hc-effect-shake',
                'hc-effect-neon',
                'hc-effect-glitch'
            );
            if (payload.settings.effect && payload.settings.effect !== 'none') {
                preview.classList.add(`hc-effect-${payload.settings.effect}`);
            }
        }

        function fillForm(settings) {
            const mode = config.headerMode === 'clock' ? 'clock' : 'greeting';
            if (byId('hcMode')) byId('hcMode').value = mode;

            const textColor = isHexColor(settings.textColor) ? settings.textColor : '#00d4ff';
            const effectColor = isHexColor(settings.effectColor) ? settings.effectColor : '#00d4ff';

            if (byId('hcShowDate')) byId('hcShowDate').checked = settings.showDate !== false;
            if (byId('hcUse24h')) byId('hcUse24h').checked = !!settings.use24HourClock;
            if (byId('hcIncludeName')) byId('hcIncludeName').checked = settings.includeName !== false;
            if (byId('hcMorning')) byId('hcMorning').value = settings.morningMessage || '';
            if (byId('hcAfternoon')) byId('hcAfternoon').value = settings.afternoonMessage || '';
            if (byId('hcEvening')) byId('hcEvening').value = settings.eveningMessage || '';
            if (byId('hcFont')) byId('hcFont').value = settings.fontFamily || fontOptions[0].value;
            if (byId('hcFontSize')) byId('hcFontSize').value = String(settings.fontSize || 56);
            if (byId('hcLetterSpacing')) byId('hcLetterSpacing').value = String(settings.letterSpacing || 2);
            if (byId('hcTextColor')) byId('hcTextColor').value = textColor;
            if (byId('hcEffect')) byId('hcEffect').value = settings.effect || 'none';
            if (byId('hcEffectColor')) byId('hcEffectColor').value = effectColor;

            updateRangeLabels();
            updatePreview();
        }

        return {
            buildFontOptions,
            updateRangeLabels,
            readForm,
            fillForm,
            updatePreview
        };
    };
})();
