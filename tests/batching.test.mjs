// Whether the "dynamic" in dynamic batching is real.
//
// calculateBatchInterval() used to be evaluated once, as the third argument to
// setInterval() inside startSender(). setInterval fixes its period when the timer
// is created, and the queue is empty at start(), so the client ran at
// minBatchInterval for its entire life however loaded the queue got — the README
// advertised an adaptation that could not happen. The sender now re-arms with
// setTimeout, so the interval is recomputed from the queue on every pass.
//
// The load-bearing assertion is that calculateBatchInterval() is called more than
// once: with setInterval it is called exactly once, forever.

import { test, describe, before, after, beforeEach } from 'node:test';
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

beforeEach(() => { server.requests.length = 0; });

/** Build a client and record what calculateBatchInterval() sees on each pass. */
function watchedClient(opts = {}) {
    const c = new TendrlClient({ apiKey: 'test-key', ...opts });
    clients.push(c);
    const passes = [];
    const real = c.calculateBatchInterval.bind(c);
    c.calculateBatchInterval = () => {
        const interval = real();
        passes.push({ queued: c.queue.length, interval });
        return interval;
    };
    return { client: c, passes };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('adaptive send interval', () => {
    test('the interval is recomputed on every pass, not once at start()', async () => {
        const { client, passes } = watchedClient({ minBatchInterval: 10, maxBatchInterval: 200 });
        client.start();
        await sleep(150);
        client.stop();

        assert.ok(passes.length > 1,
            `calculateBatchInterval() ran ${passes.length} time(s) in 150ms. Once ` +
            'means the interval was frozen at start() and the client can never ' +
            'adapt to queue load.');
    });

    test('a loaded queue widens the interval it arms', async () => {
        // maxBatchSize 1 keeps the queue loaded long enough to observe: each pass
        // drains a single message, so load stays high across several passes.
        const { client, passes } = watchedClient({
            minBatchInterval: 10,
            maxBatchInterval: 200,
            maxQueueSize: 100,
            maxBatchSize: 1,
        });
        client.start();
        for (let i = 0; i < 90; i++) client.publish({ marker: `load-${i}` });
        await sleep(300);
        client.stop();

        const loaded = passes.filter((p) => p.queued > 75);
        assert.ok(loaded.length > 0, 'the queue never got loaded; test is not measuring anything');
        assert.ok(loaded.every((p) => p.interval === 200),
            'a queue above 75% full must arm maxBatchInterval, but the intervals ' +
            `armed while loaded were ${[...new Set(loaded.map((p) => p.interval))].join(', ')}`);

        const idle = passes.filter((p) => p.queued === 0);
        assert.ok(idle.every((p) => p.interval === 10),
            'an empty queue must fall back to minBatchInterval');
    });

    test('stop() ends the loop instead of leaving it re-arming', async () => {
        const { client, passes } = watchedClient({ minBatchInterval: 10 });
        client.start();
        await sleep(60);
        client.stop();
        const atStop = passes.length;
        await sleep(120);

        assert.ok(passes.length <= atStop + 1,
            'the sender kept re-arming after stop(); a self-rescheduling timer that ' +
            'ignores stop() is a leak that outlives the client');
    });

    test('a message still goes out with the queue barely loaded', async () => {
        // minBatchSize is 10 and this publishes one. If getBatch() ever grew a
        // minBatchSize floor, this message would sit in the queue forever.
        const { client } = watchedClient({ minBatchInterval: 10 });
        client.start();
        client.publish({ marker: 'lonely' }, ['sensor']);

        assert.ok(await server.waitForMarker('lonely', 5000),
            'a single message never left the queue');
        client.stop();
    });
});
