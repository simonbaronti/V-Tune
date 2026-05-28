# V-Tune — App Store Metadata

All the text fields App Store Connect needs. Copy/paste each section
into the matching field in App Store Connect → App Information / Pricing
and Availability / App Privacy / This Version.

---

## Promotional Text (170 chars max) — can change without review

> A precision strobe tuner built for handpans. Read every partial
> independently, isolate any frequency, and let your instrument sing
> in tune.

---

## Description (4000 chars max)

> **V-Tune is a precision strobe tuner built for handpans and other
> multi-modal instruments** — drums, gongs, bells, anything where a
> single strike excites several pitches at once.
>
> Most chromatic tuners give up on these instruments because they're
> built around one fundamental. V-Tune is built around three: a
> fundamental, an octave, and an octave-plus-fifth (the 12th), all
> rendered as independent strobe bands so you can read every partial
> without them fighting each other.
>
> **What you get**
>
> • Three-band strobe display — fundamental, octave, 12th — read all
>   three partials of a handpan note at a glance
> • Per-band pitch pipe with continuous and beep modes — hear the
>   reference tone for any band, or have the app emit a comparison
>   beep on each strike
> • Live note indicator — see which note your microphone is picking
>   up on the pitch wheel, in real time
> • Pre-saved handpan scales — Kurd, Amara, Celtic, and more — with
>   the ding highlighted in purple
> • Spectrum analyser with shift+drag isolation windows — bracket any
>   peak in the spectrum and turn it into a dedicated tuning band
> • Stable cents readout with median filtering and EMA smoothing —
>   no jittery digits
> • Peak-hold-then-fade strobe envelope — read the tune from a held
>   pattern after the strike has died away
> • Configurable tolerance, hysteresis, strobe speed, brightness, and
>   bar softness — tune the tuner to feel right
> • Mains hum filter — notch out 50 Hz (UK/EU) or 60 Hz (US)
>   interference
> • Light and dark themes — dark by default
> • Pitch notation in sharps, flats, solfège, or German naming
>
> **Built for accuracy**
>
> Under the hood, V-Tune uses FFT peak detection plus phase-rate
> Goertzel analysis. The FFT tells you which frequencies are loud,
> the Goertzel measures how stable each one is, frame to frame. You
> see the result as classic strobe-pattern bars: motion = drift,
> still = locked.
>
> **Built for privacy**
>
> V-Tune has no accounts, no ads, no analytics, no network requests.
> Your microphone audio is processed on-device, in real time, and
> never stored or transmitted. The app works completely offline.

---

## Keywords (100 chars max, comma-separated)

> tuner,handpan,strobe tuner,chromatic,instrument tuner,hang drum,frequency,pitch,steel tongue,musician

(Total: 98 chars including commas.)

---

## Support URL (required)

> https://v-tune-handpan.vercel.app/support

(We'll create this page on the landing site — can be as simple as the
GitHub issues link.)

---

## Marketing URL (optional but recommended)

> https://v-tune-handpan.vercel.app

---

## Privacy Policy URL (required)

> https://v-tune-handpan.vercel.app/privacy

---

## Category

- **Primary:** Music
- **Secondary:** Utilities (optional — adds discoverability)

---

## Age Rating

V-Tune contains no objectionable content. The age-rating questionnaire
in App Store Connect should all be answered "None" / "No" — the result
will be **4+** (suitable for all ages).

---

## App Privacy (the privacy "labels" survey)

| Question | Answer |
|---|---|
| Do you collect data? | **No** |

That's it. One screen, one answer. Apple will then show "Data Not
Collected" on the App Store listing, which matches what V-Tune
actually does.

---

## What's New in This Version

> **V-Tune 1.0.1 — first public release**
>
> Three-band strobe display, per-band pitch pipe with continuous and
> beep modes, live note indicator on the pitch wheel, pre-saved
> handpan scales, spectrum analyser with isolation windows, stopwatch,
> light/dark themes, full offline operation. Tune your handpan.

---

## TestFlight Test Information (only shown to internal testers)

**What to Test:**

> Strike a handpan note (or any sustained pitch) and verify all three
> strobe bands respond. Click a ♪ icon — Tone plays the reference
> frequency, Beep mode fires a brief tone on each subsequent strike.
> Try the Spectrum Analyser (side panel) and shift+drag to isolate a
> peak. Switch between scales in the Tuning / Scale dropdown.

**Feedback Email:** (your contact email)

---

## Promotional Screenshots

You need screenshots for at minimum:

- **6.7" iPhone** (1290 × 2796 or 1320 × 2868 portrait) — Apple's
  current "primary" size, covers iPhone 14/15/16 Pro Max and similar
- **13" iPad** (2064 × 2752 portrait) — the "primary" iPad size for
  Apple Silicon iPads

3 minimum, 10 maximum per size. Take them from the **live app** so
they actually represent what users will see — Apple is increasingly
strict about screenshots showing fictional UI.

Easiest way to capture:
- iPhone: open the app on your phone, settle it, press Volume Up +
  Side button. Files land in Photos → AirDrop to Mac.
- iPad: same, Top button + Volume Up.
- iOS Simulator: Cmd+S in the simulator window. File goes to your
  desktop with the exact correct dimensions for the chosen device.

Suggested screenshot sequence:

1. **Hero shot** — strobe display with a note locked in (green bars
   on all 3 bands)
2. **Pitch pipe demo** — strobe bands with a ♪ in tone mode (yellow)
3. **Scale picker** — scale dropdown open showing handpan scales
4. **Spectrum Analyser** — SA open with an isolation window drawn
5. **Settings** — settings accordion expanded
