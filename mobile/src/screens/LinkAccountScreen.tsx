import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Building2 } from "lucide-react-native";
import { createPlaidLinkSession } from "react-native-plaid-link-sdk";
import { createLinkToken, exchangePublicToken } from "../lib/api";
import { theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";

interface Props {
  onLinked: () => void;
  // Only passed when this screen is reached from "Add another bank account"
  // in Settings, rather than the required first-link flow — gives that path
  // a way back, and swaps the copy so it doesn't say "Connect your bank" as
  // if this were the user's first one.
  onCancel?: () => void;
}

export default function LinkAccountScreen({ onLinked, onCancel }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConnectBank() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const { linkToken } = await createLinkToken();

      const session = await createPlaidLinkSession({
        token: linkToken,
        onSuccess: async (success) => {
          try {
            await exchangePublicToken(success.publicToken);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onLinked();
          } catch (err) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Couldn't finish linking", String(err));
          } finally {
            setLoading(false);
          }
        },
        onExit: (exit) => {
          setLoading(false);
          if (exit.error) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Link exited", exit.error.errorMessage ?? "Unknown error");
          }
        },
        onEvent: () => {},
      });

      await session.open();
    } catch (err) {
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't start Plaid Link", String(err));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.iconCircle}>
        <Building2 size={32} color={theme.textPrimary} />
      </View>
      <Text style={styles.title}>{onCancel ? "Add another bank account" : "Connect your bank"}</Text>
      <Text style={styles.subtitle}>
        {onCancel
          ? "Link another account — transactions from both will show up on your calendar."
          : "Link your account so transactions can show up on your calendar."}
      </Text>
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleConnectBank}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={theme.pagePlane} />
        ) : (
          <Text style={styles.buttonText}>Connect a bank account</Text>
        )}
      </Pressable>
      {onCancel && (
        <Pressable onPress={onCancel} disabled={loading} hitSlop={8} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: theme.pagePlane,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { ...typography.lg, color: theme.textPrimary, textAlign: "center" },
  subtitle: {
    ...typography.sm,
    fontWeight: "400",
    color: theme.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  button: {
    width: "100%",
    backgroundColor: theme.textPrimary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { ...typography.sm, color: theme.pagePlane },
  cancelButton: { marginTop: spacing.md },
  cancelButtonText: { ...typography.sm, color: theme.textMuted },
});
