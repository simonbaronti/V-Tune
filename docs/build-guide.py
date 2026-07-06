#!/usr/bin/env python3
"""
Build V-Tune User Guide → docs/V-Tune-User-Guide.pdf

Run from the repo root:
    python3 docs/build-guide.py

Requires reportlab (pip install reportlab). The PDF inherits V-Tune's
dark visual identity — black-ink page background, light text, cyan
accent headings, mono band labels — so it reads as a companion to the
app rather than a generic Word-style doc.
"""

from pathlib import Path

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    NextPageTemplate,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Flowable,
    KeepTogether,
)
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# ── Font registration ─────────────────────────────────────────────────
# Built-in PostScript Helvetica is Latin-1 only — no ♪ ♭ ♯ glyphs, which
# show up as solid black squares (the "boxed character" bug from the PDF
# skill notes). Register the macOS Helvetica TrueType collection for body
# text (broader Unicode coverage, same visual identity) and Apple Symbols
# as a fallback specifically for the musical-notation glyphs that
# Helvetica TTC still doesn't have (♭, ♯).
def _register_fonts():
    pdfmetrics.registerFont(TTFont(
        'V-Sans', '/System/Library/Fonts/Helvetica.ttc', subfontIndex=0))
    pdfmetrics.registerFont(TTFont(
        'V-Sans-Bold', '/System/Library/Fonts/Helvetica.ttc', subfontIndex=1))
    pdfmetrics.registerFont(TTFont(
        'V-Sans-Oblique', '/System/Library/Fonts/Helvetica.ttc', subfontIndex=2))
    pdfmetrics.registerFont(TTFont(
        'V-Sym', '/System/Library/Fonts/Apple Symbols.ttf'))


_register_fonts()

# Inline glyph wrappers — use these inside Paragraph markup whenever a
# musical accidental is needed, otherwise the body font drops to ▢.
SHARP = '<font name="V-Sym">♯</font>'
FLAT  = '<font name="V-Sym">♭</font>'
NOTE  = '<font name="V-Sym">♪</font>'


# ── V-Tune palette ────────────────────────────────────────────────────
BG          = HexColor('#08080c')   # canvas background
BG_PANEL    = HexColor('#101018')   # band background / cards
BORDER      = HexColor('#1e1e2a')   # hairlines
TEXT_PRI    = HexColor('#f5f5fa')   # primary copy
TEXT_SEC    = Color(1, 1, 1, alpha=0.65)  # secondary copy
TEXT_DIM    = Color(1, 1, 1, alpha=0.4)
CYAN        = HexColor('#06b6d4')   # selection / brand accent
CYAN_GLOW   = HexColor('#22d3ee')   # detected / beep
BLUE        = HexColor('#3b82f6')   # selected note
GREEN       = HexColor('#00e878')   # in-tune
YELLOW      = HexColor('#fbbf24')   # pitch pipe tone
RED         = HexColor('#ff3b3b')   # stop / out of tune
PURPLE      = HexColor('#a855f7')   # ding

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm


# ── Page background painter ───────────────────────────────────────────
def paint_background(canv: rl_canvas.Canvas, doc):
    """Paint the page dark + draw a slim cyan footer rule and pagination."""
    canv.saveState()
    canv.setFillColor(BG)
    canv.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Top hairline
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.3)
    canv.line(MARGIN, PAGE_H - 12 * mm, PAGE_W - MARGIN, PAGE_H - 12 * mm)

    # Header label (small, dim)
    canv.setFillColor(TEXT_DIM)
    canv.setFont('V-Sans', 7.5)
    canv.drawString(MARGIN, PAGE_H - 9 * mm, 'V-TUNE — USER GUIDE')
    canv.drawRightString(PAGE_W - MARGIN, PAGE_H - 9 * mm,
                         'Precision strobe tuner for handpans')

    # Bottom rule + page number
    canv.setStrokeColor(BORDER)
    canv.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canv.setFillColor(TEXT_DIM)
    canv.setFont('V-Sans', 8)
    canv.drawRightString(PAGE_W - MARGIN, 7 * mm, f'{doc.page}')
    canv.drawString(MARGIN, 7 * mm, 'v-tune-handpan.vercel.app')
    canv.restoreState()


