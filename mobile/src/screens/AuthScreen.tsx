import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { Mail, Lock } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { getErrorMessage } from "../lib/errors";
import { captureError } from "../lib/sentry";
import TurnstileChallenge, { TurnstileChallengeHandle } from "../components/TurnstileChallenge";
import { theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";

const PRIVACY_POLICY_URL = "https://claude.ai/code/artifact/4e325609-3c98-4037-a842-c39e4b7fce07";
const TERMS_OF_SERVICE_URL = "https://claude.ai/code/artifact/33d1e392-0850-42bf-b17f-75cc5456d2b9";
const TURNSTILE_SITE_KEY: string = Constants.expoConfig?.extra?.turnstileSiteKey ?? "";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);

  // Empty until Turnstile is actually set up (see app.config.ts) — skips the
  // challenge entirely rather than blocking sign-in/sign-up on a feature
  // that isn't configured yet. Once a real site key exists, every
  // credentialed auth attempt requires solving it first, which is the whole
  // point: Supabase's own brute-force/rate-limit protection is IP-based and
  // off by default for CAPTCHA specifically (confirmed against Supabase's
  // own docs and community-reported pentest findings, not assumed) — this
  // is what actually closes that gap once the dashboard side is toggled on.
  async function getCaptchaToken(): Promise<string | undefined> {
    if (!TURNSTILE_SITE_KEY) return undefined;
    try {
      return await turnstileRef.current?.execute();
    } catch (err) {
      captureError(err, { screen: "AuthScreen", action: "turnstile challenge" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't verify you're human", getErrorMessage(err));
      throw err;
    }
  }

  // Caught live during real end-to-end testing, not hypothetical: submitting
  // with a blank email calls Supabase with an empty string, which it treats
  // as an anonymous-sign-in attempt and rejects with "Anonymous sign-ins are
  // disabled" — a real response, but one that means nothing to a user who
  // just forgot to type an email. A trivial local check catches this before
  // it ever reaches Supabase.
  function validateFields(): boolean {
    if (!email.trim() || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Missing info", "Enter both an email and a password.");
      return false;
    }
    return true;
  }

  async function handleSignIn() {
    if (!validateFields()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const captchaToken = await getCaptchaToken();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (error) Alert.alert("Sign in failed", error.message);
    } catch {
      // getCaptchaToken() already showed its own alert.
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp() {
    if (!validateFields()) return;
    setLoading(true);
    try {
      const captchaToken = await getCaptchaToken();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { captchaToken },
      });
      if (error) Alert.alert("Sign up failed", error.message);
      else Alert.alert("Check your email", "Confirm your account, then sign in.");
    } catch {
      // getCaptchaToken() already showed its own alert.
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      {TURNSTILE_SITE_KEY && <TurnstileChallenge ref={turnstileRef} siteKey={TURNSTILE_SITE_KEY} />}
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.title}>Transaction Calendar Sync</Text>

        <View style={styles.inputRow}>
          <Mail size={18} color={theme.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabel="Email"
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
            textContentType="password"
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={handleSignIn}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{ disabled: loading }}
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
            accessibilityRole="button"
            accessibilityLabel="Sign up"
            accessibilityState={{ disabled: loading }}
          >
            <Text style={styles.secondaryButtonText}>Sign up</Text>
          </Pressable>
        </View>

        <View style={styles.legalLinks}>
          <Pressable
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <Text style={styles.privacyLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalLinkSeparator}>·</Text>
          <Pressable
            onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
          >
            <Text style={styles.privacyLink}>Terms of Service</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pagePlane },
  keyboardAvoider: { flex: 1, justifyContent: "center", padding: spacing.lg, gap: spacing.md },
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
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  legalLinkSeparator: { ...typography.xs, color: theme.textMuted },
  privacyLink: {
    ...typography.xs,
    color: theme.textMuted,
    textAlign: "center",
    textDecorationLine: "underline",
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
