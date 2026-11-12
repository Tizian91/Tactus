'use strict';
/*
 * Document model of a score (this is also the saved JSON format, *.tactus.json).
 * Built like Guitar Pro: bar headers shared by all tracks, every track has its own
 * bars with up to four voices.
 *
 *   {
 *     app: 'Tactus', version: 1,
 *     meta:   { title, subtitle, artist, album, music, words, transcriber, copyright, notes, tempo },
 *     bars:   [ BarHeader ],            // one per bar, for all tracks
 *     tracks: [ Track ],
 *     view:   { x, y, zoom }            // scroll / zoom, not part of the undo history
 *   }
 *
 *   BarHeader: { ts: [4, 4], tempo: null | bpm, repeatStart, repeatEnd, marker }
 *   Track:     { id, name, kind: 'drums' | 'pitched' | 'tab', channel, program, volume,
 *                bars: [ { voices: [ [Event], [Event] ] } ] }   // bars[i] belongs to header bars[i]
 *   Event:     { id, tick, dur, notes: [Note] }   // a chord / beat; tick from the bar start
 *   Note:      drums:   { id, art, accent, ghost, head, vel }
 *              (later)  pitched: { id, pitch, ... }, tab: { id, string, fret, ... }
 *
 * Time is counted in ticks: 960 per quarter note (as in Guitar Pro / MIDI files).
 * An event keeps the duration chosen when it was written; render.js / rhythm.js
 * turn the events into note values, rests, beams and tuplets.
 */
