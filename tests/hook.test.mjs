// What the React hook builds.
//
// useTendrlClient used to substitute 'https://app.tendrl.com/api' for a missing
// apiBaseUrl before handing it to the constructor. That looked harmless — it is
// the same default the constructor uses — but it shadowed the constructor's
// TENDRL_APP_URL lookup, so a React app could not be pointed at a local or
// staging stack at all: the env var was read and then thrown away. These tests
// pin the pass-through, and the fact that a hook-built client actually delivers
// to the URL the env var names.

import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';
import { installReactStub } from './stubs/react-loader.mjs';

let useTendrlClient;
let reactStub;
let server;

const ORIGINAL_URL = process.env.TENDRL_APP_URL;
const ORIGINAL_KEY = process.env.REACT_APP_TENDRL_KEY;

before(async () => {
    server = await startServer();
    // Redirect "react" to the stub before the hook is imported.
    await installReactStub();
    reactStub = await import('./stubs/react.mjs');
    useTendrlClient = (await import('../src/hooks/useTendrlClient.js')).default;
});

after(async () => {
    reactStub.unmountAll();
    await server.close();
    if (ORIGINAL_URL === undefined) delete process.env.TENDRL_APP_URL;
    else process.env.TENDRL_APP_URL = ORIGINAL_URL;
    if (ORIGINAL_KEY === undefined) delete process.env.REACT_APP_TENDRL_KEY;
    else process.env.REACT_APP_TENDRL_KEY = ORIGINAL_KEY;
});

afterEach(() => {
    reactStub.unmountAll(); // stop() every client the previous test mounted
    server.requests.length = 0;
});

describe('useTendrlClient', () => {
    test('TENDRL_APP_URL reaches the client the hook builds', () => {
        process.env.REACT_APP_TENDRL_KEY = 'hook-key';
        process.env.TENDRL_APP_URL = 'http://localhost:9999';

        const { client } = useTendrlClient({});

        assert.ok(client, 'the hook built no client');
        assert.equal(client.apiBaseUrl, 'http://localhost:9999/api',
            'the hook swallowed TENDRL_APP_URL — a React app then has no way to ' +
            'reach anything but production');
    });

    test('an explicit apiBaseUrl still wins', () => {
        process.env.REACT_APP_TENDRL_KEY = 'hook-key';
        process.env.TENDRL_APP_URL = 'http://from-env:1111';

        const { client } = useTendrlClient({ apiBaseUrl: 'http://from-arg:2222/api' });

        assert.equal(client.apiBaseUrl, 'http://from-arg:2222/api');
    });

    test('production is still the default when nothing is set', () => {
        process.env.REACT_APP_TENDRL_KEY = 'hook-key';
        delete process.env.TENDRL_APP_URL;

        const { client } = useTendrlClient({});

        assert.equal(client.apiBaseUrl, 'https://app.tendrl.com/api');
    });

    test('a hook-built client delivers to the env-var URL', async () => {
        process.env.REACT_APP_TENDRL_KEY = 'hook-key';
        process.env.TENDRL_APP_URL = server.url;

        const { publish } = useTendrlClient({});
        publish({ marker: 'from-hook' }, ['hook']);

        assert.ok(await server.waitForMarker('from-hook'),
            'the message never arrived: pointing the hook at a local stack must ' +
            'actually deliver there, not just set a field');
    });

    test('publish returns the promise when waitResponse is set', async () => {
        process.env.REACT_APP_TENDRL_KEY = 'hook-key';
        process.env.TENDRL_APP_URL = server.url;

        const { publish } = useTendrlClient({});
        const returned = publish({ marker: 'waited' }, ['hook'], '', true);

        assert.ok(returned && typeof returned.then === 'function',
            'the hook dropped publish()\'s return value, which makes waitResponse ' +
            'unusable through the hook');
        await returned;
        assert.ok(await server.waitForMarker('waited'));
    });

    test('no API key means no client, and an error the developer can see', () => {
        delete process.env.REACT_APP_TENDRL_KEY;
        process.env.TENDRL_APP_URL = server.url;

        const errors = [];
        const realError = console.error;
        console.error = (...args) => errors.push(args.join(' '));
        try {
            const { client } = useTendrlClient({});
            assert.equal(client, null, 'the hook must not build a keyless client');
        } finally {
            console.error = realError;
        }
        assert.ok(errors.some((e) => e.includes('TENDRL_KEY')),
            'the hook returned nothing and said nothing');
    });
});
