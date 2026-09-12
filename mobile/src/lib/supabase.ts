import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing supabaseUrl / supabaseAnonKey in app.json > expo.extra"
  );
}

// Supabase's `storage` option wants {getItem, setItem, removeItem}; SecureStore
// (iOS Keychain / Android Keystore-backed) uses *Async method names instead —
// this just adapts one to the other. Storing the session here rather than
// plain AsyncStorage means the access/refresh token pair isn't sitting in an
// unencrypted on-device file readable by anything that can read the app's
// sandbox (a compromised device, an unencrypted backup, a jailbreak).
const secureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
