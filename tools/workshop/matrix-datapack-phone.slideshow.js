window.EveMatrixPhoneSlideshow = (function () {
    'use strict';

    var DEFAULT_SPEED_MS = 3000;
    var MIN_SPEED_MS = 500;
    var MAX_SPEED_MS = 10000;
    var SPEED_STEP_MS = 500;

    function normalizeIndex(index, length) {
        if (!length) return 0;
        return ((Number(index) || 0) % length + length) % length;
    }

    function create(state, render) {
        function stop() {
            window.clearInterval(state.slideTimer);
            state.slideTimer = 0;
            state.slidePlaying = false;
        }

        function nextIndex() {
            var length = state.slideItems.length;
            if (!length) return 0;
            if (!state.slideShuffle || length < 2) {
                return normalizeIndex(state.slideIndex + 1, length);
            }
            var next = state.slideIndex;
            while (next === state.slideIndex) {
                next = Math.floor(Math.random() * length);
            }
            return next;
        }

        function start() {
            stop();
            if (!state.slideItems.length) {
                render();
                return;
            }
            state.slidePlaying = true;
            state.slideTimer = window.setInterval(function () {
                state.slideIndex = nextIndex();
                render();
            }, state.slideSpeed);
            render();
        }

        function restartIfPlaying() {
            if (state.slidePlaying) start();
            else render();
        }

        return {
            setItems: function (items) {
                stop();
                state.slideItems = Array.isArray(items) ? items : [];
                state.slideIndex = 0;
            },
            move: function (delta) {
                state.slideIndex = normalizeIndex(
                    state.slideIndex + Number(delta || 0),
                    state.slideItems.length
                );
                render();
            },
            goTo: function (index) {
                state.slideIndex = normalizeIndex(index, state.slideItems.length);
                render();
            },
            start: start,
            stop: stop,
            toggle: function () {
                if (state.slidePlaying) {
                    stop();
                    render();
                } else {
                    start();
                }
            },
            toggleShuffle: function () {
                state.slideShuffle = !state.slideShuffle;
                restartIfPlaying();
            },
            adjustSpeed: function (direction) {
                var next = state.slideSpeed + (Number(direction) || 0) * SPEED_STEP_MS;
                state.slideSpeed = Math.max(MIN_SPEED_MS, Math.min(MAX_SPEED_MS, next));
                restartIfPlaying();
            },
            setOpacity: function (value) {
                state.slideOpacity = Math.max(10, Math.min(100, Number(value) || 100));
                render();
            }
        };
    }

    return {
        create: create,
        defaults: {
            speed: DEFAULT_SPEED_MS,
            opacity: 100
        }
    };
})();
