# V-Tune build & release blueprint

One codebase → one commit → five surfaces:

```
  src/  (React + TypeScript + Vite)
   │
   ├─► PWA (dist/)                ─► Vercel auto-deploy on push
   │
   ├─► Tauri (src-tauri/)         ─► GitHub Actions builds:
   │                                  • macOS (.dmg, both Apple-Si & Intel)
   │                                  • Windows (.msi + portable .exe)
   │                                  • Linux (.deb + .AppImage)
   │
   ├─► Capacitor iOS (ios/)       ─► Xcode → TestFlight → App Store
   │
   └─► Capacitor Android (android/) ─► Gradle → signed .apk (host directly)
                                        or .aab → Play Store
```

---

## Release cadence — the simple version

You only push a tag when you want a new official release for users to download.
Day-to-day commits to `main` just push the PWA (Vercel auto-deploys) and run
the desktop CI as a smoke test.

### Routine code change (UI tweak, bug fix)
```bash
# edit code
git commit -am "tweak strobe blur fade"
git push                              # Vercel redeploys PWA in ~1 min
```
Nothing else to do. Users on the PWA / installed PWA get it automatically.

### Cutting a new release for downloadable apps
```bash
# 1. Bump version everywhere
npm version 0.2.0                     # bumps package.json + creates a git tag
# Also bump src-tauri/tauri.conf.json "version" to match.
# (Capacitor iOS/Android: bump in Xcode / build.gradle when you next archive.)

# 2. Push the tag — this kicks off the desktop build matrix
git push --follow-tags
```

That tag push triggers `.github/workflows/build-desktop.yml`, which:
1. Builds the web bundle.
2. Builds the Tauri desktop binary for **Windows, macOS (Intel + Apple Silicon), and Linux** in parallel.
3. Creates a **draft GitHub Release** named `V-Tune v0.2.0` with all four installers attached.

You go to GitHub → Releases → review the draft → **Publish**.
Then on your download page, link the latest release's `.msi`, `.dmg`, `.AppImage`.

### Mobile (iOS + Android) — same tag, separate manual upload
Because Apple and Google require interactive uploads (signing certs, store
metadata, screenshots), mobile isn't fully automated yet. After tagging:

```bash
# iOS — open Xcode, archive, upload to TestFlight
npm run cap:ios

# Android — build signed APK, replace the file on your download page
npm run apk:release
```

(Both can be CI-automated later with Fastlane / `gradle-play-publisher` if it
becomes painful — see TODO below.)

---

## What runs locally vs. on CI

| Action | You run locally | CI runs |
|---|---|---|
| Edit code, test in browser | `npm run dev` | — |
| Build PWA | `npm run build` | Vercel on every push |
| Build desktop installers | `npm run tauri:build` (your platform only) | All 3 desktops on tag push |
| Build iOS | `npm run cap:ios` → Xcode | — (manual upload needed) |
| Build Android APK | `npm run apk:release` | — (could be automated later) |

You only ever need to build the desktop **locally** if you want to test before
tagging. Day-to-day, the CI does it for you.

---

## First-time setup checklist (one-off)

You've already got most of this. The remaining items:

- [ ] **Install Rust** on your Mac (only needed if you want to test the Tauri
      desktop build locally — CI doesn't need it):
      `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [ ] **Push the repo to GitHub** if you haven't (CI needs to live there).
- [ ] **Enable GitHub Actions** for the repo (usually on by default).
- [ ] **(Optional but recommended) Windows code-signing cert** — without it,
      Windows SmartScreen warns "Unknown publisher" on the `.exe`. Certs are
      ~£50–200/year from DigiCert/Sectigo. Skip for v0; add later.
- [ ] **(Optional) macOS notarisation** — same idea, removes the
      "unidentified developer" warning. Needs your Apple Developer account
      (which you're enrolling for anyway). Can be wired into the CI workflow
      with Tauri's `signingIdentity` + Apple notary credentials as secrets.

---

## TODO — next focused chunks

In rough priority order. Tick off as we go.

### High priority
- [ ] **Interactive onboarding tour** — first-launch overlay that walks users
      through: header / theme toggle / TUNING & SCALE (pick a note) / BANDS
      explanation / SETTINGS / STOPWATCH / Let's Go button. Make each step
      require an actual interaction to advance (tap this button, tap that
      note, etc.) so they learn by doing. Store an `onboardingDone` flag in
      localStorage. Add a "show tour again" button in Settings.

### Medium priority
- [ ] **In-app version badge** — show `v0.2.0` somewhere unobtrusive (e.g.
      bottom of Settings) so beta testers can tell us what build they're on.
- [ ] **Auto-update for Tauri** — desktop installers can self-update.
      `tauri-plugin-updater` + signed update manifest served from the same
      place as the installers.
- [ ] **macOS notarisation** wired into the CI workflow so Mac users don't
      see Gatekeeper warnings.
- [ ] **Windows code-signing** in CI (needs a paid cert).

### Lower priority
- [ ] **iOS / Android CI automation** with Fastlane / `gradle-play-publisher`
      so a tag pushes everywhere.
- [ ] **Microsoft Store presence** via PWABuilder → `.msixbundle`.
- [ ] **F-Droid release** for Android (open-source store, no Google account).
- [ ] **Localisation scaffolding** (i18n) — even if only English at launch.
- [ ] **Crash reporting** (Sentry or similar) — useful as soon as users are
      finding bugs in the wild.

---

## File layout cheat-sheet

```
.
├── src/                       React app (the only place day-to-day work happens)
├── public/                    Static assets shipped with the web bundle
│   └── audio-worklet-processor.js   Cached by the service worker too
├── dist/                      Built web bundle (gitignored — both Tauri & Capacitor read this)
├── src-tauri/                 Tauri desktop wrapper
│   ├── tauri.conf.json
│   ├── Info.plist             macOS mic-permission key lives here
│   └── icons/
├── ios/                       Capacitor iOS Xcode project
├── android/                   Capacitor Android Gradle project (created on first `cap add android`)
├── .github/workflows/
│   └── build-desktop.yml      The cross-platform desktop CI
├── NATIVE.md                  iOS/Android setup + distribution notes
├── DEPLOY.md                  Vercel / PWA deploy notes
└── BLUEPRINT.md               This file
```
