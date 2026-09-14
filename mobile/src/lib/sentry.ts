import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

// Crash/error reporting for the mobile app specifically — the backend
// already has real visibility via Vercel's own log retention (that's how
// the PLAID_SECRET-leak bug earlier this session was actually caught), but
// nothing on-device reports anywhere if something goes wrong for a real
// user; the developer would only ever find out if that user happened to
// mention it. This closes that gap for uncaught JS exceptions and native
// crashes automatically, with no other code changes required — Sentry's
// React Native SDK installs its own global handlers once initialized.
//
// No-ops safely on an empty DSN (the placeholder in app.config.ts before a
// real Sentry project exists) rather than throwing — this file is safe to
// import unconditionally regardless of whether a DSN has been configured
// yet.
export function initSentry() {
  const dsn = Constants.expoConfig?.extra?.sentryDsn;
  if (!dsn) {
    if (__DEV__) {
      console.log("[sentry] No DSN configured — crash/error reporting is disabled.");
    }
    return;
  }

  Sentry.init({
    dsn,
    // Sends real, exact error text to Sentry — fine for a spending-tracker
    // app's own errors (network failures, sync failures, etc.), but this is
    // the one thing worth revisiting if this app ever logs something more
    // sensitive in an error message than it does today (it doesn't
    // currently — see getErrorMessage()/safeErrorInfo()'s own posture on
    // never surfacing raw/secret-bearing errors to the user, which is the
    // same class of data this would send to Sentry).
    // Performance tracing is a separate, quota-consuming thing from error
    // reporting (the actual ask here) — off by default so a free-tier Sentry
    // project's quota goes toward crashes/errors, not trace volume. Can be
    // turned on later as a deliberate choice, not a default side effect of
    // adding crash reporting.
    tracesSampleRate: 0,
    enabled: !__DEV__,
    debug: false,
  });
}
