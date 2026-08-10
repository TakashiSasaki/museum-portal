const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = process.env.IMAGINEDECK_TEST_ROOT || process.cwd();
const legacyGuardPath = path.join(ROOT, 'public', 'imaginedeck', 'fullscreen-guard.js');
const guardPath = path.join(ROOT, 'public', 'imaginedeck', 'fullscreen-guard-v2.js');
const indexPath = path.join(ROOT, 'public', 'imaginedeck', 'index.html');
const manifestPath = path.join(ROOT, 'public', 'imaginedeck', 'manifest.json');
const swPath = path.join(ROOT, 'public', 'sw.js');
const swFullscreenShellPath = path.join(ROOT, 'public', 'sw-imaginedeck-fullscreen-shell-v1.js');
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

function createHarness({
    initialApiFullscreen = false,
    initialDisplayModeFullscreen = false,
    requestBehaviors = [],
    fullscreenApiAvailable = true
} = {}) {
    const overlay = new FakeElement('fullscreen-guard');
    const title = new FakeElement('fullscreen-guard-title');
    const message = new FakeElement('fullscreen-guard-message');
    const elements = new Map([
        [overlay.id, overlay],
        [title.id, title],
        [message.id, message]
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

    if (fullscreenApiAvailable) {
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
    }

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
        Promise,
        Object,
        Boolean,
        String,
        Number,
        Error
    });

    vm.runInContext(guardSource, context, { filename: 'fullscreen-guard-v2.js' });

    return {
        overlay,
        title,
        message,
        document,
        window,
        mediaQuery,
        requestCalls,
        dispatchDocument,
        dispatchWindow(type, event) {
            windowTarget.dispatch(type, event);
        },
        click() {
            overlay.dispatch('click');
        },
        keyDown(key) {
            overlay.dispatch('keydown', { key });
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

test('non-fullscreen launch immediately shows a tap-to-fullscreen prompt without requesting fullscreen', () => {
    const harness = createHarness();

    assert.equal(harness.state(), 'tap-required');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.title.textContent, '全画面表示ではありません');
    assert.equal(harness.message.textContent, '画面をタップすると全画面表示になります。');
    assert.equal(harness.requestCalls.length, 0);
});

test('tap requests fullscreen and hides the prompt on success', async () => {
    const harness = createHarness({ requestBehaviors: ['success'] });

    harness.click();
    await harness.flush();

    assert.equal(harness.requestCalls.length, 1);
    assert.equal(harness.requestCalls[0].navigationUI, 'hide');
    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);
});

test('keyboard activation accepts standard and legacy Space key names', async () => {
    for (const key of ['Enter', ' ', 'Space', 'Spacebar']) {
        const harness = createHarness({ requestBehaviors: ['success'] });
        harness.keyDown(key);
        await harness.flush();

        assert.equal(harness.requestCalls.length, 1, `key ${JSON.stringify(key)} should activate`);
        assert.equal(harness.state(), 'fullscreen');
        assert.equal(harness.overlay.hidden, true);
    }

    const ignored = createHarness();
    ignored.keyDown('Escape');
    await ignored.flush();
    assert.equal(ignored.requestCalls.length, 0);
    assert.equal(ignored.state(), 'tap-required');
});

test('failed fullscreen request returns to a retry tap prompt without automatic retry', async () => {
    const harness = createHarness({ requestBehaviors: ['reject', 'success'] });

    harness.click();
    await harness.flush();

    assert.equal(harness.requestCalls.length, 1);
    assert.equal(harness.state(), 'tap-required');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.title.textContent, '全画面表示に切り替えられませんでした');
    assert.equal(harness.message.textContent, '画面をもう一度タップしてください。');

    harness.dispatchWindow('pageshow');
    assert.equal(harness.requestCalls.length, 1, 'lifecycle events must not retry fullscreen automatically');

    harness.click();
    await harness.flush();
    assert.equal(harness.requestCalls.length, 2);
    assert.equal(harness.state(), 'fullscreen');
});

test('leaving fullscreen immediately shows the tap prompt again', () => {
    const harness = createHarness({ initialApiFullscreen: true });

    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);

    harness.document.fullscreenElement = null;
    harness.dispatchDocument('fullscreenchange');

    assert.equal(harness.state(), 'tap-required');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.message.textContent, '画面をタップすると全画面表示になります。');
    assert.equal(harness.requestCalls.length, 0);
});

test('fullscreen PWA display mode suppresses the tap prompt', () => {
    const harness = createHarness({ initialDisplayModeFullscreen: true });

    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);
    assert.equal(harness.requestCalls.length, 0);
});

test('display-mode changes reconcile between fullscreen and tap-required states', () => {
    const harness = createHarness();

    harness.mediaQuery.setMatches(true);
    assert.equal(harness.state(), 'fullscreen');
    assert.equal(harness.overlay.hidden, true);

    harness.mediaQuery.setMatches(false);
    assert.equal(harness.state(), 'tap-required');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.requestCalls.length, 0);
});

