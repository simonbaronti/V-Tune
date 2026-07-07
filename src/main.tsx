import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Service worker: keep the PWA offline cache for the web build, but never
// run it inside the native (Capacitor) WebView. There a precaching worker
// serves the app shell cache-first and shadows native app updates — the
// app reports the new version while the WebView keeps serving the old UI.
// On native we also proactively tear down any worker/caches left behind by
// earlier PWA-enabled builds so an updated install heals itself.
if (Capacitor.isNativePlatform()) {
  navigator.serviceWorker?.getRegistrations?.().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
  window.caches?.keys?.().then((keys) => {
    keys.forEach((key) => window.caches.delete(key));
  });
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