(function (TC) {
  const TPQ = (TC.TPQ = 960);

  TC.VALUES = [1, 2, 4, 8, 16, 32, 64];
  /** Ticks of a plain note value (4 = quarter = 960). */
  TC.valueTicks = (v) => (4 * TPQ) / v;
  /** Ticks of the note the input settings write. */
  TC.inputTicks = (inp) => {
    let t = TC.valueTicks(inp.value);
    if (inp.triplet) t = (t * 2) / 3;
    else if (inp.dotted) t *= 1.5;
    return t;
  };
  /** Grid of the clickable positions for the input settings. */
  TC.gridTicks = (inp) => {
    const t = TC.valueTicks(inp.value);
    if (inp.triplet) return (t * 2) / 3;
    if (inp.dotted) return t / 2; // a dotted eighth may start on every sixteenth
    return t;
  };
  TC.barTicks = (ts) => (ts[0] * 4 * TPQ) / ts[1];

  TC.TIME_SIGS = [[4, 4], [3, 4], [2, 4], [5, 4], [6, 4], [6, 8], [7, 8], [9, 8], [12, 8], [5, 8], [2, 2]];
  const validTs = (ts) => Array.isArray(ts) && ts.length === 2 && Number.isInteger(ts[0]) && ts[0] >= 1 && ts[0] <= 32 &&
    [1, 2, 4, 8, 16, 32].includes(ts[1]);

  TC.emptyMeta = () => ({
    title: '', subtitle: '', artist: '', album: '', music: '', words: '', transcriber: '', copyright: '', notes: '', tempo: 120,
  });

  TC.newBarHeader = (ts) => ({ ts: ts ? ts.slice() : [4, 4], tempo: null, repeatStart: false, repeatEnd: 0, marker: '' });
  TC.newTrackBar = (voices = 2) => ({ voices: Array.from({ length: voices }, () => []) });

  TC.newTrack = function (kind = 'drums', bars = 0) {
    const t = {
      id: TC.uid('t'),
      name: kind === 'drums' ? 'Drums' : 'Track',
      kind,
      channel: kind === 'drums' ? 9 : 0, // MIDI channel 10 = drums
      program: 0,
      volume: 100,
      bars: [],
    };
    for (let i = 0; i < bars; i++) t.bars.push(TC.newTrackBar());
    return t;
  };

  /** Default size: one staff space = 16 px, so neighbouring lines are 8 px apart. */
  TC.DEFAULT_ZOOM = 1.6;

  TC.emptyScore = function (barCount = 8) {
    const doc = { app: 'Tactus', version: 1, meta: TC.emptyMeta(), bars: [], tracks: [], view: { x: 40, y: 220, zoom: TC.DEFAULT_ZOOM } };
    for (let i = 0; i < barCount; i++) doc.bars.push(TC.newBarHeader());
    doc.tracks.push(TC.newTrack('drums', barCount));
    return doc;
  };

  // ---- Loading: accept anything, keep what is valid ---------------------------------

  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v) => (v === null || v === undefined ? '' : String(v));

  function cleanNote(n, kind) {
    if (!n || typeof n !== 'object') return null;
    const out = { id: typeof n.id === 'string' ? n.id : TC.uid('n') };
    if (kind === 'drums') {
      if (!TC.drums.byId(n.art)) return null;
      out.art = n.art;
    } else {
      out.pitch = TC.clamp(Math.round(num(n.pitch, 60)), 0, 127);
    }
    out.accent = [0, 1, 2].includes(n.accent) ? n.accent : 0;
    out.ghost = !!n.ghost;
    out.head = typeof n.head === 'string' && (n.head === 'auto' || TC.HEADS[n.head]) ? n.head : 'auto';
    out.vel = n.vel === null || n.vel === undefined ? null : TC.clamp(Math.round(num(n.vel, 100)), 1, 127);
    return out;
  }

  /** Bring any parsed JSON into the current shape (missing parts get defaults, bad parts are dropped). */
  TC.normalizeDoc = function (raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.bars)) throw new Error('Not a Tactus file');
    const doc = TC.emptyScore(0);
    Object.keys(doc.meta).forEach((k) => {
      if (raw.meta && raw.meta[k] !== undefined) doc.meta[k] = k === 'tempo' ? TC.clamp(num(raw.meta.tempo, 120), 20, 400) : str(raw.meta[k]);
    });
    doc.bars = raw.bars.map((b) => {
      const h = TC.newBarHeader(b && validTs(b.ts) ? b.ts : [4, 4]);
      if (b) {
        h.tempo = typeof b.tempo === 'number' ? TC.clamp(b.tempo, 20, 400) : null;
        h.repeatStart = !!b.repeatStart;
        h.repeatEnd = TC.clamp(Math.round(num(b.repeatEnd, 0)), 0, 99);
        h.marker = str(b.marker);
      }
      return h;
    });
    if (!doc.bars.length) doc.bars.push(TC.newBarHeader());
    const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
    doc.tracks = tracks.map((t) => {
      const kind = ['drums', 'pitched', 'tab'].includes(t.kind) ? t.kind : 'drums';
      const out = TC.newTrack(kind, 0);
      if (typeof t.id === 'string') out.id = t.id;
      out.name = str(t.name) || out.name;
      out.channel = TC.clamp(Math.round(num(t.channel, out.channel)), 0, 15);
      out.program = TC.clamp(Math.round(num(t.program, 0)), 0, 127);
      out.volume = TC.clamp(Math.round(num(t.volume, 100)), 0, 127);
      out.bars = doc.bars.map((h, i) => {
        const src = Array.isArray(t.bars) ? t.bars[i] : null;
        const bar = TC.newTrackBar();
        const voices = src && Array.isArray(src.voices) ? src.voices : [];
        voices.slice(0, 4).forEach((v, vi) => {
          bar.voices[vi] = (Array.isArray(v) ? v : []).map((e) => {
            if (!e || typeof e !== 'object') return null;
            const notes = (Array.isArray(e.notes) ? e.notes : []).map((n) => cleanNote(n, kind)).filter(Boolean);
            if (!notes.length) return null;
            return { id: typeof e.id === 'string' ? e.id : TC.uid('e'), tick: Math.max(0, Math.round(num(e.tick, 0))), dur: Math.max(1, Math.round(num(e.dur, 960))), notes };
          }).filter(Boolean);
        });
        return bar;
      });
      return out;
    });
    if (!doc.tracks.length) doc.tracks.push(TC.newTrack('drums', doc.bars.length));
    doc.tracks.forEach((t) => doc.bars.forEach((h, i) => TC.score.fitBar(doc, t, i)));
    if (raw.view && typeof raw.view === 'object') {
      doc.view = { x: num(raw.view.x, 40), y: num(raw.view.y, 140), zoom: TC.clamp(num(raw.view.zoom, 1), 0.25, 4) };
    }
    return doc;
  };

  // ---- Operations on a score (pure: they change the doc passed in) ------------------

  const SC = (TC.score = {});

  /** Call fn(note, event, voiceIndex, barIndex, track) for every note. */
  SC.eachNote = function (doc, fn) {
    for (const t of doc.tracks) {
      t.bars.forEach((bar, bi) => bar.voices.forEach((voice, vi) => voice.forEach((ev) => ev.notes.forEach((n) => fn(n, ev, vi, bi, t)))));
    }
  };

  /** { note, ev, voice, bar, track } of a note id, or null. */
  SC.findNote = function (doc, id) {
    let hit = null;
    SC.eachNote(doc, (n, ev, voice, bar, track) => {
      if (!hit && n.id === id) hit = { note: n, ev, voice, bar, track };
    });
    return hit;
  };

  /** Events of a voice sorted by time; drops parts beyond the end of the bar. */
  SC.fitBar = function (doc, track, bi) {
    const L = TC.barTicks(doc.bars[bi].ts);
    const bar = track.bars[bi];
    bar.voices = bar.voices.map((voice) => {
      const v = voice.filter((e) => e.tick < L).sort((a, b) => a.tick - b.tick);
      v.forEach((e, i) => {
        const next = i + 1 < v.length ? v[i + 1].tick : L;
        e.dur = Math.max(1, Math.min(e.dur, next - e.tick, L - e.tick));
      });
      return v;
    });
  };

  /** Insert `count` empty bars before index `at` (time signature of the bar before, or ts). */
  SC.insertBars = function (doc, at, count = 1, ts) {
    at = TC.clamp(at, 0, doc.bars.length);
    const like = ts || (doc.bars[Math.max(0, at - 1)] || doc.bars[0] || { ts: [4, 4] }).ts;
    for (let k = 0; k < count; k++) {
      doc.bars.splice(at, 0, TC.newBarHeader(like));
      doc.tracks.forEach((t) => t.bars.splice(at, 0, TC.newTrackBar()));
    }
  };

  /** Remove bars from … count (at least one bar stays). */
  SC.deleteBars = function (doc, from, count = 1) {
    count = Math.min(count, doc.bars.length - 1);
    if (count <= 0) return false;
    doc.bars.splice(from, count);
    doc.tracks.forEach((t) => t.bars.splice(from, count));
    return true;
  };

  SC.clearBar = function (doc, bi) {
    doc.tracks.forEach((t) => {
      t.bars[bi] = TC.newTrackBar(t.bars[bi].voices.length);
    });
  };

  /**
   * Time signature from bar `bi` on: it applies to this bar and to the following bars that
   * had the same time signature as this one (up to the next change), like in notation programs.
   * onlyThis: change this bar alone.
   */
  SC.setTimeSig = function (doc, bi, ts, onlyThis) {
    if (!validTs(ts)) return false;
    const old = doc.bars[bi].ts.join('/');
    let i = bi;
    do {
      doc.bars[i].ts = ts.slice();
      doc.tracks.forEach((t) => SC.fitBar(doc, t, i));
      i++;
    } while (!onlyThis && i < doc.bars.length && doc.bars[i].ts.join('/') === old);
    return true;
  };

  /** Two drum notes are "the same" if they sit on the same line of the same instrument. */
  function sameSlot(a, b) {
    const x = TC.drums.byId(a.art), y = TC.drums.byId(b.art);
    return a.art === b.art || (x && y && x.el === y.el && x.line === y.line);
  }

  /**
   * Write a note at (track, bar, voice, tick) with duration `dur`.
   * - an event at the same tick gets the note as an extra chord note
   * - the same instrument there already: 'exists' (another articulation of it replaces it: 'changed')
   * - an event that still sounds at `tick` is shortened, the new one ends at the next event / bar end
   * Returns { status: 'added' | 'chord' | 'changed' | 'exists', note, ev }.
   */
  SC.place = function (doc, track, bi, vi, tick, dur, note) {
    const L = TC.barTicks(doc.bars[bi].ts);
    if (tick < 0 || tick >= L) return { status: 'outside' };
    const bar = track.bars[bi];
    while (bar.voices.length <= vi) bar.voices.push([]);
    const voice = bar.voices[vi];
    const at = voice.find((e) => e.tick === tick);
    if (at) {
      const same = at.notes.find((n) => sameSlot(n, note));
      if (same && same.art === note.art) return { status: 'exists', note: same, ev: at };
      if (same) {
        same.art = note.art;
        return { status: 'changed', note: same, ev: at };
      }
      at.notes.push(note);
      return { status: 'chord', note, ev: at };
    }
    for (const e of voice) if (e.tick < tick && e.tick + e.dur > tick) e.dur = tick - e.tick;
    const next = voice.filter((e) => e.tick > tick).reduce((m, e) => Math.min(m, e.tick), L);
    const ev = { id: TC.uid('e'), tick, dur: Math.max(1, Math.min(dur, next - tick)), notes: [note] };
    voice.push(ev);
    voice.sort((a, b) => a.tick - b.tick);
    return { status: 'added', note, ev };
  };

  /** Remove notes by id; events without notes disappear (their time becomes a rest). */
  SC.removeNotes = function (doc, ids) {
    const set = new Set(ids);
    let n = 0;
    for (const t of doc.tracks) {
      for (const bar of t.bars) {
        bar.voices = bar.voices.map((voice) => voice.filter((ev) => {
          const before = ev.notes.length;
          ev.notes = ev.notes.filter((x) => !set.has(x.id));
          n += before - ev.notes.length;
          return ev.notes.length > 0;
        }));
      }
    }
    return n;
  };

  /** New length for the events of the given notes (clipped at the next event / bar end). */
  SC.setDuration = function (doc, ids, dur) {
    const evs = new Map();
    ids.forEach((id) => {
      const h = SC.findNote(doc, id);
      if (h) evs.set(h.ev, h);
    });
    for (const [ev, h] of evs) {
      ev.dur = dur;
      SC.fitBar(doc, h.track, h.bar);
    }
    return evs.size;
  };

  /** A new drum note from the input settings. */
  TC.newDrumNote = (art, inp) => ({
    id: TC.uid('n'), art, accent: inp.accent || 0, ghost: !!inp.ghost, head: inp.head || 'auto', vel: null,
  });
})(window.TC);
