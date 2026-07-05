# Releasing V-Tune

Every platform — macOS, Windows, Linux, Android **and iOS/TestFlight** — ships
from one git tag. Push `vX.Y.Z` and `.github/workflows/release.yml` does the
rest.

## Release checklist

1. **Write the changelog.** Add a `## [X.Y.Z] — YYYY-MM-DD` section to
   `CHANGELOG.md`. This single section becomes:
   - the GitHub release notes,
   - the desktop in-app updater banner (`latest.json` notes),
   - the TestFlight "What to Test" text.
2. **Bump every version source in one go:**
   ```bash
   npm run bump X.Y.Z
   ```
   This updates all of: `package.json`, `package-lock.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
   `ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION` +
   `CURRENT_PROJECT_VERSION`), `android/app/build.gradle`
   (`versionName` + `versionCode`), and the `landing/index.html` download
   links. Build numbers (iOS/Android) are monotonic counters and get **+1**,
   not the patch number.
3. **Verify** (CI re-runs this against the tag and fails the release on any
   mismatch):
   ```bash
   npm run check:versions X.Y.Z
   ```
4. **Commit, tag, push:**
   ```bash
   git add -A && git commit -m "X.Y.Z"
   git tag vX.Y.Z && git push origin main vX.Y.Z
   ```
5. **Watch the Actions run.** On success:
   - GitHub release is published with installers for macOS/Windows/Linux + APK;
     desktop apps self-update from `latest.json`.
   - The iOS build is uploaded to TestFlight, auto-submitted for **Beta App
     Review**, and queued for the external tester group — testers are notified
     once Apple approves (usually within a day). Nothing to do in App Store
     Connect.

If only the **iOS job** fails (Apple outage, review hiccup), the GitHub release
still publishes — re-run just the `iOS (TestFlight)` job from the Actions UI.
Re-runs are safe: the lane bumps the build number past whatever TestFlight
already has for that version.

## iOS pipeline — how it works

The `ios` job (macOS runner) does: `npm ci && npm run build && npx cap sync
ios`, then `bundle exec fastlane ios beta` ([fastlane/Fastfile](fastlane/Fastfile)):

1. Reads `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` from the pbxproj
   (kept in lockstep by `npm run bump`); build number is raised above the
   latest TestFlight build for that version if needed.
2. Imports the Apple **Distribution** certificate into a temp keychain, fetches
   (or creates) the App Store provisioning profile via the App Store Connect
   API — no profile stored in secrets, so annual profile expiry self-heals.
3. Archives `ios/App/App.xcodeproj` (scheme `App`, `app-store` export).
4. `upload_to_testflight` with `distribute_external: true` +
   `submit_beta_review: true` — upload, beta review submission and external
   group assignment in one step.

## Required GitHub secrets (iOS)

Set under **Settings → Secrets and variables → Actions**:

| Secret | What it is / how to make it |
|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect → **Integrations** → App Store Connect API → Team Keys → **+**. Role: **App Manager**. The Key ID column. |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID shown at the top of the same page. |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | The downloaded `AuthKey_XXXX.p8`, base64-encoded: `base64 -i AuthKey_XXXX.p8 \| pbcopy`. (Downloadable **once** — keep the .p8 somewhere safe.) |
| `IOS_DIST_CERT_P12_BASE64` | Your **Apple Distribution** certificate + private key as .p12, base64-encoded. Export from Keychain Access (My Certificates → "Apple Distribution: Simon Baronti (2875MDJLY2)" → right-click → Export), or create via Xcode → Settings → Accounts → Manage Certificates. Note: this is *not* the Developer ID cert used for macOS notarization. `base64 -i dist.p12 \| pbcopy` |
| `IOS_DIST_CERT_PASSWORD` | The password chosen when exporting the .p12. |

Optional repo **variable** (not secret): `TESTFLIGHT_EXTERNAL_GROUP` — the
external tester group name in App Store Connect if it isn't the default
`External Testers` (must match the TestFlight sidebar exactly).

Everything else (Android keystore, Tauri updater key, macOS Developer ID +
notarization) is unchanged — see the header of
[.github/workflows/release.yml](.github/workflows/release.yml) for the full
secrets list.

## Gotchas

- **TestFlight builds expire after 90 days** — ship at least one release a
  quarter or testers get locked out.
- The very first automated submit needs the app's **Beta App Review
  information** (contact email, etc.) filled in once in App Store Connect →
  TestFlight → Test Information. Already done for V-Tune.
- Distribution certificates expire yearly-ish; when the cert dies, re-export a
  fresh .p12 and update the two `IOS_DIST_CERT_*` secrets. The provisioning
  profile is fetched fresh every run and needs no maintenance.
- The bump script warns (and CI fails) if `CHANGELOG.md` has no section for
  the version being released.
