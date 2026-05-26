import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Pin V-Tune's dev server to its own port so it can't collide with other
  // Vite projects (HypaMaps etc.) running on the default 5173. `strictPort`
  // makes Vite fail loudly if something else is already using it instead
  // of silently rolling forward to 5174 — which would leave Tauri's
  // pre-configured devUrl loading the wrong app.
  server: {
    port: 5183,
    strictPort: true,
  },
  preview: {
    port: 5183,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'V-Tune — Handpan Strobe Tuner',
        short_name: 'V-Tune',
        description: 'Precision strobe tuner for handpans and other multi-modal instruments.',
        theme_color: '#08080c',
        background_color: '#08080c',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache everything the app needs to run offline, including the
        // audio worklet processor served from /public.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/audio-worklet-processor\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-worklet',
            },
          },
        ],
      },
    }),
  ],
});
