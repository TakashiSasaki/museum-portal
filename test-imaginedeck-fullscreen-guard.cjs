const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = process.env.IMAGINEDECK_TEST_ROOT || process.cwd();
const guardPath = path.join(ROOT, 'public', 'imaginedeck', 'fullscreen-guard.js');
const indexPath = path.join(ROOT, 'public', 'imaginedeck', 'index.html');
const manifestPath = path.join(ROOT, 'public', 'imaginedeck', 'manifest.json');
const swPath = path.join(ROOT, 'public', 'sw.js');
const swCorePath = path.join(ROOT, 'public', 'sw-core-v44.js');
const swCorePreviousPath = path.join(ROOT, 'public', 'sw-core-v43.js');

const guardSource = fs.readFileSync(guardPath, 'utf8');

class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type, event = {}) {
        const enriched = {
            type,
            preventDefault() {},
            ...event
        };
        for (const listener of this.listeners.get(type) || []) {
            listener(enriched);
        }
    }
}

class FakeElement extends FakeEventTarget {
    constructor(id) {
        super();
        this.id = id;
        this.hidden = true;
        this.dataset = {};
        this.textContent = '';
    }
}

class FakeMediaQueryList extends FakeEventTarget {
    constructor(matches) {
        super();
        this.matches = matches;
    }

    addListener(listener) {
        this.addEventListener('change', listener);
    }

    setMatches(matches) {
        this.matches = matches;
        this.dispatch('change', { matches });
    }
}

function createTimerHarness() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();

    function setTimeoutFake(callback, delay = 0) {
        const id = nextId++;
        timers.set(id, { due: now + Number(delay || 0), callback });
        return id;
    }

    function clearTimeoutFake(id) {
        timers.delete(id);
    }

    function advance(ms) {
        const target = now + ms;
        while (true) {
            let selectedId = null;
            let selectedTimer = null;
            for (const [id, timer] of timers) {
                if (timer.due > target) continue;
                if (!selectedTimer || timer.due < selectedTimer.due ||
                    (timer.due === selectedTimer.due && id < selectedId)) {
                    selectedId = id;
                    selectedTimer = timer;
                }
            }
            if (!selectedTimer) break;
            now = selectedTimer.due;
            timers.delete(selectedId);
            selectedTimer.callback();
        }
        now = target;
    }

    return {
        setTimeoutFake,
        clearTimeoutFake,
        advance,
        pendingCount: () => timers.size
    };
}

function createHarness({
    initialApiFullscreen = false,
    initialDisplayModeFullscreen = false,
    requestBehaviors = []
} = {}) {
    const timers = createTimerHarness();
    const overlay = new FakeElement('fullscreen-guard');
    const title = new FakeElement('fullscreen-guard-title');
    const message = new FakeElement('fullscreen-guard-message');
    const counter = new FakeElement('fullscreen-guard-countdown');
    const elements = new Map([
        [overlay.id, overlay],
        [title.id, title],
        [message.id, message],
        [counter.id, counter]
    ]);
    const documentTarget = new FakeEventTarget();
    const windowTarget = new FakeEventTarget();
    const mediaQuery = new FakeMediaQueryList(initialDisplayModeFullscreen);
    const requestCalls = [];
    const behaviors = [...requestBehaviors];

    const documentElement = {};
    const document = {
        documentElement,
        fullscreenElement: initialApiFullscreen ? documentElement : null,
        webkitFullscreenElement: null,
        visibilityState: 'visible',
        getElementById(id) {
            return elements.get(id) || null;
        },
        addEventListener: documentTarget.addEventListener.bind(documentTarget)
    };

    function dispatchDocument(type, event) {
        documentTarget.dispatch(type, event);
    }

    documentElement.requestFullscreen = function requestFullscreen(options) {
        requestCalls.push(options);
        const behavior = behaviors.length > 0 ? behaviors.shift() : 'success';
        if (behavior === 'reject') {
            return Promise.reject(new Error('fullscreen request rejected'));
        }
        if (behavior === 'resolve-without-fullscreen') {
            return Promise.resolve();
        }
        document.fullscreenElement = documentElement;
        dispatchDocument('fullscreenchange');
        return Promise.resolve();
    };

    const window = {
        matchMedia(query) {
            assert.equal(query, '(display-mode: fullscreen)');
            return mediaQuery;
        },
        addEventListener: windowTarget.addEventListener.bind(windowTarget)
    };

    const context = vm.createContext({
        console: {
            info() {},
            warn() {},
            error() {}
        },
        document,
        window,
        setTimeout: timers.setTimeoutFake,
        clearTimeout: timers.clearTimeoutFake,
        Promise,
        Object,
        Boolean,
        String,
        Number,
        Error
    });

    vm.runInContext(guardSource, context, { filename: 'fullscreen-guard.js' });

    return {
        overlay,
        title,
        message,
        counter,
        document,
        window,
        mediaQuery,
        requestCalls,
        advance: timers.advance,
        pendingTimerCount: timers.pendingCount,
        dispatchDocument,
        dispatchWindow(type, event) {
            windowTarget.dispatch(type, event);
        },
        click() {
            overlay.dispatch('click');
        },
        async flush() {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        },
        state() {
            return window.__IMAGINEDECK_FULLSCREEN_GUARD_DIAGNOSTICS__.getState();
        }
    };
}

