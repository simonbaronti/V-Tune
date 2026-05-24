import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.vtune.tuner',
  appName: 'V-Tune',
  // Vite builds to dist/ — Capacitor bundles this folder into the native app
  webDir: 'dist',
  // Dark splash to match the app theme
  backgroundColor: '#08080c',
  ios: {
    // Allow the WKWebView to use the microphone
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    // getUserMedia needs the WebView to be allowed to capture audio
    allowMixedContent: false,
  },
};

export default config;
