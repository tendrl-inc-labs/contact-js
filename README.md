# Tendrl JavaScript SDK

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/tendrl-inc-labs/contact-js)
[![Node.js Version](https://img.shields.io/badge/node.js-18+-339933.svg)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/react-18+-61DAFB.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue.svg)](LICENSE)

A modern JavaScript/React SDK for messaging with an adaptive send interval, automatic message checking, and offline storage.

## ⚠️ License Notice

**This software is licensed for use with Tendrl services only.**

### ✅ Allowed

- Use the software with Tendrl services
- Inspect and learn from the code for educational purposes
- Modify or extend the software for personal or Tendrl-related use

### ❌ Not Allowed

- Use in any competing product or service
- Connect to any backend not operated by Tendrl, Inc.
- Package into any commercial or hosted product (e.g., SaaS, PaaS)
- Copy design patterns or protocol logic for another system without permission

For licensing questions, contact: `support@tendrl.com`

## Features

- **Adaptive Send Interval**: The sender re-arms after every pass with an interval recomputed from current queue load (`minBatchInterval` → `maxBatchInterval`); each pass sends up to `maxBatchSize` messages
- **Message Queuing**: In-memory queue with configurable size limits
- **React Integration**: Custom hooks for seamless React integration
- **Error Handling**: Failures are contained rather than thrown at the call site — see [Error Handling](#error-handling) for what surfaces and what does not
- **Automatic Message Checking**: Background polling for incoming messages (matches Python SDK)
- **Message Transformation**: Automatic format conversion for consistency
- **Connection State Management**: Built-in connection state tracking
- **Offline Storage**: IndexedDB-based message persistence (matches Python SDK)

## Installation

### NPM (Recommended)

```bash
npm install github:tendrl-inc-labs/contact-js
```

The package is not on the npm registry yet, so install it from this repository.
It resolves as `@tendrl/contact`, which is the name to import from.

### Manual Installation

Alternatively, you can copy the `src/` directory into your project and import directly.

### For React Projects

The React hooks require React as a peer dependency (which you likely already have):

```bash
npm install react  # If not already installed
```

### For Non-React Projects

You can use the client class directly without React - no dependencies required.

## Quick Start

### Using NPM Package

```javascript
import TendrlClient from '@tendrl/contact';
// or, the same client by its explicit subpath
import TendrlClient from '@tendrl/contact/utils';
// or for React hooks
import useTendrlClient from '@tendrl/contact/hooks';
```

### Using Source Code Directly

```javascript
// The .js extension is required: the package is an ES module, and Node does not
// guess extensions for relative specifiers.
import TendrlClient from './path/to/src/utils/TendrlClient.js';

// Initialize client
const client = new TendrlClient({
    apiBaseUrl: 'https://app.tendrl.com/api',
    apiKey: 'your_api_key',
    debug: true,
    callback: (message) => {
        console.log('Received:', message);
    }
});

// Start client
client.start();

// Publish messages
client.publish({
    event: 'user_action',
    timestamp: Date.now(),
    data: { action: 'click', button: 'submit' }
}, ['ui', 'events']);

// Check for messages manually (automatic checking is enabled)
client.checkMessages(5);
```

### React Integration

```jsx
import React from 'react';
import useTendrlClient from '@tendrl/contact/hooks';

function MyComponent() {
    const { client, isConnected, publish } = useTendrlClient({
        onMessage: (message) => {
            console.log('Received:', message);
        }
    });

    const handleButtonClick = () => {
        publish({
            event: 'button_click',
            component: 'MyComponent',
            timestamp: Date.now()
        }, ['ui', 'interaction']);
    };

    return (
        <div>
            <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
            <button onClick={handleButtonClick}>
                Send Event
            </button>
        </div>
    );
}
```

## Configuration Options

```javascript
const client = new TendrlClient({
    // API base URL. Resolved as: this option > TENDRL_APP_URL > production.
    // A bare origin gets /api appended. See Environment Variables below.
    apiBaseUrl: 'https://app.tendrl.com/api',
    apiKey: 'your_api_key',                   // Authentication key (required)
    debug: false,                             // Enable debug logging
    minBatchSize: 10,                         // Accepted and stored, but never read — see note below
    maxBatchSize: 100,                        // Maximum messages sent per pass
    minBatchInterval: 100,                    // Sender interval when the queue is below 25% full (ms)
    maxBatchInterval: 1000,                   // Sender interval when the queue is above 75% full (ms)
    maxQueueSize: 1000,                       // Maximum queue size
    callback: (message) => console.log(message), // Message callback function
    checkMsgRate: 3000,                       // Automatic message check frequency (ms, default: 3000)
    checkMsgLimit: 1,                        // Maximum messages per check (default: 1)
    offlineStorage: false,                   // Enable offline storage (IndexedDB — browser only)
    dbName: 'tendrl_offline',                // IndexedDB database name
});
```

**On `minBatchSize`**: the option is accepted and stored for configuration parity
with the other Tendrl SDKs, but this client never reads it. Each sender pass takes
everything queued up to `maxBatchSize`. It is deliberately not a floor: holding
messages back until ten of them existed would stall a low-traffic client
indefinitely. Setting it has no effect on when or how much is sent.

## API Reference

### Methods

#### `publish(message, tags, entity, waitResponse)`

Publishes a message to the server. Accepts both string and object messages.

**Parameters:**

- `message` (string | object): Message data. If a string is provided, it will be wrapped in `{data: message}` automatically.
- `tags` (string[]): Optional array of tags for categorization.
- `entity` (string): Optional destination entity ID.
- `waitResponse` (boolean): If `true`, the message is sent immediately and `publish()` returns a `Promise` that resolves with the server response (or `null` if the request failed or timed out after 5s). Nothing is synchronous — the promise must be awaited. If `false` (the default), the message is queued for the next sender pass and `publish()` returns `undefined`.

**Cross-SDK caveats** — two places where this SDK and the Python SDK send
different bytes for the same call:

- When `entity` and `waitResponse` are both set, this SDK sends `context.wait: true`
  next to `dest`; the Python SDK drops `wait` whenever an entity is given. So
  `publish(msg, tags, entity, true)` does not produce the same message in both.
- A string message becomes `data: {data: "..."}` here, while Python sends
  `data: "..."` unwrapped. Objects behave identically in both.

```javascript
// Publish an object (queued, returns undefined)
client.publish({
    sensor: 'temperature',
    value: 23.5
}, ['sensors', 'environment']);

// Publish a string (automatically wrapped in {data: "..."})
client.publish('Simple text message', ['logs']);

// Wait for the response (sent immediately; must be awaited)
const response = await client.publish({
    alert: 'high_temperature',
    value: 45.0
}, ['alerts'], 'sensor-001', true);
```

#### `checkMessages(limit)`

Requests messages from the server and delivers them to the callback set with
`setMessageCallback()` (or the `callback` constructor option). It is `async` and
resolves with `undefined` — it does not return the messages, and it resolves
whether or not any arrived. If automatic message checking is enabled, this is
called for you at the configured interval.

```javascript
await client.checkMessages(10); // Fetch up to 10 messages (uses checkMsgLimit if null)
```

#### `setMessageCallback(callback)`

Sets or updates the message callback function. If automatic message checking is running, it will be restarted with the new callback.

```javascript
client.setMessageCallback((message) => {
    console.log('Received:', message);
    return true; // Return false if processing failed
});
```

#### `setMessageCheckRate(rateMs)`

Sets the automatic message checking frequency in milliseconds.

```javascript
client.setMessageCheckRate(5000); // Check every 5 seconds
```

#### `setMessageCheckLimit(limit)`

Sets the maximum number of messages to retrieve per check.

```javascript
client.setMessageCheckLimit(10); // Get up to 10 messages per check
```

#### `checkConnectionState()`

Checks the current connection state and returns true if connected, false otherwise.

```javascript
const isConnected = await client.checkConnectionState();
```

#### `start()`

Starts the sender loop, and the automatic message checking if a callback is set.
There is no connection to establish, so `start()` returns immediately — but it is
not purely local: it fires a `PUT /entities/status` to mark the entity online
without awaiting it, and that request's failure is swallowed (logged only under
`debug: true`). `start()` returning is therefore not evidence that the server was
reached or that the API key is valid.

```javascript
client.start();
```

#### `stop()`

Stops the client, updates entity status to offline, and sends anything still
queued. Returns a `Promise` that resolves once that flush is done.

```javascript
await client.stop();
```

Awaiting it matters when the process is about to exit: `publish()` is
asynchronous, so a message published moments earlier is still on the queue, and
without the await the process may exit before it goes out. Calling
`client.stop()` without awaiting still works and still flushes.

If a batch cannot be delivered and no offline storage is available, the client
logs a warning naming the count and the server. Offline storage requires a
browser, so under Node that warning is the only signal you get.

#### `isConnected` (property)

Read-only. True only while the client is **both** running and last known to be
reachable — it is the last connection result AND `start()`-ed state. Two
consequences worth knowing:

- After `stop()` it is `false` on a perfectly healthy network. It is not a network
  probe; use `await client.checkConnectionState()` for that.
- Before the first request it is optimistic: a freshly started client reports
  connected until something actually fails.

```javascript
if (client.isConnected) {
    console.log('Client is connected');
}
```

#### `sendHeartbeat({ mem_free, mem_total, disk_free, disk_size })`

Sends a heartbeat message with system resource information. Always sends
immediately and waits for the response. There is no automatic heartbeat loop in
this SDK — call it yourself on whatever schedule you want.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `mem_free` | `number` | Available RAM in bytes (must be non-negative if provided) |
| `mem_total` | `number` | Total RAM in bytes (must be non-negative if provided) |
| `disk_free` | `number` | Available filesystem space in bytes (must be non-negative if provided) |
| `disk_size` | `number` | Total filesystem size in bytes (must be non-negative if provided) |

**Returns:** `Promise<any>` - Resolves with server response or `null` on error

**Throws:** `Error` - If any provided parameter is negative. Backend will validate required fields and return appropriate errors.

**Example:**

```javascript
// Send heartbeat with system resource information
await client.sendHeartbeat({
    mem_free: 8589934592,      // 8 GB in bytes
    mem_total: 17179869184,    // 16 GB in bytes
    disk_free: 107374182400,   // 100 GB in bytes
    disk_size: 1073741824000   // 1 TB in bytes
});
```

**Notes:**

- All values must be in bytes and non-negative (≥ 0) if provided
- The heartbeat message is sent immediately (bypasses queue) and waits for server response

### Message Callbacks

```javascript
// Set up callback to handle incoming messages
function messageHandler(message) {
    // Process incoming message
    // Message shape: {msg_type, data, context: {tags}, source, timestamp, dest, request_id}
    console.log(`Received: ${message.msg_type} from ${message.source}`);
    
    // Access message data
    const data = message.data;
    const tags = message.context?.tags || [];
    
    // Return true to indicate successful processing
    // Return false if processing failed (won't stop other messages)
    return true;
}

// Set callback (automatic message checking will start if client is running)
client.setMessageCallback(messageHandler);

// Configure checking behavior (optional)
client.setMessageCheckRate(5000); // Check every 5 seconds (default: 3000ms)
client.setMessageCheckLimit(10);  // Max messages per check (default: 1)

// Manual message check
client.checkMessages(5);
```

**Automatic Message Checking**: When a callback is set and the client is running, messages are automatically checked at the configured interval (`checkMsgRate`). This matches the Python SDK's behavior.

### IncomingMessage Structure

The client reshapes each message before handing it to your callback, filling in
defaults for anything the server left out. So "always present" below means the
field exists on every message you receive — **not** that the server sent it. In
particular, a defaulted `source` is the empty string, not an error.

| Field | Type | Description | Always present |
|-------|------|-------------|----------------|
| `msg_type` | `string` | Message type identifier (e.g., "command", "notification", "alert"). Defaults to `"command"` client-side | ✅ Yes |
| `source` | `string` | Sender's resource path (set by server). Defaults to `""` client-side, so a callback can receive an empty source | ✅ Yes |
| `dest` | `string` | Destination entity identifier | ❌ Only when the server sends one |
| `timestamp` | `string` | RFC3339 timestamp (set by server). Defaults client-side to the time the message was received | ✅ Yes |
| `data` | `any` | The actual message payload (can be any JSON type). Defaults to `{}` | ✅ Yes |
| `context` | `object` | Message metadata | ❌ Only when the server sends tags |
| `request_id` | `string` | Request identifier (if message was a request) | ❌ Only when the server sends one |

### Message Context Structure

| Field | Type | Description | Always present |
|-------|------|-------------|----------------|
| `tags` | `string[]` | Message tags for categorization | ❌ Only when the server sends tags |

### Message Checking How It Works

1. **Automatic Background Checking**: When a callback is set, the SDK automatically checks for messages every 3 seconds (configurable via `checkMsgRate`)
2. **Manual Checking**: You can call `checkMessages()` manually anytime
3. **Message Transformation**: Incoming messages are automatically transformed from the server's CheckMessage format to the Message format above (top-level `tags` are moved under `context`, and missing fields are defaulted)
4. **Callback Execution**: Your callback function is called for each incoming message
5. **Error Handling**: Failed callbacks don't stop other message processing
6. **Connectivity Aware**: Automatically handles network failures and updates connectivity state

### React Hooks

#### `useTendrlClient`

```javascript
import useTendrlClient from '@tendrl/contact/hooks';

const {
    client,              // TendrlClient instance
    isConnected,         // Connection status
    publish,             // Publish function
    checkMessages,       // Manual message check function
    setMessageCallback,  // Set/update message callback
    setMessageCheckRate, // Set message check frequency
    setMessageCheckLimit, // Set message check limit
    sendHeartbeat,       // Send heartbeat function
} = useTendrlClient({
    onMessage: (message) => {   // Message callback (the hook's name for `callback`)
        console.log('Received:', message);
    },
    debug: false,               // Enable debug logging
    minBatchSize: 10,           // Accepted, not used — see Configuration Options
    maxBatchSize: 100,          // Maximum messages sent per pass
    minBatchInterval: 100,      // Sender interval at low queue load (ms)
    maxBatchInterval: 1000,     // Sender interval at high queue load (ms)
    maxQueueSize: 1000,         // Maximum queue size
    checkMsgRate: 3000,         // Check every 3 seconds
    checkMsgLimit: 1,           // Get 1 message per check
    apiBaseUrl: undefined,      // Passed through; omit to use TENDRL_APP_URL / production
    offlineStorage: false,      // Enable offline storage (IndexedDB — browser only)
    dbName: 'tendrl_offline',   // IndexedDB database name
});
```

That is the complete list — the hook accepts no other options.

Two of the constructor's options are **not** among them:

- **`apiKey`**: there is no way to pass one. The hook reads
  `process.env.REACT_APP_TENDRL_KEY` and nothing else. If that variable is unset,
  the hook logs an error and `client` stays `null`; every returned function then
  logs "TendrlClient is not initialized." and does nothing.
- **`callback`**: use `onMessage`, which the hook forwards as the client's
  `callback`.

`publish` returns whatever the client returns, so `publish(msg, tags, entity, true)`
hands back the promise to await. `checkMessages` likewise returns the promise;
messages themselves arrive through `onMessage`.

`isConnected` is read during render from the client the effect built, so it is
`false` on the first render and it does not re-render the component when the
connection state later changes — the hook holds no React state. Poll
`client.isConnected` on your own timer if you need it to update on screen, as
`examples/components/APIDemo.js` does.

## Message Format

### Publishing Messages

Messages are automatically formatted. You can publish either:

- **Objects**: Passed directly as message data
- **Strings**: Automatically wrapped in `{data: "your string"}`

```javascript
// Object message
client.publish({ event: 'click', button: 'submit' }, ['ui']);

// String message (automatically wrapped)
client.publish('Log message', ['logs']);
```

## Error Handling

```javascript
// Start error handling
try {
    client.start();
    console.log('Client started successfully');
} catch (error) {
    console.error('Failed to start client:', error);
}

// Message publishing error handling
const messageData = { sensor: 'temperature', value: 23.5 };
const tags = ['sensors'];

try {
    client.publish(messageData, tags);
} catch (error) {
    console.error('Publishing failed:', error);
}

// Check connection state
const isConnected = await client.checkConnectionState();
if (!isConnected) {
    console.warn('Client is not connected');
}
```

What those `catch` blocks can and cannot see:

- `publish()` throws only for a message that is `null`, `undefined`, or neither
  string nor object. A **delivery** failure never reaches the call site: a queued
  message that cannot be sent is stored offline or dropped, and the error is logged
  only under `debug: true`. Pass `waitResponse: true` and await the result — `null`
  means the send failed — if you need to know.
- `start()` does not throw for an unreachable server or a bad API key either; see
  [`start()`](#start).

## Performance Features

### Adaptive Send Interval

The sender re-arms itself after each pass with a delay recomputed from the queue
as it is at that moment:

- Below 25% of `maxQueueSize`: `minBatchInterval`
- Above 75%: `maxBatchInterval`
- In between: interpolated linearly between the two

What is *not* adaptive: the batch size. Every pass sends whatever is queued, up to
`maxBatchSize` — there is no load-based batch sizing and `minBatchSize` is not
consulted. Overflow is bounded by `maxQueueSize`; past that, messages are stored
offline if offline storage is enabled and discarded if it is not.

### Memory Management

- Configurable queue size limits
- Automatic message discarding when queue is full (or offline storage if enabled)
- Efficient batch processing to minimize memory usage

## Offline Storage

The SDK supports offline message storage using IndexedDB (browser's native database). This ensures messages are not lost during network outages.

### Enabling Offline Storage

> **⚠️ Browser only.** IndexedDB does not exist in Node.js. Under Node,
> `offlineStorage: true` fails at construction — the storage `init()` rejects with
> `indexedDB is not defined`, the client swallows that rejection (it is only
> visible with `debug: true`), and every subsequent "stored" message is lost with
> no error at the call site. Leave `offlineStorage: false` outside the browser.

```javascript
const client = new TendrlClient({
    apiBaseUrl: 'https://app.tendrl.com/api',
    apiKey: 'your_api_key',
    offlineStorage: true,  // Enable offline storage (browser only)
    dbName: 'tendrl_offline',  // Optional: custom database name
});
```

### How It Works

1. **When Offline**: Messages are automatically stored in IndexedDB when:
   - Connection is lost
   - Queue is full (messages stored instead of discarded)
   - Publish fails due to network error

2. **When Online**: Stored messages are automatically processed when connection is restored:
   - Messages are sent in batches (50 messages per batch)
   - Tags are preserved from original messages
   - Messages are deleted after successful sending

3. **TTL Expiration**: Messages expire 1 hour (3600 seconds) after they are stored
   - Expired messages are automatically cleaned up
   - Cleanup runs at most once a minute, on a sender pass

### Offline Storage Features

- **Automatic Storage**: Messages stored when offline or queue full
- **Automatic Processing**: Messages sent when connection restored
- **Tag Preservation**: Tags are stored and restored with messages
- **TTL Expiration**: Messages expire after 1 hour. This is not configurable — the client passes 3600 seconds at both store sites and exposes no option for it
- **Batch Processing**: Large backlogs processed in manageable batches
- **Error Handling**: Failed batches don't affect successfully sent messages

### Example Usage

```javascript
const client = new TendrlClient({
    apiBaseUrl: 'https://app.tendrl.com/api',
    apiKey: 'your_api_key',
    offlineStorage: true,
    debug: true,
});

client.start();

// Publish messages - they'll be stored offline if connection is lost
client.publish({ sensor: 'temp', value: 23.5 }, ['sensors']);

// When connection is restored, offline messages are automatically processed
// No manual intervention needed!
```

## Development

### SDK Structure

The SDK code is located in the `src/` directory:

- `src/hooks/` - React hooks (`useTendrlClient`)
- `src/utils/` - Client class (`TendrlClient`)

### Examples

`examples/` holds a Create React App demo. It consumes the SDK exactly the way
your own app would: `examples/package.json` depends on `@tendrl/contact` by its
GitHub spec, and `examples/components/APIDemo.js` imports
`@tendrl/contact/hooks`. Nothing reaches outside the project root, so no symlink
is needed.

```bash
cd examples
npm install                                    # React, react-scripts, and the SDK
echo "REACT_APP_TENDRL_KEY=your_api_key" > .env
npm start
```

See `examples/README.md` for details.

## Environment Variables

```bash
REACT_APP_TENDRL_KEY=your_api_key      # API key — the only source the React hook reads
TENDRL_APP_URL=http://localhost:8000   # Optional: where the client points
```

**`REACT_APP_TENDRL_KEY`** is the only way to give the React hook an API key; the
hook accepts no `apiKey` option. Outside React, pass `apiKey` to the constructor —
nothing reads this variable there.

**`TENDRL_APP_URL`** overrides the API base URL. It is read from `process.env`
when a client is constructed, and the resolution order is:

1. the `apiBaseUrl` option, if given
2. `TENDRL_APP_URL`
3. `https://app.tendrl.com/api`

A bare origin gets `/api` appended (`http://localhost:8000` →
`http://localhost:8000/api`), a value already ending in `/api` is left alone, and
trailing slashes are trimmed. The Python SDK applies the same rule to the same
variable, so one value configures both. Where `process.env` does not exist at all,
the lookup is skipped and the production default applies.

One caveat for bundled apps: Create React App only exposes variables prefixed
`REACT_APP_` to the bundle, so `TENDRL_APP_URL` will not reach a client running in
a CRA build. Pass `apiBaseUrl` to the hook there instead.

## Runtime Requirements

Rather than quote browser version numbers this repository does not test, here is
what the code actually needs:

- **`fetch`** — every request goes through it. In Node this means **Node 18 or
  newer** (`package.json` sets `engines.node >= 18`); there is no polyfill and no
  `node-fetch` dependency.
- **`AbortController`** — used for every request timeout.
- **ES modules and `async`/`await`** — the package is `"type": "module"` and ships
  untranspiled source. Bundle it yourself if you need to support older targets.
- **`indexedDB`** — only when `offlineStorage: true`. Browsers only; see
  [Offline Storage](#offline-storage).

CI runs the test suite on Node 20 and 22.

## License

Copyright (c) Tendrl, Inc. 2025-2026.

Licensed under the MIT License with Commons Clause and Client Use Restriction —
see [LICENSE](LICENSE) for the terms that govern. You are granted the right to
use, copy, modify, merge, publish, distribute, sublicense and sell copies of the
software, subject to the restrictions summarized at the top of this README:
no commercial or hosted product built on it, and no use against any backend other
than Tendrl's.
