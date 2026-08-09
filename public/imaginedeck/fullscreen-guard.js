(() => {
    'use strict';

    const FULLSCREEN_GUARD_VERSION = 1;
    const COUNTDOWN_SECONDS = 10;
    const COUNTDOWN_INTERVAL_MS = 1_000;
    const STATE = Object.freeze({
        BOOT: 'boot',
        FULLSCREEN: 'fullscreen',
        COUNTDOWN: 'countdown',
        REQUESTING: 'requesting',
        TAP_REQUIRED: 'tap-required',
        UNAVAILABLE: 'unavailable',
        SUSPENDED: 'suspended'
    });

    const overlay = document.getElementById('fullscreen-guard');
    const title = document.getElementById('fullscreen-guard-title');
    const message = document.getElementById('fullscreen-guard-message');
    const counter = document.getElementById('fullscreen-guard-countdown');

    if (!overlay || !title || !message || !counter) {
        console.error('[ImagineDeck Fullscreen Guard] Required overlay elements are missing.');
        return;
    }

    const fullscreenDisplayMode = typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: fullscreen)')
        : null;

    let state = STATE.BOOT;
    let remainingSeconds = COUNTDOWN_SECONDS;
    let countdownTimerId = null;
    let requestInFlight = false;

    function isDocumentVisible() {
        return document.visibilityState !== 'hidden';
    }

    function isEffectiveFullscreen() {
        return Boolean(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            fullscreenDisplayMode?.matches
        );
    }

    function clearCountdownTimer() {
        if (countdownTimerId !== null) {
            clearTimeout(countdownTimerId);
            countdownTimerId = null;
        }
    }

    function setState(nextState) {
        state = nextState;
        overlay.dataset.state = nextState;
    }

    function enterFullscreenState(reason) {
        clearCountdownTimer();
        remainingSeconds = COUNTDOWN_SECONDS;
        overlay.hidden = true;
        setState(STATE.FULLSCREEN);
        console.info('[ImagineDeck Fullscreen Guard] Fullscreen state confirmed.', { reason });
    }

    function renderCountdown() {
        overlay.hidden = false;
        title.textContent = '全画面表示が解除されています';
        message.textContent = '10秒後に全画面表示へ戻ります。画面をタップするとすぐに戻ります。';
        counter.textContent = String(remainingSeconds);
    }

    function showTapRequired(messageText) {
        clearCountdownTimer();
        if (isEffectiveFullscreen()) {
            enterFullscreenState('fullscreen became active before tap prompt');
            return;
        }
        setState(STATE.TAP_REQUIRED);
        overlay.hidden = false;
        title.textContent = '全画面表示に戻ります';
        message.textContent = messageText || '画面を1回タップしてください。';
        counter.textContent = 'タップ';
    }

    function showUnavailable() {
        clearCountdownTimer();
        setState(STATE.UNAVAILABLE);
        overlay.hidden = false;
        title.textContent = '全画面表示を開始できません';
        message.textContent = 'このブラウザではページから全画面表示を開始できません。ブラウザ側の全画面表示を使用してください。';
        counter.textContent = '！';
    }

    function renderRequesting(trigger) {
        setState(STATE.REQUESTING);
        overlay.hidden = false;
        title.textContent = '全画面表示に切り替えています';
        message.textContent = trigger === 'automatic'
            ? '自動的に全画面表示へ戻しています。'
            : '全画面表示へ戻しています。';
        counter.textContent = '…';
    }

    async function requestFullscreen(trigger) {
        if (requestInFlight || isEffectiveFullscreen()) {
            if (isEffectiveFullscreen()) {
                enterFullscreenState('fullscreen already active before request');
            }
            return;
        }

        clearCountdownTimer();

        const target = document.documentElement;
        const standardRequest = target.requestFullscreen;
        const legacyRequest = target.webkitRequestFullscreen;
        if (typeof standardRequest !== 'function' && typeof legacyRequest !== 'function') {
            showUnavailable();
            return;
        }

        requestInFlight = true;
        renderRequesting(trigger);

        try {
            if (typeof standardRequest === 'function') {
                await standardRequest.call(target, { navigationUI: 'hide' });
            } else {
                await legacyRequest.call(target);
            }

            if (isEffectiveFullscreen()) {
                enterFullscreenState(`${trigger} fullscreen request succeeded`);
            } else {
                showTapRequired('全画面表示への切り替えを確認できませんでした。画面をもう一度タップしてください。');
            }
        } catch (error) {
            console.warn('[ImagineDeck Fullscreen Guard] Fullscreen request failed.', {
                trigger,
                error
            });
            showTapRequired(
                trigger === 'automatic'
                    ? '自動的に全画面表示へ戻せませんでした。画面を1回タップしてください。'
                    : '全画面表示へ切り替えられませんでした。画面をもう一度タップしてください。'
            );
        } finally {
            requestInFlight = false;
            if (isEffectiveFullscreen()) {
                enterFullscreenState(`${trigger} fullscreen request completed`);
            }
        }
    }

    function scheduleCountdownTick() {
        clearCountdownTimer();
        countdownTimerId = setTimeout(() => {
            countdownTimerId = null;

            if (state !== STATE.COUNTDOWN || !isDocumentVisible()) {
                return;
            }
            if (isEffectiveFullscreen()) {
                enterFullscreenState('fullscreen became active during countdown');
                return;
            }

            remainingSeconds -= 1;
            if (remainingSeconds <= 0) {
                remainingSeconds = 0;
                renderCountdown();
                void requestFullscreen('automatic');
                return;
            }

            renderCountdown();
            scheduleCountdownTick();
        }, COUNTDOWN_INTERVAL_MS);
    }

    function startCountdown(reason) {
        if (!isDocumentVisible() || isEffectiveFullscreen()) {
            if (isEffectiveFullscreen()) {
                enterFullscreenState(`${reason}: fullscreen already active`);
            }
            return;
        }
        if (
            state === STATE.COUNTDOWN ||
            state === STATE.REQUESTING ||
            state === STATE.TAP_REQUIRED ||
            state === STATE.UNAVAILABLE
        ) {
            return;
        }

        remainingSeconds = COUNTDOWN_SECONDS;
        setState(STATE.COUNTDOWN);
        renderCountdown();
        scheduleCountdownTick();
        console.info('[ImagineDeck Fullscreen Guard] Fullscreen recovery countdown started.', { reason });
    }

    function suspend() {
        clearCountdownTimer();
        overlay.hidden = true;
        setState(STATE.SUSPENDED);
    }

    function reconcile(reason) {
        if (!isDocumentVisible()) {
            suspend();
            return;
        }
        if (isEffectiveFullscreen()) {
            enterFullscreenState(reason);
            return;
        }
        if (state === STATE.REQUESTING) {
            return;
        }
        startCountdown(reason);
    }

    function handleUserActivation(event) {
        if (overlay.hidden || isEffectiveFullscreen()) {
            return;
        }
        if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event?.preventDefault?.();
        void requestFullscreen('user');
    }

    overlay.addEventListener('click', handleUserActivation);
    overlay.addEventListener('keydown', handleUserActivation);

    document.addEventListener('fullscreenchange', () => {
        if (isEffectiveFullscreen()) {
            enterFullscreenState('fullscreenchange');
            return;
        }
        setState(STATE.BOOT);
        reconcile('fullscreen exited');
    });

    document.addEventListener('fullscreenerror', () => {
        if (!requestInFlight && !isEffectiveFullscreen()) {
            showTapRequired('全画面表示へ切り替えられませんでした。画面をもう一度タップしてください。');
        }
    });

    if ('onwebkitfullscreenchange' in document) {
        document.addEventListener('webkitfullscreenchange', () => {
            if (isEffectiveFullscreen()) {
                enterFullscreenState('webkitfullscreenchange');
                return;
            }
            setState(STATE.BOOT);
            reconcile('webkit fullscreen exited');
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (!isDocumentVisible()) {
            suspend();
            return;
        }
        setState(STATE.BOOT);
        reconcile('document became visible');
    });

    window.addEventListener('pageshow', () => {
        if (!isDocumentVisible()) {
            return;
        }
        setState(STATE.BOOT);
        reconcile('pageshow');
    });

    if (fullscreenDisplayMode) {
        const handleDisplayModeChange = () => {
            if (isEffectiveFullscreen()) {
                enterFullscreenState('display-mode fullscreen');
                return;
            }
            setState(STATE.BOOT);
            reconcile('display-mode left fullscreen');
        };
        if (typeof fullscreenDisplayMode.addEventListener === 'function') {
            fullscreenDisplayMode.addEventListener('change', handleDisplayModeChange);
        } else if (typeof fullscreenDisplayMode.addListener === 'function') {
            fullscreenDisplayMode.addListener(handleDisplayModeChange);
        }
    }

    window.__IMAGINEDECK_FULLSCREEN_GUARD_VERSION__ = FULLSCREEN_GUARD_VERSION;
    window.__IMAGINEDECK_FULLSCREEN_GUARD_DIAGNOSTICS__ = Object.freeze({
        getState: () => state,
        isEffectiveFullscreen
    });

    reconcile('initial load');
})();
