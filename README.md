# V-Tune

A precision strobe tuner built for **handpans** and other multi-modal
instruments — drums, gongs, bells, anything where a single strike
excites several pitches at once. Most chromatic tuners give up on
these instruments because they're built around one fundamental.
V-Tune is built around three.

**[v-tune-handpan.vercel.app](https://v-tune-handpan.vercel.app)** · 
[Download](https://github.com/simonbaronti/V-Tune/releases/latest) · 
[User Guide (PDF)](docs/V-Tune-User-Guide.pdf)

---

## Download

Free on every platform:

| Platform | How |
|---|---|
| **iOS** | [TestFlight beta](https://testflight.apple.com/join/b6pCcWQ7) (App Store release pending) |
| **Android** | [Direct .apk download](https://github.com/simonbaronti/V-Tune/releases/latest) (sideload) |
| **macOS** | [Universal .dmg](https://github.com/simonbaronti/V-Tune/releases/latest) — Intel + Apple Silicon, signed + notarized |
| **Windows** | [.exe / .msi installer](https://github.com/simonbaronti/V-Tune/releases/latest) |
| **Linux** | [.deb / .AppImage](https://github.com/simonbaronti/V-Tune/releases/latest) |

## What it does

- **Three-band strobe display** — fundamental, octave, and 12th
  rendered as independent strobe bands. Bars move when you drift,
  freeze when you're locked.
- **Per-band pitch pipe** — continuous reference tone or beep-on-strike
  mode for each band.
- **Live mic-detected note** — the note you're playing lights up on
  the pitch wheel in real time.
- **Pre-saved handpan scales** — Kurd, Amara, Celtic and more, with
  the ding highlighted.
- **Spectrum analyser + isolation windows** — bracket any peak in the
  spectrum and turn it into its own tuning band.
- **FFT peak detection + phase-rate Goertzel analysis** — the FFT
  finds the loud frequencies, the Goertzel measures how stable each
  one is, frame to frame.
- **Fully offline.** No accounts, no analytics, no network requests.
  Your microphone audio is processed on-device and never stored or
  transmitted. ([Privacy policy](https://v-tune-handpan.vercel.app/privacy).)

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 + Zustand |
| Audio | Web Audio API + AudioWorklet + pitchfinder (YIN) |
| iOS / Android | Capacitor 8 |
| macOS / Windows / Linux | Tauri 2 |
| Web / PWA | vite-plugin-pwa (mobile + browser only — Tauri builds skip it) |

The full app is one Vite codebase. Each platform target wraps the
same compiled bundle in its native shell.

## Source-available, not open-source

V-Tune is **source-available** — the code is public so you can read,
study, file issues, and propose improvements. It is **not** licensed
for redistribution, rebranding, or derivative apps. See
[LICENSE](./LICENSE) for the full terms in plain English. If you'd
like to use V-Tune in a way the licence doesn't permit, open an issue
or get in touch.

## Running locally (for contributors)

```bash
git clone https://github.com/simonbaronti/V-Tune.git
cd V-Tune
npm install
npm run dev        # Web / PWA dev server on http://localhost:5183
```

For the native shells:

```bash
npm run tauri:dev  # macOS / Windows / Linux desktop, hot-reload
npm run cap:ios    # iOS, opens in Xcode
npm run cap:android # Android, opens in Android Studio
```

Production builds:

```bash
npm run build           # web bundle → dist/
npm run tauri:build     # Tauri desktop (current host's platform)
npm run tauri:build:mac # macOS universal (Intel + Apple Silicon), signed + notarized — requires src-tauri/.env.notarize (not committed)
```

CI/CD ships a tagged release on every `git tag v*.*.* && git push`,
building Android + Windows + Linux + publishing a GitHub Release with
the user-guide PDF attached. See
[`.github/workflows/release.yml`](./.github/workflows/release.yml).

## Bug reports / feature requests

[Open an issue.](https://github.com/simonbaronti/V-Tune/issues) Real
bug reports from people tuning real instruments are the most valuable
thing you can contribute.

---

V-Tune © 2026 Simon Baronti. All rights reserved.
