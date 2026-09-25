# Changelog

All notable changes to V-Tune are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and V-Tune follows
[semantic versioning](https://semver.org/).

## [1.3.2] — 2026-09-26

### Changed
- **The strobe bars now blur when the pitch is unsteady, not when it's far
  out of tune.** A strobe band says three things at once: how strong the
  partial is, how far off it is and which way, and how much the pitch is
  moving about while you watch it. V-Tune had the first two and spent blur
  on a fourth — distance from the target — which the movement already tells
  you, so the bars washed out exactly when they most needed reading. It had
  the diagnosis backwards both ways, too: a note well flat but rock-steady,
  which is a clean hammer adjustment, smeared into a wash; a note sitting on
  pitch but warbling, which usually means partials beating against each
  other, looked perfectly healthy. A steady note now stays crisp however
  flat it is, and a warble goes soft — which is the warning it should be.
  BLUR still sets the ceiling, and 0 still keeps everything sharp.
- **A Spanish user guide.** Attached to this release alongside the English
  one, and linked from the site.

### Fixed
- **Peaks are located about ten times more accurately.** The analyser fitted
  its interpolating curve to raw magnitudes, but a window's shape is a bell
  in decibels, not in amplitude — which pulled every estimate the same way,
  a bias that never averaged out. Measured against a synthetic sweep, the
  worst case at D3 falls from 4.7 cents to 0.44. That matters when the
  default tolerance is 5. Only affects readings where a partial sits well
  away from its target; anything within 25 cents was already sub-cent.
- **A refund that had only been *asked for* no longer removes the unlock.**
  Refunds on the website are created pending Paddle's approval, which takes
  days and which they can refuse — and the unlock was being taken away at
  the moment of the request. It now waits for the money to actually move, a
  rejected request costs nobody anything, and a dispute resolved in your
  favour hands the unlock back. Partial refunds keep it: somebody given ten
  pounds back still bought the app.
- **The guide had been out of date on the website for two releases** —
  vtune-app.com was serving the 1.2.1 edition, with nothing about the
  waterfall. Both copies are now written by the same build.

## [1.3.1] — 2026-09-20

### Changed
- **The strobe Speed control is now a multiple of a conventional strobe.**
  A mechanical strobe drifts its pattern one full turn per second for every
  hertz a note is out — speed is the size of the error, direction is its
  sign, and holding still is what in tune looks like. That is what every
  strobe tuner means by the number. V-Tune's meant nothing in particular:
  the old settings worked out at roughly a third of a real strobe, so the
  fastest one read about normal and the obvious request was for something
  faster. The presets are now 0.5x, 1x, 2x, 5x and 10x, with 1x the real
  thing — which also puts the top of the range where other tuners put
  theirs. **Expect the strobe to be livelier after this update**; a Speed
  you had chosen is carried over to its closest equivalent.
- **The user guide covers 1.3.0.** The waterfall and its BRIGHT, TAIL and
  SOFT controls, the keyboard, the resize handle, and the analyser's real
  60 Hz – 4.3 kHz range. It is attached to the release again, as is the
  Android APK — 1.3.0 went out without either, because the job that
  attaches them was chained behind an Android build that a change at
  Google's end had broken.

### Fixed
- **The strobe ran at the speed of your screen.** Drift was added once per
  animation frame with no reference to elapsed time, so the same note on the
  same instrument, equally out of tune, drifted twice as fast on a 120 Hz
  ProMotion iPhone as on a 60 Hz phone — and neither matched what the number
  on the button claimed. It is measured against real elapsed time now, so
  every device reads alike. The isolation bands kept their own copy of the
  same formula and had the same fault; both now work from one definition.
- **The onboarding tour pointed at parts of the screen you couldn't see.**
  A closed drawer keeps its contents fully measurable — the desktop menu
  animates to no width while everything inside it spills off the right-hand
  edge, and the mobile picker slides below the fold — so the tour picked
  those targets happily and the spotlight collapsed into a sliver against
  the edge of the screen, or inverted. Eleven of its nineteen steps point at
  something inside one of those two containers. The tour now opens the menu
  when a step needs it and always picks whichever copy of a control is
  actually on screen.
- **The tour could strand you.** A step that couldn't find its target drew a
  dimmed screen with no card on it at all — no title, no Next, no Skip — and
  Esc was the only way out, which on a phone is no way out. The card now
  appears anyway, with a Next. Separately, the Input step only moved on when
  the microphone selection changed, so anyone who declined the microphone
  prompt had nothing to pick and nowhere to go; it has a Next too.

## [1.3.0] — 2026-09-16

### Added
- **A waterfall view in the Spectrum Analyser.** Ten seconds of the spectrum
  as a heatmap, on the same frequency axis as the curve and behind it, with
  colour standing in for power — so you can see how long each partial
  actually sustains after the strike, not just how loud it is right now.
  Asked for by a handpan maker who reads the same thing off a desktop
  spectrogram alongside V-Tune.
- **Isolation windows carry through to the waterfall** as lanes, so you can
  bracket one partial and watch that one decay while the strobe reads it.
- **BRIGHT** and **TAIL** set the two ends of the colour ramp. BRIGHT is the
  saturation point — everything above it paints the hot end — so lowering it
  brings more of the signal into the top of the ramp. TAIL is how quiet a
  partial may get before it goes black. Between them they're the same pair of
  controls a desktop spectrogram calls brightness and dynamic range, which is
  what makes the colours usable on a quiet instrument rather than leaving the
  whole image in the blues. **SOFT** blurs the heatmap across frequency,
  never across time, since blurring time would smear the decay.
  Both re-render the ten seconds already on screen, so you can find the right
  setting against a strike that has already happened.
- **A piano keyboard under the analyser.** Drawn against the frequency axis
  rather than as evenly-spaced keys, so every key sits beneath the partials
  it names and the whole thing stretches and slides with the zoom. The keys
  your strobe bands are targeting are tinted, so you can see at a glance
  which note each one is on. Note names appear as the width allows — every
  white key when there's room, thinning to the octave Cs when zoomed out.
- **The analyser's range is now 60 Hz – 4.3 kHz**, down from 20 Hz – 5 kHz.
  Still comfortably wider than any handpan's fundamental-to-upper-partial
  span, and narrow enough that the keyboard's keys are readable rather than
  a 7px smear.
- **The analyser can be resized.** Drag the handle at its top edge. One
  height, kept whether the waterfall is on or off — turning it on doesn't
  resize the panel under you. The strobe keeps a guaranteed share, and the
  band labels scale with it.
- **A phone held sideways is asked to turn back.** V-Tune stacks three strobe
  bands, the analyser and the picker, and a phone in landscape hasn't the
  height for it. Phones only: a tablet's wide layout switches on at 1024px,
  so landscape is a tablet's better orientation, not its worse one.

### Fixed
- **A purchase made on the website now unlocks the app by itself.** Buying
  through vtune-app.com goes via Paddle, which RevenueCat never heard about —
  so the unlock had to be granted by hand, and until it was, someone who had
  paid quietly ran down the rest of their trial. Found it on the first paying
  customer. Refunds and chargebacks take the unlock back the same way.
- **The sharp keys are readable in light mode again.** A piano black key is
  drawn dark whichever theme you're in, but its label was taking a theme
  colour — so in light mode it was near-black text on a near-black key.

## [1.2.2] — 2026-09-13

### Added
- **The mobile note picker now slides over the tuner instead of squashing
  it.** Opening it used to compress the strobe, forcing the canvas to resize
  and re-initialise mid-tune; it now floats above on a translucent panel
  that follows the light or dark theme, and the display below stays exactly
  where it was. The tuner behind it blurs and dims while the picker is up,
  and tapping anywhere outside closes it.
- **The tuning target is now shown in hertz, and can be typed.** A field
  under the note picker takes a frequency directly — 659.34, or 123.456 —
  instead of picking a note, in either chromatic or scale mode. The octave
  and compound fifth track it as exact multiples, so you can follow an
  instrument's overtones against a base that isn't on the equal-tempered
  grid. Decimals are kept as typed rather than rounded to the nearest tenth
  of a cent.
- **The strobe bands show when the target is off the note.** Each band's
  target frequency sits on the same purple chip as the CUSTOM field — shown
  to the precision that was typed rather than rounded to a tenth of a hertz
  — so it's obvious at a glance that you're tuning to a modified target
  rather than the standard one for that note — and the band is where you're
  looking while tuning, not the control that set it.

### Changed
- **FINE has been folded into a new CUSTOM band.** The two controls were
  always one thing wearing two faces — both set the same cents offset, both
  turned purple when it wasn't zero — but they lived in different panels,
  and on a phone FINE was buried in Settings where it couldn't be reached
  while tuning. There is now a single target, in hertz, in its own tinted
  **CUSTOM** band below the note grid — a target set there overrides what
  the grid says, so it reads as an override rather than as one more field —
  with − and + either side that nudge half a cent per press. Type when you
  know the number, nudge when you're creeping up on it. The field sits in
  placeholder grey while it's showing the selected note's standard pitch and
  turns purple the moment you start typing, so a target you set never looks
  like one the app chose. Hertz is also the
  unit that's actually printed on a maker's spec sheet, where cents are
  jargon.

- **The mobile picker runs 20% larger.** Everything in the slide-up — text,
  buttons, spacing alike — is scaled up together, so the panel now fills
  about three fifths of the screen rather than a little over a third, and
  the note buttons are a comfortable thumb target. The scale dropdown now
  matches the note buttons below it too — it had been set a size smaller
  than any single note in the grid it decides the meaning of. It still
  scrolls internally on a short screen, so a phone in landscape can reach
  all of it.

### Fixed
- **The microphone no longer dies after switching apps.** Leaving V-Tune for
  anything that plays sound — a video in a social feed, a call, an alarm —
  interrupted the audio session, and nothing put it back together on return:
  the strobe sat still and nothing was detected, while the app still showed
  itself as running. The only way out was to force-quit. The session is now
  reactivated when iOS hands it back, and the capture graph is checked and
  rebuilt if it didn't survive.
- **Typing a target no longer zooms the app and strands it there.** iOS
  magnifies the whole page when you focus an input whose font-size is under
  16px, and doesn't reliably undo it — the app was left at 1.3x with no way
  back. Both text fields are now at the threshold; the email box on the
  purchase screen had the same flaw.
- **The pitch pipe no longer gets stuck in the earpiece.** Re-asserting the
  speaker on a route change could read the route before it had settled,
  decide nothing needed fixing, and return a moment before the route landed
  on the receiver — leaving the tone in the earpiece until you toggled Stop
  and Let's Go. The route is now re-checked once it has settled, and the
  speaker preference is restored whenever the app returns to the foreground.

## [1.2.1] — 2026-09-11

### Added
- **Gu port notes are now tappable.** On scales that list them, the amber
  Gu port chip under the note grid puts both Spectrum Analyser isolation
  windows ±35 cents around the port notes and zooms the analyser to frame
  them, so the two strobe bands read nothing but the Gu port. Each note
  takes the colour of the band reading it. Tap again to release.
- **The running version is shown in Settings**, under a new About heading,
  along with which platform you're on.
- Signed-in accounts now attach their **email address to the RevenueCat
  customer record**, so support and entitlement grants can find a person by
  their address instead of translating it through a database of UUIDs.
- **A volume control for the pitch pipe**, under a new **Sound** section in
  Settings. Dragging it is audible straight away, on a tone that's already
  sounding.
- **A FINE control** beside A4 and Tolerance, for sitting the target a
  fraction off the note in cents — for an instrument that isn't on the
  12-TET grid. It shifts the fundamental, octave and compound fifth
  together, in both PURE and EQUAL, and shows in purple whenever it isn't
  zero. Tap the value to clear it.

### Changed
- **The pitch pipe is louder by default** — it shipped at a level faint
  enough that the first question anyone asked on launch day was how to turn
  it up. The beep still sits a little under the sustained tone, since a
  repeating beep at full level wears thin over a session.
- Consistent naming for the Spectrum Analyser's two parts throughout the app,
  guide and changelog: an **isolation window** is the coloured bracket you
  place on the spectrum, an **isolation band** is the strobe it drives. They
  had also been called brackets and isolation strobes.

### Fixed
- **The cents nudge did nothing at all.** The keyboard map advertised
  <kbd>←</kbd> / <kbd>→</kbd> to nudge the target in cents and <kbd>0</kbd>
  to reset — but the offset was written to memory and read by nothing, so
  the strobe bands never moved. It now shifts every partial coherently, is
  clamped to ±100 cents, survives a restart, and is visible in the new FINE
  control so it can't be left on by accident.
- **Being offline could show the paywall to someone who had already paid.**
  When the licence server couldn't be reached, V-Tune fell back to the trial
  clock — but anyone who has bought is by definition past their trial, so
  "no connection" and "never paid" looked identical and the app locked. It
  now remembers the last answer for 30 days, so a workshop with no wifi, a
  festival or a plane changes nothing. A refund still takes effect on the
  next check with a connection.
- **macOS: the app installed on versions it can't run on.** The bundle
  claimed macOS 10.15 as its minimum, but the interface needs Safari 16.4's
  CSS — first available on macOS 11 Big Sur. On Catalina the app installed
  happily and opened a black window, with nothing to explain why. The
  minimum is now 11.0, so macOS declines the install with a reason instead.
  The download page says so too, and points older Macs at the web app.
- **iOS: the pitch pipe played through the earpiece instead of the speaker.**
  Opening the microphone puts iOS into its record-and-play audio mode, which
  routes playback to the receiver — so the reference tone was barely audible
  while the tuner was running, and noticeably louder the moment you stopped
  it. V-Tune now asks for the speaker, and re-asserts it whenever the route
  changes. Headphones, AirPods and car audio are left alone.
- `npm run bump` rewrote the version string everywhere it appeared in the
  landing page, including inside SVG path data — a coordinate run reads
  "1.2.0" verbatim, so bumping mangled an icon. It now only touches the
  release download links, and `check-versions` verifies those links rather
  than searching the whole file for the version (which had been passing on
  that same coincidence while the links pointed at v1.1.5).

## [1.2.0] — 2026-08-24

### Added
- **V-Tune Pro.** V-Tune is now a paid app: every install includes a
  **14-day free trial of the complete app** (no card, no sign-up), after
  which a single **£49.99 one-time purchase** unlocks it forever — no
  subscription. Buy on [vtune-app.com](https://vtune-app.com), or directly
  inside the iOS app; **one purchase covers all your devices**.
- **V-Tune accounts.** Sign in with your email (a link, or a 6-digit code
  from the sign-in email) and your unlock follows you to every platform.
- A trial countdown and an unlock screen with sign-in / restore built in.

### Changed
- The onboarding tour no longer runs while the app is locked.

## [1.1.5] — 2026-08-22

### Added
- **Two more Ayasa Elements scales** — **D Kurd 15** and **E Amara 15**, each
  with their bottom notes marked in pitch order.
- **Gu port note references.** Scales whose instruments are sometimes tuned
  with Gu port notes now show them as an amber text note beneath the scale —
  D Kurd 13/15 (E5 · A5) and E Amara 13/15 (D6 · Bb5).

### Changed
- **New V-Tune brand.** A redesigned app icon and wordmark roll out across
  the app header, splash screens, home-screen icons and the website.

## [1.1.4] — 2026-07-08

### Added
- **Keyboard map (desktop).** A new **MAP** button in the note picker opens a
  visual guide to V-Tune's piano-style keyboard shortcuts — pick notes,
  octaves, cents and the reference pitch straight from the keyboard.
- **Space slides the controls menu in and out** on desktop, so you can jump
  to the next note without reaching for the menu button. (Start/stop the
  tuner moved to **Enter**.)

### Fixed
- **Android: the microphone now works.** The app was missing the record-audio
  permission, so input wasn't detected on any Android device. It now requests
  microphone access on launch.

## [1.1.3] — 2026-07-08

### Added
- **Sixteen more handpan scales** across the Ayasa range — B2 Aavartan 17,
  B3 Pygmy 20, C Ashakiran 17, D Kurd 12 / 13 / 14 / 19, D Ashakiran 19,
  D Aegean 18 / 20, E Amara 20, F Equinox 17, F#2 Nordlys 16, F# Low Pygmy
  12 / 21, and F# Kurd 20 / 22.

### Changed
- **Bottom notes** now appear in their true pitch position within a scale and
  are marked with a **teal outline** to set them apart from the ding.
- The three original **(Ayasa Elements)** scales now sit at the top of the
  scale list, with the rest below.

### Fixed
- **Spectrum Analyser isolation bands now read frequency with the same
  sub-cent precision as the main strobe.** They previously used a coarser
  FFT-peak method that could read a couple of tenths of a hertz off (e.g.
  739.8 Hz for a 740 Hz F#5); they now refine that peak with the same
  phase-rate physics as the main bands.
- Corrected the **E Amara 20** note layout.

## [1.1.2] — 2026-07-07

### Fixed
- **Every note reading sharp on some devices (notably certain iPads).** The
  tuner's pitch engine could be handed a sample rate that didn't match what
  the microphone was actually delivering, which scaled every detected
  frequency by a fixed amount — so a whole instrument read consistently sharp
  versus reality. The engine now always uses the true audio render rate, and
  on iOS lets the system pick the rate (the path that was already correct on
  iPhone), so readings match across devices.

## [1.1.1] — 2026-07-07

### Fixed
- **iOS could report a new version while still showing the previous release's interface.** A cached service worker inside the app's WebView was serving the old, pre-cached screen even after the update installed — so the version read as new but the UI hadn't changed. The service worker is now disabled inside the native iOS app (it stays on the web app for offline use) and any leftover cache is cleared on launch, so updates take effect immediately.

## [1.1.0] — 2026-07-06

### Added
- **Redesigned controls.** Everything now lives in one menu: on desktop a full-height panel slides out from the right (open it with the burger button); on phones a bottom **quick-pick** panel slides up. Both carry a **teal utility bar** — Settings, Stopwatch and the Spectrum Analyser on the left, light/dark and (on mobile) a pin on the right.
- **Pin the menu open.** By default the menu **auto-hides after 20 seconds** of no interaction to give the strobe more room; pin it to keep it put.
- **Header stopwatch readout.** On desktop, if the menu hides while a stopwatch session is running, a compact timer stays visible in the header.
- **Interactive onboarding tour, rebuilt** — a learn-by-doing walkthrough that spotlights each control and waits for you to try it, with full desktop and mobile flows. Re-run it any time from Settings → Accessibility.

### Changed
- **Settings is now a modal**, opened with the gear icon — laid out in two columns with clear sections: Input, Strobe Preferences and Accessibility (plus Tuning on mobile).
- **Strobe display is theme-aware.** It rests at a light grey (light mode) or soft charcoal (dark mode) and darkens as soon as the mic picks up, for maximum bar contrast — then eases back when you stop. A locked band gets a dark-green wash that brightens as the note rings out.
- **Light mode is now the default** for new installs.
- **Spectrum Analyser** is toggled from the utility bar and now always reveals its two isolation windows — even if you'd cleared them.
- Title trimmed to **"Strobe Tuner"**.

### Fixed
- **Desktop audio robustness.** Resume a suspended audio context, match the capture device's sample rate, keep the mic stream alive, and keep USB mics from vanishing off the input list — fixing "Let's Go does nothing" cases in the desktop WebView, and a clearer message when a device can't be opened.

### Removed
- The desktop "collapse sidebar" strip — superseded by the burger + auto-hide + pin.

## [1.0.9] — 2026-06-18

### Changed
- **Strobe display redesign for sharper at-a-glance tuning.** The bars now blur progressively the further you are from pitch — crisp when locked, smearing into a soft wash when way out — with a gentle feather even in tune. When a note locks, the black gaps wash **dark green**; as the note rings down the gaps brighten toward the bar colour, so the strobe melts into a green field before fading back to red.
- **Settings reorganised into labelled sections** — **Input**, **Strobe Preferences** and **Accessibility Options**, each under its own heading bar. The input-device picker is now full-width, mic sensitivity is relabelled **MIC +/−**, and the **Hum filter** now sits under Input alongside the mic.

### Removed
- **Always on top** (desktop) toggle — removed.
- **Smooth** and **Readout** sliders — removed from Settings; both now use fixed, tuned defaults under the hood.

### Fixed
- **Ayasa Elements – D Kurd 11** now shows the correct top note **D5** (it was previously listed as E5).

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
  an isolation window**, so you can line an edge up against a note.

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

[1.2.0]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.2.0
[1.1.5]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.1.5
[1.1.4]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.1.4
[1.1.3]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.1.3
[1.1.2]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.1.2
[1.1.1]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.1.1
[1.1.0]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.1.0
[1.0.9]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.9
[1.0.8]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.8
[1.0.7]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.7
[1.0.6]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.6
[1.0.5]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.5
[1.0.4]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.4
[1.0.3]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.3
[1.0.2]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.2
[1.0.1]: https://github.com/simonbaronti/V-Tune/releases/tag/v1.0.1
