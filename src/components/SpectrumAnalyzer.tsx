import { useRef, useEffect, useCallback, useState } from 'react';
import {
  useTunerStore,
  MAX_ISOLATIONS,
  ISO_COLORS,
  SPECTRUM_MIN_FREQ,
  SPECTRUM_MAX_FREQ,
} from '../store/tunerStore';
import { getAnalyserNode, getAudioContext, setAnalyserFftSize, setAnalyserSmoothing } from '../audio/AudioEngine';
import { frequencyToNote, getDisplayName } from '../utils/notes';
import { micLiveness, mixRgba } from './bgSignal';

// How long the finger has to sit still before a touch-drag becomes an
// iso-create gesture (ms). Anything shorter is treated as a pan.
const TOUCH_HOLD_MS = 350;
// How far the mouse can have moved before "shift+drag" is interpreted as
// the user trying to create an iso rather than nudge the pan a hair.
const DRAG_THRESHOLD_PX = 4;

const MIN_FREQ = SPECTRUM_MIN_FREQ;
const MAX_FREQ = SPECTRUM_MAX_FREQ;
// Zoom limits expressed as a log10 frequency span.
// Full range ≈ 2.9; the small min lets you zoom right in on a single peak
// (~0.008 ≈ a ±1% window, e.g. ~±10 Hz around 1 kHz).
const MAX_LOG_SPAN = Math.log10(MAX_FREQ) - Math.log10(MIN_FREQ);
const MIN_LOG_SPAN = 0.008;
const DB_FLOOR = -100;
const DB_CEIL = -10;

// ── Waterfall ───────────────────────────────────────────────────────────────
// A heatmap of the spectrum over time: same frequency axis as the curve above
// it, scrolling downward, colour standing in for power. It answers the one
// question the curve can't — how long does each partial actually sustain —
// which is what a maker is listening for after the strike.

/** Seconds from the top of the waterfall to the bottom. */
const WF_SECONDS = 10;

/**
 * The dB range the colour ramp spans.
 *
 * Fixed, deliberately. Auto-scaling to whatever is loudest right now would
 * mean a decaying partial keeps its colour as it fades — the scale chases it
 * down — and the decay, the entire point of the view, becomes invisible.
 * A fixed range makes colour mean the same level everywhere, so a partial
 * visibly cools as it dies and two strikes can be compared.
 */
/** Widest the softness control blurs across frequency, in pixels. */
const WF_MAX_BLUR_PX = 6;

/**
 * How far the analyser can be dragged.
 *
 * The floor is where the view stops saying anything: below about this the dB
 * labels run into each other and the waterfall has too few rows to show a
 * decay. The ceiling is expressed as "leave this much for everything else" —
 * three strobe bands plus the isolation readouts — rather than as a fraction
 * of the screen, because what has to stay usable is a fixed amount of
 * furniture, not a proportion of it.
 */
const MIN_PANEL_PX = 140;
const MAX_PANEL_PX = 700;

/**
 * Strobe left standing at full stretch — three bands at ~55px, which with the
 * labels scaling stays readable.
 *
 * Applied against the space actually measured rather than against the
 * viewport. A fixed "reserve everything else" figure can't work: the chrome
 * around these two differs between the desktop and mobile layouts, and a
 * number tuned on desktop collapsed the strobe to nothing in landscape.
 */
const MIN_STROBE_PX = 165;

const WF_DB_MAX = -20;

/**
 * The range rows are *stored* against — deliberately wider than anything the
 * colour ramp shows.
 *
 * Storage and display are separate so the floor control can re-map the last
 * ten seconds as you drag it. Quantise at capture time against the displayed
 * range instead and the history is baked at whatever floor was set when each
 * row arrived, so dragging would only affect rows that hadn't happened yet.
 */
const WF_STORE_MIN = -120;
const WF_STORE_SPAN = 120;

/**
 * Colour ramp, cold to hot. Runs dark at the bottom in both themes — a light
 * floor inverts the reading and quiet partials would look like loud ones.
 *
 * This is a jet-style ramp, chosen for familiarity: it's what Overtone
 * Analyzer shows, and the maker who asked for this view reads that daily, so
 * blue-cyan-green-yellow-red already means something to him.
 *
 * The known cost: jet's *luminance* isn't monotonic. Saturated orange is
 * darker than yellow, so a partial at 90% of the range paints dimmer than one
 * at 80%, and only the hue ordering carries the level reliably. If ranking
 * the loudest partials by eye turns out to be hard, an inferno-style ramp
 * (dark -> purple -> red -> orange -> yellow -> white) climbs in brightness
 * the whole way; it's a change to this table and nothing else.
 */
const WF_STOPS: Array<[number, number, number, number]> = [
  [0.0, 12, 14, 28],
  [0.18, 22, 46, 140],
  [0.38, 0, 150, 190],
  [0.58, 40, 190, 90],
  [0.75, 240, 220, 60],
  [0.9, 240, 100, 30],
  [1.0, 255, 246, 236],
];

/** Scratch buffer for heat() — module scope so it isn't reallocated per
 *  render, and so the draw callbacks don't close over a stale one. */
const wfRgb: [number, number, number] = [0, 0, 0];

function heat(t: number, out: [number, number, number]): void {
  const v = t <= 0 ? 0 : t >= 1 ? 1 : t;
  for (let i = 1; i < WF_STOPS.length; i++) {
    const [p1, r1, g1, b1] = WF_STOPS[i];
    if (v > p1 && i < WF_STOPS.length - 1) continue;
    const [p0, r0, g0, b0] = WF_STOPS[i - 1];
    const k = p1 === p0 ? 0 : (v - p0) / (p1 - p0);
    out[0] = r0 + (r1 - r0) * k;
    out[1] = g0 + (g1 - g0) * k;
    out[2] = b0 + (b1 - b0) * k;
    return;
  }
}

function freqToX(freq: number, width: number, minF: number, maxF: number): number {
  const logMin = Math.log10(minF);
  const logMax = Math.log10(maxF);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
}

function xToFreq(x: number, width: number, minF: number, maxF: number): number {
  const logMin = Math.log10(minF);
  const logMax = Math.log10(maxF);
  const logF = logMin + (x / width) * (logMax - logMin);
  return Math.pow(10, logF);
}

function dbToY(db: number, height: number, floor: number, ceil: number): number {
  const clamped = Math.max(floor, Math.min(ceil, db));
  return height - ((clamped - floor) / (ceil - floor)) * height;
}

/** Clamp an arbitrary requested range to the analyser's limits, honouring
 * the same maximum zoom the wheel/pinch handlers use. */
function clampViewRange(a: number, b: number): [number, number] {
  const lo = Math.max(MIN_FREQ, Math.min(a, b));
  const hi = Math.min(MAX_FREQ, Math.max(a, b));
  const logSpan = Math.log10(hi) - Math.log10(lo);
  if (logSpan >= MIN_LOG_SPAN) return [lo, hi];
  const mid = (Math.log10(hi) + Math.log10(lo)) / 2;
  return [
    Math.pow(10, mid - MIN_LOG_SPAN / 2),
    Math.pow(10, mid + MIN_LOG_SPAN / 2),
  ];
}

function formatFreq(f: number): string {
  if (f >= 1000) return `${(f / 1000).toFixed(1)}k`;
  return `${Math.round(f)}`;
}