test('backgrounding hides the prompt and returning restores it without requesting fullscreen', () => {
    const harness = createHarness();

    harness.document.visibilityState = 'hidden';
    harness.dispatchDocument('visibilitychange');
    assert.equal(harness.state(), 'suspended');
    assert.equal(harness.overlay.hidden, true);

    harness.document.visibilityState = 'visible';
    harness.dispatchDocument('visibilitychange');
    assert.equal(harness.state(), 'tap-required');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.requestCalls.length, 0);
});

test('unsupported fullscreen API shows an unavailable message instead of a dead tap target', () => {
    const harness = createHarness({ fullscreenApiAvailable: false });

    assert.equal(harness.state(), 'unavailable');
    assert.equal(harness.overlay.hidden, false);
    assert.equal(harness.title.textContent, '全画面表示を開始できません');
    assert.match(harness.message.textContent, /ブラウザ側の全画面表示/);
    assert.equal(harness.requestCalls.length, 0);
});

test('tap-only guard contains no countdown or timer-driven fullscreen path', () => {
    assert.doesNotMatch(guardSource, /COUNTDOWN/);
    assert.doesNotMatch(guardSource, /setTimeout|setInterval/);
    assert.doesNotMatch(guardSource, /10秒|remainingSeconds|automatic/);
});

test('shell wiring keeps the cache-busted guard outside the atomic ImagineDeck generation', () => {
    if (!fs.existsSync(legacyGuardPath) || !fs.existsSync(indexPath) ||
        !fs.existsSync(manifestPath) || !fs.existsSync(swPath) ||
        !fs.existsSync(swFullscreenShellPath) || !fs.existsSync(swCorePath) ||
        !fs.existsSync(swCorePreviousPath)) {
        return;
    }

    const normalizeNewlines = value => value.replace(/\r\n/g, '\n');
    const legacyGuard = normalizeNewlines(fs.readFileSync(legacyGuardPath, 'utf8'));
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sw = fs.readFileSync(swPath, 'utf8');
    const fullscreenShell = fs.readFileSync(swFullscreenShellPath, 'utf8');
    const swCore = normalizeNewlines(fs.readFileSync(swCorePath, 'utf8'));
    const swCorePrevious = normalizeNewlines(fs.readFileSync(swCorePreviousPath, 'utf8'));

    assert.equal(
        legacyGuard,
        normalizeNewlines(guardSource),
        'legacy and cache-busted fullscreen guard paths must remain behaviorally identical'
    );

    assert.match(indexHtml, /rel="manifest" href="\.\/manifest\.json"/);
    assert.ok(indexHtml.indexOf('./fullscreen-guard-v2.js') < indexHtml.indexOf('./bootstrap-v45.js'));
    assert.doesNotMatch(indexHtml, /fullscreen-guard-countdown/);
    assert.doesNotMatch(indexHtml, /aria-live=/);
    assert.match(indexHtml, /aria-labelledby="fullscreen-guard-title fullscreen-guard-message"/);

    assert.equal(manifest.id, '/imaginedeck/');
    assert.equal(manifest.start_url, '/imaginedeck/');
    assert.equal(manifest.scope, '/imaginedeck/');
    assert.equal(manifest.display, 'fullscreen');

    assert.ok(
        sw.indexOf("importScripts('/sw-core-v44.js')") <
        sw.indexOf("importScripts('/sw-imaginedeck-fullscreen-shell-v1.js')")
    );
    assert.match(fullscreenShell, /'\/imaginedeck\/fullscreen-guard-v2\.js'/);
    assert.match(fullscreenShell, /self\.addEventListener\('install'/);
    assert.match(fullscreenShell, /caches\.open\(CORE_CACHE_NAME\)/);
    assert.match(fullscreenShell, /fetchCoreAssetWithTimeout\(request\)/);

    const expectedCore = swCorePrevious
        .replace("const CORE_CACHE_VERSION = 'v43';", "const CORE_CACHE_VERSION = 'v44';")
        .replaceAll(
            "  '/imaginedeck/index.html',\n  '/imaginedeck/bootstrap-v45.js',",
            "  '/imaginedeck/index.html',\n" +
            "  '/imaginedeck/fullscreen-guard.js',\n" +
            "  '/imaginedeck/manifest.json',\n" +
            "  '/imaginedeck/bootstrap-v45.js',"
        );
    assert.equal(
        swCore,
        expectedCore,
        'sw-core-v44.js must remain unchanged by the tap-only simplification'
    );

    const atomicSet = swCore.match(/const ATOMIC_IMAGINEDECK_ASSET_PATHS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(atomicSet, 'atomic asset set must remain explicit');
    assert.doesNotMatch(atomicSet[1], /fullscreen-guard|manifest\.json/);
});
