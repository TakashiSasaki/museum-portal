## 2026-07-03 - Pre-calculated CSS classes for DOM updates
**Learning:** In frontend loops, avoiding `Array.from(element.classList).filter(...)` string manipulation by pre-calculating possible classes to remove is a highly effective way to optimize layout and reduce unnecessary garbage collection and main thread blocking.
**Action:** Always extract static classes to remove into a constant array when manipulating classes in loops or frequent updates.
## 2026-07-04 - Debounce expensive resize event handlers
**Learning:** In the imaginedeck digital signage viewer (`public/imaginedeck/index.js`), calculating available height and manually measuring DOM nodes during `resize` events via `calculateNoticePages()` is highly expensive and causes layout thrashing.
**Action:** Always wrap event handlers that trigger layout measurement and updates (like `resize` and scrolling) in a debounce function (e.g. using `setTimeout` with a ~200ms delay) to prevent performance bottlenecks.

## 2026-07-04 - Avoid unnecessary array construction for classList
**Learning:** Extracting hardcoded string literal class names into arrays to use with the spread operator (e.g., `classList.add(...activeClasses)`) in an attempt to optimize performance is an anti-pattern. Passing static strings inline is highly optimized by engines. Creating arrays and using spread adds microscopic overhead.
**Action:** Do not attempt to optimize `classList.add('a', 'b')` by refactoring it to `classList.add(...['a', 'b'])` unless the classes are truly dynamic.
