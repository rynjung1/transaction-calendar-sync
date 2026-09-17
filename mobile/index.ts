import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

import { initSentry } from './src/lib/sentry';
import App from './App';

// Before anything else — installs Sentry's global handlers so an exception
// thrown during App's own render/setup is still caught, not just ones after
// the app is already up and running.
const sentryReady = initSentry();

// Sentry.wrap adds a React error boundary around the whole app — a render-
// time exception (as opposed to one inside an async callback, which the
// global handler above already catches) would otherwise just unmount the
// tree with no report anywhere, not only a blank screen for the user.
// Only wrap once Sentry has actually initialized (a real DSN is
// configured) — confirmed live that wrapping unconditionally produces a
// genuine warning on every launch while unconfigured ("Sentry.wrap was
// called before Sentry.init"). Harmless either way (Sentry.wrap degrades
// safely without a client), but there's no reason to wrap — and pay for
// the confusing log line — around a Sentry client that was never
// initialized in the first place.
const RootComponent = sentryReady ? Sentry.wrap(App) : App;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);
