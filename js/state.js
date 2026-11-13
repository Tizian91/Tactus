'use strict';
/*
 * Global namespace TC, app state and undo/redo history.
 * Same pattern as MindMapper (js/state.js there): change the model in
 * TC.state.doc, then call TC.commit() - that records an undo step,
 * autosaves and redraws.
 *
 * The document model itself (bars, tracks, events, notes) is described in model.js.
 */
window.TC = window.TC || {};

(function (TC) {
  TC.uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  TC.clone = (obj) => JSON.parse(JSON.stringify(obj));
  TC.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  TC.state = {
    doc: null,              // the score, set by main.js (TC.emptyScore / storage)
    selection: new Set(),   // ids of selected notes
    selBar: null,           // index of the bar shown in the panel's "Bar" section
    selBarEnd: null,        // other end of a range of selected bars (null: only selBar), see TC.barRange
    tool: 'write',          // 'write' | 'select' (frame, move several) | 'erase' (note panel, keys W / V / E)
    hover: null,            // where the pointer is: { bar, tick, line, art } (render.js draws a preview)
    drag: null,             // pan with the middle mouse / space (interaction.js)
    // what the next click writes (left panel)
    input: {
      value: 8,             // note value: 1 whole, 2 half, 4 quarter, 8 eighth, 16, 32, 64
      dotted: false,
      triplet: false,
      art: 42,              // drum articulation (drummap.js), 42 = hi-hat closed
      accent: 0,            // 0 none, 1 accent (>), 2 marcato (^)
      ghost: false,         // ghost note: head in parentheses, played softly
      head: 'auto',         // notehead: 'auto' = as the drum map says
      lock: false,          // instrument lock: a click anywhere in the column writes the selected instrument
      orn: null,            // grace notes: null | 'flam' | 'drag'
      trem: 0,              // roll strokes 0 … 3
      stick: '',            // sticking '' | 'R' | 'L'
    },
    settings: {
      theme: 'auto',        // 'auto' | 'light' | 'dark'
      lang: 'de',           // 'de' | 'en'
      showPanel: true,      // left panel: settings per note
      panelWidth: 270,
      showPanelRight: true, // right panel: score, bar, drum kit, view
      panelRightWidth: 270,
      leftHanded: false,    // swaps the two panels
      fingerWrites: true,   // a finger on the lines writes notes (off: only pen / mouse; fingers select and scroll)
      showDrumMap: true,    // instrument names next to the lines
      mapUsedOnly: false,   // drum map: only instruments used in the score (+ the selected one)
      kit: 'standard',      // drum kit (drummap.js TC.KITS)
      notation: 'tactus',   // where instruments sit on the staff (drummap.js TC.NOTATIONS)
      stems: 'low',         // stems: 'up' all up (one voice), 'feet' feet down, 'low' feet + low toms down
      stemsLow: [43, 41],   // the toms that go down with 'low' (floor toms)
      importKit: '',        // MIDI import: kit profile the last file came from ('' = General MIDI)
      importGrid: '16t',    // MIDI import: grid (js/midiin.js)
      kitCustom: null,      // ids of the custom kit
      layout: 'endless',    // 'endless' | 'page' (A4 pages as printed)
      zoomV2: false,        // the default size became 160 % (older scores are enlarged once)
      showCounts: false,    // counting (1 e + a) under the staff
      sound: true,          // play a note when it is written
      metronome: false,     // click while playing
      followPlay: true,     // the view follows the playback cursor (off: it stays where it is)
      countIn: false,       // one bar of clicks before playing
      loop: false,          // playback repeats (the selected bar, or everything)
      volume: 0.8,
    },
    clipboard: null,        // copied bar (TC.score.copyBar)
    file: { handle: null, name: 'Untitled.tactus.json', saved: false },
    dirty: false,
    rev: 0,                 // bumped on every change of the doc
  };

  // ---- Undo / redo -------------------------------------------------------
  // Snapshot based: after every finished user operation call TC.commit().
  // The view (scroll position, zoom) is not part of the history.

  const snapshot = () => {
    const d = TC.state.doc;
    return JSON.stringify({ meta: d.meta, bars: d.bars, tracks: d.tracks });
  };

  TC.history = {
    undoStack: [],
    redoStack: [],
    last: null,
    limit: 300,

    reset() {
      this.undoStack = [];
      this.redoStack = [];
      this.last = snapshot();
    },

    commit() {
      const s = snapshot();
      if (s === this.last) return false;
      this.undoStack.push(this.last);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
      this.last = s;
      return true;
    },

    restore(s) {
      const data = JSON.parse(s);
      Object.assign(TC.state.doc, data);
      this.last = s;
      if (TC.score && TC.score.revoice(TC.state.doc)) this.last = snapshot(); // stems may have been switched since
      TC.pruneSelection();
      TC.state.rev++;
    },

    /** The doc changed without an undo step of its own (e.g. stems switched): the next step starts from here. */
    rebase() {
      this.last = snapshot();
    },

    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.last);
      this.restore(this.undoStack.pop());
      return true;
    },

    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.last);
      this.restore(this.redoStack.pop());
      return true;
    },
  };

  /** Select bar i (extend: from the bar selected before up to i, e.g. to play several bars). */
  TC.selectBar = function (i, extend) {
    const S = TC.state;
    if (extend && S.selBar !== null && i !== null) {
      S.selBarEnd = i === S.selBar ? null : i;
    } else {
      S.selBar = i;
      S.selBarEnd = null;
    }
  };
  /** The selected bars [first, last] (a single bar: [i, i]), or null. */
  TC.barRange = function () {
    const S = TC.state, n = S.doc ? S.doc.bars.length : 0;
    if (S.selBar === null || S.selBar >= n) return null;
    const e = S.selBarEnd !== null && S.selBarEnd < n ? S.selBarEnd : S.selBar;
    return [Math.min(S.selBar, e), Math.max(S.selBar, e)];
  };

  /** Remove selected ids whose notes no longer exist. */
  TC.pruneSelection = function () {
    for (const id of [...TC.state.selection]) {
      if (!TC.score.findNote(TC.state.doc, id)) TC.state.selection.delete(id);
    }
    if (TC.state.selBar !== null && TC.state.selBar >= TC.state.doc.bars.length) TC.state.selBar = null;
  };

  /**
   * Finish a user operation: record undo step, autosave, redraw.
   * opts.merge: join this step with the one before (e.g. a row of notes written by dragging).
   */
  TC.commit = function (opts) {
    TC.state.rev++;
    if (TC.score && TC.score.revoice) TC.score.revoice(TC.state.doc); // e.g. a note changed to a kick: into the lower voice
    if (TC.history.commit()) {
      if (opts && opts.merge && TC.history.undoStack.length > 1) TC.history.undoStack.pop();
      TC.state.dirty = true;
      if (TC.storage) TC.storage.scheduleAutosave();
    }
    TC.refresh();
  };

  /** Redraw everything (defined fully in main.js once all modules are loaded). */
  TC.refresh = function () {};
})(window.TC);
