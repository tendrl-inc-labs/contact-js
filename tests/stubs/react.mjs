// The smallest React that useTendrlClient can run against.
//
// The hook is 130 lines of plain JavaScript around two React primitives, and the
// behavior worth testing — which URL the client it builds ends up pointing at —
// needs neither a renderer nor a DOM. useEffect here runs its callback
// immediately and hands back the cleanup so a test can unmount by calling it.
//
// Anything this stub gets wrong, it gets wrong loudly: useRef returns a plain
// mutable box and useEffect runs once, so a test can never accidentally depend on
// React's scheduling.

export function useRef(initial) {
    return { current: initial };
}

export function useEffect(fn) {
    const cleanup = fn();
    if (typeof cleanup === 'function') {
        pendingCleanups.push(cleanup);
    }
}

const pendingCleanups = [];

/** Run every cleanup an effect returned, i.e. unmount. */
export function unmountAll() {
    while (pendingCleanups.length) {
        try { pendingCleanups.pop()(); } catch { /* teardown is best effort */ }
    }
}

export default { useRef, useEffect };
