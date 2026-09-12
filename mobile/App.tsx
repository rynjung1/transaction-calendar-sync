import { useEffect, useState } from "react";
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { House, ChartColumn, Settings } from "lucide-react-native";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";
import { getPlaidStatus } from "./src/lib/api";
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
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [linked, setLinked] = useState(false);
  const [calendar, setCalendar] = useState<SelectedCalendar | null>(null);
  const [tab, setTab] = useState<Tab>("home");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setLinked(false);
        setCalendar(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    getPlaidStatus()
      .then((status) => setLinked(status.linked))
      .catch(() => setLinked(false));
  }, [session]);

  useEffect(() => {
    if (!linked) return;
    AsyncStorage.getItem(CALENDAR_STORAGE_KEY).then((raw) => {
      if (raw) setCalendar(JSON.parse(raw));
    });
  }, [linked]);

  async function handleCalendarSelected(selected: SelectedCalendar) {
    await AsyncStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(selected));
    setCalendar(selected);
  }

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.textPrimary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppContent
        session={session}
        linked={linked}
        calendar={calendar}
        tab={tab}
        setTab={setTab}
        setLinked={setLinked}
        onCalendarSelected={handleCalendarSelected}
      />
    </SafeAreaProvider>
  );
}

interface AppContentProps {
  session: Session | null;
  linked: boolean;
  calendar: SelectedCalendar | null;
  tab: Tab;
  setTab: (tab: Tab) => void;
  setLinked: (linked: boolean) => void;
  onCalendarSelected: (calendar: SelectedCalendar) => void;
}

function AppContent({
  session,
  linked,
  calendar,
  tab,
  setTab,
  setLinked,
  onCalendarSelected,
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
      ) : (
        <View style={styles.tabbedContainer}>
          <View style={styles.screenArea}>
            {tab === "home" ? (
              <HomeScreen calendar={calendar} />
            ) : tab === "insights" ? (
              <InsightsScreen />
            ) : (
              <SettingsScreen />
            )}
          </View>
          <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
            <Pressable style={styles.tabButton} onPress={() => setTab("home")}>
              <House size={22} color={tab === "home" ? theme.textPrimary : theme.textMuted} />
              <Text style={[styles.tabLabel, tab === "home" && styles.tabLabelActive]}>Home</Text>
            </Pressable>
            <Pressable style={styles.tabButton} onPress={() => setTab("insights")}>
              <ChartColumn size={22} color={tab === "insights" ? theme.textPrimary : theme.textMuted} />
              <Text style={[styles.tabLabel, tab === "insights" && styles.tabLabelActive]}>
                Insights
              </Text>
            </Pressable>
            <Pressable style={styles.tabButton} onPress={() => setTab("settings")}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.pagePlane },
  tabbedContainer: { flex: 1 },
  screenArea: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  tabButton: { flex: 1, paddingTop: spacing.sm, alignItems: "center", gap: 2 },
  tabLabel: { ...typography.xs, color: theme.textMuted },
  tabLabelActive: { color: theme.textPrimary },
});
