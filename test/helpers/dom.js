// test/helpers/dom.js — mount the real components in a real DOM, from a plain `node --test` file.
//
// WHY THIS EXISTS
// Most UI tests used to call a component as a plain function and walk the returned vnode tree
// (`ChessCard({...}).props.class`). That only works while a component calls no hook at its top level: preact's hook
// dispatcher needs a "current component" that only a real render installs, so the first unconditional `useSkin(...)`
// (D040/D041, night batch of 2026-10-14) turned every such test into
// `TypeError: Cannot read properties of undefined (reading '__H')`.
//
// The fix is to really mount. `happy-dom` supplies the document (a devDependency), preact's own `render` does the
// diff, and the hooks module then works exactly as in the browser. A hand-rolled DOM shim was tried first and
// abandoned: every missing standard behaviour (script tags, `disabled`, `dataset`, numeric attributes, `<select>`
// values) broke a different test, so the real implementation is both smaller and more honest.
//
// USAGE
//   import { installMiniDom, mountVNode, mountVNodes } from '../helpers/dom.js';
//   installMiniDom();                                   // before any app module is imported
//   const preact = await import('../../public/vendor/preact.module.js');
//   await import('../../public/vendor/hooks.module.js');
//   const { ChessCard } = await import('../../public/js/ui/shopBar.js');
//   const card = mountVNode(preact, ChessCard, { slot, idx: 0, priv, onBuy() {}, onDetail() {} });
//   card.props.class;              // the vnode-shaped view the old assertions expect
//   card.$('.scard__art');         // or the real element, when a test wants the DOM
//   card.props.onClick();          // dispatches for real
//
// `mountVNode` returns the component's own root in the vnode shape the older assertions use — `props.class`,
// `props.children`, `onClick`, `data-*` and boolean attributes converted back — so most expectations survive
// unchanged. Prefer asserting on what the component DREW: the markup carries everything it shows. For a value that
// never reaches the markup (an object or array prop, or a `key`) pass it through the optional `overrides` argument
// instead of guessing.

import { Window } from 'happy-dom';

let windowRef = null;

/** The HTML boolean attributes: present means true, absent means false. */
const BOOLEAN_ATTRIBUTES = new Set([
  'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default', 'defer', 'disabled',
  'formnovalidate', 'hidden', 'inert', 'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nomodule',
  'novalidate', 'open', 'playsinline', 'readonly', 'required', 'reversed', 'selected',
]);

// ---------------------------------------------------------------------------------------------------------------
// installation
// ---------------------------------------------------------------------------------------------------------------

/**
 * Install the DOM globals that preact and the app modules read. Idempotent, and safe to call before anything else.
 * @returns {Window} the happy-dom window
 */
export function installMiniDom() {
  if (windowRef) return windowRef;
  const w = new Window({ url: 'http://localhost/' });
  windowRef = w;
  globalThis.window = w;
  globalThis.document = w.document;
  for (const name of ['Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'CustomEvent', 'MutationObserver',
    'ResizeObserver', 'DOMParser', 'XMLHttpRequest', 'location', 'navigator']) {
    if (w[name] === undefined) continue;
    // Some of these are getter-only on node's globalThis (navigator since v21) — a plain assignment throws, so
    // define over them and skip whatever still refuses. Nothing here is worth failing a suite over.
    try {
      Object.defineProperty(globalThis, name, { value: w[name], writable: true, configurable: true });
    } catch { /* keep node's own */ }
  }
  globalThis.getComputedStyle = w.getComputedStyle.bind(w);
  if (!globalThis.localStorage) globalThis.localStorage = w.localStorage;
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  return w;
}

/** Alias for callers that awaited an async installer (kept so either style reads naturally). */
export const installMiniDomAsync = async () => installMiniDom();

/** The happy-dom window, once installed. */
export const miniDomWindow = () => windowRef;

// ---------------------------------------------------------------------------------------------------------------
// mounting
// ---------------------------------------------------------------------------------------------------------------

/**
 * Mount a component SYNCHRONOUSLY and hand back its own root in the vnode shape the older assertions use.
 *
 * A drop-in for a direct `Component(props)` call: same synchronous call, same return shape, but the component really
 * renders, so a top-level hook (`useSkin`) has the context it needs.
 *
 * @param {object} preact the imported preact module (it carries `h` and `render`)
 * @param {Function} type a function component
 * @param {object} [props]
 * @param {object|null} [overrides] extra props merged onto the returned root vnode, for a value the markup cannot
 *   carry (an object, an array, a number the component stringified, a `key`)
 */
