# V-Tune — walkthrough narration

Working script for the deep-dive video. Target **~19 minutes**, chaptered,
to sit alongside Colin Foulke's Linotune tutorial as the reference people
link timestamps into.

Accurate to **1.3.3**. If the app changes, this drifts — check it against
`docs/build-guide.py`, which is the same content written to be read.

**Two deliberate departures from the reference.**

*Reading a band comes early, at 4:20.* Colin leaves "what are we actually
looking at?" until 16:38 and gives it thirty seconds. It is the only part
that teaches a skill rather than a button, and somebody who stops watching
after five minutes should already have it.

*There is no band-editing chapter.* That is a quarter of the reference
video and V-Tune does not do it. Nothing here apologises for that or draws
attention to it — the isolation windows do the job people actually reach
band editing for, and they get the room instead.

**Stage directions in [brackets]. Everything else is spoken.**

---

## Before you record

- **Real instrument audio, not screen capture alone.** A strobe with nothing
  to read is a dead rectangle. Mic the pan into the room and capture the
  screen; the viewer needs to hear the strike that moves the bars.
- **One instrument, start to finish.** Colin's video works partly because it
  is one pan the whole way through. Switching instruments resets the
  viewer's ear.
- **Dark theme.** The strobe bars have more contrast against it and it
  films better.
- **Turn the onboarding tour off first** (Settings → it will not re-run once
  completed) so nothing interrupts a take.
- **Decide the scale before you start** and use a pan you can actually play
  in it. A D Kurd is the safest choice — most viewers will recognise it.

---

## 0:00 — Cold open

[Strobe already running, three bands, a note ringing and locking green.
No talking over the first strike — let it land.]

This is V-Tune. It is a strobe tuner built for handpans, and the thing it
does that a chromatic tuner cannot is read every partial of a note at the
same time, separately.

[Point at the three bands in turn.]

One strike, three readings. The fundamental, the octave above it, and the
twelfth — the octave and a fifth. On a handpan those three are tuned
individually, so a tuner that reports one number for the note is telling
you about a third of what is going on.

The next nineteen minutes is everything in the app. There are chapters, so
skip about.

---

## 0:40 — Chapter 1: Getting sound in

[Settings, gear icon in the teal bar. Input section.]

First thing, before anything else works: the microphone.

Settings is the gear in the teal bar along the top of the menu. Input,
first section. **Microphone** picks which device V-Tune is listening to —
if you are running an interface or a decent external mic, choose it here
rather than letting the system decide.

**Microphone Sensitivity** is input gain. If your strikes barely register,
bring it up. If the bars go wild on a quiet room, bring it down. You want
the strike to register clearly and the silence between strikes to be
silence.

[Demonstrate: too low, too high, about right.]

**Hum** is a notch filter for mains noise. Fifty hertz in the UK and
Europe, sixty in the US. If you are working near anything with a
transformer in it, set this and it takes the hum and its harmonics out
before they reach the analysis.

