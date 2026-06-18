# Changelog

All notable changes to V-Tune are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and V-Tune follows
[semantic versioning](https://semver.org/).

## [1.0.9] — 2026-06-18

### Changed
- **Strobe display redesign for sharper at-a-glance tuning.** The bars now
  blur progressively the further you are from pitch — crisp when locked,
  smearing into a soft wash when way out — with a gentle feather even in
  tune. When a note locks, the black gaps wash **dark green**; as the note
  rings down the gaps brighten toward the bar colour, so the strobe melts
  into a green field before fading back to red.
- **Settings reorganised into labelled sections** — **Input**, **Strobe
  Preferences** and **Accessibility Options**, each under its own heading
  bar. The input-device picker is now full-width, mic sensitivity is
  relabelled **MIC +/−**, and the **Hum filter** now sits under Input
  alongside the mic.

### Removed
- **Always on top** (desktop) toggle — removed.
- **Smooth** and **Readout** sliders — removed from Settings; both now use
  fixed, tuned defaults under the hood.

### Fixed
- **Ayasa Elements – D Kurd 11** now shows the correct top note **D5**
  (it was previously listed as E5).

## [1.0.8] — 2026-06-17

### Added
- **Desktop apps now update themselves.** Windows, macOS and Linux builds
  check for a newer signed release on launch and offer a one-click
  "Install & Restart" — no more redownloading and reinstalling by hand.
  (This release installs the updater; the first auto-update happens when
  the next version ships.)
- **Spectrum Analyser on by default**, with two isolation windows ready to
  go — the first **teal**, the second **purple** — so it's obvious which
  bracket on the spectrum feeds which strobe band. Remove or re-add them
  as before; a re-added window reclaims the freed colour.
- **Speed** now offers **0.5×** (the 10× option was dropped).
- **Collapsible sidebar (desktop)** — collapse the panel to a skinny strip
  to give the strobe more width, via a control beneath the stopwatch.

### Changed
- **Smooth** and **Readout** now default to a calmer **75 %**.
- The **Spectrum Analyser toggle** moved to sit directly under Settings.
- The frequency / note / cents readout now stays visible **while dragging
  an isolation bracket**, so you can line an edge up against a note.

### Fixed
- Removed dead space above the "Let's Go" button in the mobile side panel.

## [1.0.7] — 2026-06-14

### Fixed
- **Mobile: removed dead space above the "Let's Go" button** in the
  slide-out side panel. The drawer was applying the top safe-area inset a
  second time on top of the header, leaving a large empty gap above the
  button on iPhone (and a smaller one on Android).

### Added
- **Android: "update available" banner.** Sideloaded APKs don't get store
  auto-updates, so V-Tune now checks for a newer release on launch and
  shows a dismissible banner with a one-tap link to the download page when
  one exists. (iOS updates via the App Store; the web app auto-updates;
  a built-in auto-installer for the desktop apps is coming next.)

## [1.0.6] — 2026-06-14

### Added
- **Clear feedback when audio can't start.** Pressing "Let's Go" with no
  microphone connected (or with mic access blocked, or the mic in use by
  another app) used to do nothing at all — no error, no hint. V-Tune now
  shows a brief, dismissible message explaining exactly what's wrong and
  what to do, e.g. *"No microphone detected. Connect a microphone, then
  tap Let's Go again."*

## [1.0.5] — 2026-06-14

### Fixed
- **Input device dropdown was empty.** On a fresh launch the Settings →
  Input list showed nothing but "Default" — neither connected USB mics
  nor the built-in microphone appeared. Browsers (and especially the
  macOS desktop webview) only reveal device names once microphone
  permission has been granted, and the app wasn't triggering that. Now,
  when you open the input dropdown, V-Tune requests permission if needed
  and immediately populates the real device list; it also refreshes the
  list automatically once audio starts, and updates live when you plug or
  unplug a device.

## [1.0.4] — 2026-05-30

### Improved
- **Sub-cent tuning precision.** The strobe bands now use phase-rate
  (Goertzel DTFT) measurement as the primary cents source whenever the
  signal is on-target, instead of the FFT-peak position. The FFT peak is
  bin-limited (~1 cent floor at low notes); phase-rate evaluates the
  frequency exactly and reads accurate to a fraction of a cent on steady
  tones. The FFT-peak path is still used when the dominant partial sits
  well off the target note (the multi-modal-instrument case).
- **Isolation-window strobe bands now move identically to the main
  strobe bands.** Previously the dedicated strobe for an isolated
  frequency drifted slowly and barely responded to how sharp or flat the
  note was. It now uses the exact same phase-rate physics as the main
  bands: motion speed scales with the real Hz detuning (faster the
  further out of tune), is frequency-aware, and respects the strobe-speed
  setting identically.

### Added
- **PURE / EQUAL tuning-reference toggle** (in the Tuning / Scale panel).
  - **PURE** (default) references each foundation band against an exact
    integer multiple of the fundamental, so a perfectly-tuned handpan
    reads 0 on every partial — the acoustically correct reference for
    handpan partial tuning.
  - **EQUAL** references each band against the nearest equal-tempered
    note. On a pure handpan the compound-fifth band then reads about
    +2 cents (the real difference between a pure 3:1 fifth and a tempered
    fifth). For players who tune partials to equal temperament.

## [1.0.3] — 2026-05-30

### Added
- **Your settings now persist between sessions.** Reference A4, tolerance,
  strobe speed, brightness, softness, mic gain, FFT size, hum filter,
  chosen scale, the note you were tuning, any isolation windows you drew,
  theme and notation — all remembered when you reopen the app. Transient
  state (audio running, live mic data, the tour) still starts fresh each
  launch.

### Fixed
- **macOS: the "Let's Go" button now works.** The desktop app was missing
  the microphone entitlement required under Apple's hardened runtime, so
  it silently failed to request mic access. The strobe now responds to
  audio on macOS.

### Other
- Added a proprietary source-available license and a proper project
  README (replacing the default Vite template).

## [1.0.2] — 2026-05-28

### Fixed
- **Mobile: Quick-Pitch bar no longer overflows the right edge** of the
  screen (the corner of the "Let's Go" button was being clipped on
  iPhone).
- **Spectrum Analyser: the threshold/gate line is now draggable by touch**,
  not just with a mouse.
- **macOS / Windows / Linux desktop builds no longer load to a black
  screen** (the bundled service worker was breaking the desktop webview).

### Changed
- **Tuning / Scale controls relaid out**: AUTO is full-width on its own
  row, with Reference A4 and Tolerance as two equal columns beneath it.
- User-guide PDF redesigned — new cover, cleaner page flow.

## [1.0.1] — 2026-05-27

### Added
- First public release of V-Tune across **iOS, Android, macOS, Windows,
  Linux and the web**.
- **Three-band strobe display** — fundamental, octave and 12th rendered
  as independent strobe bands.
- **Per-band pitch pipe** — a continuous reference tone or a beep that
  fires on each strike, for any band.
- **Live mic-detected note** lights up on the pitch wheel in real time.
- **Pre-saved handpan scales** (Kurd, Amara, Celtic and more) with the
  ding highlighted.
- **Spectrum analyser with shift-drag isolation windows** that become
  dedicated tuning bands.
- **Mains-hum notch filter** (50 / 60 Hz).
- Light and dark themes; sharp / flat / solfège / German notation.
- Fully offline — no accounts, no analytics, no network requests.

[1.0.8]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.8
[1.0.7]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.7
[1.0.6]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.6
[1.0.5]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.5
[1.0.4]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.4
[1.0.3]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.3
[1.0.2]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.2
[1.0.1]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.1
