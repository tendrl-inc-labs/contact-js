// The sender loop must outlive a pass that throws.
//
// Re-arming with setTimeout gave the batch interval a chance to track the queue,
// but it also made the loop conditional on reaching the re-arm. setInterval fired
// again whatever its callback did; a self-re-arming timeout does not. Without a
// finally, one exception anywhere in a pass stopped the client sending forever,
// silently and with no way for the caller to notice.

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('sender resilience', () => {
    test('a pass that throws does not end the loop', async () => {
        const c = new TendrlClient({ apiKey: 'test-key' });
        clients.push(c);

        // Blow up the first pass from inside the tick, the way a failing
        // storage or connectivity call would.
        let thrown = 0;
        const realGetBatch = c.getBatch.bind(c);
        c.getBatch = () => {
            if (thrown === 0) {
                thrown += 1;
                throw new Error('pass exploded');
            }
            return realGetBatch();
        };

        // Something must be queued or the pass has no batch to fetch.
        c.publish({ marker: 'before-the-throw' }, ['sensor']);
        c.start();
        await sleep(400);
        assert.equal(thrown, 1, 'the test never triggered the failure it is about');

        c.publish({ marker: 'after-the-throw' }, ['sensor']);

        const deadline = Date.now() + 5000;
        let arrived = false;
        while (Date.now() < deadline && !arrived) {
            arrived = server.requests.some((r) =>
                JSON.stringify(r.body ?? '').includes('after-the-throw'));
            if (!arrived) await sleep(100);
        }

        assert.ok(arrived,
            'the sender stopped after one throwing pass and never sent again');
    });
});
