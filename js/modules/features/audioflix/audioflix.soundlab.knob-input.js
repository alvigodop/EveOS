window.EveAudioflixSoundLabKnobInput = window.EveAudioflixSoundLabKnobInput || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabKnobInput;
    if (ns.ready) return;

    function snapped(value, input) {
        const min = Number(input.min || 0);
        const max = Number(input.max || 1);
        const step = Math.max(Number(input.step || 0.01), Number.EPSILON);
        const bounded = Math.max(min, Math.min(max, value));
        return Math.round((bounded - min) / step) * step + min;
    }

    function emit(input, type) {
        input.dispatchEvent(new Event(type, { bubbles: true }));
    }

    function bindInput(input) {
        if (input.dataset.sfKnobBound === '1') return;
        input.dataset.sfKnobBound = '1';
        input.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const min = Number(input.min || 0);
            const max = Number(input.max || 1);
            const startY = event.clientY;
            const startValue = Number(input.value || min);
            const pointerId = event.pointerId;

            const move = (moveEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                const travel = moveEvent.shiftKey ? 1200 : 360;
                input.value = String(snapped(
                    startValue + ((startY - moveEvent.clientY) / travel) * (max - min),
                    input
                ));
                emit(input, 'input');
            };
            const finish = (upEvent) => {
                if (upEvent.pointerId !== pointerId) return;
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', finish);
                window.removeEventListener('pointercancel', finish);
                emit(input, 'change');
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', finish);
            window.addEventListener('pointercancel', finish);
        });
        input.addEventListener('wheel', (event) => {
            event.preventDefault();
            const step = Number(input.step || 0.01) * (event.shiftKey ? 1 : 4);
            input.value = String(snapped(
                Number(input.value || 0) + (event.deltaY > 0 ? -step : step),
                input
            ));
            emit(input, 'input');
            emit(input, 'change');
        }, { passive: false });
    }

    function bind(root) {
        root?.querySelectorAll?.('.sonic-forge-knob-shell input[type="range"]').forEach(bindInput);
    }

    Object.assign(ns, { ready: true, bind });
})();
