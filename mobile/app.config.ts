import type { ExpoConfig } from "expo/config";
import type { ConfigPlugin } from "@expo/config-plugins";

// Plain require, not `import` — this is a .js (CommonJS) file, not .ts. See
// that file's header comment for why: a relative import from app.config.ts
// is resolved by Node's native require() (not Expo's config-loader
// transpilation, which only covers the entry file itself), so a .ts import
// here fails prebuild with "Cannot find module" — confirmed the hard way.
const withExcludeDevClientFromProductionAutolinking: ConfigPlugin =
  require("./plugins/withExcludeDevClientFromProductionAutolinking");

// expo-dev-client's launcher screen ships in every build that has it linked —
// the eas.json `developmentClient` flag does NOT gate this (see CLAUDE.md's
// "Mobile security" section: verified by reading expo-dev-launcher's actual
// native source, not assumed). Without this exclusion, a production build
// submitted to the App Store would show real users the "Development Build" /
// "Enter URL manually" screen instead of the app.
//
// Two things are needed, not one: excluding "expo-dev-client" from `plugins`
// below only stops its config-time Info.plist/scheme changes — it does NOT
// stop CocoaPods autolinking from still linking the pod (autolinking reads
// node_modules directly, ignoring this array entirely), which is what
// actually wires its AppDelegate-subscriber hook in. The exclude in
// withExcludeDevClientFromProductionAutolinking (below) is the piece that
// stops it from being linked at all — verified by diffing the generated
// ExpoModulesProvider.swift and Podfile.lock with and without it.
//
// EAS sets EAS_BUILD_PROFILE automatically during `eas build`; it's unset for
// a plain local `expo prebuild`/`expo run:ios`, which correctly keeps the dev
// client for local development.
const isProductionBuild = process.env.EAS_BUILD_PROFILE === "production";

const config: ExpoConfig = {
  name: "Transaction Calendar Sync",
  slug: "transaction-calendar-sync",
  // Bumped from 1.0.0: `runtimeVersion: { policy: "appVersion" }` below ties
  // Expo Updates' native-compatibility fingerprint directly to this field —
  // confirmed against Expo's own docs, not assumed ("appVersion" reads this
  // exact field, and the documented practice is to bump it "just as you
  // would for a user-facing release" whenever native code changes, since
  // forgetting means a JS-only OTA update could get delivered to an older
  // binary that reports the same runtime version but lacks the native
  // module the update's JS actually needs). This project added three real
  // native dependencies since 1.0.0 was first set — expo-secure-store,
  // react-native-webview (for Turnstile), @sentry/react-native — with no
  // version bump for any of them. No live EAS Update channel is actually
  // serving real users yet, so nothing broke from this in practice, but
  // fixing it now closes the gap before it ever could. Bumped again to
  // 1.2.0 for the associatedDomains entitlement below — same reasoning,
  // it's a native/code-signing-level change too.
  version: "1.2.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  scheme: "txncalsync",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.rynjung1.transactioncalendarsync",
    infoPlist: {
      NSCalendarsUsageDescription:
        "This app writes your transactions as events on the calendar you choose, so it needs permission to add and view events.",
      NSCalendarsFullAccessUsageDescription:
        "This app writes your transactions as events on the calendar you choose, so it needs permission to add and view events.",
      ITSAppUsesNonExemptEncryption: false,
    },
    // Enables Plaid OAuth support for banks that require it (several major
    // Canadian ones do — RBC, TD, Scotiabank, BMO, CIBC). iOS OAuth Link
    // needs a real Universal Link, not this app's own txncalsync:// custom
    // scheme — checked Plaid's own current docs rather than assuming a
    // custom-scheme deep link would work, since it explicitly doesn't for
    // iOS. This entitlement alone is inert (Associated Domains only takes
    // effect once the domain actually serves a matching, correctly-signed
    // apple-app-site-association file — see
    // backend/.well-known/apple-app-site-association, whose appID still has
    // a placeholder Team ID pending Apple Developer enrollment) and is safe
    // to ship before that's finished. Points at the existing backend
    // deployment — no separate domain needed.
    associatedDomains: ["applinks:backend-theta-fawn-72.vercel.app"],
  },
  android: {
    package: "com.rynjung1.transactioncalendarsync",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: ["READ_CALENDAR", "WRITE_CALENDAR"],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    // Excluded from production builds — see the comment above isProductionBuild.
    // (Necessary but not sufficient on its own; withExcludeDevClientFromProductionAutolinking
    // below is applied separately since ExpoConfig["plugins"] only accepts plugin
    // names/tuples, not a function reference.)
    ...(isProductionBuild ? [] : (["expo-dev-client"] as const)),
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
    "expo-secure-store",
  ],
  extra: {
    apiBaseUrl: "https://backend-theta-fawn-72.vercel.app",
    supabaseUrl: "https://qddrlqlbjzhmjwotgmbc.supabase.co",
    supabaseAnonKey: "sb_publishable_lc7XV6Vq2hy-MyAbwJvJAA_tQPwrkeK",
    // A Sentry DSN is a *publishable* identifier by design (like the Plaid/
    // Supabase values above) — it only lets a client send events to this
    // project, not read or manage anything, so it's safe to embed the same
    // way. Empty until a real project exists; sentry.ts no-ops on an empty
    // DSN rather than erroring, so this is safe to ship either way.
    sentryDsn: "",
    // Same posture as sentryDsn above: a Turnstile *site* key is meant to be
    // public/embeddable (Cloudflare's own docs are explicit about this —
    // it's the *secret* key, entered in the Supabase dashboard's Attack
    // Protection settings and never touching this codebase, that must stay
    // private). Empty until Turnstile is set up; AuthScreen skips the
    // challenge entirely on an empty key rather than erroring.
    turnstileSiteKey: "",
    eas: {
      projectId: "4b6f7547-bd97-456d-8db2-77c16280ab11",
    },
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/4b6f7547-bd97-456d-8db2-77c16280ab11",
  },
};

// Local plugins that reference the exported plugin function directly (rather
// than by name in the `plugins` array above, which only accepts strings/tuples)
// are applied by calling them on the config, same as the `plugins` array does
// internally — this is the standard composition pattern for config plugins.
export default isProductionBuild ? withExcludeDevClientFromProductionAutolinking(config) : config;
