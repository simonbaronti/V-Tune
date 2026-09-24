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

import json
import os
import sys
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


# ── Languages ─────────────────────────────────────────────────────────
# The English text in this file is the source of truth. A translation is a
# JSON map from the exact English string to its replacement, in
# docs/guide-strings.<lang>.json.
#
# Rather than thread a language argument through 166 Paragraph calls, the
# name `Paragraph` is shadowed below with a wrapper that translates on the
# way through. One interception point, no call sites to keep in step, and no
# way for a new paragraph to be added later and quietly skip translation.
#
# Two rules the translations follow, both worth knowing before editing one:
#
#   - Anything the app actually prints on screen stays in English, because
#     the app is English-only and the reader is looking at it while they
#     read this. So the guide says BRIGHT, TAIL, Let's Go — and explains
#     them in the target language around the untouched label.
#   - Markup inside a string (<b>, <font>, &nbsp;) has to survive intact.
#     It is ReportLab markup, not content.
LANG = 'en'

# Contents-page column split, per language. The total is the 160mm of text
# width; a language whose section titles run long takes more of it from the
# descriptions, which have slack.
TOC_COLUMNS_MM = {
    'en': [60 * mm, 100 * mm],
    'es': [66 * mm, 94 * mm],
}
TOC_GUTTER = 8  # points between the two columns
_CATALOGUE = {}
_COLLECT = False
_COLLECTED = []
_MISSING = []


def tr(text):
    """One user-facing string, in the language being built."""
    if _COLLECT and text not in _COLLECTED:
        _COLLECTED.append(text)
    if LANG == 'en':
        return text
    hit = _CATALOGUE.get(text)
    if hit:
        return hit
    # Fall back to English and say so. A guide with one English paragraph in
    # it is a bug to fix; a guide with a blank space where a paragraph was
    # is a bug nobody notices until a reader does.
    if text not in _MISSING:
        _MISSING.append(text)
    return text


_Paragraph = Paragraph


def Paragraph(text, style, **kw):  # noqa: F811 — deliberate shadow, see above
    return _Paragraph(tr(text), style, **kw)


# Printed on the cover — bump it whenever the guide is rebuilt for a release,
# so a downloaded PDF says which version of the app it describes.
GUIDE_VERSION = '1.3.1'
SITE = 'vtune-app.com'

# Inline glyph wrappers — use these inside Paragraph markup whenever a
# musical accidental is needed, otherwise the body font drops to ▢.
SHARP = '<font name="V-Sym">♯</font>'
FLAT  = '<font name="V-Sym">♭</font>'
NOTE  = '<font name="V-Sym">♪</font>'
# Arrow keycaps need the symbol font too — Helvetica renders them as nothing
# at all, which is worse than a box: the row silently loses its label.
UP    = '<font name="V-Sym">↑</font>'
DOWN  = '<font name="V-Sym">↓</font>'
LEFT  = '<font name="V-Sym">←</font>'
RIGHT = '<font name="V-Sym">→</font>'
# Every "Settings → Tuning" in the body needs RIGHT too, not a bare arrow:
# an unwrapped one vanishes and the breadcrumb reads as a double space.


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
    canv.drawString(MARGIN, PAGE_H - 9 * mm, tr('V-TUNE — USER GUIDE'))
    canv.drawRightString(PAGE_W - MARGIN, PAGE_H - 9 * mm,
                         tr('Precision strobe tuner for handpans'))

    # Bottom rule + page number
    canv.setStrokeColor(BORDER)
    canv.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canv.setFillColor(TEXT_DIM)
    canv.setFont('V-Sans', 8)
    canv.drawRightString(PAGE_W - MARGIN, 7 * mm, f'{doc.page}')
    canv.drawString(MARGIN, 7 * mm, SITE)
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
    canv.drawString(MARGIN, PAGE_H - 70 * mm, tr('User Guide'))

    canv.setFillColor(TEXT_SEC)
    canv.setFont('V-Sans', 11)
    canv.drawString(MARGIN, PAGE_H - 80 * mm,
                    tr('A precision strobe tuner for handpans'))
    canv.drawString(MARGIN, PAGE_H - 86 * mm,
                    tr('and other multi-modal instruments.'))

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
                    tr('The three-band strobe display — still + green when locked, '
                       'drifting + red when out of tune.'))

    # ── Footer (clear of the hero) ──────────────────────────────────────
    canv.setFillColor(TEXT_DIM)
    canv.setFont('V-Sans', 8)
    canv.drawString(MARGIN, 7 * mm, f'{SITE}  ·  v{GUIDE_VERSION}')
    canv.drawRightString(PAGE_W - MARGIN, 7 * mm,
                         tr('FFT peak detection + phase-rate Goertzel analysis'))

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
        _Paragraph(f'<font color="#06b6d4">•</font>&nbsp;&nbsp;{tr(t)}',
                   styles['bullet'])
        for t in items
    ]


