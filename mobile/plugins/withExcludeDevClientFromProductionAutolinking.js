const { withPodfile } = require("@expo/config-plugins");

// `use_expo_modules!` in the generated Podfile links every Expo native
// module present in node_modules via CocoaPods autolinking — completely
// independent of app.config.ts's `plugins` array. That array only controls
// config-time injection (Info.plist entries, permissions strings); it does
// NOT control which pods get compiled in. Verified directly: excluding
// "expo-dev-client" from `plugins` alone left the generated AppDelegate.swift
// byte-identical, and expo-dev-launcher's AppDelegate-subscriber hook (wired
// via the autolinking-generated ExpoModulesProvider.swift, not AppDelegate.swift)
// still fired. This plugin is the piece that actually removes it, by passing
// `exclude:` to `use_expo_modules!` for production builds only — confirmed by
// diffing ExpoModulesProvider.swift and Podfile.lock with and without it.
//
// Plain .js (CommonJS), not .ts: app.config.ts is transpiled by Expo's own
// config loader, but a relative import *from* it is resolved by Node's
// native require(), which can't load .ts files — confirmed the hard way,
// a .ts version of this file failed prebuild with "Cannot find module".
const DEV_CLIENT_MODULES = ["expo-dev-client", "expo-dev-launcher", "expo-dev-menu"];

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withExcludeDevClientFromProductionAutolinking = (config) => {
  return withPodfile(config, (config) => {
    const target = "use_expo_modules!";
    if (!config.modResults.contents.includes(target)) {
      // Fail loud rather than silently ship the dev-launcher to production
      // if a future Expo/RN template upgrade changes this line's form.
      throw new Error(
        `withExcludeDevClientFromProductionAutolinking: expected to find "${target}" in the generated Podfile — the template may have changed. Update this plugin's string match.`
      );
    }
    const excludeList = DEV_CLIENT_MODULES.map((name) => `'${name}'`).join(", ");
    config.modResults.contents = config.modResults.contents.replace(
      target,
      `${target}(exclude: [${excludeList}])`
    );
    return config;
  });
};

module.exports = withExcludeDevClientFromProductionAutolinking;
