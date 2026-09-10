// Whether a failing storage backend is retried at the intended cadence.
//
// The sender cleans up expired offline messages once a minute, gated on
// _lastCleanup. That timestamp used to be advanced inside the try block, after
// the await returned — so a cleanupExpired() that throws never advanced it and
// the failing call was reissued on every sender pass. Under Node, where
// IndexedDB does not exist, the README's offline-storage example turned that
// into several ReferenceErrors per second.
//
// The load-bearing assertion is a count, not the absence of a throw: the old
// code did not throw either, it just retried forever.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, freshClient } from './helpers.mjs';

let server;
let TendrlClient;
const clients = [];

before(async () => {
    server = await startServer();
    process.env.TENDRL_APP_URL = server.url;
    TendrlClient = await freshClient();
});

after(async () => {
    for (const c of clients) { try { c.stop?.(); } catch { /* best effort */ } }
    await server.close();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A client whose storage is a stub. offlineStorage stays off so the real
 * IndexedDBStorage is never constructed; the stub stands in for whatever
 * backend the sender was handed.
 */
function clientWithStorage(cleanupExpired, opts = {}) {
    const c = new TendrlClient({ apiKey: 'test-key', minBatchInterval: 10, ...opts });
    clients.push(c);
    c.storage = { cleanupExpired };
    return c;
}

/** Count the sender passes actually taken, so a count of 1 means something. */
function countPasses(client) {
    const passes = { n: 0 };
    const real = client.calculateBatchInterval.bind(client);
    client.calculateBatchInterval = () => { passes.n++; return real(); };
    return passes;
}

describe('expired-message cleanup cadence', () => {
    test('a cleanupExpired() that rejects is not retried on every pass', async () => {
        let calls = 0;
        const client = clientWithStorage(async () => {
            calls++;
            throw new ReferenceError('indexedDB is not defined');
        });
        const passes = countPasses(client);

        client.start();
        await sleep(400);
        client.stop();

        assert.ok(passes.n > 5,
            `the sender only took ${passes.n} pass(es); the test never got the ` +
            'chance to observe a repeat and is not measuring anything');
        assert.ok(calls <= 1,
            `cleanupExpired() rejected and was called ${calls} times across ` +
            `${passes.n} sender passes. A failing storage backend must be retried ` +
            'once a minute, not once a pass.');
    });

    test('a cleanupExpired() that resolves is also called once a minute', async () => {
        let calls = 0;
        const client = clientWithStorage(async () => { calls++; return 0; });
        const passes = countPasses(client);

        client.start();
        await sleep(400);
        client.stop();

        assert.ok(passes.n > 5, `only ${passes.n} sender pass(es); not measuring anything`);
        assert.equal(calls, 1,
            `cleanupExpired() succeeded and was called ${calls} times across ` +
            `${passes.n} sender passes; the minute gate should allow exactly one.`);
    });
});
