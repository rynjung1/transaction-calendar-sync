import { useEffect, useState } from "react";
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { House, ChartColumn, Settings } from "lucide-react-native";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";
import { getPlaidStatus } from "./src/lib/api";
import { getErrorMessage } from "./src/lib/errors";
import AuthScreen from "./src/screens/AuthScreen";
import LinkAccountScreen from "./src/screens/LinkAccountScreen";
import CalendarPickerScreen from "./src/screens/CalendarPickerScreen";
import HomeScreen from "./src/screens/HomeScreen";
import InsightsScreen from "./src/screens/InsightsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { theme } from "./src/lib/theme";
import { typography } from "./src/lib/typography";
import { spacing } from "./src/lib/spacing";
import type { SelectedCalendar } from "./src/types";

type Tab = "home" | "insights" | "settings";

const CALENDAR_STORAGE_KEY = "selectedCalendar";

export default function App() {
  // `booting` covers the *entire* "do we actually know this user's state
  // yet" window — session, then (if signed in) their Plaid-linked status.
  // It used to only cover the session check, so `linked` sat at its default
  // `false` while the status check was still in flight: every already-linked
  // user briefly saw "Connect your bank" on cold launch before it flipped to
  // their real Home screen. Not anymore — nothing renders past the spinner
  // until the real answer is in.
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [linked, setLinked] = useState(false);
  // True when at least one linked bank needs to be reconnected (Plaid
  // ITEM_LOGIN_REQUIRED/ERROR) — distinct from `linked`, which only means
  // "has completed onboarding at least once". See plaid/status.ts for why
  // conflating the two used to send an already-linked user with a broken
  // connection back through first-link onboarding.
  const [needsReauth, setNeedsReauth] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusCheckAttempt, setStatusCheckAttempt] = useState(0);
  const [calendar, setCalendar] = useState<SelectedCalendar | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  // Only meaningful once already linked — this is the "add another account"
  // path from Settings, distinct from the required first-link flow gated by
  // `linked` above. There's no navigation stack in this app, so this is a
  // second, separate flag rather than trying to route through `linked`.
  const [addingAccount, setAddingAccount] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // No session at all means there's nothing further to check before
      // showing AuthScreen — the plaid-status effect below only runs once
      // signed in, so booting has to end here for a signed-out user.
      if (!data.session) setBooting(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) {
        setLinked(false);
        setNeedsReauth(false);
        setCalendar(null);
        setBooting(false);
      } else if (event === "SIGNED_IN") {
        // A fresh sign-in mid-session (switching accounts, or right after
        // Settings -> Delete account signs the old session out) needs the
        // same "don't render until the real state is known" gate as cold
        // launch — otherwise `linked` is still reset to false from the
        // prior sign-out and flashes "Connect your bank" on an account
        // that's actually already linked, while the status check catches up.
        //
        // Gated on the actual event now, not "any truthy session" — this
        // callback also fires for TOKEN_REFRESHED (routine, roughly hourly
        // via autoRefreshToken: true), USER_UPDATED, and INITIAL_SESSION,
        // none of which mean "the user just signed in". Treating any of
        // those as a fresh sign-in re-armed `booting`, which unmounts and
        // remounts the entire app (App.tsx renders a bare spinner while
        // booting) — discarding every screen's local state and any in-flight
        // work (e.g. a sync mid-loop) for no reason tied to anything the
        // user did. Plausibly the real cause of the transient "401 right
        // after sign-in, fixed by retrying" symptom seen during live
        // testing, not just a UI flash.
        setBooting(true);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setStatusError(null);
    getPlaidStatus()
      .then((status) => {
        if (cancelled) return;
        setLinked(status.linked);
        setNeedsReauth(status.needsReauth);
      })
      .catch((err) => {
        // A network hiccup or transient server error is not the same thing
        // as "this user hasn't linked a bank" — treating them the same used
        // to route an already-linked user back through the first-link flow
        // on nothing more than a bad connection. Show a real error with a
        // way to retry instead of guessing either way.
        if (!cancelled) setStatusError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, statusCheckAttempt]);

  useEffect(() => {
    if (!linked) return;
    let cancelled = false;
    AsyncStorage.getItem(CALENDAR_STORAGE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        setCalendar(JSON.parse(raw));
      } catch {
        // Corrupted local data (a bad write, a leftover incompatible shape
        // from an older version) — treat as "no calendar chosen yet" rather
        // than let JSON.parse throw inside this unhandled promise callback.
        // The picker just runs again; nothing the user did caused this.
        AsyncStorage.removeItem(CALENDAR_STORAGE_KEY);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [linked]);

  async function handleCalendarSelected(selected: SelectedCalendar) {
    await AsyncStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(selected));
    setCalendar(selected);
  }

  // Previously there was no way back to CalendarPickerScreen at all once a
  // calendar was chosen — not even signing out and back in, since that only
  // reset the in-memory `calendar` state, not the persisted AsyncStorage
  // value the next sign-in would just reload. A mis-tap during onboarding,
  // wanting to switch calendars, or the chosen calendar being deleted from
  // the device were all unrecoverable short of reinstalling the app.
  async function handleChangeCalendar() {
    await AsyncStorage.removeItem(CALENDAR_STORAGE_KEY);
    setCalendar(null);
  }

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.textPrimary} />
      </View>
    );
  }

  if (statusError) {
    return (
      <View style={styles.center}>
        <Text style={styles.statusErrorText}>{statusError}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => setStatusCheckAttempt((n) => n + 1)}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppContent
        session={session}
        linked={linked}
        needsReauth={needsReauth}
        calendar={calendar}
        tab={tab}
        setTab={setTab}
        setLinked={setLinked}
        onCalendarSelected={handleCalendarSelected}
        onChangeCalendar={handleChangeCalendar}
        addingAccount={addingAccount}
        setAddingAccount={setAddingAccount}
      />
    </SafeAreaProvider>
  );
}

