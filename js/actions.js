'use strict';
/*
 * Named commands. Toolbar buttons, panel buttons (data-action="name" data-value="…"),
 * menus and keyboard shortcuts all call into TC.actions.
 */
(function (TC) {
  const S = TC.state;
  const A = (TC.actions = {});
  const tr = (s, v) => TC.tr(s, v);
  const selectedIds = () => [...S.selection];

  // ---- Input (what the next click writes) ---------------------------------------------

  /** Note value 1 … 64. With notes selected: they get the new length. */
  A.setValue = function (v) {
    v = Number(v);
    if (!TC.VALUES.includes(v)) return;
    S.input.value = v;
    if (S.input.value <= 1) S.input.triplet = false;
    applyDurationToSelection();
    TC.refresh();
  };
  A.toggleDotted = function () {
    S.input.dotted = !S.input.dotted;
    if (S.input.dotted) S.input.triplet = false;
    applyDurationToSelection();
    TC.refresh();
  };
  A.toggleTriplet = function () {
    S.input.triplet = !S.input.triplet;
    if (S.input.triplet) S.input.dotted = false;
    applyDurationToSelection();
    TC.refresh();
  };
  function applyDurationToSelection() {
    if (!S.selection.size) return;
    TC.score.setDuration(S.doc, selectedIds(), TC.inputTicks(S.input));
    TC.commit();
  }

  /*
   * Note properties: with notes selected they change the selected notes only,
   * otherwise they are the settings for the next notes.
   */

  /** Instrument (selected notes change to it; otherwise the next notes get it). */
  A.setArt = function (id) {
    id = Number(id);
    const art = TC.drums.byId(id);
    if (!art) return;
    if (S.selection.size) {
      forSelected((n) => { n.art = id; });
      TC.commit();
    } else {
      S.input.art = id;
      TC.saveSettings();
      TC.refresh();
    }
    TC.ui.hint(TC.drums.label(art));
  };

  A.setAccent = function (a) {
    a = Number(a);
    if (S.selection.size) {
      forSelected((n) => { n.accent = a; });
      TC.commit();
    } else {
      S.input.accent = a;
      TC.refresh();
    }
  };
  A.toggleAccent = function () {
    if (S.selection.size) {
      const first = TC.score.findNote(S.doc, selectedIds()[0]);
      A.setAccent(first && first.note.accent === 1 ? 0 : 1);
    } else A.setAccent(S.input.accent === 1 ? 0 : 1);
  };
  A.toggleGhost = function () {
    if (S.selection.size) {
      const first = TC.score.findNote(S.doc, selectedIds()[0]);
      const on = !(first && first.note.ghost);
      forSelected((n) => { n.ghost = on; });
      TC.commit();
    } else {
      S.input.ghost = !S.input.ghost;
      TC.refresh();
    }
  };
  A.setHead = function (h) {
    if (h !== 'auto' && !TC.HEADS[h]) return;
    if (S.selection.size) {
      forSelected((n) => { n.head = h; });
      TC.commit();
    } else {
      S.input.head = h;
      TC.refresh();
    }
  };

  /** Flam / drag before the note (null = none). */
  A.setOrn = (o) => noteProp('orn', o === 'flam' || o === 'drag' ? o : null);
  /** Roll: 0 … 3 strokes through the stem. */
  A.setTrem = (v) => noteProp('trem', TC.clamp(Math.round(Number(v) || 0), 0, 3));
  /** Sticking under the note: 'R', 'L' or '' (none). */
  A.setStick = (v) => noteProp('stick', v === 'R' || v === 'L' ? v : '');
  function noteProp(k, v) {
    if (S.selection.size) {
      forSelected((n) => { n[k] = v; });
      TC.commit();
    } else {
      S.input[k] = v;
      TC.refresh();
    }
  }

  function forSelected(fn) {
    for (const id of S.selection) {
      const hit = TC.score.findNote(S.doc, id);
      if (hit) fn(hit.note, hit);
    }
  }

  /** Move the selected notes one instrument up / down (to the next line of the kit). */
  A.moveLine = function (dir) {
    if (!S.selection.size) return;
    const lines = TC.drums.lines(TC.drums.kit());
    forSelected((n) => {
      const art = TC.drums.byId(n.art);
      const next = dir < 0 ? lines.filter(([l]) => l < art.line).pop() : lines.find(([l]) => l > art.line);
      if (next) n.art = (next[1].find((a) => a.def) || next[1][0]).id;
    });
    TC.commit();
  };

  /** Instrument lock: a click anywhere in the column writes the selected instrument. */
  A.toggleLock = function () {
    S.input.lock = !S.input.lock;
    TC.ui.hint(tr(S.input.lock ? 'Instrument lock on: the height no longer matters' : 'Instrument lock off'));
    TC.refresh();
    TC.interaction.refreshHover();
  };

  // ---- Drum kit and drum map ------------------------------------------------------------

  A.setKit = function (kit) {
    if (!TC.KITS[kit]) return;
    if (kit === 'custom' && !S.settings.kitCustom) S.settings.kitCustom = [...TC.drums.kit()];
    S.settings.kit = kit;
    TC.saveSettings();
    TC.refresh();
  };
  /** Kit profiles: which key of a drum VST is which instrument (dialog, js/kits.js). */
  A.openKits = () => TC.kits.open();
  /** Notation layout (where the instruments sit): a view setting, the score does not change. */
  A.setNotation = function (key) {
    if (!TC.NOTATIONS[key]) return;
    S.settings.notation = key;
    TC.drums.setNotation(key);
    TC.saveSettings();
    TC.refresh();
  };
  /** Stems: 'up' (all up, one voice), 'feet' (feet down), 'low' (feet + chosen low toms down). */
  A.setStems = function (mode) {
    if (!TC.drums.STEM_MODES.includes(mode)) return;
    S.settings.stems = mode;
    applyStems();
  };
  /** A tom goes down with the feet ('low' mode) - or not. */
  A.toggleStemLow = function (id) {
    id = Number(id);
    const low = new Set(Array.isArray(S.settings.stemsLow) ? S.settings.stemsLow : TC.drums.DEFAULT_LOW);
    if (low.has(id)) low.delete(id);
    else low.add(id);
    S.settings.stemsLow = [...low];
    applyStems();
  };
  function applyStems() {
    TC.drums.setStems(S.settings.stems, S.settings.stemsLow);
    // the notes move into the voices of the new setting; no undo step (only the notation changes)
    if (TC.score.revoice(S.doc)) {
      TC.history.rebase();
      S.rev++;
      TC.storage.scheduleAutosave();
    }
    TC.saveSettings();
    TC.refresh();
  }

  /** Rest cleanup of the drum track (rhythm.js R.ends): part of the score, so undoable. */
  A.setFill = function (fill) {
    const t = S.doc.tracks[0];
    if (!TC.rhythm.FILLS.includes(fill) || t.fill === fill) return;
    t.fill = fill;
    TC.commit();
  };
  /** Instrument in / out of the kit (the kit becomes a custom one). */
  A.toggleKitArt = function (id) {
    id = Number(id);
    const ids = TC.drums.kit();
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    S.settings.kitCustom = [...ids];
    S.settings.kit = 'custom';
    TC.saveSettings();
    TC.refresh();
  };
  A.toggleMapUsed = function () {
    S.settings.mapUsedOnly = !S.settings.mapUsedOnly;
    TC.saveSettings();
    TC.refresh();
  };

  /** Tool of the score: 'write', 'select' (frame, move several), 'erase'. */
  A.setTool = function (t) {
    if (!['write', 'select', 'erase'].includes(t)) return;
    S.tool = t;
    TC.ui.hint(tr({ write: 'Write notes', select: 'Select: frame, Shift + click, drag to move', erase: 'Eraser: tap or wipe over notes' }[t]));
    TC.refresh();
    TC.interaction.refreshHover();
  };
  /** All notes - or those of the selected bars, if several are selected. */
  A.selectAll = function () {
    const R = TC.barRange(), part = R && R[1] > R[0];
    S.selection = new Set();
    TC.score.eachNote(S.doc, (n, ev, vi, bi) => { if (!part || (bi >= R[0] && bi <= R[1])) S.selection.add(n.id); });
    TC.refresh();
    TC.ui.hint(tr('{n} note(s) selected', { n: S.selection.size }));
  };
  /** Selected notes one grid step earlier (-1) or later (1), across bars. */
  A.shiftSelection = function (dir) {
    if (!S.selection.size) return;
    if (TC.score.moveNotes(S.doc, [...S.selection], TC.gridTicks(S.input) * (dir < 0 ? -1 : 1))) TC.commit();
    else TC.ui.hint(tr('Cannot move there (a note of the same instrument, or the end of the score)'));
  };

  A.deleteSelection = function () {
    if (!S.selection.size) return;
    const n = TC.score.removeNotes(S.doc, selectedIds());
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('{n} note(s) deleted', { n }));
  };

  A.selectNone = function () {
    S.selection.clear();
    TC.selectBar(null);
    TC.refresh();
  };

  // ---- Bars -----------------------------------------------------------------------------

  const curBar = () => (S.selBar !== null ? S.selBar : S.doc.bars.length - 1);

  A.addBar = function () {
    TC.score.insertBars(S.doc, S.doc.bars.length, 1);
    TC.selectBar(S.doc.bars.length - 1);
    TC.commit();
  };
  A.insertBarBefore = function (i = curBar()) {
    TC.score.insertBars(S.doc, i, 1, S.doc.bars[i].ts);
    TC.selectBar(i);
    TC.commit();
  };
  A.insertBarAfter = function (i = curBar()) {
    TC.score.insertBars(S.doc, i + 1, 1, S.doc.bars[i].ts);
    TC.selectBar(i + 1);
    TC.commit();
  };
  /** Bar i, or all selected bars if i is one of them: [first, last]. */
  function rangeAt(i) {
    const R = TC.barRange();
    return R && R[1] > R[0] && i >= R[0] && i <= R[1] ? R : [i, i];
  }
  A.rangeAt = rangeAt;
  /** Delete bar i - or all selected bars, if i is one of them (at least one bar stays). */
  A.deleteBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    if (!TC.score.deleteBars(S.doc, a, b - a + 1)) return TC.ui.hint(tr('The last bar cannot be deleted'));
    S.doc.bars[0].simile = false; // the first bar has nothing before it to repeat
    TC.selectBar(Math.min(a, S.doc.bars.length - 1));
    TC.pruneSelection();
    TC.commit();
    if (b > a) TC.ui.hint(tr('{n} bars deleted', { n: b - a + 1 }));
  };
  /** Empty bar i - or all selected bars, if i is one of them. */
  A.clearBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    for (let k = a; k <= b; k++) TC.score.clearBar(S.doc, k);
    TC.pruneSelection();
    TC.commit();
  };

  /** Swing / shuffle of the score (%: 50 straight … 75 hard); part of the score, undoable. */
  A.setSwing = function (v) {
    S.doc.meta.swing = TC.clamp(Math.round(Number(v) || 50), 50, 80);
    TC.commit();
  };
  A.setSwingUnit = function (u) {
    S.doc.meta.swingUnit = Number(u) === 16 ? 16 : 8;
    TC.commit();
  };
  /** Swing also in the MIDI export (off: straight notes, to swing them in the DAW). */
  A.toggleSwingMidi = function () {
    S.settings.swingMidi = S.settings.swingMidi === false;
    TC.saveSettings();
    TC.refresh();
  };

  /** Tempo from bar i on ('' / 0: as the bars before; bar 1: the tempo of the score). */
  A.setBarTempo = function (v, i = curBar()) {
    const n = Math.round(Number(v) || 0);
    if (i === 0) {
      if (n) S.doc.meta.tempo = TC.clamp(n, 20, 400);
    } else {
      S.doc.bars[i].tempo = n ? TC.clamp(n, 20, 400) : null;
    }
    TC.commit();
  };
  A.clearBarTempo = (i) => A.setBarTempo('', Number(i));
  /** Select bar i and scroll it into view (tempo list in the panel). */
  A.gotoBar = function (i) {
    i = Number(i);
    if (!S.doc.bars[i]) return;
    TC.selectBar(i);
    S.selection.clear();
    TC.refresh();
    const L = TC.render.layout, b = L && L.bars[i];
    if (b) TC.player.keepInView({ x: L.systems[b.sys].tx + b.x + b.w / 2, y: L.systems[b.sys].ty + 2 * TC.render.SP });
  };
  A.editBarTempo = function (i = curBar()) {
    const v = prompt(tr('Tempo from bar {n} (quarter notes per minute) – empty: as before', { n: i + 1 }), i === 0 ? S.doc.meta.tempo : S.doc.bars[i].tempo || '');
    if (v !== null) A.setBarTempo(v, i);
  };
  /** Time signature "n/d" from bar i on (onlyThis: this bar alone). */
  A.setTimeSig = function (value, i = curBar(), onlyThis = false) {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(value));
    if (!m || !TC.score.setTimeSig(S.doc, i, [+m[1], +m[2]], onlyThis)) return TC.ui.hint(tr('Invalid time signature'));
    TC.pruneSelection();
    TC.commit();
  };
  A.customTimeSig = function (i = curBar()) {
    const v = prompt(tr('Time signature (e.g. 7/8, 11/16)'), S.doc.bars[i].ts.join('/'));
    if (v) A.setTimeSig(v, i);
  };
  /** Beam groups "2+2+3" from bar i on ('default': as usual for the time signature). */
  A.setBeam = function (value, i = curBar()) {
    const groups = !value || value === 'default' ? null : String(value).split('+').map(Number);
    if (!TC.score.setBeam(S.doc, i, groups)) return;
    TC.commit();
  };

  /** Copy bar i - or all selected bars, if i is one of them. */
  A.copyBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    S.clipboard = TC.score.copyBars(S.doc, a, b);
    if (a === b) TC.selectBar(i);
    TC.ui.hint(a === b ? tr('Bar {n} copied – click a bar and paste (Ctrl+V)', { n: a + 1 })
      : tr('Bars {a}–{b} copied – click a bar and paste (Ctrl+V)', { a: a + 1, b: b + 1 }));
    TC.refresh();
  };
  /** Paste the copied bar(s) from bar i on (the first of the selected bars); new bars at the end if needed. */
  A.pasteBar = function (i = curBar()) {
    if (!S.clipboard) return TC.ui.hint(tr('Copy a bar first (Ctrl+C)'));
    const at = rangeAt(i)[0];
    const n = TC.score.pasteBars(S.doc, at, S.clipboard);
    TC.selectBar(at);
    if (n > 1) TC.selectBar(at + n - 1, true);
    TC.pruneSelection();
    TC.commit();
    TC.ui.hint(n > 1 ? tr('Pasted into bars {a}–{b}', { a: at + 1, b: at + n }) : tr('Pasted into bar {n}', { n: at + 1 }));
  };
  /** A copy of the bar (or of the selected bars) right after it. */
  A.duplicateBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    const n = TC.score.duplicateBars(S.doc, a, b);
    TC.selectBar(b + 1);
    if (n > 1) TC.selectBar(b + n, true);
    TC.commit();
  };
  /**
   * "%": the bar repeats the bar before it. Switching it on empties the bar; switching it off
   * writes out the notes it repeated, so you can change them from there.
   */
  A.toggleSimile = function (i = curBar()) {
    if (i <= 0) return TC.ui.hint(tr('The first bar has no bar before it to repeat'));
    const h = S.doc.bars[i];
    if (h.simile) {
      TC.score.pasteBar(S.doc, i, TC.score.copyBar(S.doc, i - 1));
    } else {
      TC.score.clearBar(S.doc, i);
      h.simile = true;
    }
    TC.selectBar(i);
    TC.pruneSelection();
    TC.commit();
  };

  // ---- View -------------------------------------------------------------------------------

  TC.zoomAt = function (zoom, sx, sy) {
    const v = S.doc.view;
    const z = TC.clamp(zoom, 0.25, 4);
    v.x = sx - (sx - v.x) * (z / v.zoom);
    v.y = sy - (sy - v.y) * (z / v.zoom);
    v.zoom = z;
    TC.render.applyView();
    TC.ui.updateZoom();
  };
  function zoomCenter(factor) {
    const r = document.getElementById('viewport').getBoundingClientRect();
    TC.zoomAt(S.doc.view.zoom * factor, r.width / 2, r.height / 2);
  }
  A.zoomIn = () => zoomCenter(1.25);
  A.zoomOut = () => zoomCenter(1 / 1.25);
  /** Back to the default size (160 %). */
  A.zoomReset = () => zoomCenter(TC.DEFAULT_ZOOM / S.doc.view.zoom);
  /** Back to the start of the piece. */
  A.home = function () {
    const v = S.doc.view;
    if (TC.render.isPage()) {
      // the first page, centred
      const w = document.getElementById('viewport').clientWidth;
      v.x = Math.max((S.settings.showDrumMap ? 130 : 20) * v.zoom, (w - TC.render.PAGE_W * v.zoom) / 2);
      v.y = 20;
    } else {
      v.x = (S.settings.showDrumMap ? 150 : 30) * v.zoom;
      v.y = 165 * v.zoom;
    }
    TC.render.applyView();
  };

  A.toggleDrumMap = function () {
    S.settings.showDrumMap = !S.settings.showDrumMap;
    TC.saveSettings();
    if (S.settings.showDrumMap && S.doc.view.x < 150 * S.doc.view.zoom) A.home();
    TC.refresh();
  };
  /** Show / hide a panel: side 'right' = score settings, otherwise the note panel. */
  A.togglePanel = function (side) {
    const k = side === 'right' ? 'showPanelRight' : 'showPanel';
    S.settings[k] = !S.settings[k];
    TC.saveSettings();
    TC.panel.applyLayout();
  };
  A.togglePanelRight = () => A.togglePanel('right');
  /** Settings window (drum kit, notation, page, view, keys): open / close. */
  A.openSettings = () => TC.panel.openSettings();
  /** Left-handed: the note panel goes to the right, the settings to the left. */
  /** Fingers write notes on the lines (off: pen / mouse only, a finger selects and scrolls). */
  A.toggleFingerWrites = function () {
    S.settings.fingerWrites = S.settings.fingerWrites === false;
    TC.saveSettings();
    TC.refresh();
  };
  A.toggleLeftHanded = function () {
    S.settings.leftHanded = !S.settings.leftHanded;
    TC.saveSettings();
    TC.panel.applyLayout();
    TC.refresh();
  };
  function toggleSetting(k) {
    S.settings[k] = !S.settings[k];
    TC.saveSettings();
    TC.refresh();
  }
  A.toggleCounts = () => toggleSetting('showCounts');
  A.toggleSound = () => toggleSetting('sound');
  A.toggleMetronome = () => toggleSetting('metronome');
  A.toggleMidiSynth = () => toggleSetting('midiOutSynth');
  /** Recorded drum sounds instead of the synthesizer (loaded the first time). */
  A.toggleSamples = function () {
    toggleSetting('samples');
    const ctx = S.settings.samples && TC.audio.context();
    if (ctx && TC.samples.state() !== 'ready') {
      TC.samples.load(ctx).then((ok) => TC.ui.hint(tr(ok ? 'Recorded drum sounds ready' : 'The recordings could not be loaded (offline, or opened as a file) – the synthesizer plays.')));
    }
  };
  /** Lead of the MIDI output in ms (the drum VST's delay is made up for). */
  A.setMidiLead = function (ms) {
    S.settings.midiLead = TC.clamp(Math.round(Number(ms) || 0), 0, 500);
    TC.saveSettings();
    if (TC.player.playing) TC.player.restartHere();
    TC.refresh();
  };
  /**
   * Sound of the playback: '' = Tactus' own sounds, '?' = look for MIDI outputs (the browser asks
   * once), otherwise the name of a MIDI output (js/midiout.js: Cubase plays the notes).
   */
  A.setMidiOut = function (value) {
    if (value === '?') {
      TC.midiOut.init().then((ok) => {
        if (!ok) TC.ui.hint(tr('MIDI is not available (Chrome / Edge, and allow it when the browser asks).'));
        else if (!TC.midiOut.outputs().length) TC.ui.hint(tr('No MIDI output found - is the virtual MIDI cable (e.g. loopMIDI) running?'));
        TC.refresh();
      });
      return;
    }
    if (TC.player.playing) TC.player.stop(true);
    S.settings.midiOut = value || '';
    if (value) S.settings.midiOutLast = value; // for the switch in the toolbar
    TC.saveSettings();
    TC.refresh();
  };
  /** Toolbar: Tactus sounds ↔ the MIDI output chosen last. */
  A.toggleSoundOut = function () {
    if (S.settings.midiOut) {
      S.settings.midiOutLast = S.settings.midiOut;
      return A.setMidiOut('');
    }
    const last = S.settings.midiOutLast;
    if (!last) return TC.ui.hint(tr('Choose a MIDI output first: panel → Playback → Sound.'));
    TC.midiOut.init().then(() => {
      A.setMidiOut(last);
      if (TC.midiOut.missing()) TC.ui.hint(tr('No MIDI output found - is the virtual MIDI cable (e.g. loopMIDI) running?'));
    });
  };
  /** The view follows the playback cursor (off: it stays, to change notes while listening). */
  A.toggleFollowPlay = function () {
    S.settings.followPlay = S.settings.followPlay === false;
    TC.saveSettings();
    TC.refresh();
    TC.ui.hint(tr(S.settings.followPlay ? 'The view follows the playback' : 'The view stays where it is while playing'));
  };
  A.toggleCountIn = () => toggleSetting('countIn');
  A.toggleLoop = function () {
    toggleSetting('loop');
    if (TC.player.playing) TC.player.restartHere();
  };
  A.togglePlay = () => TC.player.toggle();
  A.stop = () => TC.player.stop();
  A.setVolume = function (v) {
    S.settings.volume = TC.clamp(Number(v), 0, 1);
    TC.audio.setVolume(S.settings.volume);
    TC.saveSettings();
  };

  A.toggleTheme = function () {
    const order = ['auto', 'light', 'dark'];
    S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % 3];
    TC.saveSettings();
    TC.applyTheme();
  };
  A.toggleLang = function () {
    TC.setLang(S.settings.lang === 'de' ? 'en' : 'de');
  };
  /** Endless view (all bars in one row) or page view (A4 pages, as printed). */
  A.layout = function (mode) {
    mode = mode === 'page' ? 'page' : 'endless';
    if (S.settings.layout === mode) return;
    S.settings.layout = mode;
    TC.saveSettings();
    const v = S.doc.view;
    if (mode === 'page') {
      // the whole width of a page in view
      const w = document.getElementById('viewport').clientWidth;
      v.zoom = TC.clamp((w - 40) / TC.render.PAGE_W, 0.3, TC.DEFAULT_ZOOM);
    } else {
      v.zoom = TC.DEFAULT_ZOOM;
    }
    TC.render.draw();
    A.home();
    TC.refresh();
  };
  A.toggleLayout = () => A.layout(S.settings.layout === 'page' ? 'endless' : 'page');

  /** PDF / print: the page view on A4 (the browser's print dialog: "Save as PDF"). */
  A.print = function () {
    if (TC.player.playing) TC.player.stop();
    TC.render.print();
  };

  // ---- Page: bar text, line breaks, bars per line, bar numbers --------------------------------

  /** Text above bar i (Verse, Chorus, Fill …); empty removes it. */
  A.setMarker = function (text, i = curBar()) {
    const h = S.doc.bars[i];
    const t = String(text || '').trim().slice(0, 40);
    if (!h || h.marker === t) return;
    h.marker = t;
    TC.commit();
  };
  A.editMarker = function (i = curBar()) {
    const v = prompt(tr('Text above bar {n} (e.g. Verse, Chorus) – empty: remove', { n: i + 1 }), S.doc.bars[i].marker || '');
    if (v !== null) A.setMarker(v, i);
  };
  /** Page view: bar i starts a new line (the break is kept at the bar after it). */
  A.toggleLineBreak = function (i = curBar()) {
    if (i <= 0) return;
    S.doc.bars[i].lineBreak = !S.doc.bars[i].lineBreak;
    TC.commit();
    if (!TC.render.isPage()) TC.ui.hint(tr('Line breaks show in the page view'));
  };
  /** Page view: a new line after bar i (= from bar i + 1). */
  A.toggleBreakAfter = function (i = curBar()) {
    if (i < S.doc.bars.length - 1) A.toggleLineBreak(i + 1);
  };
  A.setBarsPerLine = function (n) {
    n = TC.clamp(Math.round(Number(n) || 0), 0, 12);
    if (S.doc.page.barsPerLine === n) return;
    S.doc.page.barsPerLine = n;
    TC.commit();
  };
  /** Page margins in mm (page view / PDF). */
  A.setMargin = function (mm) {
    mm = Number(mm);
    if (!TC.MARGINS.includes(mm) || S.doc.page.margin === mm) return;
    S.doc.page.margin = mm;
    TC.commit();
  };
  /** Title and "Page 2 / 3" at the top of the pages after the first (else only the number at the bottom). */
  A.togglePageHeader = function () {
    S.doc.page.header = !S.doc.page.header;
    TC.commit();
  };
  /** Page view / PDF: empty bars in a row as one multi-bar rest. */
  A.toggleMultiRest = function () {
    S.doc.page.multiRest = !S.doc.page.multiRest;
    TC.commit();
  };
  A.setBarNumbers = function (mode) {
    if (!TC.BAR_NUMBERS.includes(mode) || S.doc.page.barNumbers === mode) return;
    S.doc.page.barNumbers = mode;
    TC.commit();
  };

  // ---- History, files -----------------------------------------------------------------------

  A.undo = function () {
    if (TC.history.undo()) {
      S.dirty = true;
      TC.storage.scheduleAutosave();
      TC.refresh();
    }
  };
  A.redo = function () {
    if (TC.history.redo()) {
      S.dirty = true;
      TC.storage.scheduleAutosave();
      TC.refresh();
    }
  };
  A.newScore = () => TC.storage.newScore();
  A.open = () => TC.storage.open();
  A.save = () => TC.storage.save(false);
  A.saveAs = () => TC.storage.save(true);
  A.demo = () => TC.storage.loadDemo();

  // ---- Dropbox (js/dropbox.js) ----------------------------------------------------------------
  A.dropboxConnect = () => TC.dropbox.login(null);
  A.dropboxOpen = () => TC.dropbox.openSongs(); // asks about unsaved changes when a song is chosen
  A.dropboxSave = () => TC.dropbox.saveSong(false);
  A.dropboxSaveAs = () => TC.dropbox.saveSong(true);
  A.dropboxDisconnect = async function () {
    if (!confirm(tr('Disconnect Dropbox in this browser? Your files stay in Dropbox.'))) return;
    await TC.dropbox.disconnect();
    if (S.file.dropbox) S.file.dropbox = null;
    TC.storage.autosave();
    TC.refresh();
    TC.ui.hint(tr('Dropbox disconnected'));
  };
  function dropboxItems() {
    const DB = TC.dropbox;
    if (!DB || !DB.allowed) return [{ label: 'Dropbox (online version only)', disabled: true }];
    if (!DB.signedIn()) return [{ label: 'Connect Dropbox…', action: A.dropboxConnect }];
    const acc = DB.account();
    return [
      { label: 'Open from Dropbox…', action: A.dropboxOpen },
      { label: 'Save to Dropbox', action: A.dropboxSave, shortcut: S.file.dropbox ? 'Ctrl+S' : '' },
      { label: 'Save to Dropbox as…', action: A.dropboxSaveAs },
      { label: TC.tr('Disconnect Dropbox') + (acc ? ' (' + acc + ')' : ''), action: A.dropboxDisconnect },
    ];
  }

  A.fileMenu = function () {
    const r = document.getElementById('file-btn').getBoundingClientRect();
    TC.menu.open([
      { label: 'New score', action: A.newScore },
      { label: 'Open…', action: A.open, shortcut: 'Ctrl+O' },
      '-',
      { label: 'Save', action: A.save, shortcut: 'Ctrl+S' },
      { label: 'Save as…', action: A.saveAs, shortcut: 'Ctrl+Shift+S' },
      '-',
      ...dropboxItems(),
      { label: 'Copy a link to share', action: () => TC.share.copyLink() },
      '-',
      { label: 'Load example groove', action: A.demo },
      { label: 'PDF / print…', action: A.print, shortcut: 'Ctrl+P' },
      '-',
      { label: 'Import MIDI…', action: A.importMidi },
      { label: TC.tr('Export MIDI ({name})', { name: kitName() }), action: () => A.exportMidiCurrent(), shortcut: 'Ctrl+E' },
      { label: 'Export MIDI for', submenu: A.midiTargets() },
    ], r.left, r.bottom + 2);
  };

  const curKit = () => { const p = TC.kits.current(S.doc); return p ? p.id : null; };
  const kitName = () => { const p = TC.kits.current(S.doc); return p ? p.name : 'General MIDI'; };

  /** Targets of the MIDI export: General MIDI (also Guitar Pro) and every kit profile. */
  A.midiTargets = function () {
    TC.kits.load();
    const items = [{ label: 'General MIDI (Guitar Pro …)', action: () => A.exportMidi(null) }];
    if (TC.kits.list.length) items.push('-');
    for (const p of TC.kits.list) items.push({ label: TC.tr('Kit profile: {name}', { name: p.name }), action: () => A.exportMidi(p.id) });
    items.push('-', { label: 'Kit profiles (Cubase)…', action: A.openKits });
    return items;
  };

  /** MIDI import (js/midiin.js): choose a file, where it comes from and the grid. */
  A.importMidi = () => TC.midiIn.pick();

  /** MIDI export with the score's kit profile (Ctrl+E). */
  A.exportMidiCurrent = () => A.exportMidi(curKit());

  /** Kit profile of the score (status bar): which keys the MIDI export uses. Part of the score. */
  A.setKitProfile = function (id) {
    const p = id ? TC.kits.byId(id) : null;
    S.doc.meta.kit = p ? p.id : '';
    S.doc.meta.kitName = p ? p.name : '';
    TC.commit();
    // instruments of the score the profile has no key for: show them right away
    if (p && TC.kits.check(S.doc, p).length) TC.kits.openCheck(p);
  };
  A.kitMenu = function () {
    TC.kits.load();
    const r = document.getElementById('status-kit').getBoundingClientRect();
    const cur = curKit();
    const items = [];
    const p = TC.kits.byId(cur);
    if (p) {
      const n = TC.kits.check(S.doc, p).length;
      items.push({ label: n ? tr('Missing in this profile ({n})…', { n }) : tr('Check the kit profile…'), action: () => TC.kits.openCheck(p) }, '-');
    }
    items.push({ label: 'General MIDI (Guitar Pro …)', checked: !cur, action: () => A.setKitProfile(null) });
    if (TC.kits.list.length) items.push('-');
    for (const p of TC.kits.list) items.push({ label: p.name, checked: p.id === cur, action: () => A.setKitProfile(p.id) });
    items.push('-', { label: 'Kit profiles (Cubase)…', action: A.openKits });
    TC.menu.open(items, r.left, r.top - 4 - items.length * 30);
  };

  /** Writes the score as a MIDI file (js/midi.js) for General MIDI or a kit profile. */
  A.exportMidi = function (profileId) {
    const p = profileId ? TC.kits.byId(profileId) : null;
    const res = TC.midi.build(S.doc, p, { straight: S.settings.swingMidi === false });
    const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, '-');
    const base = clean(S.doc.meta.title || S.file.name.replace(/\.tactus\.json$|\.json$/i, '') || 'Tactus');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([res.bytes], { type: 'audio/midi' }));
    a.download = base + (p ? ' (' + clean(p.name) + ')' : '') + '.mid';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    const lab = (x) => TC.drums.label(x);
    const lines = res.replaced.map((r) => TC.tr('{a} played as {b}', { a: lab(r.art), b: lab(r.by) }))
      .concat(res.missing.map((x) => TC.tr('{a}: no key in the profile, left out', { a: lab(x) })));
    if (lines.length) alert(TC.tr('MIDI exported. The kit profile "{name}" has no key for:', { name: p.name }) + '\n\n' + lines.join('\n'));
    else TC.ui.status(TC.tr('MIDI exported: {file}', { file: a.download }));
  };
  A.zoomMenu = function () {
    const r = document.getElementById('zoom-label').getBoundingClientRect();
    TC.menu.open([
      { label: 'Zoom in', action: A.zoomIn, shortcut: 'Ctrl++' },
      { label: 'Zoom out', action: A.zoomOut, shortcut: 'Ctrl+-' },
      { label: 'Default size (160 %)', action: A.zoomReset, shortcut: 'Ctrl+0' },
      '-',
      { label: 'To the start', action: A.home, shortcut: 'Home' },
    ], r.left, r.bottom + 2);
  };

  /** Right-click on a bar. */
  // ---- Repeats and endings (played / exported written out, model.js playOrder) ----------------

  A.toggleRepeatStart = function (i = curBar()) {
    S.doc.bars[i].repeatStart = !S.doc.bars[i].repeatStart;
    TC.commit();
  };
  /** Repeat end at bar i: played n times in all (0: none). */
  A.setRepeatEnd = function (n, i = curBar()) {
    n = TC.clamp(Math.round(Number(n) || 0), 0, 9);
    S.doc.bars[i].repeatEnd = n > 1 ? n : 0;
    TC.commit();
  };
  /** Ending of bar i: '' none, '1', '2', '1,2' … */
  A.setVolta = function (v, i = curBar()) {
    S.doc.bars[i].volta = TC.cleanVolta(String(v || '').split(',').map(Number));
    TC.commit();
  };
  /** The selected bars as a repeat (|: … :|, twice). */
  A.repeatSelection = function (times = 2) {
    const R = TC.barRange();
    if (!R) return TC.ui.hint(tr('Select bars first'));
    S.doc.bars[R[0]].repeatStart = true;
    S.doc.bars[R[1]].repeatEnd = TC.clamp(Number(times) || 2, 2, 9);
    TC.commit();
    TC.ui.hint(tr('Bars {a}–{b} are repeated', { a: R[0] + 1, b: R[1] + 1 }));
  };
  /** Write the repeats out in the score: bar numbers as in Cubase (one undo step). */
  A.unfoldRepeats = function () {
    if (!TC.score.hasRepeats(S.doc)) return TC.ui.hint(tr('The score has no repeats'));
    if (!confirm(tr('Write the repeats out as bars of their own? The bar numbers will then be those of Cubase. (Undo is possible.)'))) return;
    const n = TC.score.unfold(S.doc);
    TC.selectBar(null);
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('Repeats written out: {n} bars', { n }));
  };
  /** 𝄋 Segno / ⊕ Coda at the start of bar i ('' none); only one bar has each sign. */
  A.setMark = function (v, i = curBar()) {
    v = TC.MARKS.includes(v) ? v : '';
    if (v) S.doc.bars.forEach((b) => { if (b.mark === v) b.mark = ''; });
    S.doc.bars[i].mark = v;
    TC.commit();
  };
  /** Fine / To Coda at the end of bar i ('' none). */
  A.setEnd = function (v, i = curBar()) {
    S.doc.bars[i].end = TC.ENDS.includes(v) ? v : '';
    TC.commit();
  };
  /** D.C. / D.S. … at the end of bar i ('' none). */
  A.setJump = function (v, i = curBar()) {
    const h = S.doc.bars[i];
    h.jump = TC.JUMPS.includes(v) ? v : '';
    if (!h.jump) h.jumpRep = false;
    TC.commit();
    const p = TC.score.jumpProblems(S.doc).filter((x) => x.bar === i);
    if (p.length) TC.ui.hint(A.jumpProblemText(p[0]));
  };
  A.toggleJumpRep = function (i = curBar()) {
    S.doc.bars[i].jumpRep = !S.doc.bars[i].jumpRep;
    TC.commit();
  };
  A.jumpProblemText = (p) => tr({ noSegno: 'D.S.: no 𝄋 Segno in the score yet (bar menu or panel)', noFine: 'al Fine: no bar with Fine yet',
    noToCoda: 'al Coda: no bar with "To Coda" yet', noCoda: 'al Coda: no bar with ⊕ Coda (start of the coda) yet' }[p.problem]);
  const JUMP_LABELS = [['', '–'], ['dc', 'D.C. (from the start)'], ['dcFine', 'D.C. al Fine'], ['dcCoda', 'D.C. al Coda'],
    ['ds', 'D.S. (from 𝄋)'], ['dsFine', 'D.S. al Fine'], ['dsCoda', 'D.S. al Coda']];
  A.JUMP_LABELS = JUMP_LABELS;

  /** How jumps work: a short explanation with an example (until the manual exists). */
  A.jumpHelp = function () {
    TC.help.open(tr('How jumps work'), JUMP_HELP());
  };
  const JUMP_HELP = () => TC.getLang && TC.getLang() === 'de' ? `
    <p><b>D.C.</b> (Da Capo) = zurück zum Anfang. <b>D.S.</b> (Dal Segno) = zurück zum Zeichen <b>𝄋 Segno</b>.</p>
    <p><b>… al Fine</b>: nach dem Sprung bis zum Takt mit <b>Fine</b> spielen – dort ist Schluss.<br>
       <b>… al Coda</b>: nach dem Sprung bis <b>To Coda</b> spielen, dann weiter beim Takt mit <b>⊕ Coda</b> (dem Schlussteil).</p>
    <p>Fine und To Coda gelten erst <b>nach</b> dem Sprung; beim ersten Durchlauf spielt man darüber hinweg.</p>
    <p class="help-ex">Takt&nbsp; 1 2 | 3&nbsp;𝄋 4 | 5 6&nbsp;(To Coda) | 7 8&nbsp;(D.S. al Coda) | 9&nbsp;⊕ 10<br>
       gespielt: 1 2 3 4 5 6 7 8 → 𝄋 → 3 4 5 6 → ⊕ → 9 10</p>
    <p><b>Wiederholungen nach dem Sprung</b> werden nur einmal gespielt, bei 1. / 2. Klammer die letzte
       (so ist es üblich). Steht „con rip.“ in den Noten: Häkchen „Wiederholungen nach dem Sprung mitspielen“.</p>
    <p class="help-ex">Takt&nbsp; 1 | 2&nbsp;𝄋 |: 3 [1. 4 :| [2. 5 (Fine) | 6 (D.S. al Fine)<br>
       gespielt: 1 2 3 4 3 5 6 → 𝄋 → 2 3 5 Ende</p>
    <p>Setzen: Takt-Panel → <b>Wiederholungen &amp; Sprünge</b>, oder Rechtsklick auf den Takt. Abspielen, Cursor und
       MIDI-Export folgen den Sprüngen (in Cubase mit Markern „D.S. – Takt 3“, „Coda – Takt 9“).</p>` : `
    <p><b>D.C.</b> (da capo) = back to the start. <b>D.S.</b> (dal segno) = back to the sign <b>𝄋 segno</b>.</p>
    <p><b>… al Fine</b>: after the jump play up to the bar with <b>Fine</b> – the end.<br>
       <b>… al Coda</b>: after the jump play up to <b>To Coda</b>, then go on at the bar with <b>⊕ Coda</b>.</p>
    <p>Fine and To Coda count only <b>after</b> the jump.</p>
    <p class="help-ex">bars&nbsp; 1 2 | 3&nbsp;𝄋 4 | 5 6&nbsp;(To Coda) | 7 8&nbsp;(D.S. al Coda) | 9&nbsp;⊕ 10<br>
       played: 1 2 3 4 5 6 7 8 → 𝄋 → 3 4 5 6 → ⊕ → 9 10</p>
    <p><b>Repeats after the jump</b> are played once, with endings the last one (the usual way). For "con rip.":
       tick "Play the repeats after the jump".</p>`;
  const VOLTAS = [['', '–'], ['1', '1.'], ['2', '2.'], ['3', '3.'], ['4', '4.'], ['1,2', '1., 2.'], ['1,2,3', '1., 2., 3.']];
  A.VOLTAS = VOLTAS;
  /** Submenu "Repeat" of bar i. */
  function repeatItems(i) {
    const h = S.doc.bars[i], R = TC.barRange(), vk = (h.volta || []).join(',');
    const items = [
      { label: 'Repeat starts here |:', checked: !!h.repeatStart, action: () => A.toggleRepeatStart(i) },
      { label: 'Repeat ends here :|', submenu: [0, 2, 3, 4, 5, 6].map((n) => ({
        label: n ? tr('{n} times', { n }) : tr('none'), checked: (h.repeatEnd || 0) === n, action: () => A.setRepeatEnd(n, i),
      })) },
      { label: 'Ending (1st / 2nd time bar)', submenu: VOLTAS.map(([v, l]) => ({ label: l, checked: vk === v, action: () => A.setVolta(v, i) })) },
      '-',
      { label: 'Sign at the start', submenu: [['', '–'], ['segno', '𝄋 Segno (D.S. jumps here)'], ['coda', '⊕ Coda (the coda starts here)']]
        .map(([v, l]) => ({ label: l, checked: (h.mark || '') === v, action: () => A.setMark(v, i) })) },
      { label: 'At the end', submenu: [['', '–'], ['fine', 'Fine'], ['toCoda', 'To Coda ⊕']]
        .map(([v, l]) => ({ label: l, checked: (h.end || '') === v, action: () => A.setEnd(v, i) })) },
      { label: 'Jump back at the end', submenu: JUMP_LABELS.map(([v, l]) => ({ label: l, checked: (h.jump || '') === v, action: () => A.setJump(v, i) })) },
      ...(h.jump ? [{ label: 'Play the repeats after the jump', checked: !!h.jumpRep, action: () => A.toggleJumpRep(i) }] : []),
      { label: 'How jumps work…', action: A.jumpHelp },
    ];
    if (R && R[1] > R[0]) {
      items.unshift({ label: tr('Repeat bars {a}–{b}', { a: R[0] + 1, b: R[1] + 1 }), action: () => A.repeatSelection(2) },
        { label: tr('𝄋 Segno on bar {a}', { a: R[0] + 1 }), action: () => A.setMark('segno', R[0]) },
        { label: tr('D.S. al Coda after bar {b}', { b: R[1] + 1 }), action: () => A.setJump('dsCoda', R[1]) }, '-');
    }
    items.push('-', { label: 'Write the repeats out (bar numbers as in Cubase)…', action: A.unfoldRepeats, disabled: !TC.score.hasRepeats(S.doc) });
    return items;
  }

  /** Select the bars from the selected one (or `from`) up to bar i (e.g. to play / loop them). */
  A.selectBarsTo = function (i, from) {
    i = Number(i);
    if (!S.doc.bars[i]) return;
    if (from !== undefined && from !== null) TC.selectBar(from);
    if (S.selBar === null) TC.selectBar(i);
    else TC.selectBar(i, true);
    S.selection.clear();
    TC.refresh();
    const [a, b] = TC.barRange();
    TC.ui.hint(a === b ? tr('Bar {n} selected', { n: a + 1 }) : tr('Bars {a}–{b} selected', { a: a + 1, b: b + 1 }));
  };

  /** Right-click / long press on bar i; before: the bar selected until then (offers "bars before … to i"). */
  A.barMenu = function (i, x, y, before) {
    const h = S.doc.bars[i];
    const R = TC.barRange();
    const multi = R && R[1] > R[0];
    // copy / duplicate / clear / delete work on all selected bars when the menu is opened on one of them
    const [ra, rb] = rangeAt(i), many = rb > ra, ab = { a: ra + 1, b: rb + 1 };
    const clipN = S.clipboard ? (S.clipboard.bars ? S.clipboard.bars.length : 1) : 0;
    const extend = before !== undefined && before !== null && before !== i && !(multi && i >= R[0] && i <= R[1])
      ? { label: tr('Select bars {a}–{b}', { a: Math.min(before, i) + 1, b: Math.max(before, i) + 1 }), action: () => A.selectBarsTo(i, before) }
      : null;
    const play = multi && i >= R[0] && i <= R[1]
      ? { label: tr('Play bars {a}–{b}', { a: R[0] + 1, b: R[1] + 1 }), action: () => TC.player.play(), shortcut: tr('Space') }
      : { label: 'Play from here', action: () => TC.player.play(i), shortcut: tr('Space') };
    const sigs = TC.TIME_SIGS.map((ts) => ({
      label: ts.join('/'), checked: h.ts.join('/') === ts.join('/'), action: () => A.setTimeSig(ts.join('/'), i),
    }));
    const groups = TC.beamChoices(h.ts);
    const cur = (TC.beamGroups(h.ts, h.beam) || []).join('+');
    const beamItems = groups.map((g, k) => ({
      label: g.join('+') + (k === 0 ? ' ' + tr('(default)') : ''), checked: g.join('+') === cur,
      action: () => A.setBeam(k === 0 ? 'default' : g.join('+'), i),
    }));
    TC.menu.open([
      { label: 'Time signature from here', submenu: sigs.concat(['-', { label: 'Other…', action: () => A.customTimeSig(i) }]) },
      beamItems.length ? { label: 'Beam groups', submenu: beamItems } : null,
      { label: 'Repeat & jump', submenu: repeatItems(i) },
      '-',
      extend,
      play,
      '-',
      { label: many ? tr('Copy bars {a}–{b}', ab) : 'Copy bar', action: () => A.copyBar(i), shortcut: 'Ctrl+C' },
      { label: clipN > 1 ? tr('Paste {n} bars from here', { n: clipN }) : 'Paste into this bar', action: () => A.pasteBar(i), shortcut: 'Ctrl+V', disabled: !S.clipboard },
      { label: many ? tr('Duplicate bars {a}–{b}', ab) : 'Duplicate bar', action: () => A.duplicateBar(i), shortcut: 'Ctrl+D' },
      { label: 'Repeat the bar before (%)', checked: !!h.simile, action: () => A.toggleSimile(i), disabled: i === 0 },
      '-',
      { label: TC.tr('Tempo from here…') + (i > 0 && h.tempo ? ` (${h.tempo})` : ''), action: () => A.editBarTempo(i) },
      { label: 'Text above the bar…', action: () => A.editMarker(i) },
      { label: 'Line break after this bar', checked: !!(S.doc.bars[i + 1] && S.doc.bars[i + 1].lineBreak), action: () => A.toggleBreakAfter(i), disabled: i === S.doc.bars.length - 1 },
      { label: 'New line from this bar', checked: !!h.lineBreak, action: () => A.toggleLineBreak(i), disabled: i === 0 },
      '-',
      { label: 'Insert bar before', action: () => A.insertBarBefore(i) },
      { label: 'Insert bar after', action: () => A.insertBarAfter(i) },
      { label: many ? tr('Clear bars {a}–{b}', ab) : 'Clear bar', action: () => A.clearBar(i) },
      { label: many ? tr('Delete bars {a}–{b}', ab) : 'Delete bar', action: () => A.deleteBar(i), disabled: S.doc.bars.length < 2 },
    ].filter(Boolean), x, y);
  };
})(window.TC);
