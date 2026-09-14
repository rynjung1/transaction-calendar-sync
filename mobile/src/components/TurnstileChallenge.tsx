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

const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, Props>(({ siteKey }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const pending = useRef<{ resolve: (token: string) => void; reject: (err: Error) => void } | null>(
    null
  );

  useImperativeHandle(ref, () => ({
    execute: () =>
      new Promise<string>((resolve, reject) => {
        pending.current = { resolve, reject };
        webviewRef.current?.injectJavaScript(
          "window.turnstile && window.turnstile.execute(); true;"
        );
      }),
  }));

  function handleMessage(event: WebViewMessageEvent) {
    if (!pending.current) return;
    const { resolve, reject } = pending.current;
    pending.current = null;
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
