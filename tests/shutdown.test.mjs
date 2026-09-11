// stop() must send what is still queued, and say so when it cannot.
//
// stopSender() only clears the timer, so everything still in the queue was
// abandoned: publish() had already returned, nothing raised, nothing logged.
// A message published shortly before stop() was simply gone.

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
    for (const c of clients) { try { await c.stop?.(); } catch { /* best effort */ } }
    await server.close();
});

beforeEach(() => { server.requests.length = 0; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arrived(marker) {
    return server.requests.some((r) =>
        JSON.stringify(r.body ?? '').includes(marker));
}

describe('shutdown flush', () => {
    test('stop() sends a message published after the sender went idle', async () => {
        const c = new TendrlClient({ apiKey: 'test-key' });
        clients.push(c);
        c.start();
        await sleep(600);

        c.publish({ marker: 'idle-then-stop' }, ['sensor']);
        assert.equal(c.queue.length, 1, 'the test never queued anything');

        await c.stop();
        assert.ok(arrived('idle-then-stop'),
            'stop() discarded the queued message instead of sending it');
    });

    test('stop() sends a whole queued batch', async () => {
        const c = new TendrlClient({ apiKey: 'test-key' });
        clients.push(c);
        c.start();
        await sleep(600);

        for (let i = 0; i < 8; i++) c.publish({ marker: `batch-${i}` }, ['sensor']);
        await c.stop();

        const lost = [];
        for (let i = 0; i < 8; i++) if (!arrived(`batch-${i}`)) lost.push(i);
        assert.deepEqual(lost, [], `stop() discarded ${lost.length} of 8 messages`);
    });

    test('stop() on a client that never started resolves quietly', async () => {
        const c = new TendrlClient({ apiKey: 'test-key' });
        clients.push(c);
        await c.stop();
    });

    test('an undeliverable batch is reported rather than dropped in silence', async () => {
        const warnings = [];
        const realWarn = console.warn;
        console.warn = (...args) => warnings.push(args.join(' '));
        try {
            const c = new TendrlClient({ apiKey: 'test-key', apiBaseUrl: 'http://127.0.0.1:1/api' });
            clients.push(c);
            c.start();
            c.publish({ marker: 'undeliverable' }, ['sensor']);
            await c.stop();
        } finally {
            console.warn = realWarn;
        }
        assert.ok(warnings.some((w) => w.includes('DROPPED')),
            `a message was discarded and nothing was logged; saw: ${JSON.stringify(warnings)}`);
    });
});