export function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dataRef = useRef<Float32Array | null>(null);
  const smoothDataRef = useRef<Float32Array | null>(null);
  const peakHoldRef = useRef<Float32Array | null>(null);

  const bands = useTunerStore((s) => s.bands);
  const fftSize = useTunerStore((s) => s.fftSize);
  const fftSmoothing = useTunerStore((s) => s.fftSmoothing);
  const isolations = useTunerStore((s) => s.isolations);
  const showWaterfall = useTunerStore((s) => s.showWaterfall);
  const waterfallSoftness = useTunerStore((s) => s.waterfallSoftness);
  const waterfallFloor = useTunerStore((s) => s.waterfallFloor);
  const spectrumHeight = useTunerStore((s) => s.spectrumHeight);
  const waterfallHeight = useTunerStore((s) => s.waterfallHeight);

  // The waterfall needs vertical room to say anything — ten seconds squeezed
  // into a phone-sized strip is a smear. Gated on the space available rather
  // than on the platform, because iPadOS reports itself as iOS and a tablet
  // is the device this suits best.
  // No space gate. This was once withheld below 700x600 on the grounds that
  // ten seconds squeezed into a phone-sized strip is a smear — true, but the
  // drag handle below hands that judgement to whoever is holding the phone,
  // which is the better place for it.
  const waterfallOn = showWaterfall;

  // Height is committed to the store on release rather than on every pointer
  // move: the store persists to localStorage on each set, and a drag would
  // otherwise write sixty times a second.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const gripRef = useRef<{ startY: number; startH: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  // The ceiling has to come from the layout, not from a guess about it. A
  // fixed "leave this much" figure was tuned on desktop and collapsed the
  // strobe to nothing in landscape, because the chrome around these two
  // differs between the layouts.
  //
  // The strobe's wrapper and this canvas are the only two elements in the
  // column that flex; everything else — our header and grip, the isolation
  // readouts, the quick-pick bar on mobile — is fixed. So their *sum* is the
  // budget the two of them share, it doesn't change as the split does, and
  // measuring it can't chase its own tail.
  const [maxCanvas, setMaxCanvas] = useState(MAX_PANEL_PX);
  const measureSpace = useCallback(() => {
    const wrapper = rootRef.current?.parentElement;
    const column = wrapper?.parentElement;
    const strobeWrap = wrapper?.previousElementSibling as HTMLElement | null;
    const canvas = canvasRef.current;
    if (!wrapper || !column || !strobeWrap || !canvas) return;
    const h = (el: Element) => el.getBoundingClientRect().height;

    // Every term here is independent of how the space is currently split, so
    // one reading is correct whenever it's taken. Deriving the cap from the
    // strobe and canvas sizes instead looked equivalent but wasn't: it needs
    // the layout to have settled first, and a reading taken mid-settle stuck
    // at the wrong value and never corrected.
    let fixedSiblings = 0;
    for (const child of column.children) {
      if (child !== wrapper && child !== strobeWrap) fixedSiblings += h(child);
    }
    const ourChrome = h(wrapper) - h(canvas);
    setMaxCanvas(
      Math.max(70, Math.round(h(column) - MIN_STROBE_PX - fixedSiblings - ourChrome)),
    );
  }, []);
  useEffect(() => {
    measureSpace();
    // Observed rather than measured once: a single reading taken before the
    // layout has settled is wrong and never corrects itself. Watching both
    // elements converges instead — the budget is the same whatever the split,
    // so re-measuring returns the same number and React stops re-rendering.
    const strobeWrap = rootRef.current?.parentElement?.previousElementSibling;
    const ro = new ResizeObserver(measureSpace);
    if (strobeWrap) ro.observe(strobeWrap);
    if (canvasRef.current) ro.observe(canvasRef.current);
    window.addEventListener('resize', measureSpace);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureSpace);
    };
  }, [measureSpace]);

  // Applied on every render, not just while dragging: a height set on a
  // desktop follows the user to a phone, where it can be taller than the
  // whole screen.
  const minH = Math.min(MIN_PANEL_PX, Math.max(70, Math.round(maxCanvas * 0.6)));
  const maxH = Math.max(minH, Math.min(MAX_PANEL_PX, maxCanvas));
  const storedHeight = waterfallOn ? waterfallHeight : spectrumHeight;
  const panelHeight = Math.max(minH, Math.min(maxH, dragHeight ?? storedHeight));

  const clampHeight = (px: number) => Math.max(minH, Math.min(maxH, px));


  const onGripDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    measureSpace();
    gripRef.current = { startY: e.clientY, startH: storedHeight };
    setDragHeight(storedHeight);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const g = gripRef.current;
    if (!g) return;
    // The panel is anchored at the bottom, so dragging the grip upward has to
    // make it taller — hence start minus current, not the other way round.
    setDragHeight(clampHeight(g.startH + (g.startY - e.clientY)));
  };
  const onGripUp = (e: React.PointerEvent) => {
    const g = gripRef.current;
    if (!g) return;
    gripRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const finalH = clampHeight(g.startH + (g.startY - e.clientY));
    useTunerStore.getState().setAnalyserHeight(finalH, waterfallOn);
    setDragHeight(null);
  };

  // A zoom request can be waiting before we even mount — arming the Gu-port
  // chip turns the analyser on and asks for a range in the same breath — so
  // pick it up here rather than only in the subscription below.
  const [viewRange, setViewRange] = useState<[number, number]>(() => {
    const pending = useTunerStore.getState().spectrumZoom;
    return pending ? clampViewRange(pending.minFreq, pending.maxFreq) : [MIN_FREQ, MAX_FREQ];
  });
  const [threshold, setThreshold] = useState(-60);
  // Pending isolation being painted right now via mouse/touch drag. Stored
  // in component state (not the store) until commit on pointer-up — keeps
  // the per-frame canvas redraw cheap and the store noise-free.
  const [pendingIso, setPendingIso] = useState<{ startFreq: number; currentFreq: number } | null>(null);
  const pendingIsoRef = useRef(pendingIso);
  pendingIsoRef.current = pendingIso;
  const [dragState, setDragState] = useState<{
    type:
      | 'pan'             // dragging the view left/right
      | 'iso-create'      // dragging out a new isolation window
      | 'iso-resize-left'
      | 'iso-resize-right'
      | 'threshold'
      | null;
    startX: number;
    startY: number;
    startThreshold: number;
    // For panning: where the view range was when the drag began.
    startRange: [number, number];
    // For iso-resize: which isolation, and its starting bracket.
    isoId: string | null;
    startIsoMin: number;
    startIsoMax: number;
    // For iso-create: frequency under the pointer at start.
    startFreq: number;
  }>({
    type: null,
    startX: 0,
    startY: 0,
    startThreshold: -60,
    startRange: [MIN_FREQ, MAX_FREQ],
    isoId: null,
    startIsoMin: 0,
    startIsoMax: 0,
    startFreq: 0,
  });

  // Hover position (canvas-relative pixels). Used to render the live
  // freq/note readout that follows the cursor across the spectrum.
  const hoverRef = useRef<{ x: number; y: number } | null>(null);

  // ── Waterfall state ───────────────────────────────────────────────────────
  // Rows are kept as quantised dB (one byte per bin) rather than only as
  // painted pixels, so zooming re-renders the history against the new
  // frequency axis instead of throwing away the last ten seconds. At a few
  // hundred rows that's under a megabyte.
  const wfOffRef = useRef<HTMLCanvasElement | null>(null);
  const wfValsRef = useRef<Float32Array | null>(null);
  const wfBlurRef = useRef<Float32Array | null>(null);
  const wfRowsRef = useRef<Uint8Array[]>([]);
  const wfHeadRef = useRef(0);
  const wfFilledRef = useRef(0);
  const wfLastRowRef = useRef(0);
  const wfBinsRef = useRef<{ binCount: number; freqPerBin: number }>({ binCount: 0, freqPerBin: 0 });
  // What the offscreen currently depicts. Any mismatch forces a full redraw.
  const wfPaintedRef = useRef<{
    w: number; rows: number; minF: number; maxF: number; soft: number; floor: number;
  }>({ w: 0, rows: 0, minF: 0, maxF: 0, soft: -1, floor: 0 });

  /** Paint one stored row across the frequency axis at `y` on the offscreen. */
  const wfPaintRow = useCallback((
    octx: CanvasRenderingContext2D,
    row: Uint8Array,
    y: number,
    w: number,
    minF: number,
    maxF: number,
    softness: number,
    floorDb: number,
  ) => {
    const { binCount, freqPerBin } = wfBinsRef.current;
    if (!binCount || !freqPerBin) return;

    if (!wfValsRef.current || wfValsRef.current.length !== w) {
      wfValsRef.current = new Float32Array(w);
      wfBlurRef.current = new Float32Array(w);
    }
    const vals = wfValsRef.current;

    for (let x = 0; x < w; x++) {
      // Take the loudest bin falling in this pixel. Averaging would smear a
      // narrow partial into the noise around it, which at the top of the
      // range — where many bins share a pixel — is most of them.
      const b0 = Math.max(0, Math.floor(xToFreq(x, w, minF, maxF) / freqPerBin));
      const b1 = Math.min(binCount - 1, Math.ceil(xToFreq(x + 1, w, minF, maxF) / freqPerBin));
      let v = 0;
      for (let b = b0; b <= b1; b++) if (row[b] > v) v = row[b];
      vals[x] = v;
    }

    // Soften across frequency only — never across time. Blurring vertically
    // would smear the decay into the rows around it, and the decay is the
    // whole reason this view exists. A running-sum box blur, twice, which is
    // close enough to a gaussian to look like one.
    const radius = Math.round(softness * WF_MAX_BLUR_PX);
    let src = vals;
    if (radius > 0) {
      const tmp = wfBlurRef.current!;
      for (let pass = 0; pass < 2; pass++) {
        const dst = pass === 0 ? tmp : vals;
        const from = pass === 0 ? vals : tmp;
        let sum = 0;
        const span = radius * 2 + 1;
        for (let x = -radius; x <= radius; x++) sum += from[Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          dst[x] = sum / span;
          sum -= from[Math.min(w - 1, Math.max(0, x - radius))];
          sum += from[Math.min(w - 1, Math.max(0, x + radius + 1))];
        }
      }
      src = vals;
    }

    const img = octx.createImageData(w, 1);
    const px = img.data;
    const rampSpan = WF_DB_MAX - floorDb;
    for (let x = 0; x < w; x++) {
      const db = WF_STORE_MIN + (src[x] / 255) * WF_STORE_SPAN;
      heat((db - floorDb) / rampSpan, wfRgb);
      const o = x * 4;
      px[o] = wfRgb[0];
      px[o + 1] = wfRgb[1];
      px[o + 2] = wfRgb[2];
      px[o + 3] = 255;
    }
    octx.putImageData(img, 0, y);
  }, []);

  /** Repaint every stored row — after a zoom, a resize, or first paint. */
  const wfRepaint = useCallback((w: number, rows: number, minF: number, maxF: number, soft: number, floorDb: number) => {
    const off = wfOffRef.current;
    if (!off) return;
    const octx = off.getContext('2d');
    if (!octx) return;
    heat(0, wfRgb);
    octx.fillStyle = `rgb(${wfRgb[0]}, ${wfRgb[1]}, ${wfRgb[2]})`;
    octx.fillRect(0, 0, w, rows);
    const ring = wfRowsRef.current;
    const filled = wfFilledRef.current;
    const head = wfHeadRef.current;
    for (let y = 0; y < Math.min(filled, rows); y++) {
      const idx = (head - 1 - y + ring.length * 2) % ring.length;
      wfPaintRow(octx, ring[idx], y, w, minF, maxF, soft, floorDb);
    }
    wfPaintedRef.current = { w, rows, minF, maxF, soft, floor: floorDb };
  }, [wfPaintRow]);

  /**
   * Keep the waterfall's offscreen buffer current, and hand it back to be
   * drawn as the panel's background.
   *
   * The row cadence is derived from the panel height so that one row is
   * exactly one pixel and the full ten seconds spans it — no resampling, and
   * the slope of a decay is honest rather than stretched.
   */
  const wfUpdate = useCallback((
    // null while audio is off: the buffer still exists and paints its floor,
    // so the panel reads as an empty ten seconds rather than a blank box.
    data: { smooth: Float32Array; binCount: number; freqPerBin: number } | null,
    w: number,
    rows: number,
    minF: number,
    maxF: number,
    soft: number,
    floorDb: number,
  ): HTMLCanvasElement | null => {
    if (w < 1 || rows < 1) return null;

    // (Re)allocate the ring when the height or the FFT size changes. Both
    // invalidate the history, so start it over rather than show a seam.
    const bins = wfBinsRef.current;
    if (data && (wfRowsRef.current.length !== rows || bins.binCount !== data.binCount)) {
      wfRowsRef.current = Array.from({ length: rows }, () => new Uint8Array(data.binCount));
      wfHeadRef.current = 0;
      wfFilledRef.current = 0;
      wfBinsRef.current = { binCount: data.binCount, freqPerBin: data.freqPerBin };
      wfPaintedRef.current = { w: 0, rows: 0, minF: 0, maxF: 0, soft: -1, floor: 0 };
    }
    if (data) bins.freqPerBin = data.freqPerBin;

    let off = wfOffRef.current;
    if (!off || off.width !== w || off.height !== rows) {
      off = document.createElement('canvas');
      off.width = w;
      off.height = rows;
      wfOffRef.current = off;
      wfPaintedRef.current = { w: 0, rows: 0, minF: 0, maxF: 0, soft: -1, floor: 0 };
    }
    const octx = off.getContext('2d');
    if (!octx) return null;

    const painted = wfPaintedRef.current;
    if (
      painted.w !== w || painted.rows !== rows
      || painted.minF !== minF || painted.maxF !== maxF
      || painted.soft !== soft || painted.floor !== floorDb
    ) {
      // Zoom, resize or a softness change — repaint the stored history
      // against the new settings rather than throwing the last ten seconds
      // away, which is why rows are kept as dB and not just as pixels.
      wfRepaint(w, rows, minF, maxF, soft, floorDb);
    }

    const now = performance.now();
    const interval = (WF_SECONDS * 1000) / rows;
    if (data && now - wfLastRowRef.current >= interval) {
      wfLastRowRef.current = now;
      const { smooth, binCount } = data;
      const ring = wfRowsRef.current;
      const row = ring[wfHeadRef.current];
      for (let i = 0; i < binCount; i++) {
        // Deliberately the *ungated* level. Feeding this the threshold-gated
        // data — which is what it did first — meant a partial decaying past
        // the threshold line didn't fade out, it dropped to black mid-tail.
        // The gate exists to clean up the curve; on a decay it amputates it.
        // The floor control below is this view's own noise gate.
        const v = isFinite(smooth[i]) ? smooth[i] : WF_STORE_MIN;
        const t = (v - WF_STORE_MIN) / WF_STORE_SPAN;
        row[i] = t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0;
      }
      wfHeadRef.current = (wfHeadRef.current + 1) % rows;
      wfFilledRef.current = Math.min(wfFilledRef.current + 1, rows);

      // Scroll what's there down a pixel and paint the new row on top, so
      // "now" is the top edge — where the live curve is drawn — and history
      // falls away beneath it.
      octx.drawImage(off, 0, 0, w, rows - 1, 0, 1, w, rows - 1);
      wfPaintRow(octx, row, 0, w, minF, maxF, soft, floorDb);
    }

    return off;
  }, [wfRepaint, wfPaintRow]);

  // Mirror of dragState so the rAF draw loop can read it without forcing
  // re-renders on every move.
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const viewRangeRef = useRef(viewRange);
  viewRangeRef.current = viewRange;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  const isolationsRef = useRef(isolations);
  isolationsRef.current = isolations;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const w = rect.width;
    const h = rect.height;

    const [minF, maxF] = viewRangeRef.current;
    const currentThreshold = thresholdRef.current;
    const store = useTunerStore.getState();
    const currentNaming = store.noteNaming;
    const refFreq = store.referenceFreq;

    // Theme-aware neutrals that darken with the mic (in sync with the strobe
    // via micLiveness): light grey resting → dark when signal is present.
    const dark = store.theme === 'dark';
    const d = micLiveness.value;
    const specBg =        dark ? mixRgba([26, 26, 35, 1], [16, 16, 22, 1], d)     : mixRgba([212, 215, 221, 1], [22, 22, 30, 1], d);
    const specGrid =      dark ? mixRgba([40, 40, 54, 1], [30, 30, 42, 1], d)     : mixRgba([150, 152, 162, 0.55], [60, 62, 78, 0.5], d);
    const specGridLabel = dark ? 'rgba(140, 140, 155, 0.9)'                       : mixRgba([40, 42, 52, 0.85], [200, 200, 215, 0.85], d);

    // Background
    ctx.fillStyle = specBg;
    ctx.fillRect(0, 0, w, h);

    // The waterfall is the panel's background, with the live curve riding
    // over it. Drawn from last frame's buffer — the FFT for this frame isn't
    // read until further down, and one frame of lag at 60fps isn't visible.
    const wfOn = store.showWaterfall;
    if (wfOn && wfOffRef.current) {
      ctx.drawImage(wfOffRef.current, 0, 0, w, h);
    }

    // Grid lines. Over the heatmap the theme's own grid colour disappears,
    // so the furniture switches to a light wash that reads on either.
    ctx.strokeStyle = wfOn ? 'rgba(255, 255, 255, 0.12)' : specGrid;
    ctx.lineWidth = 0.5;
    const gridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000];
    for (const gf of gridFreqs) {
      if (gf < minF || gf > maxF) continue;
      const gx = freqToX(gf, w, minF, maxF);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
      ctx.fillStyle = wfOn ? 'rgba(226, 226, 240, 0.85)' : specGridLabel;
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatFreq(gf)}`, gx, h - 4);
    }

    // dB grid
    for (let db = -90; db <= -10; db += 10) {
      const gy = dbToY(db, h - 20, DB_FLOOR, DB_CEIL);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
      ctx.fillStyle = wfOn ? 'rgba(226, 226, 240, 0.7)' : specGridLabel;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${db}`, 2, gy - 2);
    }

    // Threshold line
    const threshY = dbToY(currentThreshold, h - 20, DB_FLOOR, DB_CEIL);
    ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${currentThreshold} dB`, w - 4, threshY - 4);

    // FFT data (only when audio is active)
    const analyser = getAnalyserNode();
    const actx = getAudioContext();
    if (analyser && actx) {
      const binCount = analyser.frequencyBinCount;
      const sampleRate = actx.sampleRate;
      const freqPerBin = sampleRate / (binCount * 2);

      if (!dataRef.current || dataRef.current.length !== binCount) {
        dataRef.current = new Float32Array(binCount);
        smoothDataRef.current = new Float32Array(binCount);
        peakHoldRef.current = new Float32Array(binCount).fill(DB_FLOOR);
      }

      analyser.getFloatFrequencyData(dataRef.current as Float32Array<ArrayBuffer>);

      const raw = dataRef.current;
      const smooth = smoothDataRef.current!;
      const peaks = peakHoldRef.current!;
      // AnalyserNode already applies temporal smoothing via
      // smoothingTimeConstant, so use its output directly. The threshold
      // line acts as a noise gate — anything below it is flattened to the
      // floor so only peaks above the line survive.
      for (let i = 0; i < binCount; i++) {
        let val = isFinite(raw[i]) ? raw[i] : DB_FLOOR;
        if (val < currentThreshold) val = DB_FLOOR;
        smooth[i] = val;
        if (smooth[i] > peaks[i]) {
          peaks[i] = smooth[i];
        } else {
          peaks[i] -= 0.3;
        }
      }

      // Feed the waterfall from the same gated data the curve is drawn from,
      // so the two always agree about what's above the noise floor.
      if (wfOn) {
        // `raw` rather than `smooth`: see the capture loop.
        wfUpdate({ smooth: raw, binCount, freqPerBin }, Math.round(w), Math.round(h),
          minF, maxF, store.waterfallSoftness, store.waterfallFloor);
      }

      // Draw spectrum fill
      ctx.beginPath();
      ctx.moveTo(0, h - 20);
      let firstPoint = true;
      for (let i = 1; i < binCount; i++) {
        const freq = i * freqPerBin;
        if (freq < minF || freq > maxF) continue;
        const x = freqToX(freq, w, minF, maxF);
        const y = dbToY(smooth[i], h - 20, DB_FLOOR, DB_CEIL);
        if (firstPoint) {
          ctx.moveTo(x, h - 20);
          ctx.lineTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(w, h - 20);
      ctx.closePath();

      // Thinner fill over the waterfall — at the opaque weight it works
      // against a flat panel it would bury the history underneath it.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, wfOn ? 'rgba(160, 200, 255, 0.20)' : 'rgba(59, 130, 246, 0.5)');
      grad.addColorStop(0.5, wfOn ? 'rgba(160, 200, 255, 0.08)' : 'rgba(59, 130, 246, 0.2)');
      grad.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw spectrum line
      ctx.beginPath();
      firstPoint = true;
      for (let i = 1; i < binCount; i++) {
        const freq = i * freqPerBin;
        if (freq < minF || freq > maxF) continue;
        const x = freqToX(freq, w, minF, maxF);
        const y = dbToY(smooth[i], h - 20, DB_FLOOR, DB_CEIL);
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = wfOn ? 'rgba(235, 245, 255, 0.95)' : 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Peak hold line
      ctx.beginPath();
      firstPoint = true;
      for (let i = 1; i < binCount; i++) {
        const freq = i * freqPerBin;
        if (freq < minF || freq > maxF) continue;
        const x = freqToX(freq, w, minF, maxF);
        const y = dbToY(peaks[i], h - 20, DB_FLOOR, DB_CEIL);
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // ── Isolation peak detection ────────────────────────────────────
      // Scan the *threshold-gated* smooth[] array for the strongest bin
      // inside each isolation's window. Because anything below the user's
      // threshold line was flattened to DB_FLOOR above, a silent room or
      // a quiet harmonic produces no peak at all (push null) instead of
      // a random noise-floor bin. This is what stops the strobe from
      // going beserk between strikes.
      const isoStore = useTunerStore.getState();
      const isosNow = isolationsRef.current;
      const PEAK_MIN_DB = currentThreshold; // explicit: gated by user line
      for (let k = 0; k < isosNow.length; k++) {
        const iso = isosNow[k];
        const i0 = Math.max(1, Math.floor(iso.minFreq / freqPerBin));
        const i1 = Math.min(binCount - 2, Math.ceil(iso.maxFreq / freqPerBin));
        let bestBin = -1;
        let bestVal = PEAK_MIN_DB; // ignore anything that didn't survive the gate
        for (let i = i0; i <= i1; i++) {
          // Local-max requirement avoids picking a sloped tail
          if (smooth[i] > bestVal && smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1]) {
            bestVal = smooth[i];
            bestBin = i;
          }
        }
        let newPeak: number | null = null;
        if (bestBin > 0) {
          // Parabolic interpolation in dB → sub-bin frequency
          const a = smooth[bestBin - 1];
          const b = smooth[bestBin];
          const c = smooth[bestBin + 1];
          const denom = a - 2 * b + c;
          const p = denom !== 0 ? 0.5 * (a - c) / denom : 0;
          newPeak = (bestBin + p) * freqPerBin;
        }
        // Only push when meaningfully changed (>0.3 Hz) or on null/non-null
        // flip, to avoid re-render churn every animation frame.
        const cur = iso.peakFreq;
        const flipped = (cur === null) !== (newPeak === null);
        const moved =
          cur !== null && newPeak !== null && Math.abs(newPeak - cur) > 0.3;
        if (flipped || moved) {
          isoStore.setIsolationPeak(iso.id, newPeak);
        }
      }
    } else {
      // Analyser not running — clear any stale peak so the bandlets show
      // "no peak in window" instead of locking onto whatever was last there.
      const isoStore = useTunerStore.getState();
      for (const iso of isolationsRef.current) {
        if (iso.peakFreq !== null) isoStore.setIsolationPeak(iso.id, null);
      }
    }

    // Band frequency markers
    for (const band of bands) {
      if (band.frequency < minF || band.frequency > maxF) continue;
      const bx = freqToX(band.frequency, w, minF, maxF);
      ctx.strokeStyle = 'rgba(0, 232, 120, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx, h - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${band.noteName}${band.octave}`, bx, 12);
    }

    // Isolation windows — draw each existing one, then the in-progress
    // pending bracket if the user is mid-drag. (Peak detection happens
    // earlier, inside the FFT block, so it can use threshold-gated data.)
    const drawIsoBracket = (
      isoMin: number,
      isoMax: number,
      opts: { label?: string; pending?: boolean; rgb: string; hex: string },
    ) => {
      const { rgb, hex } = opts;
      const lx = freqToX(Math.max(minF, isoMin), w, minF, maxF);
      const rx = freqToX(Math.min(maxF, isoMax), w, minF, maxF);
      ctx.fillStyle = opts.pending ? `rgba(${rgb}, 0.18)` : `rgba(${rgb}, 0.10)`;
      ctx.fillRect(lx, 0, rx - lx, h - 20);

      ctx.strokeStyle = opts.pending ? `rgba(${rgb}, 0.7)` : `rgba(${rgb}, 0.9)`;
      ctx.lineWidth = 2;
      if (opts.pending) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h - 20);
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx, h - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!opts.pending) {
        // Grab tabs near the bottom of each locator
        ctx.fillStyle = hex;
        const handleY = h - 26;
        ctx.fillRect(lx - 4, handleY, 8, 12);
        ctx.fillRect(rx - 4, handleY, 8, 12);
      }

      // Frequency labels at the top of each locator
      ctx.fillStyle = `rgba(${rgb}, 0.95)`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(isoMin)}`, lx, 10);
      ctx.fillText(`${Math.round(isoMax)}`, rx, 10);

      if (opts.label) {
        ctx.fillStyle = `rgba(${rgb}, 0.7)`;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(opts.label, (lx + rx) / 2, 10);
      }
    };

    for (let i = 0; i < isolationsRef.current.length; i++) {
      const iso = isolationsRef.current[i];
      const color = ISO_COLORS[iso.colorIndex] ?? ISO_COLORS[0];
      drawIsoBracket(iso.minFreq, iso.maxFreq, {
        label: isolationsRef.current.length > 1 ? `${i + 1}` : undefined,
        rgb: color.rgb,
        hex: color.hex,
      });
    }

    // In-progress drag rectangle — paints in the colour of the slot it will
    // claim on release (teal if the teal slot is free, otherwise purple).
    const pending = pendingIsoRef.current;
    if (pending) {
      const lo = Math.min(pending.startFreq, pending.currentFreq);
      const hi = Math.max(pending.startFreq, pending.currentFreq);
      const usedSlot = new Set(isolationsRef.current.map((i) => i.colorIndex));
      const pendingColor = usedSlot.has(0) ? ISO_COLORS[1] : ISO_COLORS[0];
      drawIsoBracket(lo, hi, { pending: true, rgb: pendingColor.rgb, hex: pendingColor.hex });
    }

    // Hover readout — vertical guide line + freq/note label that follows
    // the cursor while the mouse is inside the canvas. Shown when idle and
    // *also* while drawing or resizing an isolation bracket (handy for
    // dialling in a window edge against a note/cents), but not during a pan
    // or threshold-line drag.
    const hoverDrag = dragStateRef.current.type;
    const showHoverDuringDrag =
      hoverDrag === 'iso-create' ||
      hoverDrag === 'iso-resize-left' ||
      hoverDrag === 'iso-resize-right';
    const hover = hoverRef.current;
    if (hover && (!hoverDrag || showHoverDuringDrag)) {
      const hx = Math.max(0, Math.min(w, hover.x));
      const hoverFreq = xToFreq(hx, w, minF, maxF);
      if (hoverFreq >= MIN_FREQ && hoverFreq <= MAX_FREQ) {
        const note = frequencyToNote(hoverFreq, refFreq);
        const displayNote = getDisplayName(note.name, currentNaming);
        const centsRounded = Math.round(note.centsOff);
        const centsStr = centsRounded >= 0 ? `+${centsRounded}` : `${centsRounded}`;

        // Guide line (thin, dim, sits behind everything except the iso marks)
        ctx.strokeStyle = 'rgba(245, 245, 250, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx, h - 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label content
        const label1 = `${displayNote}${note.octave} ${centsStr}¢`;
        const label2 = `${hoverFreq.toFixed(1)} Hz`;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const tw1 = ctx.measureText(label1).width;
        ctx.font = '9px "JetBrains Mono", monospace';
        const tw2 = ctx.measureText(label2).width;
        const labelW = Math.max(tw1, tw2) + 10;
        const labelH = 28;
        // Flip the label to the other side of the guide line when we're
        // near the right edge so it never clips.
        const flip = hx + labelW + 6 > w;
        const labelX = flip ? hx - labelW - 6 : hx + 6;
        const labelY = 4;

        ctx.fillStyle = 'rgba(15, 15, 25, 0.88)';
        ctx.strokeStyle = 'rgba(245, 245, 250, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(245, 245, 250, 0.95)';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label1, labelX + labelW / 2, labelY + 11);
        ctx.fillStyle = 'rgba(180, 180, 200, 0.75)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(label2, labelX + labelW / 2, labelY + 22);
      }
    }

    if (wfOn && (!analyser || !actx)) {
      wfUpdate(null, Math.round(w), Math.round(h), minF, maxF,
        store.waterfallSoftness, store.waterfallFloor);
    }

    // Range info
    ctx.fillStyle = '#A1A1A1';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${formatFreq(minF)} Hz`, 4, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`${formatFreq(maxF)} Hz`, w - 4, 12);

    animRef.current = requestAnimationFrame(draw);
  }, [bands, wfUpdate]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  useEffect(() => {
    setAnalyserFftSize(fftSize);
  }, [fftSize]);

  // Someone (the Gu-port chip) asked us to look at a particular range.
  // Subscribed rather than read as state: the view range is ours to own —
  // a request only nudges it, and the user is free to pan/zoom away after.
  // Each request is a fresh object, so tapping the same chip twice re-frames
  // the view even when the numbers are identical.
  useEffect(() => {
    return useTunerStore.subscribe((state, prev) => {
      const req = state.spectrumZoom;
      if (!req || req === prev.spectrumZoom) return;
      setViewRange(clampViewRange(req.minFreq, req.maxFreq));
    });
  }, []);

  useEffect(() => {
    setAnalyserSmoothing(fftSmoothing);
  }, [fftSmoothing]);

  /** Hit-test: returns which isolation (and which side) is under x, if
   *  the pointer is within `tol` pixels of one of its locator lines. */
  const findIsoHandleAt = useCallback((x: number, w: number, tol = 12) => {
    const [minF, maxF] = viewRange;
    for (const iso of isolations) {
      const lx = freqToX(Math.max(minF, iso.minFreq), w, minF, maxF);
      const rx = freqToX(Math.min(maxF, iso.maxFreq), w, minF, maxF);
      const dL = Math.abs(x - lx);
      const dR = Math.abs(x - rx);
      if (dL <= tol && dL <= dR) return { iso, side: 'left' as const };
      if (dR <= tol) return { iso, side: 'right' as const };
    }
    return null;
  }, [viewRange, isolations]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const h = rect.height;
    const w = rect.width;

    // 1. Existing isolation handles (highest priority — most visually obvious)
    const hit = findIsoHandleAt(x, w);
    if (hit) {
      setDragState({
        type: hit.side === 'left' ? 'iso-resize-left' : 'iso-resize-right',
        startX: e.clientX,
        startY: e.clientY,
        startThreshold: threshold,
        startRange: viewRange,
        isoId: hit.iso.id,
        startIsoMin: hit.iso.minFreq,
        startIsoMax: hit.iso.maxFreq,
        startFreq: 0,
      });
      return;
    }

    // 2. Threshold line
    const threshY = dbToY(threshold, h - 20, DB_FLOOR, DB_CEIL);
    if (Math.abs(y - threshY) < 10) {
      setDragState({
        type: 'threshold',
        startX: e.clientX,
        startY: e.clientY,
        startThreshold: threshold,
        startRange: viewRange,
        isoId: null,
        startIsoMin: 0,
        startIsoMax: 0,
        startFreq: 0,
      });
      return;
    }

    // 3. Modifier decides: shift+drag = create iso, plain drag = pan.
    //    (Cap-aware: if we're already at MAX_ISOLATIONS, even shift falls
    //    back to pan so the user isn't stuck.)
    const [minF, maxF] = viewRange;
    const startFreq = xToFreq(x, w, minF, maxF);
    const wantIso = e.shiftKey && isolations.length < MAX_ISOLATIONS;
    setDragState({
      type: wantIso ? 'iso-create' : 'pan',
      startX: e.clientX,
      startY: e.clientY,
      startThreshold: threshold,
      startRange: viewRange,
      isoId: null,
      startIsoMin: 0,
      startIsoMax: 0,
      startFreq,
    });
    if (wantIso) {
      // Seed the pending bracket at zero width so it appears under the
      // cursor straight away; mouseMove fattens it up.
      setPendingIso({ startFreq, currentFreq: startFreq });
    }
  }, [viewRange, threshold, findIsoHandleAt, isolations.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Always update hover position so the readout label tracks the cursor.
    hoverRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    if (!dragState.type) return;

    const [minF, maxF] = viewRange;

    if (dragState.type === 'threshold') {
      const dy = e.clientY - dragState.startY;
      const dbRange = DB_CEIL - DB_FLOOR;
      const dbDelta = -(dy / (rect.height - 20)) * dbRange;
      setThreshold(Math.max(-90, Math.min(-10, Math.round(dragState.startThreshold + dbDelta))));
    } else if (dragState.type === 'iso-resize-left' || dragState.type === 'iso-resize-right') {
      const x = e.clientX - rect.left;
      const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
      const update = useTunerStore.getState().updateIsolationRange;
      if (!dragState.isoId) return;
      if (dragState.type === 'iso-resize-left') {
        // Keep min < max with a minimum 5 Hz window
        update(dragState.isoId, Math.min(newFreq, dragState.startIsoMax - 5), dragState.startIsoMax);
      } else {
        update(dragState.isoId, dragState.startIsoMin, Math.max(newFreq, dragState.startIsoMin + 5));
      }
    } else if (dragState.type === 'pan') {
      const dx = e.clientX - dragState.startX;
      if (Math.abs(dx) < 1) return;
      const [sMin, sMax] = dragState.startRange;
      const logMin = Math.log10(sMin);
      const logMax = Math.log10(sMax);
      const logSpan = logMax - logMin;
      const shift = -(dx / rect.width) * logSpan;
      let newLogMin = logMin + shift;
      let newLogMax = logMax + shift;
      // Clamp to the absolute bounds without changing the span (so panning
      // past the edge "sticks" instead of zooming).
      if (newLogMin < Math.log10(MIN_FREQ)) {
        newLogMax += Math.log10(MIN_FREQ) - newLogMin;
        newLogMin = Math.log10(MIN_FREQ);
      }
      if (newLogMax > Math.log10(MAX_FREQ)) {
        newLogMin -= newLogMax - Math.log10(MAX_FREQ);
        newLogMax = Math.log10(MAX_FREQ);
      }
      setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
    } else if (dragState.type === 'iso-create') {
      const x = e.clientX - rect.left;
      const currentFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
      setPendingIso((p) => (p ? { ...p, currentFreq } : { startFreq: dragState.startFreq, currentFreq }));
    }
  }, [dragState, viewRange]);

  const handleMouseUp = useCallback(() => {
    if (dragState.type === 'iso-create') {
      const p = pendingIsoRef.current;
      if (p) {
        const lo = Math.min(p.startFreq, p.currentFreq);
        const hi = Math.max(p.startFreq, p.currentFreq);
        // Reject pinprick drags (< 5 Hz wide) so a shift-click doesn't
        // create a useless one-bin window.
        if (hi - lo >= 5) {
          useTunerStore.getState().addIsolation(lo, hi);
        }
      }
      setPendingIso(null);
    }
    setDragState((s) => ({ ...s, type: null }));
  }, [dragState]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;

    // Right-click on an isolation handle removes that isolation.
    const hit = findIsoHandleAt(x, w, 14);
    if (hit) {
      useTunerStore.getState().removeIsolation(hit.iso.id);
    }
  }, [findIsoHandleAt]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const [minF, maxF] = viewRange;

    const centerFreq = xToFreq(mouseX, rect.width, minF, maxF);
    const logCenter = Math.log10(centerFreq);
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);
    const logSpan = logMax - logMin;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const newSpan = Math.max(MIN_LOG_SPAN, Math.min(MAX_LOG_SPAN, logSpan * zoomFactor));

    const ratio = (logCenter - logMin) / logSpan;
    let newLogMin = logCenter - ratio * newSpan;
    let newLogMax = logCenter + (1 - ratio) * newSpan;

    newLogMin = Math.max(Math.log10(MIN_FREQ), newLogMin);
    newLogMax = Math.min(Math.log10(MAX_FREQ), newLogMax);

    setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
  }, [viewRange]);

  // ── Pinch-to-zoom (mobile) ──────────────────────────────────────────
  const pinchRef = useRef<{ startDist: number; startRange: [number, number]; centerFreq: number } | null>(null);
  // Long-press timer — fires after TOUCH_HOLD_MS of a stationary single
  // finger to promote a pending touch from 'pan' to 'iso-create'.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const touchDistance = (touches: React.TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const [minF, maxF] = viewRange;

    if (e.touches.length === 2) {
      cancelLongPress();
      e.preventDefault();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      pinchRef.current = {
        startDist: touchDistance(e.touches),
        startRange: [minF, maxF],
        centerFreq: xToFreq(midX, rect.width, minF, maxF),
      };
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      // Iso handle resize wins
      const hit = findIsoHandleAt(x, w, 18);
      if (hit) {
        e.preventDefault();
        setDragState({
          type: hit.side === 'left' ? 'iso-resize-left' : 'iso-resize-right',
          startX: t.clientX,
          startY: t.clientY,
          startThreshold: threshold,
          startRange: viewRange,
          isoId: hit.iso.id,
          startIsoMin: hit.iso.minFreq,
          startIsoMax: hit.iso.maxFreq,
          startFreq: 0,
        });
        return;
      }

      // Threshold line — same hit zone as the mouse path. Wider on touch
      // (16px vs the mouse's 10px) since fingers are less precise.
      const threshY = dbToY(threshold, h - 20, DB_FLOOR, DB_CEIL);
      if (Math.abs(y - threshY) < 16) {
        e.preventDefault();
        setDragState({
          type: 'threshold',
          startX: t.clientX,
          startY: t.clientY,
          startThreshold: threshold,
          startRange: viewRange,
          isoId: null,
          startIsoMin: 0,
          startIsoMax: 0,
          startFreq: 0,
        });
        return;
      }

      // Empty area → start panning immediately. A long-press timer runs
      // in parallel: if the finger sits still long enough, we promote
      // pan→iso-create (touch-hold-then-drag gesture).
      const startFreq = xToFreq(x, w, minF, maxF);
      setDragState({
        type: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        startThreshold: threshold,
        startRange: viewRange,
        isoId: null,
        startIsoMin: 0,
        startIsoMax: 0,
        startFreq,
      });
      cancelLongPress();
      if (isolations.length < MAX_ISOLATIONS) {
        longPressTimerRef.current = setTimeout(() => {
          // Only promote if we're still in 'pan' (finger never moved much)
          // and the cap still has room.
          const ds = dragStateRef.current;
          if (ds.type !== 'pan') return;
          if (useTunerStore.getState().isolations.length >= MAX_ISOLATIONS) return;
          setPendingIso({ startFreq, currentFreq: startFreq });
          setDragState((s) => ({ ...s, type: 'iso-create' }));
        }, TOUCH_HOLD_MS);
      }
    }
  }, [viewRange, threshold, findIsoHandleAt, isolations.length]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 2-finger pinch (zoom) takes precedence
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = touchDistance(e.touches);
      if (dist <= 0) return;
      const ratioChange = pinchRef.current.startDist / dist;
      const [sMin, sMax] = pinchRef.current.startRange;
      const logMin = Math.log10(sMin);
      const logMax = Math.log10(sMax);
      const logSpan = logMax - logMin;
      const logCenter = Math.log10(pinchRef.current.centerFreq);
      const newSpan = Math.max(MIN_LOG_SPAN, Math.min(MAX_LOG_SPAN, logSpan * ratioChange));
      const centerRatio = (logCenter - logMin) / logSpan;
      let newLogMin = logCenter - centerRatio * newSpan;
      let newLogMax = logCenter + (1 - centerRatio) * newSpan;
      newLogMin = Math.max(Math.log10(MIN_FREQ), newLogMin);
      newLogMax = Math.min(Math.log10(MAX_FREQ), newLogMax);
      setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
      return;
    }

    // 1-finger drag
    if (e.touches.length === 1 && dragState.type) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const [minF, maxF] = viewRange;

      // Cancel the long-press as soon as the finger has moved enough.
      const moved = Math.abs(t.clientX - dragState.startX) + Math.abs(t.clientY - dragState.startY);
      if (moved > DRAG_THRESHOLD_PX) cancelLongPress();

      // Track the finger so the freq/note/cents readout follows the bracket
      // edge while drawing or resizing an isolation window on touch (it's
      // cleared on touch-end). Pan/threshold drags don't show the readout.
      if (
        dragState.type === 'iso-create' ||
        dragState.type === 'iso-resize-left' ||
        dragState.type === 'iso-resize-right'
      ) {
        hoverRef.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      }

      if (dragState.type === 'threshold') {
        e.preventDefault();
        const dy = t.clientY - dragState.startY;
        const dbRange = DB_CEIL - DB_FLOOR;
        const dbDelta = -(dy / (rect.height - 20)) * dbRange;
        setThreshold(Math.max(-90, Math.min(-10, Math.round(dragState.startThreshold + dbDelta))));
      } else if (dragState.type === 'iso-resize-left' || dragState.type === 'iso-resize-right') {
        e.preventDefault();
        const x = t.clientX - rect.left;
        const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
        const update = useTunerStore.getState().updateIsolationRange;
        if (!dragState.isoId) return;
        if (dragState.type === 'iso-resize-left') {
          update(dragState.isoId, Math.min(newFreq, dragState.startIsoMax - 5), dragState.startIsoMax);
        } else {
          update(dragState.isoId, dragState.startIsoMin, Math.max(newFreq, dragState.startIsoMin + 5));
        }
      } else if (dragState.type === 'pan') {
        e.preventDefault();
        const dx = t.clientX - dragState.startX;
        const [sMin, sMax] = dragState.startRange;
        const logMin = Math.log10(sMin);
        const logMax = Math.log10(sMax);
        const logSpan = logMax - logMin;
        const shift = -(dx / rect.width) * logSpan;
        let newLogMin = logMin + shift;
        let newLogMax = logMax + shift;
        if (newLogMin < Math.log10(MIN_FREQ)) {
          newLogMax += Math.log10(MIN_FREQ) - newLogMin;
          newLogMin = Math.log10(MIN_FREQ);
        }
        if (newLogMax > Math.log10(MAX_FREQ)) {
          newLogMin -= newLogMax - Math.log10(MAX_FREQ);
          newLogMax = Math.log10(MAX_FREQ);
        }
        setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
      } else if (dragState.type === 'iso-create') {
        e.preventDefault();
        const x = t.clientX - rect.left;
        const currentFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
        setPendingIso((p) => (p ? { ...p, currentFreq } : { startFreq: dragState.startFreq, currentFreq }));
      }
    }
  }, [dragState, viewRange]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) pinchRef.current = null;

    if (e.touches.length === 0) {
      cancelLongPress();
      if (dragState.type === 'iso-create') {
        const p = pendingIsoRef.current;
        if (p) {
          const lo = Math.min(p.startFreq, p.currentFreq);
          const hi = Math.max(p.startFreq, p.currentFreq);
          if (hi - lo >= 5) useTunerStore.getState().addIsolation(lo, hi);
        }
        setPendingIso(null);
      }
      setDragState((s) => ({ ...s, type: null }));
    }
  }, [dragState]);

  const handleDoubleClick = useCallback(() => {
    setViewRange([MIN_FREQ, MAX_FREQ]);
  }, []);

  const getCursor = () => {
    if (dragState.type === 'threshold') return 'ns-resize';
    if (dragState.type === 'iso-resize-left' || dragState.type === 'iso-resize-right') return 'ew-resize';
    if (dragState.type === 'iso-create') return 'crosshair';
    if (dragState.type === 'pan') return 'grabbing';
    return 'crosshair';
  };

  return (
    <div
      ref={rootRef}
      className="flex flex-col shrink-0"
      style={{ borderTop: '1px solid var(--border)' }}
      data-spectrum-analyser
    >
      {/* Drag to resize. Sits above the header so it's the panel's top edge —
          the analyser is anchored to the bottom of the column, so pulling up
          grows it into the space the strobe was using, which is the trade the
          user is actually making. */}
      <div
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the analyser"
        title="Drag to resize"
        className="w-full flex items-center justify-center shrink-0"
        style={{
          height: 11,
          cursor: 'ns-resize',
          touchAction: 'none',
          background: 'var(--bg-panel)',
        }}
      >
        <span
          style={{
            width: 34,
            height: 3,
            borderRadius: 2,
            background: dragHeight !== null ? 'var(--accent-blue)' : 'var(--text-dim)',
            opacity: dragHeight !== null ? 1 : 0.5,
          }}
        />
      </div>

      {/* Single-row header: title + inline smooth slider + clear-iso + close.
          Everything is text-[10px]/min-w-0 so it stays on one line at narrow
          widths instead of wrapping. */}
      <div
        // Wraps rather than squeezing: with three sliders and two buttons this
        // row doesn't fit a phone on one line, and shrinking them all to
        // nothing makes every one of them unusable instead of just stacking.
        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1 min-w-0"
        style={{ background: 'var(--bg-panel)' }}
      >
        <span
          className="text-[10px] font-medium whitespace-nowrap"
          style={{ color: 'var(--accent-blue)' }}
        >
          SPECTRUM ANALYSER
        </span>
        <label
          className="flex items-center gap-1.5 text-[9px] flex-1 min-w-[110px]"
          style={{ color: 'var(--text-dim)' }}
        >
          <span className="whitespace-nowrap">SMOOTH</span>
          <input
            type="range"
            min="0"
            max="0.99"
            step="0.01"
            value={fftSmoothing}
            onChange={(e) => useTunerStore.getState().setFftSmoothing(parseFloat(e.target.value))}
            className="flex-1 h-1 min-w-0"
            style={{ accentColor: 'var(--accent-blue)' }}
          />
          <span className="tabular-nums w-7 text-right" style={{ color: 'var(--text-secondary)' }}>
            {Math.round(fftSmoothing * 100)}%
          </span>
        </label>
        {waterfallOn && (
          <label
            className="flex items-center gap-1.5 text-[9px] shrink-0"
            style={{ color: 'var(--text-dim)' }}
            title="How quiet a partial may get before it goes black. Drag right to follow a decay further down."
          >
            <span className="whitespace-nowrap">TAIL</span>
            <input
              type="range"
              min="-115"
              max="-40"
              step="1"
              // direction:rtl does the inverting, so dragging right lowers
              // the floor and "more" reads as a longer tail. The value itself
              // stays in its own units — negating it here as well put it
              // outside the slider's range and pinned it to the end.
              value={waterfallFloor}
              onChange={(e) =>
                useTunerStore.getState().setWaterfallFloor(parseFloat(e.target.value))
              }
              className="w-12 h-1"
              style={{ accentColor: 'var(--accent-blue)', direction: 'rtl' }}
            />
            <span className="tabular-nums w-7 text-right" style={{ color: 'var(--text-secondary)' }}>
              {waterfallFloor}
            </span>
          </label>
        )}
        {waterfallOn && (
          <label
            className="flex items-center gap-1.5 text-[9px] shrink-0"
            style={{ color: 'var(--text-dim)' }}
            title="Blur the heatmap across frequency. Never across time — that would smear the decay."
          >
            <span className="whitespace-nowrap">SOFT</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={waterfallSoftness}
              onChange={(e) =>
                useTunerStore.getState().setWaterfallSoftness(parseFloat(e.target.value))
              }
              className="w-12 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
          </label>
        )}
        <button
            onClick={() => useTunerStore.getState().setShowWaterfall(!showWaterfall)}
            aria-pressed={showWaterfall}
            title={showWaterfall ? 'Hide the waterfall' : 'Show power over the last 10 seconds'}
            className="text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap shrink-0"
            style={{
              color: showWaterfall ? 'var(--accent-blue)' : 'var(--text-dim)',
              background: showWaterfall ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
            }}
          >
            WATERFALL
        </button>
        {isolations.length > 0 && (
          <button
            onClick={() => useTunerStore.getState().clearIsolations()}
            className="text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap shrink-0"
            style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.15)' }}
          >
            Clear iso
          </button>
        )}
        <button
          onClick={() => useTunerStore.getState().setShowSpectrum(false)}
          className="text-xs px-1.5 py-0.5 rounded shrink-0"
          style={{ color: 'var(--text-dim)', background: 'var(--bg-tertiary)' }}
          aria-label="Hide spectrum analyser"
        >
          ✕
        </button>
      </div>
      <canvas
        ref={canvasRef}
        data-tour="spectrum-canvas"
        className="w-full shrink-0"
        style={{ height: panelHeight, cursor: getCursor(), touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          hoverRef.current = null;
          setDragState((s) => ({ ...s, type: null }));
        }}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />
    </div>
  );
}
