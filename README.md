# Tactus

Drum notation by clicking, in the browser. No installation, no account, no build step.
Values and MIDI numbers follow Guitar Pro, so scores can later go to Guitar Pro / MIDI.

**Online:** https://tizian91.github.io/Tactus/

**Start locally:** double-click `index.html` (Edge or Chrome recommended).
**As a web app:** put the folder on any web server with https (e.g. GitHub Pages) – Chrome / Edge then
offer "Install app" and it works offline (`manifest.webmanifest`, `sw.js`).

**Dropbox (online version):** File → *Connect Dropbox…*. Each user signs in with their own Dropbox (OAuth 2
with PKCE, no app secret, no server; app key in `js/dropbox.js`). The app sees only its app folder
`Apps/<app name>/`: songs in `Songs/` (*Open from / Save to Dropbox*; saving again checks for changes made on
another device), all kit profiles in `Kit-Profile/Kits.tactus-kits.json` (kept in step automatically).
Opening / saving files on the device and the export / import of kit profiles work as before.
Redirect URIs in the Dropbox App Console: `https://tizian91.github.io/Tactus/` and `…/Tactus/index.html`.
Not available when `index.html` is opened as a file (Dropbox needs https).

## How it works

- Choose a **note value** on the left (keys `1`–`7`, `.` dotted, `T` triplet). It is also the **click grid**:
  only positions of that value can be clicked; a finer grid widens the bars so a cell never gets too small.
- **One rule for mouse, pen and finger:**

  | where you press | tap | drag | hold (½ s), then drag |
  |---|---|---|---|
  | empty place on the lines | write the note | the preview follows (column and line), **release writes it**; off the lines: nothing | held still (finger / pen): **bar menu**, no note |
  | on a note | select (again: delete; `Ctrl`: several) | **move it**: sideways in time, up / down to another instrument | **row** of that instrument (mouse: `Ctrl` + drag) |
  | beside the lines (above, below, bar start) | **select the bar** | **scroll** | finger: bar menu |
  | two fingers | – | scroll + zoom | – |

  "On the lines": near a line with an instrument of the kit – the nearest one decides ("magnet"); where several
  instruments share a line (hi-hat closed / half / open, snare / rimshot / side stick …), the one chosen in the
  panel is written. Mouse / pen above the screen show the preview before pressing. `Esc` drops a held note.
  Setting "fingers write notes" (settings → view) off: a finger only selects and scrolls.
- **Instrument lock** (panel switch for tablets, key `L`, or hold `Shift`): the height on the lines no longer
  matters – the selected instrument is written; beside the lines a tap still selects the bar.
- With notes selected the note panel changes them (accent, ghost note, notehead, instrument, value).
- **Right-click a bar**: time signature (from this bar on), insert / clear / delete bars.
- **Two panels:** the note panel (left) holds what every note needs, for the hand that does not hold the pen /
  mouse; the panel "Bar · score" (right) holds bar, playback and score. **Left-handed mode** swaps them. Set once
  and rarely changed: the **settings window** (⚙ in the toolbar) – drum kit, notation, page, view, keyboard shortcuts.
- **Drum kit** (settings ⚙): standard 5-piece, large, all, or a custom choice – only these instruments appear
  in the note panel and the drum map.
- **Notation** (settings panel → drum kit): "Tactus" (default; kick and pedal hi-hat on the bottom line, toms from
  the top line down, crash 2 / china / splash above the hi-hat) or "Guitar Pro". Only the drawing changes.
- **Kit profiles** (settings → drum kit → "Kit profiles (Cubase)…"): load the Cubase drum map of a drum VST, Tactus
  matches the keys by name; per instrument (fixed line and head) only the key is chosen. "Save drum map for Cubase"
  writes a `.drm` with the Tactus notation. Kept in the browser; export / import as `*.tactus-kits.json`.
- **MIDI import** (File → Import MIDI, or drop a `.mid` on the window): choose where it comes from (kit profile or
  General MIDI) and the grid (1/16 + triplets …); velocity becomes ghost / accent, soft hits just before become
  flams. Replaces the open score.
- **Kit profile of the score** (status bar "Kit: …", click to change): saved with the score.
- **Repeats** (bar menu → Repeat, or the bar panel): `|:` start, `:|` end (2×, 3× …), endings 1. / 2. (also over
  several bars); several bars selected: "Repeat bars a–b". Playback, cursor and **MIDI export play them written
  out** – a MIDI file knows no repeats, so Cubase gets every bar as played, with a marker where a repeat starts
  again ("Bar 5 – 2. time"). While playing, the status bar shows the written bar and the played bar number (as in
  Cubase). "Write the repeats out" turns them into bars of their own (bar numbers as in Cubase).
- **MIDI export** (File → Export MIDI, `Ctrl+E`, with the kit profile of the score; "Export MIDI for" picks another):
  General MIDI (also for Guitar Pro) or a kit profile – tempo, time signature,
  bar texts as markers, velocity (ghost / accent), flam / drag / rolls and %-bars written out.
- **Drum map**: short names (HH, SN, BD …) exactly at the height of their line; pointer on one lights its line
  up, a click chooses the instrument. Option: only the instruments used in the score.
- **Rows**: hold a note, then drag sideways (mouse: `Ctrl` + drag): the same instrument is written in steps of
  the note value – a row of hi-hat eighths in one go (one undo step).
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
- **Tablet**: see the table above – on the lines a finger aims and writes on release, beside the lines it
  scrolls and selects bars, two fingers scroll and zoom.

## Code layout

| File | Purpose |
|---|---|
| `js/state.js` | Namespace `TC`, app state, undo/redo (`TC.commit()`) |
| `js/model.js` | Score model (bar headers, tracks, voices, events, notes), loading, operations (`TC.score`) |
| `js/drummap.js` | Drum map: Guitar Pro articulations (line, MIDI note, notehead), notation layouts (Tactus / Guitar Pro), drum kits, "magnet" |
| `js/cubase.js` | Cubase drum maps (`.drm`): read, recognise instruments, write with the Tactus notation |
| `js/kits.js` | Kit profiles (which VST key is which instrument), their dialog, drum maps for Cubase |
| `js/midi.js` | MIDI export (Standard MIDI File) for General MIDI or a kit profile |
| `js/midiin.js` | MIDI import: read the file, snap to the grid (straight / triplets), dialog |
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
| `js/dropbox.js` | Dropbox: sign-in, songs (open / save), kit profiles in step |
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