export function mountVNode(preact, type, props = {}, overrides = null) {
  const w = installMiniDom();
  const host = w.document.createElement('div');
  w.document.body.appendChild(host);
  preact.render(preact.h(type, props), host);
  // A component may render nothing at all (LoadoutStats returns null without data). A direct call returned null
  // there, so mounting does too.
  const roots = [...host.children];
  if (!roots.length) return null;
  return vnodeOf(roots.length === 1 ? roots[0] : host, overrides);
}

/**
 * `mountVNode` for a component that returns an ARRAY of roots (ChessDetail returns one vnode per section).
 *
 * Keeps the two things such a test relies on: the elements are in order, and each carries the `key` its source vnode
 * had (`blocks.find((b) => b.key === 'head')`). preact does not put the key on the DOM node, so the caller names the
 * sections — ChessDetail renders `CHESS_SECTIONS` in order and passes that list.
 *
 * A component may also splice an extra block in (ChessDetail puts its merge hint at index 1). Pass `keys` as
 * `{ at: 1, key: 'merge', list: CHESS_SECTIONS }` to describe that inserted block; the rest shift accordingly.
 * @param {object} preact @param {Function} type @param {object} [props]
 * @param {string[]|{ at?: number, key?: string, list: string[], absent?: string[] }|null} [keys] either the exact
 *   key per element, or `{ list, absent }` — the full section order plus the sections that render nothing here
 * @param {Record<number, object>|null} [overridesAt] props to merge onto the block at that index, for an assertion
 *   that reads a value the markup cannot carry (a record object, an array)
 */
export function mountVNodes(preact, type, props = {}, keys = null, overridesAt = null) {
  const w = installMiniDom();
  const host = w.document.createElement('div');
  w.document.body.appendChild(host);
  preact.render(preact.h(type, props), host);
  // `keyAt` answers "what is the key of the element at this index". This has to survive two things a component does
  // to its section list: dropping a null section (`CHESS_SECTIONS.map(...).filter(Boolean)`), and splicing one in
  // (ChessDetail's merge hint at index 1). Both are declared by the caller rather than guessed from the element.
  let keyAt = null;
  if (Array.isArray(keys)) {
    keyAt = (i) => keys[i];
  } else if (keys && typeof keys.at === 'number') {
    keyAt = (i) => (i === keys.at ? keys.key : keys.list[i - (i > keys.at ? 1 : 0)]);
  } else if (keys && Array.isArray(keys.list)) {
    // `list` is the full section order; `absent` names the sections that render nothing for this input, so the
    // remaining names line up with the elements that really appeared.
    const absent = new Set(keys.absent ?? []);
    const present = keys.list.filter((k) => !absent.has(k));
    keyAt = (i) => present[i];
  }
  return [...host.children].map((el, i) => {
    const v = toVNode(el, overridesAt?.[i] ?? null);
    if (keyAt) {
      const name = keyAt(i);
      if (name != null) v.key = name;
    }
    return v;
  });
}

/** Unmount (runs every effect cleanup) and detach. */
export function unmount(preact, node) {
  const el = node?.el ?? node;
  const host = el?.parentNode;
  if (host && host.tagName === 'DIV') preact.render(null, host);
}

// ---------------------------------------------------------------------------------------------------------------
// the vnode-shaped view of rendered markup
// ---------------------------------------------------------------------------------------------------------------

/**
 * Adapt a rendered element into the vnode shape the older assertions walk.
 *
 * `props.class`, `props.src`, `props.role`, `props['aria-*']`, `data-*` (back to a number when the value
 * round-trips), boolean attributes as booleans, `onClick` (which really dispatches), and `children` as an array of
 * adapted nodes plus raw strings. The element itself stays reachable as `.el`, `.$()` and `.$$()`.
 * @param {Element} node
 * @param {object} [overrides] extra props to merge (see mountVNode)
 */