test('non-fullscreen launch starts a single 10-second countdown and a tap enters fullscreen', async () => {
    const harness = createHarness({ requestBehaviors: ['success'] });

    assert.equal(harness.state(), 'countdown');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.counter.textContent, '10');
    assert.equal(harness.pendingTimerCount(), 1);

    harness.advance(1_000);
    assert.equal(harness.counter.textContent, '9');
    assert.equal(harness.pendingTimerCount(), 1);

    harness.click();
    await harness.flush();

    assert.equal(harness.requestCalls.length, 1);
    assert.equal(harness.requestCalls[0].navigationUI, 'hide');
    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);
    assert.equal(harness.pendingTimerCount(), 0);
});

test('countdown makes a best-effort automatic request then falls back to one tap', async () => {
    const harness = createHarness({ requestBehaviors: ['reject', 'success'] });

    harness.advance(10_000);
    await harness.flush();

    assert.equal(harness.requestCalls.length, 1);
    assert.equal(harness.state(), 'tap-required');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.counter.textContent, 'タップ');
    assert.match(harness.message.textContent, /画面を1回タップ/);
    assert.equal(harness.pendingTimerCount(), 0);

    harness.click();
    await harness.flush();

    assert.equal(harness.requestCalls.length, 2);
    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);
});

test('leaving fullscreen starts recovery countdown again', () => {
    const harness = createHarness({ initialApiFullscreen: true });

    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);

    harness.document.fullscreenElement = null;
    harness.dispatchDocument('fullscreenchange');

    assert.equal(harness.state(), 'countdown');
    assert.equal(harness.counter.textContent, '10');
    assert.equal(harness.pendingTimerCount(), 1);
});

test('fullscreen PWA display mode suppresses recovery UI', () => {
    const harness = createHarness({ initialDisplayModeFullscreen: true });

    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);
    assert.equal(harness.pendingTimerCount(), 0);
    assert.equal(harness.requestCalls.length, 0);
});

test('backgrounding cancels countdown and returning starts a fresh countdown', () => {
    const harness = createHarness();

    harness.advance(3_000);
    assert.equal(harness.counter.textContent, '7');

    harness.document.visibilityState = 'hidden';
    harness.dispatchDocument('visibilitychange');
    assert.equal(harness.state(), 'suspended');
    assert.equal(harness.overlay.hidden, true);
    assert.equal(harness.pendingTimerCount(), 0);

    harness.document.visibilityState = 'visible';
    harness.dispatchDocument('visibilitychange');
    assert.equal(harness.state(), 'countdown');
    assert.equal(harness.counter.textContent, '10');
    assert.equal(harness.pendingTimerCount(), 1);
});

test('repeated lifecycle events do not create duplicate countdown timers', () => {
    const harness = createHarness();

    harness.dispatchWindow('pageshow');
    harness.dispatchWindow('pageshow');
    harness.dispatchDocument('fullscreenchange');

    assert.equal(harness.state(), 'countdown');
    assert.equal(harness.pendingTimerCount(), 1);
});

test('shell wiring and manifest keep fullscreen assets outside the atomic ImagineDeck generation', () => {
    if (!fs.existsSync(indexPath) || !fs.existsSync(manifestPath) ||
        !fs.existsSync(swPath) || !fs.existsSync(swCorePath)) {
        return;
    }

    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sw = fs.readFileSync(swPath, 'utf8');
    const swCore = fs.readFileSync(swCorePath, 'utf8');
    const swCorePrevious = fs.readFileSync(swCorePreviousPath, 'utf8');

    const normalizeNewlines = value => value.replace(/\r\n/g, '\n');
    const expectedCore = normalizeNewlines(swCorePrevious)
        .replace("const CORE_CACHE_VERSION = 'v43';", "const CORE_CACHE_VERSION = 'v44';")
        .replaceAll(
            "  '/imaginedeck/index.html',\n  '/imaginedeck/bootstrap-v45.js',",
            "  '/imaginedeck/index.html',\n" +
            "  '/imaginedeck/fullscreen-guard.js',\n" +
            "  '/imaginedeck/manifest.json',\n" +
            "  '/imaginedeck/bootstrap-v45.js',"
        );
    assert.equal(
        normalizeNewlines(swCore),
        expectedCore,
        'sw-core-v44.js must differ from v43 only by the cache version and fullscreen shell assets'
    );

    assert.match(indexHtml, /rel="manifest" href="\.\/manifest\.json"/);
    assert.ok(indexHtml.indexOf('./fullscreen-guard.js') < indexHtml.indexOf('./bootstrap-v45.js'));
    assert.equal(manifest.id, '/imaginedeck/');
    assert.equal(manifest.start_url, '/imaginedeck/');
    assert.equal(manifest.scope, '/imaginedeck/');
    assert.equal(manifest.display, 'fullscreen');

    assert.match(sw, /importScripts\('\/sw-core-v44\.js'\)/);
    assert.match(swCore, /const CORE_CACHE_VERSION = 'v44'/);
    assert.match(swCore, /'\/imaginedeck\/fullscreen-guard\.js'/);
    assert.match(swCore, /'\/imaginedeck\/manifest\.json'/);

    const atomicSet = swCore.match(/const ATOMIC_IMAGINEDECK_ASSET_PATHS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(atomicSet, 'atomic asset set must remain explicit');
    assert.doesNotMatch(atomicSet[1], /fullscreen-guard|manifest\.json/);
});
