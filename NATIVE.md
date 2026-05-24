# Native app (iOS / Android) via Capacitor

Capacitor wraps the existing web build (`dist/`) in a native shell so V-Tune can
be submitted to the App Store and Google Play. You write zero new app code — the
same React app runs inside a native WebView.

## One-time setup

Requirements:
- **iOS**: a Mac with Xcode + CocoaPods (`sudo gem install cocoapods`).
- **Android**: Android Studio.

Add the native platforms (creates `ios/` and `android/` folders):

```bash
npm run build          # produce dist/
npx cap add ios
npx cap add android
```

### Microphone permission (required — the tuner won't work without it)

**iOS** — edit `ios/App/App/Info.plist`, add:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>V-Tune uses the microphone to listen to your instrument and show its pitch.</string>
```

**Android** — edit `android/app/src/main/AndroidManifest.xml`, add inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

Android also needs the WebView to auto-grant the mic to the page. In
`android/app/src/main/java/.../MainActivity.java` this is handled by Capacitor's
default bridge, but if mic prompts don't appear, add the `@capacitor/microphone`
plugin or a small `onPermissionRequest` override (documented in Capacitor's
Android permissions guide).

### App icon / splash

Drop a 1024×1024 PNG and run the official asset generator:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate
```

(or set icons manually in Xcode / Android Studio).

## Build & run

```bash
npm run cap:ios        # build web, sync, open Xcode
npm run cap:android    # build web, sync, open Android Studio
```

In Xcode: pick a device/simulator → Run. To ship: Product → Archive → distribute
to App Store Connect.

In Android Studio: Run on a device, or Build → Generate Signed Bundle/APK → upload
the `.aab` to the Play Console.

## Costs / accounts

- Apple Developer Program — **$99/year**.
- Google Play Developer — **$25 one-time**.

---

# Easiest distribution (no full store review)

## Android — direct `.apk` download (free, no account, no review)

After `npx cap add android` and the mic-permission edits:

**Quick test build (unsigned debug — fine for sharing with friends):**
```bash
npm run apk:debug
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

**Proper release build (signed — recommended for public download):**
1. Generate a signing key once:
   ```bash
   keytool -genkey -v -keystore vtune.keystore -alias vtune \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Tell Gradle about it — in `android/app/build.gradle` add inside `android { }`:
   ```gradle
   signingConfigs {
     release {
       storeFile file('/absolute/path/to/vtune.keystore')
       storePassword 'YOUR_STORE_PASSWORD'
       keyAlias 'vtune'
       keyPassword 'YOUR_KEY_PASSWORD'
     }
   }
   buildTypes {
     release { signingConfig signingConfigs.release }
   }
   ```
   (Keep the keystore + passwords safe — you need the *same* key to ship future updates.)
3. Build:
   ```bash
   npm run apk:release
   # output: android/app/build/outputs/apk/release/app-release.apk
   ```
4. Host the `.apk` anywhere (your site, Vercel `public/`, Google Drive, GitHub release).
   Users tap it, allow "install from unknown sources", done.

> Note: direct-APK users won't get auto-updates. To update, build a new APK (bump
> `versionCode` in `build.gradle`), replace the download, tell them to reinstall.
> Capacitor live-updates (Capgo) can push JS/CSS changes over-the-air to dodge this.

## iOS — TestFlight (needs the $99 Apple account, but minimal/no review)

There's no free way to put it on *other people's* iPhones — Apple requires the
Developer Program. But TestFlight avoids full App Store review:

1. `npm run cap:ios` → Xcode opens.
2. Select your Team under Signing & Capabilities, set a version + build number.
3. **Product → Archive**.
4. **Distribute App → App Store Connect → Upload**.
5. In App Store Connect → your app → **TestFlight** tab:
   - **Internal testers** (up to 100, people on your team): install **immediately, no review**.
   - **External testers** (up to 10,000, via a public link): one quick **beta review**
     (usually a day), then anyone with the link installs through the TestFlight app.
6. Testers install Apple's **TestFlight** app, then your build.

> Note: TestFlight builds **expire after 90 days** — it's meant for beta testing, so
> you re-upload periodically. For permanent iOS distribution you'd eventually do the
> full App Store submission (same Archive/Upload, plus the review).

---

## Updating after release — this is the key part

There are **two kinds of update**, and most of yours will be the easy kind.

### 1. JS / CSS / UI changes (≈ 95% of your changes)

Anything that lives in the web bundle — strobe tweaks, new sliders, layout, colours,
bug fixes — is just:

```bash
# make your code change, then:
npm run cap:sync       # rebuild dist/ and copy it into both native projects
```

Then re-archive in Xcode / re-build the bundle in Android Studio and upload the new
version to each store. **No native code touched.** The review process applies
(Apple: usually 1–2 days; Google: hours to a day).

So the loop is: *edit code → `cap:sync` → bump version → upload → wait for review.*

#### Skip-the-review option (live updates)

Because the app is just web content, you can use **Capacitor "live updates"**
(Capgo, or Ionic Appflow) to push JS/CSS changes **over-the-air without a store
resubmission** — users get the update next time they open the app, like a website.
Native store submission is then only needed when you change native bits (below).
This is optional and adds a small service, but it makes UI iteration instant.

### 2. Native changes (rare)

You only go through the full native rebuild + longer setup when you:
- bump the Capacitor version,
- add a native plugin,
- change permissions, app icon, name, or splash,
- change the minimum OS version.

These need Xcode/Android Studio open and a version bump, but they're infrequent.

### Version bumping

Each store upload needs a higher version number:
- **iOS**: bump `MARKETING_VERSION` / build number in Xcode (or `Info.plist`).
- **Android**: bump `versionCode` (must increase) and `versionName` in
  `android/app/build.gradle`.

---

## TL;DR on updates

- **UI / logic tweak** → `npm run cap:sync`, bump version, re-upload. Simple.
- **Want instant updates with no review** → add Capacitor live updates (Capgo/Appflow).
- **Native change (plugin/permission/icon)** → rebuild in Xcode/Studio, bump, upload.
