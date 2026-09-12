import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Mail, Lock } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";

const PRIVACY_POLICY_URL = "https://claude.ai/code/artifact/4e325609-3c98-4037-a842-c39e4b7fce07";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert("Sign in failed", error.message);
  }

  async function handleSignUp() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) Alert.alert("Sign up failed", error.message);
    else Alert.alert("Check your email", "Confirm your account, then sign in.");
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <Text style={styles.title}>Transaction Calendar Sync</Text>

      <View style={styles.inputRow}>
        <Mail size={18} color={theme.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>

      <View style={styles.inputRow}>
        <Lock size={18} color={theme.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.pagePlane} />
          ) : (
            <Text style={styles.primaryButtonText}>Sign in</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondaryButton]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>Sign up</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} hitSlop={8}>
        <Text style={styles.privacyLink}>Privacy Policy</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: theme.pagePlane,
  },
  title: {
    ...typography.lg,
    color: theme.textPrimary,
    marginBottom: spacing.lg,
    textAlign: "center",
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
  input: {
    ...typography.md,
    flex: 1,
    color: theme.textPrimary,
    paddingVertical: spacing.md,
  },
  buttons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  privacyLink: {
    ...typography.xs,
    color: theme.textMuted,
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: { backgroundColor: theme.textPrimary },
  primaryButtonText: { ...typography.sm, color: theme.pagePlane },
  secondaryButton: {
    backgroundColor: theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  secondaryButtonText: { ...typography.sm, color: theme.textPrimary },
});
