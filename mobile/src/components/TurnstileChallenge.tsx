import { forwardRef, useImperativeHandle, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

// Cloudflare Turnstile has no native React Native SDK — its widget is a web
// component, so a WebView loading a minimal HTML shell is the standard way
// to run it outside a browser. Kept at 1x1/opacity 0 rather than
// display:none — a fully removed-from-layout element risks Cloudflare's own
// bot-detection heuristics treating it as suspicious, since real widgets
// (even "invisible" ones) still occupy real layout space.
export interface TurnstileChallengeHandle {
  execute: () => Promise<string>;
}

interface Props {
  siteKey: string;
}

// If Cloudflare's script never loads (no network, the CDN unreachable, a
// WebView content-blocking policy), the injected page's own waitForTurnstile
// polling loop retries forever — window.turnstile.render() is never called,
// so neither the success nor error-callback path in handleMessage below
// ever fires. Without a bound here, execute()'s promise would then never
// resolve or reject at all: getCaptchaToken() (awaited directly in
// handleSignIn/handleSignUp before either ever reaches Supabase) would hang
// indefinitely with the loading spinner stuck and no error shown — a real
// dead end, the same class of thing already fixed elsewhere in this app
// (the calendar-permission dead end). Not reachable today since Turnstile
// is still inert (empty site key), but worth closing before it's turned on
// rather than after a real user hits it.
const EXECUTE_TIMEOUT_MS = 15_000;

const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, Props>(({ siteKey }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const pending = useRef<{ resolve: (token: string) => void; reject: (err: Error) => void } | null>(
    null
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function settle(fn: () => void) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pending.current = null;
    fn();
  }

  useImperativeHandle(ref, () => ({
    execute: () =>
      new Promise<string>((resolve, reject) => {
        pending.current = { resolve, reject };
        timeoutRef.current = setTimeout(() => {
          settle(() => reject(new Error("Couldn't verify you're human. Check your connection and try again.")));
        }, EXECUTE_TIMEOUT_MS);
        webviewRef.current?.injectJavaScript(
          "window.turnstile && window.turnstile.execute(); true;"
        );
      }),
  }));

  function handleMessage(event: WebViewMessageEvent) {
    if (!pending.current) return;
    const { resolve, reject } = pending.current;
    settle(() => {});
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "success" && typeof data.token === "string") {
        resolve(data.token);
      } else {
        reject(new Error("Couldn't verify you're human. Please try again."));
      }
    } catch {
      reject(new Error("Couldn't verify you're human. Please try again."));
    }
  }

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  </head>
  <body style="margin:0;padding:0;">
    <div id="turnstile-widget"></div>
    <script>
      function post(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      (function waitForTurnstile() {
        if (window.turnstile) {
          window.turnstile.render('#turnstile-widget', {
            sitekey: '${siteKey}',
            size: 'invisible',
            callback: function (token) { post({ type: 'success', token: token }); },
            'error-callback': function () { post({ type: 'error' }); },
            'expired-callback': function () { post({ type: 'expired' }); }
          });
        } else {
          setTimeout(waitForTurnstile, 100);
        }
      })();
    </script>
  </body>
</html>`;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webviewRef}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        style={styles.webview}
        originWhitelist={["*"]}
      />
    </View>
  );
});

TurnstileChallenge.displayName = "TurnstileChallenge";

export default TurnstileChallenge;

const styles = StyleSheet.create({
  hidden: { width: 1, height: 1, opacity: 0, position: "absolute", bottom: 0, right: 0 },
  webview: { width: 1, height: 1 },
});