export function toVNode(node, overrides = null) {
  if (node == null) return node;
  const props = {};
  for (const attr of node.attributes ?? []) {
    let value = attr.value;
    if (BOOLEAN_ATTRIBUTES.has(attr.name)) {
      value = value !== 'false';            // present means true: `disabled="true"` and a bare `disabled` alike
    } else if (attr.name.startsWith('data-')) {
      const n = Number(value);
      if (value !== '' && String(n) === value) value = n;   // "0" → 0, while "007" stays a string
    }
    props[attr.name] = value;
  }
  // `value` is a live DOM property, not an attribute (a `<select>` reflects the selected `<option>`), while a vnode
  // carried it as a plain prop. Surface it for the form elements that have one.
  if (typeof node.value === 'string' && /^(select|input|textarea|option)$/i.test(node.tagName ?? '')) {
    props.value = node.value;
  }
  // A vnode's `style` prop was the string the component wrote; on a mounted element `node.style` is a live
  // CSSStyleDeclaration. Assertions match the string, so keep it under `style` and expose the live object as
  // `styleObject` for a test that wants to read a computed property back.
  const styleAttr = node.getAttribute?.('style');
  if (styleAttr != null) {
    props.style = styleAttr;
    props.styleObject = node.style;
  }
  if (overrides) Object.assign(props, overrides);

  // preact keeps JSX event props on the element; expose them as the `onX` props the older tests call. In the shipped
  // minified build the table is `l` (unminified sources call it `__l`) and a key is the event type plus the capture
  // flag — `clickfalse`, or `Clickfalse` depending on how the DOM exposes the property. Match case-insensitively and
  // rebuild the `onClick` spelling.
  for (const key of ['__l', 'l']) {
    const table = node[key];
    if (!table || typeof table !== 'object') continue;
    const entries = table instanceof Map ? [...table.entries()] : Object.entries(table);
    for (const [k, fn] of entries) {
      const m = /^([a-z][a-z]*?)(true|false)?$/i.exec(String(k));
      if (!m) continue;
      const eventName = m[1].toLowerCase();
      const prop = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
      if (props[prop]) continue;
      props[prop] = (event) => {
        const handler = typeof fn === 'function' ? fn : fn?.value;
        if (typeof handler !== 'function') return undefined;
        // A caller may hand in a plain object — the older tests pass `{ currentTarget: { value } }` to drive a
        // handler without a real dispatch. Only fill in what it left out, never overwrite what it supplied.
        const e = event && typeof event === 'object'
          ? event
          : new globalThis.Event(eventName, { bubbles: true });
        if (e.currentTarget === undefined) e.currentTarget = node;
        if (e.target === undefined) e.target = node;
        if (typeof e.preventDefault !== 'function') e.preventDefault = () => {};
        if (typeof e.stopPropagation !== 'function') e.stopPropagation = () => {};
        return handler.call(node, e);
      };
    }
  }

  const children = [...node.childNodes].map((c) => (c.nodeType === 3 ? c.textContent : toVNode(c)));
  if (children.length) props.children = children.length === 1 ? children[0] : children;

  const vnode = { type: node.tagName ? node.tagName.toLowerCase() : '#text', props };
  Object.defineProperty(vnode, 'el', { value: node, enumerable: false });
  vnode.$ = (sel) => node.querySelector(sel);
  vnode.$$ = (sel) => [...node.querySelectorAll(sel)];
  return vnode;
}

/** The vnode a direct `Component(props)` call used to return: the rendered root. */
export const vnodeOf = (node, overrides = null) => toVNode(node, overrides);

/**
 * What is still keeping this process alive, as `{ type, ms }` rows.
 *
 * Mounting runs the app's real effects, and an effect may arm an interval or a timeout (the ownership sync debounce,
 * the audio module, a store subscription). node's test runner then waits for the loop to drain even though every test
 * finished, and the file looks "hung" at a few per cent of nothing. Call this from an `after()` hook to see what has
 * to be cleared — or run the file with `--test-force-exit` while a fix is pending.
 * @returns {{ type: string, ms: number|null }[]}
 */
export function pendingHandles() {
  const out = [];
  for (const h of process._getActiveHandles?.() ?? []) {
    const type = h?.constructor?.name || 'unknown';
    if (type === 'Socket' || type === 'Server' || type === 'WriteStream') continue; // the runner's own stdio
    out.push({ type, ms: typeof h?._idleTimeout === 'number' ? h._idleTimeout : null });
  }
  for (const r of process._getActiveRequests?.() ?? []) out.push({ type: 'request:' + (r?.constructor?.name || '?'), ms: null });
  return out;
}
