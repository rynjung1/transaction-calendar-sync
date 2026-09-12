import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CircleCheck } from "lucide-react-native";
import { getSyncFilters, updateSyncFilters, deleteAccount } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";

// "FOOD_AND_DRINK" -> "Food & Drink". Generic transform rather than a
// curated label map — this needs a readable label for all 16 PFC primary
// categories the backend can send, not just the 7 theme.ts picks colors
// for on the Insights chart (a different, narrower concern).
function humanizeCategory(pfc: string): string {
  return pfc
    .toLowerCase()
    .split("_")
    .map((word) => (word === "and" ? "&" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

const MAX_MIN_AMOUNT = 1_000_000;

interface Props {
  onAddAccount: () => void;
}

export default function SettingsScreen({ onAddAccount }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validCategories, setValidCategories] = useState<string[]>([]);
  const [minAmountText, setMinAmountText] = useState("0");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getSyncFilters()
      .then((res) => {
        if (cancelled) return;
        setMinAmountText(String(res.sync_filters.min_amount));
        // Drop anything not currently valid rather than silently re-submitting
        // it on save — a stale/unknown category here would otherwise fail the
        // backend's validation for a category the user never touched.
        const validSet = new Set(res.valid_categories);
        setExcluded(new Set(res.sync_filters.excluded_categories.filter((c) => validSet.has(c))));
        setValidCategories(res.valid_categories);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleCategory(category: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  async function handleSave() {
    const minAmount = Number(minAmountText);
    if (!Number.isFinite(minAmount) || minAmount < 0 || minAmount > MAX_MIN_AMOUNT) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Invalid amount",
        `Minimum amount must be a number between 0 and ${MAX_MIN_AMOUNT.toLocaleString()}.`
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      await updateSyncFilters({ min_amount: minAmount, excluded_categories: Array.from(excluded) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your sync filters have been updated.");
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't save filters", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your account, disconnects your bank, and erases every synced transaction — this can't be undone. Calendar events already created are not removed automatically; you'd need to delete those yourself.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: confirmDeleteAccount },
      ]
    );
  }

  async function confirmDeleteAccount() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setDeleting(true);
    try {
      await deleteAccount();
      // The account (and its session) no longer exists server-side — clear
      // the local session too so App.tsx's auth listener sends the user back
      // to the sign-in screen instead of holding a session for a deleted user.
      await supabase.auth.signOut();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't delete account", getErrorMessage(err));
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ActivityIndicator color={theme.textPrimary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.sectionTitle}>Minimum amount</Text>
        <Text style={styles.sectionSubtitle}>
          Charges below this amount won't be synced to your calendar. Refunds and income are never
          filtered by amount.
        </Text>
        <View style={styles.inputRow}>
          <Text style={styles.inputPrefix}>$</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={theme.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel="Minimum amount"
            value={minAmountText}
            onChangeText={setMinAmountText}
          />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Excluded categories</Text>
        <Text style={styles.sectionSubtitle}>
          Transactions in these categories are never synced, regardless of amount.
        </Text>
        <FlatList
          style={styles.list}
          data={validCategories}
          keyExtractor={(category) => category}
          renderItem={({ item: category }) => {
            const isExcluded = excluded.has(category);
            return (
              <Pressable
                style={styles.categoryRow}
                onPress={() => toggleCategory(category)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isExcluded }}
                accessibilityLabel={humanizeCategory(category)}
              >
                <Text style={styles.categoryLabel}>{humanizeCategory(category)}</Text>
                {isExcluded ? (
                  <CircleCheck size={20} color={theme.textPrimary} />
                ) : (
                  <View style={styles.uncheckedCircle} />
                )}
              </Pressable>
            );
          }}
        />

        <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={theme.pagePlane} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>

        <Pressable style={styles.addAccountButton} onPress={onAddAccount}>
          <Text style={styles.addAccountButtonText}>Add another bank account</Text>
        </Pressable>

        <Pressable
          style={[styles.deleteButton, deleting && styles.saveButtonDisabled]}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={theme.statusDanger} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete account</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pagePlane },
  keyboardAvoider: { flex: 1, padding: spacing.lg },
  title: { ...typography.lg, color: theme.textPrimary, marginBottom: spacing.md },
  errorText: {
    ...typography.sm,
    fontWeight: "400",
    color: theme.textSecondary,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  sectionTitle: { ...typography.sm, color: theme.textPrimary },
  sectionSubtitle: {
    ...typography.xs,
    color: theme.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
  },
  inputPrefix: { ...typography.md, color: theme.textMuted },
  input: { ...typography.md, flex: 1, color: theme.textPrimary, paddingVertical: spacing.md },
  list: { flex: 1 },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  categoryLabel: { ...typography.md, color: theme.textPrimary },
  uncheckedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  saveButton: {
    backgroundColor: theme.textPrimary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { ...typography.sm, color: theme.pagePlane },
  addAccountButton: {
    backgroundColor: theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  addAccountButtonText: { ...typography.sm, color: theme.textPrimary },
  deleteButton: {
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.statusDanger,
  },
  deleteButtonText: { ...typography.sm, color: theme.statusDanger },
});