interface AppContentProps {
  session: Session | null;
  linked: boolean;
  needsReauth: boolean;
  calendar: SelectedCalendar | null;
  tab: Tab;
  setTab: (tab: Tab) => void;
  setLinked: (linked: boolean) => void;
  onCalendarSelected: (calendar: SelectedCalendar) => void;
  onChangeCalendar: () => void;
  addingAccount: boolean;
  setAddingAccount: (adding: boolean) => void;
}

function AppContent({
  session,
  linked,
  needsReauth,
  calendar,
  tab,
  setTab,
  setLinked,
  onCalendarSelected,
  onChangeCalendar,
  addingAccount,
  setAddingAccount,
}: AppContentProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {!session ? (
        <AuthScreen />
      ) : !linked ? (
        <LinkAccountScreen onLinked={() => setLinked(true)} />
      ) : !calendar ? (
        <CalendarPickerScreen onSelected={onCalendarSelected} />
      ) : addingAccount ? (
        <LinkAccountScreen
          onLinked={() => setAddingAccount(false)}
          onCancel={() => setAddingAccount(false)}
        />
      ) : (
        <View style={styles.tabbedContainer}>
          {needsReauth && (
            // No dedicated "reconnect" flow exists yet — the broken item is
            // excluded from every future sync (plaid/sync.ts only syncs
            // status="active" items), so it just goes quiet rather than
            // erroring repeatedly. Relinking via Settings' existing "Add
            // another bank account" is a safe way to restore that bank:
            // the old, broken item stays inert (never synced again), so
            // there's no duplicate-transaction risk in doing that.
            <Pressable
              style={styles.reauthBanner}
              onPress={() => setTab("settings")}
              accessibilityRole="button"
              accessibilityLabel="One of your banks needs attention. Go to Settings."
            >
              <Text style={styles.reauthBannerText}>
                One of your banks needs to be reconnected — tap to fix in Settings.
              </Text>
            </Pressable>
          )}
          <View style={styles.screenArea}>
            {tab === "home" ? (
              <HomeScreen calendar={calendar} />
            ) : tab === "insights" ? (
              <InsightsScreen />
            ) : (
              <SettingsScreen onAddAccount={() => setAddingAccount(true)} onChangeCalendar={onChangeCalendar} />
            )}
          </View>
          <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
            <Pressable
              style={styles.tabButton}
              onPress={() => setTab("home")}
              accessibilityRole="tab"
              accessibilityLabel="Home"
              accessibilityState={{ selected: tab === "home" }}
            >
              <House size={22} color={tab === "home" ? theme.textPrimary : theme.textMuted} />
              <Text style={[styles.tabLabel, tab === "home" && styles.tabLabelActive]}>Home</Text>
            </Pressable>
            <Pressable
              style={styles.tabButton}
              onPress={() => setTab("insights")}
              accessibilityRole="tab"
              accessibilityLabel="Insights"
              accessibilityState={{ selected: tab === "insights" }}
            >
              <ChartColumn size={22} color={tab === "insights" ? theme.textPrimary : theme.textMuted} />
              <Text style={[styles.tabLabel, tab === "insights" && styles.tabLabelActive]}>
                Insights
              </Text>
            </Pressable>
            <Pressable
              style={styles.tabButton}
              onPress={() => setTab("settings")}
              accessibilityRole="tab"
              accessibilityLabel="Settings"
              accessibilityState={{ selected: tab === "settings" }}
            >
              <Settings size={22} color={tab === "settings" ? theme.textPrimary : theme.textMuted} />
              <Text style={[styles.tabLabel, tab === "settings" && styles.tabLabelActive]}>
                Settings
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pagePlane },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: theme.pagePlane,
  },
  statusErrorText: { ...typography.sm, fontWeight: "400", color: theme.textSecondary, textAlign: "center" },
  retryButton: {
    backgroundColor: theme.textPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
  },
  retryButtonText: { ...typography.sm, color: theme.pagePlane },
  tabbedContainer: { flex: 1 },
  reauthBanner: {
    backgroundColor: theme.statusDanger,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  reauthBannerText: { ...typography.xs, color: theme.pagePlane, textAlign: "center" },
  screenArea: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  tabButton: { flex: 1, paddingTop: spacing.sm, alignItems: "center", gap: 2 },
  tabLabel: { ...typography.xs, color: theme.textMuted },
  // fontWeight, not just color, distinguishes the active tab — color alone
  // is invisible to anyone who can't perceive the textMuted/textPrimary
  // difference (and accessibilityState={{selected}} above covers screen
  // readers specifically; this covers sighted low-contrast-perception cases).
  tabLabelActive: { color: theme.textPrimary, fontWeight: "600" },
});
