# Tendrl JavaScript SDK Examples

This directory contains example applications demonstrating how to use the Tendrl JavaScript SDK.

## Examples

The examples directory contains a React application demonstrating the Tendrl SDK.

### Features Demonstrated

- API-based messaging (uses native fetch)
- Message publishing with tags (both object and string messages)
- Automatic message checking
- Message callbacks
- Connection state management

### Files

- `App.js` - Main application component
- `index.js` - Application entry point
- `components/APIDemo.js` - Demo component
- `public/index.html` - HTML template

**Note:** The example can be extended to demonstrate offline storage by enabling `offlineStorage: true` in the client configuration.

## Running the Examples

The example depends on the SDK as a package, the same way your own app would:
`package.json` here lists `@tendrl/contact` by its GitHub spec and `APIDemo.js`
imports `@tendrl/contact/hooks`. No symlink, and nothing imported from outside
this directory — `react-scripts` rejects imports that reach above the project
root, which is what the old `../../src/` import did.

1. Install dependencies (React, `react-scripts`, and the SDK from GitHub):

   ```bash
   cd examples
   npm install
   ```

2. Set up environment variables (create a `.env` file in the examples directory):

   ```bash
   REACT_APP_TENDRL_KEY=your_api_key
   ```

   The API key is the only required variable. The client defaults to
   `https://app.tendrl.com/api`; to point the demo somewhere else, pass
   `apiBaseUrl` to `useTendrlClient` in `components/APIDemo.js`. Create React App
   only exposes variables prefixed `REACT_APP_` to the bundle, so the SDK's
   `TENDRL_APP_URL` variable does not reach a client running here.

3. Run the example:

   ```bash
   npm start
   ```

This will start the React development server. The example application will be available at `http://localhost:3000`.

### Copying into your own project

To reuse this code, copy `App.js` and `components/APIDemo.js` into your project's
`src/` directory and install the SDK there:

```bash
npm install github:tendrl-inc-labs/contact-js
```

The imports need no changes — they already reference the package.