[Close settings. Press Let's Go.]

And **Let's Go** starts and stops the audio. It is at the bottom of the
menu, and it is the button you will press most.

---

## 2:00 — Chapter 2: Choosing what to tune

[Note picker, chromatic mode.]

By default you are in **Chromatic** — a piano keyboard. Tap a key and V-Tune
tunes to that note in the current octave. **OCT minus** and **OCT plus**
move the octave.

[Change octave, tap a couple of notes, show the bands updating.]

Notice the three bands updating as I do that. They are always one note, at
three multiples of it.

[Tap AUTO.]

**AUTO** is the one to know about. Turn it on and V-Tune follows whatever
you play instead of holding the note you picked. When you are going round
an instrument checking where everything sits, this saves you selecting each
note by hand.

[Play several notes round the pan, let it follow.]

Turn it off again when you want to stay put and work on one note.

---

## 3:10 — Chapter 3: Scales and the ding

[Open the SCALE dropdown.]

The **SCALE** dropdown loads a handpan layout instead of a chromatic
keyboard — Kurd, Amara, Pygmy, Aegean, Ashakiran, Aavartan, Equinox,
Nordlys. Twenty-two layouts, with the Ayasa Elements scales at the top.

[Pick the scale matching the instrument in shot.]

Now the picker shows only the notes in that scale, each at the octave it
actually lives at on the instrument, rather than an abstract keyboard. The
**ding** is highlighted in purple, and selecting a scale selects the ding
for you.

[Point at a bottom note.]

Notes with a teal outline are **bottom notes** — tuned into the underside of
the shell. They sit in the picker at their true pitch, which is often below
the ding, and the outline is just so you know where you are on the
instrument. They tune exactly like anything else.

One small thing: in scale mode the sharps and flats follow the scale's own
convention. Kurd is written in flats, Amara in sharps. In chromatic mode
you choose, and I will come back to that.

---

## 4:20 — Chapter 4: Reading a band

**This is the part that matters.** Everything else is buttons; this is the
skill.

[Full screen on one band. Strike and let it ring.]

A band tells you three things at once, and they are independent.

**One: the bars move.** Movement is the pitch being off. Moving **left**
means you are flat — the note is below the target. Moving **right** means
sharp. And when the pattern **holds still**, you are there.

[Strike a flat note, let the drift be obvious. Then a sharp one.]

The speed is the size of the error. A long way out and it races. Close in
and it crawls. Dead on and it stops. That is the whole reading — a
mechanical strobe has worked exactly this way for a hundred years, and the
number on the right is a convenience, not the instrument.

**Two: the bars are green or red**, and the whole band washes green when
you are inside tolerance. Five cents by default.

**Three, and this one is new**: the **sharpness** of the bars tells you how
*steady* the pitch is — not how far out it is, which the movement already
told you.

[Strike a clean note that is clearly flat. Bars slide but stay crisp.]

That note is well flat and rock steady. The bars are sharp and sliding.
That is a clean adjustment — you know exactly what to do to it.

[Now strike a note with a wobble, or bend one slightly.]

And that one goes soft. The pitch is unsettled. On a handpan that usually
means partials beating against each other, or a note field fighting
itself — and it is worth seeing, because it is a different problem from
being flat and it wants a different answer.

[Let a note decay fully.]

Last thing: the pattern **holds for about four seconds** after each strike
and then fades over the next second. You do not have to keep hitting the
note to keep reading it. Strike it, let it ring, and read the held pattern
while it dies.

---

## 7:00 — Chapter 5: PURE and EQUAL

[Point at the toggle.]

Above the notes there is a **PURE / EQUAL** switch, and it decides what
those three bands are measured against.

**PURE** — the default — measures each band against an exact whole-number
multiple of the fundamental. One times, two times, three times. A handpan
whose partials are tuned to those pure ratios reads **zero on all three**.

**EQUAL** measures each band against the nearest equal-tempered note
instead.

[Switch to EQUAL on a well-tuned note. Point at the 3× band.]

Watch the twelfth. It moves to about **plus two cents** and stays there.
That is not an error — it is the real, constant difference between a pure
three-to-one fifth and a tempered one. The octave does not budge, because
an octave is an exact doubling in both systems.

So: PURE if you tune partials to the instrument, EQUAL if you tune them to
the tempered scale. Most handpan work is PURE.

---

## 8:30 — Chapter 6: The pitch pipe

[Click the ♪ on a band.]

Each band has a **note symbol** on its left edge. Click it and you hear that
band's exact target frequency.

[Let the tone play.]

Click again and it changes mode.

[Click through to beep.]

**Beep** is the useful one. It stays silent until the band hears a strike,
then fires a short reference tone at the target. So you hit the note, and
immediately hear what it should have been.

[Demonstrate: strike, beep, strike, beep.]

That is ear-and-eye at once, and for some people it is faster than reading
the bars. Click a third time to turn it off. Click the symbol on a
different band and the pipe moves there — only one at a time.

---

## 9:40 — Chapter 7: Typing a target

[Scroll to the CUSTOM band.]

Underneath the notes is **CUSTOM** — the pitch you are actually tuning to,
in hertz. Picking a note fills it in. But you can also set it yourself, and
this is where V-Tune stops being a note picker.

[Type a frequency.]

**Type it** when you know the number — off a maker's spec sheet, or an
instrument you measured before. Decimals are kept exactly as you type them,
not rounded away. Enter, or SET.

[Use the − / + buttons.]

**Nudge it** when you do not. Minus and plus move the target **half a cent**
a press, up to a semitone either way. That is the one to reach for when an
instrument sits between the notes and you are creeping up on it with the
strobe running.

[Point at the purple.]

Either way the field goes **purple** the moment the target is off the note,
and it tells you which note you are near and by how much. So you cannot
leave an offset on by accident and wonder why everything reads wrong later.

And it moves all three partials together, so the relationship between them
is kept.

---

## 11:00 — Chapter 8: The analyser

[Turn on the Spectrum Analyser from the teal bar.]

The equaliser icon opens the **Spectrum Analyser** — everything the
instrument is producing, from sixty hertz to four point three kilohertz.

[Strike, let the peaks appear.]

That range is deliberate. Wider than any handpan's fundamental to its top
partial, and narrow enough that the keyboard along the bottom stays
readable.

[Point at the keyboard.]

That keyboard is drawn **against the frequency axis**, not as even keys — so
every key sits underneath the partials it names. The keys your strobe bands
are targeting are tinted, so you can see at a glance which note each band is
on.

[Drag the resize handle.]

And you can drag the top edge to make the whole thing taller or shorter. The
strobe always keeps a guaranteed share of the screen, so you cannot lose it.

---

## 12:30 — Chapter 9: Isolation windows

[Point at the two coloured brackets.]

These two brackets are **isolation windows**, and they are how you tune
something that is not the fundamental, the octave or the twelfth.

Each bracket finds the **loudest peak inside it** and drives its own strobe
band underneath, in the same colour. So: you move the window, you read the
band.

[Drag a bracket onto a partial. Point at the band appearing below.]

Drag either end to move it. The frequency, note and cents follow as you go,
so you can line an edge up against a note.

[Shift-drag a new one.]

Shift and drag draws a new one anywhere on the spectrum — touch and hold on
a phone. Two at a time, and the × removes one.

And this matters: those isolation bands read with **the same sub-cent
precision as the main strobe**. Same physics. It is not a rougher reading
off the spectrum — what you see on an isolation band is as trustworthy as
the three foundation bands.

---

## 14:30 — Chapter 10: The waterfall

[Turn on WATERFALL.]

This one I want to spend a minute on, because it answers a question the
spectrum cannot.

The curve tells you how **loud** each partial is right now. It tells you
nothing about how long any of them **lasts**.

[Strike and let it ring while the waterfall fills.]

**WATERFALL** paints the last **ten seconds** behind the curve, on the same
frequency axis, with colour standing in for power. Newest at the top,
everything older sliding down and off the bottom.

[Point at a long streak, then a short one.]

A partial that rings on draws a long vertical streak. One that dies on the
strike draws a dash. That is sustain, visible, and you can compare two notes
by eye instead of by feel.

One row is exactly one pixel, and the ten seconds spans whatever height the
panel is — nothing is resampled, so the slope of a decay is honest.

[Adjust BRIGHT, then TAIL.]

Three controls. **BRIGHT** is the saturation point — everything above it
paints the hot end, so bringing it *down* pulls more of a quiet instrument
into the top of the range. **TAIL** is how faint a partial can get before it
goes black; raise it to follow a decay further into the noise. **SOFT**
blurs across frequency only — never across time, because smearing time would
flatten the very decay you are reading.

All three redraw the ten seconds already on screen. So you can find the
right setting against a strike that has already happened, instead of
hitting the instrument over and over.

[Show an isolation window as a lane in the waterfall.]

And the isolation windows carry through as lanes — so you can bracket one
partial, watch that one decay, and read its strobe, all at once.

---

## 17:00 — Chapter 11: The Gu port

[Select a scale with Gu notes. Point at the amber chip.]

On a scale with notes tuned into the **Gu**, an amber chip appears under the
note grid.

[Tap it.]

Tap it and V-Tune aims itself at them. Both isolation windows land on the
port notes at plus or minus thirty-five cents, the analyser zooms in to
frame them, and the two bands underneath read nothing but the Gu port —
teal for the lower, purple for the higher.

Tap it again to put everything back.

---

## 17:50 — Chapter 12: Speed, and the keyboard

[Settings → Strobe Preferences → Speed.]

Two last things.

**Speed**, in Settings, is how fast the pattern drifts — as a multiple of a
conventional strobe. **One is a real strobe**: the pattern turns once a
second for every hertz the note is out. Go above it to make a small error on
a high partial obvious. Go below for low notes, where a real strobe already
moves faster than the eye wants.

[Press MAP.]

And on a computer you can drive the whole picker from the keyboard. The
**MAP** button shows you the lot — the home row is the white keys, the row
above is the black keys, arrows move the octave and nudge the target, and
Enter starts and stops the tuner. Handy when one hand is on the instrument.

---

## 18:40 — Close

[Back to the full view, one clean note locking green.]

That is the whole app.

The guide has all of this written down, in English and Spanish, at
vtune-app.com. And if something does not work the way you expect, or you
want it to do something it does not — tell me. Most of what is in this
video got there because somebody asked.

[Hold on the locked band. End.]

---

## Chapter markers for the YouTube description

```
0:00  What V-Tune is
0:40  Setting up your microphone
2:00  Choosing what to tune
3:10  Scales, the ding and bottom notes
4:20  Reading a band
7:00  PURE and EQUAL
8:30  The pitch pipe
9:40  Typing a target frequency
11:00 The spectrum analyser
12:30 Isolation windows
14:30 The waterfall
17:00 The Gu port
17:50 Strobe speed and keyboard shortcuts
18:40 Close
```
