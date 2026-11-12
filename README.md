# Tactus

Drum notation by clicking, in the browser. No installation, no account, no build step.
Values and MIDI numbers follow Guitar Pro, so scores can later go to Guitar Pro / MIDI.

**Online:** https://tizian91.github.io/Tactus/

**Start locally:** double-click `index.html` (Edge or Chrome recommended).
**As a web app:** put the folder on any web server with https (e.g. GitHub Pages) – Chrome / Edge then
offer "Install app" and it works offline (`manifest.webmanifest`, `sw.js`).

## How it works

- Choose a **note value** on the left (keys `1`–`7`, `.` dotted, `T` triplet). It is also the **click grid**:
  only positions of that value can be clicked; a finer grid widens the bars so a cell never gets too small.
- **Click on a line** of the staff: the preview shows the note and its name; keep the button down and move up /
  down to pick another line – the note is written when you release. The nearest line
  with an instrument of the kit decides ("magnet"); where several instruments share a line (hi-hat closed / half /
  open, snare / rimshot / side stick …), the one chosen in the panel is written.
- **Instrument lock** (panel switch for tablets, key `L`, or hold `Shift`): the height no longer matters – a click
  anywhere in the column writes the selected instrument.
- Click a note to **select** it, click it again to **delete** it, `Ctrl`+click selects several. With notes selected
  the note panel changes them (accent, ghost note, notehead, instrument, value).
- **Right-click a bar**: time signature (from this bar on), insert / clear / delete bars.
- **Two panels:** the note panel (left) holds what every note needs, for the hand that does not hold the pen /
  mouse; the settings panel (right) holds score, bar, drum kit and view. **Left-handed mode** swaps them.
- **Drum kit** (settings panel): standard 5-piece, large, all, or a custom choice – only these instruments appear
  in the note panel and the drum map.
- **Notation** (settings panel → drum kit): "Tactus" (default; kick and pedal hi-hat on the bottom line, toms from
  the top line down, crash 2 / china / splash above the hi-hat) or "Guitar Pro". Only the drawing changes.
- **Kit profiles** (settings → drum kit → "Kit profiles (Cubase)…"): load the Cubase drum map of a drum VST, Tactus
  matches the keys by name; per instrument (fixed line and head) only the key is chosen. "Save drum map for Cubase"
  writes a `.drm` with the Tactus notation. Kept in the browser; export / import as `*.tactus-kits.json`.
- **Drum map**: short names (HH, SN, BD …) exactly at the height of their line; pointer on one lights its line
  up, a click chooses the instrument. Option: only the instruments used in the score.
- **Drag sideways** from a new or existing note (mouse / pen; finger: hold the note first): the same instrument
  is written at every grid position passed – a row of hi-hat eighths in one go (one undo step).
- **Rest cleanup** (settings → view → note values, drums): a note lasts up to the next one, at most to the end
  of its beat, so fewer rests are written. Alternatives: up to the next note, or as written. Only the display
  changes; the saved durations stay.
- **Flam, drag, roll, sticking** per note in the note panel: grace notes, 1–3 strokes through the stem,
  R / L under the staff. **Counting** (1 e + a) under the staff can be switched on (settings → view).
- **Bars**: copy / paste / duplicate (`Ctrl+C` / `V` / `D`), **% = repeat the bar before**, **beam groups**
  for odd meters (7/8 = 2+2+3, 3+2+2 …).
- **Playback** (`Space` or ▶): synthesized drum sounds, running cursor, metronome, count-in, loop of the
  selected bar, tempo in the toolbar. Changes are heard while it plays. A note sounds when it is written.
- **Page view** (toolbar "Page"): A4 pages as printed – bars break into lines that fill the width, bars per
  line automatic or fixed, a line break after any bar (bar menu, marked ↵). **Text above a bar** (Intro, Verse, Chorus …)
  and **bar numbers** (start of each line / every bar / none). **PDF**: File → PDF / print (`Ctrl+P`),
  choose "Save as PDF".
- **Tablet**: one finger drag scrolls, tap writes, hold opens the bar menu, hold a note and drag writes a row,
  two fingers zoom; a pen writes.

## Code layout

| File | Purpose |
|---|---|
| `js/state.js` | Namespace `TC`, app state, undo/redo (`TC.commit()`) |
| `js/model.js` | Score model (bar headers, tracks, voices, events, notes), loading, operations (`TC.score`) |
| `js/drummap.js` | Drum map: Guitar Pro articulations (line, MIDI note, notehead), notation layouts (Tactus / Guitar Pro), drum kits, "magnet" |
| `js/cubase.js` | Cubase drum maps (`.drm`): read, recognise instruments, write with the Tactus notation |
| `js/kits.js` | Kit profiles (which VST key is which instrument), their dialog, drum maps for Cubase |
| `js/rhythm.js` | Events → note values, rests, dots, triplets, beams (pure, tested) |
| `js/render.js` | SVG engraving with the Bravura font (SMuFL), grid, hover preview; endless and page view (lines, A4 pages), PDF / print |
| `js/panel.js` | Note panel and settings panel, widths, left-handed mode |
| `js/actions.js` | Commands used by toolbar, panel, menus and keys |
| `js/interaction.js` | Mouse, pen, fingers and keyboard on the score |
| `js/playback.js` | Playback timeline: which stroke at which second (pure, tested) |
| `js/audio.js` | Synthesized drum sounds (Web Audio) and the player with cursor |
| `js/contextmenu.js` | Menus (from MindMapper) |
| `js/storage.js` | Open / save `*.tactus.json`, autosave in the browser, example groove |
| `js/i18n.js` | German / English, light / dark theme |
| `js/main.js` | Startup, toolbar, status bar |
| `css/bravura.css` | The music font, embedded (built by `tools/make_font_css.js`) |

Rule of thumb: change the model in `TC.state.doc`, then call `TC.commit()`. That records an undo step,
autosaves and redraws. Time is counted in ticks, 960 per quarter note.

Tests: see [`tools/tests/README.md`](tools/tests/README.md). The plan: [`plans/plan.md`](plans/plan.md).

## File format

A score is saved as readable JSON (`*.tactus.json`); see the comment at the top of `js/model.js`.

## Credits

- Music font **Bravura** © Steinberg Media Technologies GmbH, SIL Open Font License 1.1 (`fonts/Bravura-OFL.txt`).
- Drum articulations (lines, MIDI notes, noteheads) as used by Guitar Pro 7/8, taken from the open source
  project [alphaTab](https://github.com/CoderLine/alphaTab).
- Building blocks (undo, panel, menus, theme, offline app) from MindMapper.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to use, change and share for any **noncommercial**
purpose. Commercial use needs the author's permission.