def paint_cover(canv: rl_canvas.Canvas, doc):
    """Cover page — title block up top, a realistic 3-band strobe display
    as a hero visual filling the centre, footer clear at the bottom."""
    canv.saveState()
    canv.setFillColor(BG)
    canv.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # ── Top accent rule + title block ───────────────────────────────────
    canv.setStrokeColor(CYAN)
    canv.setLineWidth(0.6)
    canv.line(MARGIN, PAGE_H - 35 * mm, MARGIN + 18 * mm, PAGE_H - 35 * mm)

    canv.setFillColor(TEXT_PRI)
    canv.setFont('V-Sans-Bold', 56)
    canv.drawString(MARGIN, PAGE_H - 60 * mm, 'V-Tune')

    canv.setFillColor(CYAN)
    canv.setFont('V-Sans', 16)
    canv.drawString(MARGIN, PAGE_H - 70 * mm, 'User Guide')

    canv.setFillColor(TEXT_SEC)
    canv.setFont('V-Sans', 11)
    canv.drawString(MARGIN, PAGE_H - 80 * mm,
                    'A precision strobe tuner for handpans')
    canv.drawString(MARGIN, PAGE_H - 86 * mm,
                    'and other multi-modal instruments.')

    # ── Hero strobe display — fills the centre, mimics the real UI ───────
    # (note, frequency, multiplier, cents, colour)
    bands = [
        ('A4', '440.0 Hz', '3×', '+1', GREEN),
        ('A3', '220.0 Hz', '2×', '0',  GREEN),
        ('D3', '146.8 Hz', '1×', '−7', RED),
    ]
    band_w = PAGE_W - 2 * MARGIN
    band_h = 64
    gap = 8
    top = 486  # top edge (y) of the first band

    for i, (note, freq, mult, cents, c) in enumerate(bands):
        y = top - i * (band_h + gap)          # y = top edge of this band
        bottom = y - band_h

        # Panel background (rounded)
        canv.setFillColor(BG_PANEL)
        canv.roundRect(MARGIN, bottom, band_w, band_h, 6, fill=1, stroke=0)

        # Strobe bars, clipped to the band rect
        canv.saveState()
        clip = canv.beginPath()
        clip.rect(MARGIN, bottom, band_w, band_h)
        canv.clipPath(clip, stroke=0, fill=0)
        c.alpha = 0.9
        canv.setFillColor(c)
        bar_w = 18
        n = int(band_w // (bar_w * 2)) + 2
        offset = (i * 9) % (bar_w * 2)        # stagger each band
        for j in range(n):
            x = MARGIN + j * (bar_w * 2) - offset
            canv.rect(x, bottom + 5, bar_w, band_h - 10, fill=1, stroke=0)
        canv.restoreState()

        mid = bottom + band_h / 2

        # ♪ pipe icon (far left)
        canv.setFillColor(Color(1, 1, 1, alpha=0.85))
        canv.setFont('V-Sym', 20)
        canv.drawString(MARGIN + 14, mid - 7, '♪')

        # Note label
        canv.setFillColor(Color(1, 1, 1, alpha=0.96))
        canv.setFont('V-Sans-Bold', 26)
        canv.drawString(MARGIN + 46, mid - 4, note)

        # Frequency + multiplier under the note
        canv.setFillColor(Color(1, 1, 1, alpha=0.5))
        canv.setFont('V-Sans', 9)
        canv.drawString(MARGIN + 46, mid - 18, f'{freq} · {mult}')

        # Cents (far right)
        canv.setFillColor(Color(1, 1, 1, alpha=0.96))
        canv.setFont('V-Sans-Bold', 22)
        canv.drawRightString(MARGIN + band_w - 16, mid - 6, cents)

    # Caption beneath the hero
    stripe_bottom = top - (len(bands) - 1) * (band_h + gap) - band_h
    canv.setFillColor(TEXT_DIM)
    canv.setFont('V-Sans', 9)
    canv.drawString(MARGIN, stripe_bottom - 16,
                    'The three-band strobe display — still + green when locked, '
                    'drifting + red when out of tune.')

    # ── Footer (clear of the hero) ──────────────────────────────────────
    canv.setFillColor(TEXT_DIM)
    canv.setFont('V-Sans', 8)
    canv.drawString(MARGIN, 7 * mm, 'v-tune-handpan.vercel.app  ·  v1.0.1')
    canv.drawRightString(PAGE_W - MARGIN, 7 * mm,
                         'FFT peak detection + phase-rate Goertzel analysis')

    canv.restoreState()


# ── Styles ────────────────────────────────────────────────────────────
def make_styles():
    s = {}
    s['body'] = ParagraphStyle(
        name='body', fontName='V-Sans', fontSize=10.2, leading=14.5,
        textColor=TEXT_PRI, spaceBefore=0, spaceAfter=6,
    )
    s['body_secondary'] = ParagraphStyle(
        name='body_secondary', parent=s['body'],
        textColor=TEXT_SEC, fontSize=9.5, leading=13,
    )
    s['lead'] = ParagraphStyle(
        name='lead', parent=s['body'], fontSize=11.5, leading=16,
        textColor=TEXT_PRI, spaceAfter=10,
    )
    s['h1'] = ParagraphStyle(
        name='h1', fontName='V-Sans-Bold', fontSize=24, leading=28,
        textColor=TEXT_PRI, spaceBefore=4, spaceAfter=2,
        # Keep a section title glued to its subtitle (and onward) so it
        # never strands alone at the bottom of a page now that sections
        # flow continuously instead of each starting a fresh page.
        keepWithNext=1,
    )
    s['h1_sub'] = ParagraphStyle(
        name='h1_sub', fontName='V-Sans', fontSize=10, leading=14,
        textColor=CYAN, spaceBefore=0, spaceAfter=16,
        keepWithNext=1,
    )
    s['h2'] = ParagraphStyle(
        name='h2', fontName='V-Sans-Bold', fontSize=14, leading=18,
        textColor=CYAN, spaceBefore=14, spaceAfter=4,
        # Never strand a subsection heading at the bottom of a page — keep it
        # with the paragraph it introduces.
        keepWithNext=1,
    )
    s['h3'] = ParagraphStyle(
        name='h3', fontName='V-Sans-Bold', fontSize=11, leading=15,
        textColor=TEXT_PRI, spaceBefore=8, spaceAfter=2,
    )
    s['mono'] = ParagraphStyle(
        name='mono', fontName='Courier', fontSize=9.5, leading=13,
        textColor=TEXT_PRI,
    )
    s['caption'] = ParagraphStyle(
        name='caption', fontName='V-Sans-Oblique', fontSize=8.5,
        leading=11, textColor=TEXT_DIM, spaceAfter=6,
    )
    s['bullet'] = ParagraphStyle(
        name='bullet', parent=s['body'], leftIndent=14, bulletIndent=2,
        spaceAfter=4,
    )
    s['toc'] = ParagraphStyle(
        name='toc', fontName='V-Sans', fontSize=11, leading=20,
        textColor=TEXT_PRI,
    )
    return s


# ── Custom flowables ──────────────────────────────────────────────────
class StrobeBandMockup(Flowable):
    """A miniature illustration of a strobe band — used to show the user
    what they're looking at when the guide describes ♪ icon / cents /
    note label / strobe bars. Drawn directly on the PDF canvas."""

    def __init__(self, width, height, note='D3', freq='146.8 Hz',
                 cents='+2', tuned=True):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.note = note
        self.freq = freq
        self.cents = cents
        self.tuned = tuned

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        # band bg
        c.setFillColor(BG_PANEL)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        # strobe bars
        bar_color = GREEN if self.tuned else RED
        bar_color.alpha = 0.9
        c.setFillColor(bar_color)
        bar_w = 16
        n = int(w // (bar_w * 2))
        offset = 6
        for j in range(n + 2):
            x = j * (bar_w * 2) - offset
            c.rect(x, 4, bar_w, h - 8, fill=1, stroke=0)
        # ♪ icon (left)
        c.setFillColor(TEXT_PRI)
        c.setFillColorRGB(1, 1, 1, alpha=0.8)
        c.setFont('V-Sans', 22)
        c.drawCentredString(18, h / 2 - 6, '♪')
        # note label
        c.setFillColor(TEXT_PRI)
        c.setFont('V-Sans-Bold', 22)
        c.drawString(42, h / 2 - 4, self.note)
        # frequency
        c.setFillColorRGB(1, 1, 1, alpha=0.5)
        c.setFont('Courier', 9)
        c.drawString(42, h / 2 - 18, self.freq)
        # cents (right)
        c.setFillColor(TEXT_PRI if self.tuned else HexColor('#8888a0'))
        c.setFont('V-Sans-Bold', 20)
        c.drawRightString(w - 8, h / 2 - 6, self.cents)
        c.setFillColorRGB(0.27, 0.27, 0.35, alpha=1)
        c.setFont('Courier', 7)
        c.drawRightString(w - 8, h / 2 - 18, '0.3 Hz')
        # border
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.rect(0, 0, w, h, fill=0, stroke=1)


class ColorSwatch(Flowable):
    """A small filled square + label, for inline colour legends."""
    def __init__(self, color, label, w=82, h=12):
        Flowable.__init__(self)
        self.width = w
        self.height = h
        self.color = color
        self.label = label

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.rect(0, 1, 11, self.height - 2, fill=1, stroke=0)
        c.setFillColor(TEXT_PRI)
        c.setFont('V-Sans', 8.5)
        c.drawString(16, 2, self.label)


class HRule(Flowable):
    """Thin cyan rule used as a chapter divider."""
    def __init__(self, width, length=22, color=CYAN, thickness=0.8):
        Flowable.__init__(self)
        self.width = width
        self.length = length
        self.height = 6
        self.color = color
        self.thickness = thickness

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        c.line(0, 2, self.length, 2)


# ── Content helpers ───────────────────────────────────────────────────
def para(text, style):
    return Paragraph(text, style)


def bullets(items, styles):
    return [
        Paragraph(f'<font color="#06b6d4">•</font>&nbsp;&nbsp;{t}',
                  styles['bullet'])
        for t in items
    ]


def feature_row(name, desc, styles):
    """Two-column row used in settings tables: label on the left in
    mono-ish, description on the right in body."""
    return [
        Paragraph(f'<b>{name}</b>', styles['body']),
        Paragraph(desc, styles['body_secondary']),
    ]


def settings_table(rows, styles, col_widths=(45 * mm, 110 * mm)):
    data = [feature_row(name, desc, styles) for name, desc in rows]
    t = Table(data, colWidths=list(col_widths), hAlign='LEFT')
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, -1), BG_PANEL),
    ]))
    return t