def feature_row(name, desc, styles):
    """Two-column row used in settings tables: label on the left in
    mono-ish, description on the right in body."""
    return [
        _Paragraph(f'<b>{tr(name)}</b>', styles['body']),
        _Paragraph(tr(desc), styles['body_secondary']),
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
        ('8.  Analyser, waterfall & ISO', 'See the full spectrum, isolate frequencies'),
        ('9.  Keyboard shortcuts', 'Play the picker from a computer keyboard'),
        ('10. Settings', 'Every knob, what it does'),
        ('11. Stopwatch', 'Time your tuning sessions'),
        ('12. Theme, notation, tour', f'Light/dark, {SHARP}/{FLAT}/Do/DE, re-run onboarding'),
        ('13. V-Tune Pro', 'The trial, the one-time unlock, your account'),
        ('14. Tips & troubleshooting', 'Things to try if something feels off'),
    ]
    for left, right in toc:
        row = Table(
            [[Paragraph(left, s['toc']),
              Paragraph(f'<font color="#a8a8b8">{right}</font>', s['toc'])]],
            # The two columns had no gutter between them at all, which
            # English got away with because its section titles are short.
            # Translations are not so lucky — Spanish runs the title right up
            # against the description. A gutter fixes it for every language,
            # and the split widens where the titles need it.
            colWidths=TOC_COLUMNS_MM.get(LANG, TOC_COLUMNS_MM['en']), hAlign='LEFT',
        )
        row.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (0, -1), TOC_GUTTER),
            ('RIGHTPADDING', (1, 0), (1, -1), 0),
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
        ('Grant microphone access', 'On first launch V-Tune asks for the mic. Allow it. You can change device later in Settings <font name="V-Sym">→</font> Input (open Settings with the gear in the teal icon bar).'),
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
        '<b>Settings</b> (gear) — opens the Settings modal (section 10).',
        '<b>Stopwatch</b> (stopwatch face) — reveals or hides the stopwatch (section 11).',
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
        '<b>Bars moving left</b> <font name="V-Sym">→</font> your input is <i>flat</i> (pitch too low). '
        'Tune up. <b>Bars moving right</b> <font name="V-Sym">→</font> your input is <i>sharp</i> '
        '(pitch too high). Tune down. <b>Bars holding still</b> <font name="V-Sym">→</font> you’re '
        'locked. When a band is in tune it gets a <font color="#00e878">dark-'
        'green wash</font> and its cents readout settles on 0.',
        s['body'],
    ))
    story.append(Paragraph(
        'The bars are green in tune and red out of tune, and their '
        '<i>sharpness</i> tracks how <i>steady</i> the pitch is — not how far off '
        'it is, which the movement already tells you. A note well flat but '
        'rock-steady stays crisp while it slides; a note sitting on pitch but '
        'warbling goes soft, which is the warning it should be. On a handpan a '
        'warble usually means partials beating against each other, so it is '
        'worth seeing. Expect softness during the attack of a fresh strike too, '
        'before the pitch settles. Settings <font name="V-Sym">→</font> Blur sets the ceiling on it.',
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
        'A4 and Tolerance move into Settings <font name="V-Sym">→</font> Tuning. Either way the picker '
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
        'Pick a pre-saved handpan scale from the <b>SCALE</b> dropdown above '
        'the keyboard — Kurd, Amara, Pygmy, Aavartan, Ashakiran, Aegean, '
        'Equinox and Nordlys, twenty-two layouts in all, with the '
        '<b>Ayasa Elements</b> scales at the top of the list. The note picker '
        'switches from a chromatic keyboard to just the notes in that scale, '
        'each with a fixed octave matching the physical instrument. The '
        '<font color="#a855f7">ding</font> (root) is highlighted in purple. '
        'Switching scales auto-selects the ding.',
        s['body'],
    ))
    story.append(Paragraph(
        'Note naming: in scale mode the accidentals follow the scale’s '
        'convention (Kurd uses flats, Amara uses sharps). In chromatic mode '
        f'they follow the <b>{SHARP} {FLAT} Do DE</b> buttons in the menu '
        '(section 12).',
        s['body_secondary'],
    ))

    story.append(Paragraph('Bottom notes', s['h2']))
    story.append(Paragraph(
        'Notes tuned into the underside of the shell sit in the picker at '
        'their <i>true pitch position</i> — often below the ding — and carry '
        'a <font color="#06b6d4">teal outline</font> so you can tell them '
        'apart at a glance. They tune exactly like any other note; the '
        'outline is just there so you know where you are on the instrument.',
        s['body'],
    ))

    story.append(Paragraph('Gu port notes', s['h2']))
    story.append(Paragraph(
        'Some instruments carry one or two notes tuned into the <b>Gu</b> '
        'opening underneath. Where a scale has them, they appear as an '
        '<font color="#fbbf24">amber chip</font> beneath the note grid — '
        'D Kurd 13 / 15 show <b>E5 · A5</b>, E Amara 13 / 15 show '
        f'<b>B{FLAT}5 · D6</b>. They aren’t playable targets, so you '
        'can’t select one the way you select a note.',
        s['body'],
    ))
    story.append(Paragraph(
        '<b>Tap the chip</b> and V-Tune aims itself at them: both '
        'Spectrum Analyser isolation windows jump to ±35 cents around the '
        'notes, the analyser zooms in to frame them, and the two strobe '
        'bands underneath then read nothing but the Gu port. Each note '
        'takes the colour of the band reading it — '
        '<font color="#06b6d4">teal</font> for the lower, '
        '<font color="#a855f7">purple</font> for the higher — so there’s no '
        'guessing which is which. Tap it again to hand the windows back to '
        'their defaults. Full detail on those windows in section 8.',
        s['body'],
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

    story.append(Paragraph('CUSTOM — the target in hertz, to as many decimals as you like', s['h2']))
    story.append(Paragraph(
        'Below the note grid, in its own tinted band, is <b>CUSTOM</b>: the '
        'pitch you are actually tuning to, in hertz. Picking a note fills it '
        'in, but you can also set it yourself — and because a target set here '
        'overrides whatever the grid above says, it gets a band of its own '
        'rather than passing for one more field. There are two ways to set '
        'it, depending on whether you know the number you are after.',
        s['body'],
    ))
    story.append(Paragraph(
        '<b>Type it</b> when you do — 659.34, or 123.456 — from a maker’s '
        'spec sheet or an instrument you have measured before. Decimals are '
        'kept as typed rather than rounded away. Press Enter, or tap '
        '<b>SET</b>; on a phone, simply tapping elsewhere commits it.',
        s['body'],
    ))
    story.append(Paragraph(
        '<b>Nudge it</b> when you don’t — the <b>−</b> and <b>+</b> buttons '
        'either side move the target half a cent per press, up to a semitone '
        'either way. That is the one to reach for when an instrument sits '
        'between the notes and you are creeping up on it with the strobe '
        'running, rather than working from a number.',
        s['body'],
    ))
    story.append(Paragraph(
        'Either way it moves the fundamental, the octave and the compound '
        'fifth <i>together</i>, so the relationship between the partials is '
        'preserved — in PURE and in EQUAL alike. The field turns '
        '<font color="#a855f7">purple</font> whenever the target is off the '
        'note, so an offset cannot be left on by accident, and the caption '
        'underneath names the nearest note and the offset in cents with a '
        '<b>reset</b> beside it. The strobe bands show the same purple chip '
        'while an offset is in play. On a keyboard, '
        f'{LEFT} and {RIGHT} nudge a cent at a time, Shift takes ten, and '
        '<b>0</b> resets it (section 9).',
        s['body'],
    ))

    story.append(Paragraph('Reference A4, Tolerance & Let’s Go', s['h2']))
    story.append(Paragraph(
        '<b>Reference A4</b> sets concert pitch (default 440 Hz) and '
        '<b>Tolerance</b> sets how close counts as in tune (default ±5 '
        'cents). On desktop these sit in the menu alongside the picker; on '
        'mobile they move into Settings <font name="V-Sym">→</font> Tuning. <font color="#00e878">Let’s '
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
        'centred. Tap the bar to slide the panel up. It floats <i>over</i> the '
        'tuner on a translucent panel rather than compressing it, so the '
        'strobe stays exactly where it was; the display behind dims and '
        'blurs while the panel is up, and tapping anywhere outside closes '
        'it.',
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
        'Reference A4 and Tolerance live in Settings <font name="V-Sym">→</font> Tuning on mobile.',
        s['body_secondary'],
    ))

    story.append(Paragraph('Hold your phone upright', s['h2']))
    story.append(Paragraph(
        'Turn a phone sideways and V-Tune asks for it back. Three strobe '
        'bands, the analyser and the picker are stacked vertically, and a '
        'phone in landscape simply hasn’t the height for them. This applies '
        'to <b>phones only</b> — a tablet switches to the wide layout at '
        '1024px, so landscape is a tablet’s better orientation, not its '
        'worse one.',
        s['body'],
    ))

    story.append(Spacer(1, 40))

    # ── 8. Spectrum Analyser + ISO ────────────────────────────────────
    story.append(Paragraph('8. Spectrum Analyser, waterfall &amp; Isolation windows', s['h1']))
    story.append(Paragraph('See the full frequency content, watch it decay, then isolate the bits you care about', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Toggle the <b>Spectrum Analyser</b> with its icon (equaliser bars) '
        'in the teal utility bar. It appears under the strobes as a '
        'frequency-domain view from <b>60 Hz to 4.3 kHz</b> — a real-time '
        'picture of every harmonic your instrument is producing, with two '
        'isolation bands beneath it for fine-tuning partials. That range is '
        'comfortably wider than any handpan\u2019s fundamental-to-upper-partial '
        'span, and narrow enough that the keyboard along the bottom stays '
        'readable rather than a smear.',
        s['body'],
    ))
    story.append(Paragraph(
        'Two names worth keeping straight, because they are two different '
        'things: an <b>isolation window</b> is the coloured bracket you place '
        'on the spectrum, and an <b>isolation band</b> is the strobe it '
        'drives underneath. You move the window; you read the band. They '
        'share a colour so it is always obvious which belongs to which, and '
        'the app labels both <b>ISO</b> for short.',
        s['body_secondary'],
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
    story.append(Paragraph(
        'The isolation bands read frequency with the same sub-cent precision '
        'as the main strobe — the same phase-rate physics, not a coarser '
        'reading off the FFT peak. What you see on an ISO band is as '
        'trustworthy as what you see on the 1× / 2× / 3× bands.',
        s['body_secondary'],
    ))

    story.append(Paragraph('Jumping straight to the Gu port', s['h2']))
    story.append(Paragraph(
        'On a scale with Gu port notes you don’t have to place the brackets '
        'by hand. Tap the <font color="#fbbf24">amber Gu port chip</font> '
        'under the note grid and both windows land on the port notes at '
        '±35 cents, with the analyser zoomed to frame them — wide enough to '
        'watch the peak float inside the bracket, tight enough that nothing '
        'else in the shell wanders in. Tap it again to restore the default '
        'windows and the full view. See section 6.',
        s['body'],
    ))

    story.append(Paragraph('The waterfall', s['h2']))
    story.append(Paragraph(
        'The spectrum curve tells you how loud each partial is <i>right now</i>. '
        'It says nothing about how long any of them lasts. Turn on '
        '<b>WATERFALL</b> in the analyser\u2019s control strip and the last '
        '<b>ten seconds</b> are painted as a heatmap behind the curve, on the '
        'same frequency axis, with colour standing in for power. The newest '
        'moment is the top line; everything older slides down and off the '
        'bottom. A partial that rings on draws a long vertical streak. One '
        'that dies on the strike draws a dash.',
        s['body'],
    ))
    story.append(Paragraph(
        'One row is exactly one pixel tall, and the full ten seconds spans '
        'whatever height the panel currently is. Nothing is resampled, so the '
        'slope of a decay is honest — two notes\u2019 sustain can be compared by '
        'eye, not just by feel.',
        s['body_secondary'],
    ))
    story.append(Paragraph(
        'Isolation windows carry through as lanes, so you can bracket one '
        'partial, watch that one decay, and read the strobe for it at the '
        'same time.',
        s['body'],
    ))

    story.append(Paragraph('Reading the colours: BRIGHT, TAIL and SOFT', s['h2']))
    story.append(Paragraph(
        'A quiet instrument recorded at a sensible level puts almost '
        'everything in the cold end of the ramp, which looks like nothing is '
        'happening. Two controls set the ends of that ramp, and between them '
        'they are what make the colours usable:',
        s['body'],
    ))
    story.append(settings_table([
        ('BRIGHT', 'The saturation point. Everything above it paints the hot '
                   'end of the ramp, so <b>lowering it brings more of the '
                   'signal into the top</b> — the move to make on a soft '
                   'instrument. Desktop spectrograms call this brightness.'),
        ('TAIL', 'How quiet a partial may get before it goes black. Raise it '
                 'to <b>follow a decay further down</b> into the noise. This '
                 'is the dynamic range of the picture.'),
        ('SOFT', 'Blurs the heatmap <b>across frequency only, never across '
                 'time</b> — smearing time would flatten the very decay you '
                 'are trying to read. Useful for turning a grainy shell into '
                 'readable bands.'),
    ], s))
    story.append(Paragraph(
        'All three re-render the ten seconds already on screen, so you can '
        'find the right setting against a strike that has already happened '
        'rather than hitting the instrument again and again.',
        s['body_secondary'],
    ))

    story.append(Paragraph('The keyboard', s['h2']))
    story.append(Paragraph(
        'A piano keyboard runs along the bottom of the analyser. It is drawn '
        '<i>against the frequency axis</i> rather than as evenly spaced keys, '
        'so every key sits beneath the partials it names, and the whole thing '
        'stretches and slides with the zoom. Keys your strobe bands are '
        'targeting are tinted, so a glance tells you which note each band is '
        'on. Note names appear as the width allows — every white key when '
        'there is room, thinning to the octave Cs when zoomed out.',
        s['body'],
    ))

    story.append(Paragraph('Resizing the analyser', s['h2']))
    story.append(Paragraph(
        'Drag the handle at the analyser\u2019s top edge to make it taller or '
        'shorter. The strobe above always keeps a guaranteed share of the '
        'screen, so you cannot drag it away, and the band labels scale with '
        'whatever is left. It is <b>one height, kept whether the waterfall is '
        'on or off</b> — switching the waterfall on does not resize the panel '
        'under you.',
        s['body'],
    ))

    story.append(Spacer(1, 40))

    # ── 9. Keyboard shortcuts ─────────────────────────────────────────
    story.append(Paragraph('9. Keyboard shortcuts', s['h1']))
    story.append(Paragraph('Play the note picker from a computer keyboard', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'On desktop you can drive the whole picker from the keyboard without '
        'reaching for the mouse — useful when one hand is on the instrument. '
        'Hit the <font color="#a855f7"><b>MAP</b></font> button at the right '
        'of the notation row in the menu for an on-screen reminder of '
        'everything below.',
        s['body'],
    ))

    story.append(Paragraph('Note keys', s['h2']))
    story.append(Paragraph(
        'The letter keys are laid out like a piano: the home row is the white '
        'keys, the row above is the black keys, sitting where they would on a '
        'real keyboard.',
        s['body'],
    ))
    story.append(settings_table([
        ('A S D F G H J', 'The naturals — C D E F G A B, in the current octave.'),
        ('W E &nbsp;&nbsp; T Y U',
         f'The accidentals — C{SHARP} D{SHARP} &nbsp; F{SHARP} G{SHARP} A{SHARP}, '
         'grouped in twos and threes like the black keys.'),
    ], s))

    story.append(Paragraph('Everything else', s['h2']))
    story.append(settings_table([
        (f'{UP} / {DOWN}', 'Octave up / down.'),
        (f'{LEFT} / {RIGHT}', 'Nudge the target by a cent. Hold Shift for ±10.'),
        ('0', 'Reset that nudge back to zero.'),
        ('Q', 'Toggle AUTO note detection.'),
        ('+ / −', 'Reference pitch (A4) up / down.'),
        ('Space', 'Slides the main menu in and out on a wide window. On a '
                  'narrow one, where there is no side menu, it starts / stops '
                  'the tuner instead.'),
        ('Enter', 'Start / stop the tuner — the keyboard’s Let’s Go.'),
        ('Esc', 'Deselect the current strobe band.'),
    ], s))
    story.append(Paragraph(
        'Shortcuts stay out of the way while you’re typing in a field or '
        'using a dropdown, so they never fire by accident.',
        s['body_secondary'],
    ))

    story.append(Spacer(1, 40))

    # ── 10. Settings ──────────────────────────────────────────────────
    story.append(Paragraph('10. Settings', s['h1']))
    story.append(Paragraph('Every knob, what it does', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Settings is a <b>modal</b>, opened by the gear in the teal '
        'utility bar. It’s organised into labelled teal-header sections, each '
        'laid out in two columns — the setting’s name and a short description '
        'on the left, its control on the right.',
        s['body'],
    ))

    story.append(Paragraph('V-Tune Pro', s['h2']))
    story.append(settings_table([
        ('Status',
         'Where you stand — <b>Free trial</b> with the days left, or '
         '<b>Unlocked</b> once you’ve bought it. The line underneath says '
         'which account you’re signed in as. Full detail in section 13.'),
        ('Unlock forever',
         'Shown during the trial: opens the unlock screen so you can buy '
         'without waiting for the trial to run out.'),
    ], s))

    story.append(Paragraph('Sound', s['h2']))
    story.append(settings_table([
        ('Pitch pipe volume',
         f'How loud the {NOTE} reference tone plays on each band (section 5). '
         'Takes effect on a tone that’s already sounding, so you can set it '
         'by ear.'),
    ], s))

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
         'Edge softness of the bars. They soften as the pitch becomes <b>unsteady</b>, '
         'not as it goes further out of tune — a steady note stays crisp however flat '
         'it is. This sets the ceiling on that softness; at 0 the bars stay sharp always.'),
        ('Speed',
         'Drift rate, as a multiple of a conventional strobe: 0.5× / 1× / 2× / 5× / 10×. '
         '<b>1× is a real strobe</b> — the pattern turns once a second for every hertz the '
         'note is out, which is the reading itself. Go above it to make a small error on a '
         'high partial obvious; below it for low notes, where a conventional strobe already '
         'moves faster than the eye wants.'),
    ], s))

    story.append(Paragraph('Accessibility Options', s['h2']))
    story.append(settings_table([
        ('High contrast',
         'Boosts contrast throughout the UI for easier reading.'),
        ('Larger text',
         'Scales up the interface text.'),
        ('Onboarding tour',
         'Replays the interactive guided walkthrough from the start '
         '(section 12).'),
    ], s))

    story.append(Spacer(1, 40))

    # ── 11. Stopwatch ─────────────────────────────────────────────────
    story.append(Paragraph('11. Stopwatch', s['h1']))
    story.append(Paragraph('Time your tuning sessions', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Toggle the <b>stopwatch</b> on and off with its icon in the teal '
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

    # ── 12. Theme / notation / tour ───────────────────────────────────
    story.append(Paragraph('12. Theme, notation, and the onboarding tour', s['h1']))
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
        'Pick how accidentals are labelled with the four small buttons in the '
        f'menu, on the row below the note picker: <b>{SHARP}</b> sharps, '
        f'<b>{FLAT}</b> flats, <b>Do</b> solfège, or <b>DE</b> German naming '
        f'(which uses H for B and B for B{FLAT}).',
        s['body'],
    ))
    story.append(Paragraph(
        'They only appear in chromatic mode — a scale brings its own '
        'convention with it (section 6).',
        s['body_secondary'],
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
        'Want it again? Open Settings and hit <b>Onboarding tour</b> under '
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
        f'app at <b>app.{SITE}</b> refreshes itself.)',
        s['body'],
    ))

    story.append(Spacer(1, 40))

    # ── 13. V-Tune Pro ────────────────────────────────────────────────
    story.append(Paragraph('13. V-Tune Pro', s['h1']))
    story.append(Paragraph('The trial, the one-time unlock, your account', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph(
        'Every install starts with a <b>14-day free trial of the complete '
        'app</b> — no card, no sign-up, nothing withheld. When it ends, a '
        'single <font color="#00e878"><b>£49.99</b></font> purchase unlocks '
        'V-Tune forever. It is not a subscription and there is nothing to '
        'renew.',
        s['body'],
    ))

    story.append(Paragraph('One purchase, every device', s['h2']))
    story.append(Paragraph(
        'The unlock belongs to your <b>account</b>, not to a machine. Buy '
        'once and sign in on the Mac in the workshop, the iPad on the bench '
        'and the phone in your pocket — all of them unlock. Buy on '
        f'<b>{SITE}</b>, or directly inside the iOS app, whichever suits.',
        s['body'],
    ))

    story.append(Paragraph('Signing in', s['h2']))
    story.append(Paragraph(
        'Enter your email on the unlock screen and V-Tune sends you a '
        'sign-in link <i>and</i> a <b>6-digit code</b>. Tap the link on a '
        'desktop or web browser; inside the phone and tablet apps, type the '
        'code — that’s the path that brings you back into the app itself. '
        'There is no password to invent or forget.',
        s['body'],
    ))
    story.append(Paragraph(
        'Already bought it on this device and just reinstalled? '
        '<b>Restore purchase</b>, next to Sign in, asks the store directly.',
        s['body_secondary'],
    ))

    story.append(Paragraph('While the trial runs', s['h2']))
    story.append(Paragraph(
        'Nothing nags you until the last three days, when a slim purple '
        'countdown appears above the strobe — dismissible, and back on the '
        'next launch. To buy before the trial is out, open '
        '<b>Settings <font name="V-Sym">→</font> V-Tune Pro <font name="V-Sym">→</font> Unlock now</b>. Once the trial ends the '
        'unlock screen stays up until you buy, sign in or restore.',
        s['body'],
    ))
    story.append(Paragraph(
        'The onboarding tour holds off while the app is locked, so you never '
        'get walked through an app you can’t yet use.',
        s['body_secondary'],
    ))

    story.append(Spacer(1, 40))

    # ── 14. Tips & troubleshooting ────────────────────────────────────
    story.append(Paragraph('14. Tips & troubleshooting', s['h1']))
    story.append(Paragraph('Things to try if something feels off', s['h1_sub']))
    story.append(HRule(50, length=36))

    story.append(Paragraph('“The bars are jittery / never lock.”', s['h3']))
    story.append(Paragraph(
        'Background noise is usually the culprit. Open Settings with the '
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
        'menu on desktop, or Settings <font name="V-Sym">→</font> Tuning on mobile. Also check you’re '
        'on the right note: handpans have rich overtones, and it’s easy to '
        'accidentally lock onto a partial that isn’t the fundamental. The '
        'live note indicator on the note grid (cyan glow) helps catch this.',
        s['body'],
    ))

    story.append(Paragraph('“The strobe is too lively / too sluggish.”', s['h3']))
    story.append(Paragraph(
        '<b>Settings <font name="V-Sym">→</font> Speed</b> is your friend. Drop it for a calmer '
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

    story.append(Paragraph('“I bought V-Tune but this device still shows the trial.”', s['h3']))
    story.append(Paragraph(
        'The unlock travels with your account, so the device needs to know '
        'who you are. Open the unlock screen — <b>Settings <font name="V-Sym">→</font> V-Tune Pro</b> '
        'during the trial — hit <b>Sign in</b>, and use the same email you '
        'bought with. If you bought inside the iOS app on this very device, '
        '<b>Restore purchase</b> is the quicker route.',
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


def _load_catalogue(here, lang):
    path = here / f'guide-strings.{lang}.json'
    if not path.exists():
        raise SystemExit(
            f'No translation catalogue at {path}.\n'
            f'Build it with:  python3 docs/build-guide.py --collect'
        )
    return json.loads(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    args = sys.argv[1:]

    # --collect walks the whole guide and writes out every string that asked
    # to be translated, in the order a reader meets them. Run it after any
    # edit to the English text: new strings appear as empty values, so what
    # needs translating is whatever is still empty.
    if '--collect' in args:
        _COLLECT = True
        build(Path(os.devnull))
        out = here / 'guide-strings.pot.json'
        existing = {}
        for lang_file in sorted(here.glob('guide-strings.*.json')):
            if lang_file.name.endswith('.pot.json'):
                continue
            existing[lang_file.stem.split('.')[-1]] = json.loads(
                lang_file.read_text(encoding='utf-8'))
        out.write_text(
            json.dumps({t: '' for t in _COLLECTED}, indent=2, ensure_ascii=False),
            encoding='utf-8')
        print(f'Collected {len(_COLLECTED)} strings -> {out}')
        for lang, cat in existing.items():
            todo = [t for t in _COLLECTED if not cat.get(t)]
            gone = [t for t in cat if t not in _COLLECTED]
            print(f'  {lang}: {len(_COLLECTED) - len(todo)}/{len(_COLLECTED)} translated'
                  + (f', {len(todo)} to do' if todo else '')
                  + (f', {len(gone)} no longer used' if gone else ''))
        raise SystemExit(0)

    lang = 'en'
    if '--lang' in args:
        lang = args[args.index('--lang') + 1]

    if lang != 'en':
        LANG = lang
        _CATALOGUE = _load_catalogue(here, lang)
        out = here / f'V-Tune-User-Guide-{lang.upper()}.pdf'
    else:
        out = here / 'V-Tune-User-Guide.pdf'

    build(out)
    print(f'Wrote {out}  ({out.stat().st_size / 1024:.1f} KB)')

    # Write straight into the site as well. These two copies drifted apart
    # once already — vtune-app.com served the 1.2.1 guide for two releases,
    # because the site's copy was a manual duplicate nobody remembered to
    # refresh. Building both at once is the only version of this that stays
    # true without anyone having to remember.
    site = here.parent / 'landing' / out.name
    if site.parent.is_dir():
        site.write_bytes(out.read_bytes())
        print(f'   and {site}')
    if _MISSING:
        print(f'\n  ⚠ {len(_MISSING)} string(s) fell back to English:')
        for t in _MISSING[:8]:
            print(f'    · {t[:88]}')
        if len(_MISSING) > 8:
            print(f'    … and {len(_MISSING) - 8} more')
        print(f'  Re-run with --collect to refresh guide-strings.pot.json.')
