# Deploying V-Tune to Vercel

The app is now a PWA (installable, offline-capable). Below is the fastest way
to get it live on a public URL with HTTPS — which is **required** because the
mic API (`getUserMedia`) refuses to run on plain HTTP.

---

## Option A — CLI deploy (fastest, ~3 minutes)

From the project root:

```bash
npm i -g vercel
vercel login
vercel
```

Vercel will:

1. Ask you to link the project (accept the defaults — it auto-detects Vite).
2. Build it and push the `dist/` folder to a global CDN.
3. Print a URL like `https://v-tune-abc123.vercel.app`.

To promote that to your "production" URL (without the random hash):

```bash
vercel --prod
```

You'll get the canonical `https://v-tune-<account>.vercel.app`.

---

## Option B — GitHub connected (auto-deploy on every push)

1. Push the repo to GitHub (`git push origin main` etc.).
2. Go to <https://vercel.com/new>.
3. **Import** your GitHub repo.
4. Framework preset: **Vite** (auto-detected).
5. Build command: `npm run build` (default).
6. Output directory: `dist` (default).
7. Hit **Deploy**.

From now on every push to `main` redeploys automatically. PR branches get their
own preview URLs.

---

## Custom domain

After the first deploy, in the Vercel dashboard:

1. Project → Settings → **Domains**.
2. Add the domain you own (e.g. `v-tune.app`).
3. Follow the DNS instructions Vercel shows (usually one `A` record or a `CNAME`).

Vercel issues a Let's Encrypt certificate automatically — HTTPS in < 30 s.

---

## Installing it as a real app

Once the URL is live, anyone who opens it can install the PWA:

- **iOS Safari** — Share button → *Add to Home Screen*. The icon appears on
  the home screen and the app runs fullscreen (no browser chrome) with the
  V-Tune name underneath.
- **Android Chrome** — an *Install app* prompt pops up automatically. Tap it,
  or use the three-dot menu → *Install app*.
- **Desktop Chrome / Edge** — install icon in the address bar (a small "+"
  inside a circle on the right of the URL field), or three-dot menu →
  *Install V-Tune*. Runs in its own window with no tabs.

After install, the service worker caches the bundle so the app launches
instantly and works offline (mic input still requires permission of course).

---

## Replacing the icon

The placeholder is at `public/icon.svg`. To swap it for your own design:

1. Replace `public/icon.svg` with your artwork. Keep the viewBox `0 0 512 512`
   and design the important content within the inner ~80% so it isn't clipped
   by Android's circular mask.
2. Regenerate the PNG variants:
   ```bash
   npm run generate-pwa-assets
   ```
3. Rebuild and deploy (`vercel --prod`).

---

## Notes specific to this app

- **Audio worklet caching**: the worklet at `/audio-worklet-processor.js` is
  explicitly cached by the service worker so the tuner works offline.
- **HTTPS required**: without it, the browser silently refuses `getUserMedia`
  and the START button will throw. Localhost and Vercel domains are both fine.
- **iOS specifics**: iOS Safari's PWA support is decent. The strobe and FFT
  both run inside a `AudioWorkletNode` which iOS 14.5+ supports.
