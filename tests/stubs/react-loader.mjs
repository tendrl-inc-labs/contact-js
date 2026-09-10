// Resolves the bare specifier "react" to the stub in this directory.
//
// React is an optional peer dependency and CI installs nothing, so the hook
// cannot be imported in a test without this. A resolve hook is the only
// redirection that works on every Node line the CI matrix covers — node:test's
// module mocking landed in 22, and registerHooks() in 22.15.
//
// This module is both the off-thread loader (Node 20 imports it by path through
// register()) and the installer the test calls.

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const STUB = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'react.mjs')
).href;

export function resolve(specifier, context, next) {
    if (specifier === 'react') {
        return { url: STUB, shortCircuit: true };
    }
    return next(specifier, context);
}

/**
 * Point "react" at the stub for every subsequent import. Static imports in the
 * calling module are evaluated first, so the hook must be imported dynamically
 * after this returns.
 */
export async function installReactStub() {
    const { register, registerHooks } = await import('node:module');
    if (typeof registerHooks === 'function') {
        // Node >= 22.15: synchronous, in-thread, and not deprecated.
        registerHooks({ resolve });
    } else {
        register('./react-loader.mjs', import.meta.url);
    }
}