# ── Build the document ────────────────────────────────────────────────
def build(out_path: Path):
    doc = BaseDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title='V-Tune User Guide',
        author='V-Tune',
        subject='V-Tune User Guide',
    )

    body_frame = Frame(
        MARGIN, 14 * mm,
        PAGE_W - 2 * MARGIN, PAGE_H - 34 * mm,
        leftPadding=0, rightPadding=0, topPadding=4, bottomPadding=0,
        id='body',
    )

    doc.addPageTemplates([
        PageTemplate(id='cover', frames=[body_frame], onPage=paint_cover),
        PageTemplate(id='content', frames=[body_frame],
                     onPage=paint_background),
    ])

    s = make_styles()
    story = []

    # ── Cover (blank flowables — the cover graphic is drawn in onPage) ─
    # Explicitly switch the page template to 'content' BEFORE the
    # PageBreak — without this, every subsequent page reuses the cover
    # template and the cover graphics bleed through behind the body.
    story.append(NextPageTemplate('content'))
    story.append(PageBreak())

    # ── Page 2: Contents ──────────────────────────────────────────────
    story.append(Paragraph('Contents', s['h1']))
    story.append(HRule(50, length=36))
    story.append(Spacer(1, 16))

    toc = [
        ('1.  Welcome', 'What V-Tune is and who it’s for'),
        ('2.  Quick start', 'Strike a note. Watch it lock in. Done.'),
        ('3.  The menu & utility bar', 'The slide-out menu, teal icons, auto-hide'),
        ('4.  The strobe display', 'Bands, bars, colours, cents readout'),
        ('5.  The pitch pipe (♪)', 'Per-band reference tones, three click states'),
        ('6.  The tuning & scale controls', 'Chromatic and scale modes, PURE vs EQUAL'),
        ('7.  Mobile quick-pick panel', 'The slide-up controls on phones / tablets'),
        ('8.  Spectrum Analyser + ISO', 'See the full spectrum, isolate frequencies'),
        ('9.  Settings', 'Every knob, what it does'),
        ('10. Stopwatch', 'Time your tuning sessions'),
        ('11. Theme, notation, tour', f'Light/dark, {SHARP}/{FLAT}/Do/DE, re-run onboarding'),
        ('12. Tips & troubleshooting', 'Things to try if something feels off'),
    ]
    for left, right in toc:
        row = Table(
            [[Paragraph(left, s['toc']),
              Paragraph(f'<font color="#a8a8b8">{right}</font>', s['toc'])]],
            colWidths=[60 * mm, 100 * mm], hAlign='LEFT',
        )
        row.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        story.append(row)

    story.append(PageBreak())

    # ── 1. Welcome ────────────────────────────────────────────────────
    story.append(Paragraph('1. Welcome', s['h1']))
    story.append(Paragraph('What V-Tune is and why it exists', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'V-Tune is a precision strobe tuner built for handpans and other '
        'multi-modal instruments — drums, gongs, bells, anything where a '
        'single strike excites several pitches at once. Most chromatic '
        'tuners give up on these instruments because they’re built around '
        'one fundamental. V-Tune is built around three: a fundamental, an '
        'octave, and an octave-plus-fifth (the 12th), all rendered as '
        'independent strobe bands so you can read every partial without '
        'them fighting each other.',
        s['lead'],
    ))

    story.append(Paragraph(
        'Under the hood, V-Tune uses FFT peak detection plus phase-rate '
        'Goertzel analysis — the FFT tells you which frequencies are loud, '
        'the Goertzel measures how stable each one is, frame to frame. '
        'You see the result as classic strobe-pattern bars: motion = drift, '
        'still = locked.',
        s['body'],
    ))

    story.append(Paragraph(
        'This guide walks through every part of the app. It’s short — '
        'V-Tune is a small tool, and the parts that exist exist for a '
        'reason. Read it once, then keep tuning.',
        s['body_secondary'],
    ))

    story.append(Spacer(1, 40))

    # ── 2. Quick start ────────────────────────────────────────────────
    story.append(Paragraph('2. Quick start', s['h1']))
    story.append(Paragraph('From cold app to tuned note in about a minute', s['h1_sub']))
    story.append(HRule(50, length=36))

    qs = [
        ('Grant microphone access', 'On first launch V-Tune asks for the mic. Allow it. You can change device later in Settings → Input (open Settings with the ⚙ gear in the teal icon bar).'),
        ('Pick a note', 'The menu loads open. In the <font color="#22d3ee">Tuning / Scale</font> controls pick a scale from the <font color="#22d3ee">SCALE</font> dropdown and tap a note, or stay on Chromatic and use <font color="#22d3ee">OCT −</font> / <font color="#22d3ee">OCT +</font> to set the octave. The three foundation strobe bands (1×, 2×, 3×) update instantly.'),
        ('Press <font color="#00e878">Let’s Go</font>', 'The green button lives at the bottom of the menu (or the bottom of the mobile slide-up). Audio starts. Strike your instrument. The bars freeze when you’re in tune; they drift <i>left</i> when you’re flat, <i>right</i> when you’re sharp.'),
        ('Read the cents number on the right of each band', 'It reads 0 (and the band washes green) when you’re in tune, within ±5¢ by default. The signed number is exactly how many cents off you are.'),
    ]
    for i, (head, txt) in enumerate(qs, 1):
        story.append(Paragraph(f'<b><font color="#06b6d4">{i}.</font>  {head}</b>',
                               s['h3']))
        story.append(Paragraph(txt, s['body']))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 14))
    story.append(Paragraph('Sample strobe band — in tune', s['caption']))
    story.append(StrobeBandMockup(PAGE_W - 2 * MARGIN, 70,
                                   note='D3', freq='146.8 Hz',
                                   cents='+2', tuned=True))

    story.append(PageBreak())

    # ── 3. The menu & utility bar ─────────────────────────────────────
    story.append(Paragraph('3. The menu & utility bar', s['h1']))
    story.append(Paragraph('Where every control lives — and how it gets out of your way', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'All of V-Tune’s controls live in one place: the <b>menu</b>. It '
        'looks different on a wide screen versus a phone, but the contents '
        'are the same — a teal utility bar up top, the tuning / scale '
        'controls, and <font color="#00e878">Let’s Go</font> pinned to the '
        'bottom.',
        s['body'],
    ))

    story.append(Paragraph('On desktop & landscape tablet', s['h2']))
    story.append(Paragraph(
        'A full-height panel slides out from the <b>right</b> edge. Open and '
        'close it with the <b>burger button</b> (three lines in a rounded '
        'square) at the top-right of the header. The menu always loads '
        '<b>open</b> on launch so everything is to hand.',
        s['body'],
    ))
    story.append(Paragraph(
        'To give the strobe more room while you tune, the menu '
        '<b>auto-hides after 20 seconds</b> of no interaction with it. Any '
        'tap, drag or scroll inside the menu resets the timer. If you want '
        'it to stay put, hit the <b>pin</b> — that disables auto-hide until '
        'you unpin.',
        s['body'],
    ))
    story.append(Paragraph(
        'If the menu hides while a stopwatch session is running, a compact '
        'stopwatch readout appears in the header next to the burger, so your '
        'timing stays visible. Tap it to reopen the menu.',
        s['body_secondary'],
    ))

    story.append(Paragraph('On phone & portrait tablet', s['h2']))
    story.append(Paragraph(
        'There’s no burger or side panel. Instead the controls live in a '
        'bottom <b>quick-pick</b> panel that slides up. Collapsed, it’s a '
        'single bar with a soft <font color="#a855f7">purple glow</font> '
        'showing the currently-selected note (e.g. “D3”), centred. Tap it to '
        'slide the panel up — this pushes the canvas up, which shrinks '
        'responsively to make room. It also auto-hides after 20 seconds of '
        'no interaction, and has its own pin to keep it open. Full details '
        'in section 7.',
        s['body'],
    ))

    story.append(Paragraph('The teal utility bar', s['h2']))
    story.append(Paragraph(
        'A slim teal-tinted row of icon buttons sits at the top of the menu '
        '(and inside the mobile slide-up). The left group, in order:',
        s['body'],
    ))
    story += bullets([
        '<b>⚙ Settings</b> — opens the Settings modal (section 9).',
        '<b>⏱ Stopwatch</b> — reveals or hides the stopwatch (section 10).',
        '<b>Spectrum Analyser</b> (equaliser-bars icon) — reveals or hides '
        'the Spectrum Analyser (section 8).',
    ], s)
    story.append(Paragraph(
        'On the right sits the <b>light / dark theme toggle</b> (sun / moon). '
        'On mobile the <b>pin</b> icon also lives on the right, just left of '
        'the theme toggle. Any active toggle — stopwatch on, spectrum on, '
        'pinned — gets a teal highlight so you can see its state at a glance.',
        s['body'],
    ))

    story.append(PageBreak())

    # ── 4. The strobe display ─────────────────────────────────────────
    story.append(Paragraph('4. The strobe display', s['h1']))
    story.append(Paragraph('Where you actually read the tune', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'The strobe display is the centre of V-Tune. Each horizontal stripe '
        'is one <b>band</b> — a frequency the app is tracking. By default '
        'you get three foundation bands stacked top-to-bottom:',
        s['body'],
    ))
    story.append(Paragraph(
        'The display is <b>theme-aware</b>. At rest — when the mic is quiet — '
        'the background is a light grey in light mode, or a soft charcoal '
        '(not pure black) in dark mode. The moment the mic picks up signal, '
        'the background darkens toward a deep near-black for maximum bar '
        'contrast, then eases back to its resting tone when you stop. The '
        'neutral text (note names, cents) flips light or dark to stay legible '
        'against whichever background is showing.',
        s['body'],
    ))
    story += bullets([
        '<b>3×</b> — the 12th (octave + fifth). Top of the stack.',
        '<b>2×</b> — the octave.',
        '<b>1×</b> — the fundamental. Bottom of the stack.',
    ], s)
    story.append(Paragraph(
        'A thicker cyan separator marks the boundary between foundation '
        'bands and any custom bands you add (via the Spectrum Analyser).',
        s['body_secondary'],
    ))

    story.append(Paragraph('Reading a band', s['h2']))
    story.append(Paragraph(
        'Each band shows you five things at a glance:',
        s['body'],
    ))
    story += bullets([
        '<b>♪ icon (far left)</b> — the per-band pitch pipe. See section 5.',
        '<b>Note label</b> — e.g. “D3”. The note this band is tuned to.',
        '<b>Frequency</b> — the exact target in Hz, under the note label.',
        '<b>Strobe bars</b> — the moving red/green pattern. Motion direction tells you sharp vs flat.',
        '<b>Cents readout (far right)</b> — the deviation in cents, signed. Reads 0 (and the band washes green) when in tune.',
    ], s)

    story.append(Paragraph('Colours, and what they mean', s['h2']))
    swatch_table = Table(
        [
            [ColorSwatch(GREEN, 'In tune  (within ±5¢)'),
             ColorSwatch(RED, 'Out of tune')],
            [ColorSwatch(CYAN, 'Selected band'),
             ColorSwatch(YELLOW, '♪ Pipe — continuous tone')],
            [ColorSwatch(CYAN_GLOW, '♪ Pipe — beep mode / detected note'),
             ColorSwatch(PURPLE, 'Scale "ding" highlight')],
        ],
        colWidths=[78 * mm, 78 * mm], hAlign='LEFT',
    )
    swatch_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(swatch_table)

    story.append(Paragraph('Motion = drift', s['h2']))
    story.append(Paragraph(
        '<b>Bars moving left</b> → your input is <i>flat</i> (pitch too low). '
        'Tune up. <b>Bars moving right</b> → your input is <i>sharp</i> '
        '(pitch too high). Tune down. <b>Bars holding still</b> → you’re '
        'locked. When a band is in tune it gets a <font color="#00e878">dark-'
        'green wash</font> and its cents readout settles on 0.',
        s['body'],
    ))
    story.append(Paragraph(
        'The bars are green in tune and red out of tune, and their '
        '<i>blur</i> tracks how far off you are: crisp and sharp when locked, '
        'blurring more the further out of tune you drift (and during the '
        'unstable attack transient of a fresh strike). Settings → Blur sets '
        'the ceiling on that softness.',
        s['body_secondary'],
    ))

    story.append(Paragraph('Peak hold + decay', s['h2']))
    story.append(Paragraph(
        'V-Tune holds the strobe pattern for ~4 seconds after each strike, '
        'then fades it out over a second. This means you can let the note '
        'die away and still read the tune from the held pattern — no need '
        'to keep re-striking. A louder hit resets the hold timer.',
        s['body'],
    ))

    story.append(PageBreak())

    # ── 5. Pitch pipe ─────────────────────────────────────────────────
    story.append(Paragraph('5. The pitch pipe (♪)', s['h1']))
    story.append(Paragraph('A reference tone for every band, three clicks deep', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Each strobe band has a <font color="#ffffff">♪</font> icon on its '
        'left edge. Click it to hear the band’s exact target frequency. '
        'Click again to cycle modes:',
        s['body'],
    ))

    pipe_states = [
        ('Off', 'rgba(255,255,255,0.8)', 'Silent. The default state.'),
        ('Tone', '#fbbf24',
         'Continuous sine reference. Plays the band’s frequency forever '
         '(until you click again). Useful for hum-along tuning.'),
        ('Beep', '#22d3ee',
         'Silent <i>until</i> the band detects a strike — then it fires a '
         'brief reference beep at the target frequency. So as you tune '
         'each strike triggers a comparison tone you can match against. '
         'This is the LinoTune-style mode.'),
    ]
    pipe_rows = []
    for label, hex_color, desc in pipe_states:
        # Build a colored ♪ glyph inline
        glyph = f'<font name="V-Sans-Bold" size="18" color="{hex_color}">♪</font>'
        pipe_rows.append([
            Paragraph(glyph, s['body']),
            Paragraph(f'<b>{label}</b>', s['body']),
            Paragraph(desc, s['body_secondary']),
        ])
    pipe_table = Table(pipe_rows,
                       colWidths=[16 * mm, 22 * mm, 122 * mm],
                       hAlign='LEFT')
    pipe_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, -1), BG_PANEL),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
    ]))
    story.append(pipe_table)

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        '<b>Clicking the ♪ icon on a different band</b> moves the pipe to '
        'that band — same mode, new frequency. Only one band can be piping '
        'at a time. To stop completely, click the active band’s ♪ until '
        'it cycles back to Off.',
        s['body'],
    ))

    story.append(Spacer(1, 40))

    # ── 6. The tuning & scale controls ────────────────────────────────
    story.append(Paragraph('6. The tuning & scale controls', s['h1']))
    story.append(Paragraph('Where you tell V-Tune which note to listen for', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'On desktop the tuning and scale controls sit directly in the menu, '
        'below the teal bar. On phones and portrait tablets they split: the '
        'scale picker, note grid and <font color="#00e878">Let’s Go</font> '
        'live in the slide-up quick-pick panel (section 7), while Reference '
        'A4 and Tolerance move into Settings → Tuning. Either way the picker '
        'has two modes:',
        s['body'],
    ))

    story.append(Paragraph('AUTO', s['h2']))
    story.append(Paragraph(
        'Tap <b>AUTO</b> to let V-Tune auto-detect whichever note you play, '
        'rather than pinning it to a note you’ve chosen. Handy when you’re '
        'sweeping across an instrument and don’t want to keep re-selecting.',
        s['body'],
    ))

    story.append(Paragraph('Chromatic mode', s['h2']))
    story.append(Paragraph(
        'A piano-keyboard layout — 7 naturals + 5 sharps. Tap any key to '
        'tune to that note in the current octave. Use the <b>OCT −</b> / '
        '<b>OCT +</b> buttons below to drop or raise the octave. This is '
        'the default mode on launch.',
        s['body'],
    ))

    story.append(Paragraph('Scale mode', s['h2']))
    story.append(Paragraph(
        'Pick a pre-saved handpan scale (Kurd, Amara, Celtic, etc.) from '
        'the <b>SCALE</b> dropdown above the keyboard. The note picker '
        'switches from a chromatic keyboard to just the notes in that '
        'scale, each with a fixed octave matching the physical instrument. '
        'The <font color="#a855f7">ding</font> (root) is highlighted in '
        'purple. Switching scales auto-selects the ding.',
        s['body'],
    ))
    story.append(Paragraph(
        'Note naming: in scale mode the accidentals follow the scale’s '
        'convention (Kurd uses flats, Amara uses sharps). In chromatic '
        'mode they follow your <i>Settings → Notation</i> preference.',
        s['body_secondary'],
    ))

    story.append(Paragraph('Live note indicator', s['h2']))
    story.append(Paragraph(
        'While audio is running, the note V-Tune is currently picking up '
        'from the microphone gets a soft cyan glow ring around its button. '
        'This is purely informational — it doesn’t change which note you’re '
        'tuning against. Useful for quickly orienting yourself when you '
        'strike an unfamiliar partial.',
        s['body'],
    ))

    story.append(Paragraph('Tuning reference — PURE vs EQUAL', s['h2']))
    story.append(Paragraph(
        'Above the note layout is a <b>PURE / EQUAL</b> toggle that decides '
        'what the three foundation bands are measured against:',
        s['body'],
    ))
    story += bullets([
        '<b>PURE</b> (default) references each band against an exact integer '
        'multiple of the fundamental — 1×, 2×, 3×. A handpan whose partials '
        'are tuned to those pure ratios reads <b>0 on every band</b>. This '
        'is the acoustically correct reference for handpan partial tuning.',
        '<b>EQUAL</b> references each band against the nearest equal-tempered '
        'note instead. On a pure handpan the compound-fifth (3×) band then '
        'reads about <b>+2 cents</b> — the real, constant difference between '
        'a pure 3:1 fifth and a tempered fifth. Use this if you tune your '
        'partials to equal temperament.',
    ], s)
    story.append(Paragraph(
        'The octave (2×) band reads the same either way — octaves are an '
        'exact 2:1 in both systems. Only the compound fifth differs.',
        s['body_secondary'],
    ))

    story.append(Paragraph('Reference A4, Tolerance & Let’s Go', s['h2']))
    story.append(Paragraph(
        '<b>Reference A4</b> sets concert pitch (default 440 Hz) and '
        '<b>Tolerance</b> sets how close counts as in tune (default ±5 '
        'cents). On desktop these sit in the menu alongside the picker; on '
        'mobile they move into Settings → Tuning. <font color="#00e878">Let’s '
        'Go</font> — which starts and stops audio — is pinned to the '
        '<b>bottom</b> of the menu on desktop, and the bottom of the slide-up '
        'on mobile.',
        s['body'],
    ))

    story.append(Spacer(1, 40))

    # ── 7. Mobile quick-pick panel ────────────────────────────────────
    story.append(Paragraph('7. Mobile quick-pick panel', s['h1']))
    story.append(Paragraph('The controls, condensed for thumbs', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'On phones and portrait tablets there’s no burger or side panel. The '
        'controls live in a bottom <b>quick-pick</b> panel that slides up. '
        'Collapsed, it’s a single bar with a soft <font color="#a855f7">'
        'purple glow</font> showing the currently-selected note (e.g. “D3”), '
        'centred. Tap the bar to slide the panel up — this pushes the canvas '
        'up, which shrinks responsively to make room.',
        s['body'],
    ))
    story.append(Paragraph(
        'Opened, it carries the same teal utility bar (settings, stopwatch, '
        'spectrum, pin, theme) and the scale / note controls:',
        s['body'],
    ))
    story += bullets([
        '<b>SCALE</b> dropdown — same scales as desktop, above the note grid.',
        '<b>Chromatic / Scale note grid</b> — a responsive grid of notes, '
        'each labelled with its octave; OCT −/+ in chromatic mode.',
        '<b>Let’s Go</b> — pinned to the bottom of the slide-up.',
    ], s)
    story.append(Paragraph(
        'Like the desktop menu, the slide-up <b>auto-hides after 20 seconds</b> '
        'of no interaction so the strobe gets full width, and it has its own '
        '<b>pin</b> (in the teal bar) to keep it open. When it re-collapses '
        'it just shows the selected note, centred, ready to tap again. '
        'Reference A4 and Tolerance live in Settings → Tuning on mobile.',
        s['body_secondary'],
    ))

    story.append(Spacer(1, 40))

    # ── 8. Spectrum Analyser + ISO ────────────────────────────────────
    story.append(Paragraph('8. Spectrum Analyser & Isolation windows', s['h1']))
    story.append(Paragraph('See the full frequency content, then isolate the bits you care about', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Toggle the <b>Spectrum Analyser</b> with its icon (equaliser bars) '
        'in the teal utility bar. It appears under the strobes as a '
        'frequency-domain view across the audible range — a real-time '
        'picture of every harmonic your instrument is producing, with two '
        'isolation strobe bands beneath it for fine-tuning partials.',
        s['body'],
    ))
    story.append(Paragraph(
        'Turning the Spectrum Analyser <b>on always restores the two default '
        'isolation windows</b> — the teal and purple ones — every time, even '
        'if you previously cleared them. So it’s never revealed empty.',
        s['body'],
    ))

    story.append(Paragraph('Isolation windows (ISO)', s['h2']))
    story.append(Paragraph(
        'V-Tune starts with <b>two isolation windows</b> ready to go — a '
        '<font color="#06b6d4">teal</font> one and a '
        '<font color="#a855f7">purple</font> one. Each is a bracket on the '
        'spectrum; V-Tune finds the <i>loudest peak inside the bracket</i> '
        'and drives a dedicated strobe band from it, shown beneath the '
        'spectrum. The band carries the same colour as its bracket, so it’s '
        'always clear which window feeds which band.',
        s['body'],
    ))
    story.append(Paragraph(
        'Drag either end of a bracket to move it; the frequency / note / '
        'cents readout follows so you can line an edge up against a note. '
        'This is how you tune partials that aren’t the fundamental, octave '
        'or 12th — say, a particular overtone. Remove a window with its '
        '× button, and draw a new one any time with <b>Shift + drag</b> '
        '(or touch-hold then drag on mobile) across the spectrum; you can '
        'have up to two at once, splitting the band area 50/50. A re-added '
        'window reclaims the freed colour slot.',
        s['body'],
    ))

    story.append(Spacer(1, 40))

    # ── 9. Settings ───────────────────────────────────────────────────
    story.append(Paragraph('9. Settings', s['h1']))
    story.append(Paragraph('Every knob, what it does', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Settings is a <b>modal</b>, opened by the ⚙ gear in the teal '
        'utility bar. It’s organised into labelled teal-header sections, each '
        'laid out in two columns — the setting’s name and a short description '
        'on the left, its control on the right.',
        s['body'],
    ))

    story.append(Paragraph('Input', s['h2']))
    story.append(settings_table([
        ('Microphone',
         'Which audio input device V-Tune listens to. Default uses the system mic.'),
        ('Microphone Sensitivity',
         'Input gain in dB (MIC +/−). Bump it up if your input is quiet, drop it if you’re clipping.'),
        ('Hum',
         'Mains-hum notch filter: Off / 50 Hz (UK/EU) / 60 Hz (US). Notches out mains hum plus its harmonics.'),
    ], s))

    story.append(Paragraph('Tuning (mobile only)', s['h2']))
    story.append(Paragraph(
        'On phones and portrait tablets, Reference A4 and Tolerance live '
        'here. On desktop these controls sit directly in the menu instead, '
        'so this section only appears on mobile.',
        s['body_secondary'],
    ))
    story.append(settings_table([
        ('Reference A4',
         'Concert pitch. Default 440 Hz. Set to 442 for some orchestral work, 432 if you’re into that.'),
        ('Tolerance (±cents)',
         'How close you have to be before V-Tune calls you in tune. Default is ±5 cents.'),
    ], s))

    story.append(Paragraph('Strobe Preferences', s['h2']))
    story.append(settings_table([
        ('Brightness',
         'How vivid the red/green strobe bars are. Lower for ambient lighting, higher for stage / sunlight.'),
        ('Blur',
         'Edge softness of the bars — sharp when locked, automatically softer when way out of tune. This sets the ceiling on that softness.'),
        ('Speed',
         'How fast the strobe reacts: 0.5× / 1× / 2× / 3× / 5×. Higher = livelier, lower = calmer / easier to read.'),
    ], s))

    story.append(Paragraph('Accessibility Options', s['h2']))
    story.append(settings_table([
        ('High contrast',
         'Boosts contrast throughout the UI for easier reading.'),
        ('Larger text',
         'Scales up the interface text.'),
        ('Show tour again',
         'Re-runs the interactive onboarding tour from the start (section 11).'),
    ], s))

    story.append(Spacer(1, 40))

    # ── 10. Stopwatch ─────────────────────────────────────────────────
    story.append(Paragraph('10. Stopwatch', s['h1']))
    story.append(Paragraph('Time your tuning sessions', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Toggle the <b>stopwatch</b> on and off with the ⏱ icon in the teal '
        'utility bar. When on, its panel appears pinned at the <b>bottom</b> '
        'of the menu, just above <font color="#00e878">Let’s Go</font> (on '
        'mobile, just above the slide-up). Start, stop and reset controls sit '
        'on the panel. It counts continuously even if you toggle the panel '
        'off and back on.',
        s['body'],
    ))

    story.append(Paragraph(
        'On desktop, if the menu auto-hides while a session is running, a '
        'compact stopwatch readout appears in the header next to the burger '
        'so your timing stays visible. Tap it to reopen the menu.',
        s['body_secondary'],
    ))

    story.append(Spacer(1, 40))

    # ── 11. Theme / notation / tour ───────────────────────────────────
    story.append(Paragraph('11. Theme, notation, and the onboarding tour', s['h1']))
    story.append(Paragraph('A few preferences worth knowing about', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph('Light / dark theme', s['h2']))
    story.append(Paragraph(
        'Flip between light and dark with the sun / moon icon on the right of '
        'the teal utility bar. Fresh installs default to <b>light</b> mode; '
        'switch to dark whenever you prefer. The strobe display follows the '
        'theme too — see section 4.',
        s['body'],
    ))

    story.append(Paragraph('Notation', s['h2']))
    story.append(Paragraph(
        'Pick how accidentals are labelled in <b>Settings → Notation</b>: '
        f'<b>{SHARP}</b> sharps, <b>{FLAT}</b> flats, <b>Do</b> solfège, '
        f'or <b>DE</b> German naming (which uses H for B and B for B{FLAT}).',
        s['body'],
    ))

    story.append(Paragraph('The onboarding tour', s['h2']))
    story.append(Paragraph(
        'V-Tune ships with an interactive, learn-by-doing tour. It spotlights '
        'each part of the UI and <i>waits for you to actually perform the '
        'action</i> before moving on — open the menu, open Settings and walk '
        'its sections, reveal the stopwatch and the Spectrum Analyser, pin '
        'the menu, pick a scale, then <font color="#00e878">Let’s Go</font>. '
        'It runs automatically on first launch.',
        s['body'],
    ))
    story.append(Paragraph(
        'Want it again? Open Settings and hit <b>Show tour again</b> under '
        'Accessibility Options — it restarts the whole guided tour from the '
        'top, any time.',
        s['body_secondary'],
    ))

    story.append(Paragraph('Staying up to date (desktop)', s['h2']))
    story.append(Paragraph(
        'The macOS, Windows and Linux apps update themselves. When a newer '
        'version is published, V-Tune notices on launch and offers a '
        'one-click <b>Install &amp; Restart</b> — no need to redownload or '
        'reinstall. (iOS and Android update through their stores; the web '
        'app refreshes itself.)',
        s['body'],
    ))

    story.append(Spacer(1, 40))

    # ── 12. Tips & troubleshooting ────────────────────────────────────
    story.append(Paragraph('12. Tips & troubleshooting', s['h1']))
    story.append(Paragraph('Things to try if something feels off', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph('“The bars are jittery / never lock.”', s['h3']))
    story.append(Paragraph(
        'Background noise is usually the culprit. Open Settings with the ⚙ '
        'gear, then (a) lower Microphone Sensitivity until just your strikes '
        'register, and (b) set Hum to your local mains frequency (50 Hz '
        'UK/EU, 60 Hz US).',
        s['body'],
    ))

    story.append(Paragraph('“The cents number is right but the strobe disagrees.”', s['h3']))
    story.append(Paragraph(
        'They’re measuring different things. The cents number is a '
        'median-filtered, EMA-smoothed reading designed to be a stable '
        'digit you can read. The strobe is raw phase rate — it shows '
        'instantaneous motion. Trust the strobe for fine adjustments; '
        'trust the cents number for the overall verdict.',
        s['body'],
    ))

    story.append(Paragraph('“It’s telling me I’m in tune but I’m clearly not.”', s['h3']))
    story.append(Paragraph(
        'Check Reference A4. If it’s set to something exotic (442, 432) '
        'you’ll be tuning against a different concert pitch — it’s in the '
        'menu on desktop, or Settings → Tuning on mobile. Also check you’re '
        'on the right note: handpans have rich overtones, and it’s easy to '
        'accidentally lock onto a partial that isn’t the fundamental. The '
        'live note indicator on the note grid (cyan glow) helps catch this.',
        s['body'],
    ))

    story.append(Paragraph('“The strobe is too lively / too sluggish.”', s['h3']))
    story.append(Paragraph(
        '<b>Settings → Speed</b> is your friend. Drop it for a calmer '
        'reading, raise it for a more responsive one.',
        s['body'],
    ))

    story.append(Paragraph('“I want to tune a partial that isn’t 1×, 2×, or 3×.”', s['h3']))
    story.append(Paragraph(
        'Turn on the Spectrum Analyser, find the peak you care about, and '
        'shift+drag (or touch-hold drag on mobile) a bracket around it. '
        'V-Tune will generate a dedicated strobe band for that partial.',
        s['body'],
    ))

    story.append(Paragraph('“My phone screen has a notch / home indicator.”', s['h3']))
    story.append(Paragraph(
        'Handled — V-Tune respects iOS safe-area insets on the header, the '
        'quick-pick slide-up, and the menu. The strobe never hides behind '
        'the notch or the home-indicator strip.',
        s['body'],
    ))

    # ── Closer ────────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(HRule(50, length=180, thickness=0.5))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        '<font color="#a8a8b8">That’s the whole app. Strike a note, watch '
        'it lock in.</font>',
        s['body_secondary'],
    ))

    doc.build(story)


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    out = here / 'V-Tune-User-Guide.pdf'
    build(out)
    print(f'Wrote {out}  ({out.stat().st_size / 1024:.1f} KB)')
