import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

import { initSentry } from './src/lib/sentry';
import App from './App';

// Before anything else — installs Sentry's global handlers so an exception
// thrown during App's own render/setup is still caught, not just ones after
// the app is already up and running.
initSentry();

// Sentry.wrap adds a React error boundary around the whole app — a render-
// time exception (as opposed to one inside an async callback, which the
// global handler above already catches) would otherwise just unmount the
// tree with no report anywhere, not only a blank screen for the user.
const SentryWrappedApp = Sentry.wrap(App);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(SentryWrappedApp);
