'use strict';
/*
 * Document model of a score (this is also the saved JSON format, *.tactus.json).
 * Built like Guitar Pro: bar headers shared by all tracks, every track has its own
 * bars with up to four voices.
 *
 *   {
 *     app: 'Tactus', version: 1,
 *     meta:   { title, subtitle, artist, album, music, words, transcriber, copyright, notes, tempo, kit, kitName },
 *     bars:   [ BarHeader ],            // one per bar, for all tracks
 *     tracks: [ Track ],
 *     page:   { barsPerLine: 0 (auto) | 1 … 12, barNumbers: 'system' | 'every' | 'off' }   page view / PDF
 *     view:   { x, y, zoom }            // scroll / zoom, not part of the undo history
 *   }
 *
 *   BarHeader: { ts: [4, 4], tempo: null | bpm,
 *                repeatStart: false      a repeat begins here (|:)
 *                repeatEnd: 0            a repeat ends here (:|), the number is how often it is played (2 = twice)
 *                volta: null | [1]       ending (1st / 2nd time bar): played only in these passes, e.g. [1], [2], [1, 2]
 *                marker: ''               text above the bar (Verse, Chorus …)
 *                lineBreak: false        page view: this bar starts a new line
 *                beam: null | [2, 2, 3]  beam groups in units of the lower number (7/8: eighths), null = default
 *                simile: false           true = "repeat the bar before" (% sign; plays the bar before) }
 *   Track:     { id, name, kind: 'drums' | 'pitched' | 'tab', channel, program, volume, fill,
 *                bars: [ { voices: [ [Event], [Event] ] } ] }   // bars[i] belongs to header bars[i]
 *   Event:     { id, tick, dur, notes: [Note] }   // a chord / beat; tick from the bar start
 *   Note:      drums:   { id, art, accent, ghost, head, vel,
 *                         orn: null | 'flam' | 'drag'   grace notes before the note
 *                         trem: 0 … 3                   roll: strokes through the stem
 *                         stick: '' | 'R' | 'L' }       sticking (right / left hand), written under the staff
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
    kit: '', kitName: '', // kit profile for MIDI export / import (js/kits.js): id, and the name to find it on another computer
    swing: 50,            // swing / shuffle in %: 50 straight, 67 shuffle (triplet feel), up to 75 (see TC.swingTick)
    swingUnit: 8,         // which notes swing: 8 eighths, 16 sixteenths
  });

  /** Swing amounts offered (%): straight, light, swing, shuffle (triplet feel), hard. */
  TC.SWINGS = [[50, 'Straight'], [58, 'Light swing'], [62, 'Swing'], [67, 'Shuffle (triplet feel)'], [75, 'Hard shuffle']];

  /**
   * Where a note at `tick` (from the bar start) sounds with swing: within every pair of eighths
   * (unit 8; sixteenths: unit 16) the second one comes later - at `amount` % of the pair instead of
   * 50 %; the positions in between stretch along. Triplets (and other positions off the 64th grid)
   * stay where they are. Used by playback and the MIDI export.
   */
  TC.swingTick = function (tick, amount, unit) {
    if (!amount || amount === 50 || tick % 60 !== 0) return tick;
    const pair = unit === 16 ? 480 : 960, split = (pair * amount) / 100;
    const base = Math.floor(tick / pair) * pair, pos = tick - base, half = pair / 2;
    return base + (pos < half ? (pos * split) / half : split + ((pos - half) * (pair - split)) / half);
  };

  TC.newBarHeader = (ts) => ({ ts: ts ? ts.slice() : [4, 4], tempo: null, repeatStart: false, repeatEnd: 0, volta: null, marker: '', beam: null, simile: false, lineBreak: false });
  TC.newPage = () => ({ barsPerLine: 0, barNumbers: 'system' });
  TC.BAR_NUMBERS = ['system', 'every', 'off'];

  /** Endings of a bar: sorted passes 1 … 8, or null. */
  TC.cleanVolta = function (v) {
    if (!Array.isArray(v)) return null;
    const out = [...new Set(v.filter((x) => Number.isInteger(x) && x >= 1 && x <= 8))].sort((a, b) => a - b);
    return out.length ? out : null;
  };

  /** Is the time signature compound (6/8, 9/8, 12/8: counted in dotted quarters)? */
  TC.isCompound = (ts) => ts[1] === 8 && ts[0] % 3 === 0 && ts[0] > 3;

  /**
   * Beam groups of a bar in units of the lower number (7/8 -> [2, 2, 3] eighths), or null when
   * the beats decide (4/4, 3/4, 2/2 …: one beam per quarter). Odd eighth / sixteenth meters get
   * the usual grouping; any bar may have its own (header.beam).
   */
  const ODD = { 5: [3, 2], 7: [2, 2, 3], 11: [3, 3, 3, 2], 13: [3, 3, 3, 2, 2] };
  TC.beamGroups = function (ts, beam) {
    if (Array.isArray(beam) && beam.reduce((a, b) => a + b, 0) === ts[0]) return beam.slice();
    if (ts[1] < 8) return null;
    if (TC.isCompound(ts)) return Array(ts[0] / 3).fill(3);
    const per = ts[1] === 8 ? 2 : 4; // eighths in quarters, sixteenths in fours
    if (ts[0] % per === 0) return Array(ts[0] / per).fill(per);
    if (ODD[ts[0]]) return ODD[ts[0]].slice();
    const g = Array(Math.floor(ts[0] / 2)).fill(2);
    if (ts[0] % 2) g[g.length - 1] = 3;
    return g;
  };
  /** Ways to group a bar of n units into 2s, 3s (and 4s for sixteenths), the default first. */
  TC.beamChoices = function (ts) {
    const n = ts[0], out = [];
    const sizes = ts[1] >= 16 ? [2, 3, 4] : [2, 3];
    const walk = (rest, cur) => {
      if (out.length > 30) return;
      if (rest === 0) return void out.push(cur);
      sizes.forEach((k) => { if (rest >= k) walk(rest - k, cur.concat(k)); });
    };
    if (ts[1] >= 8 && n >= 4 && n <= 13) walk(n, []);
    const def = TC.beamGroups(ts, null);
    const key = (g) => g && g.join('+');
    const list = out.filter((g) => key(g) !== key(def));
    return def ? [def].concat(list) : list;
  };
  TC.newTrackBar = (voices = 2) => ({ voices: Array.from({ length: voices }, () => []) });

  TC.newTrack = function (kind = 'drums', bars = 0) {
    const t = {
      id: TC.uid('t'),
      name: kind === 'drums' ? 'Drums' : 'Track',
      kind,
      channel: kind === 'drums' ? 9 : 0, // MIDI channel 10 = drums
      program: 0,
      volume: 100,
      fill: kind === 'drums' ? 'beat' : 'off', // rest cleanup on screen (rhythm.js R.ends): beat | next | off
      bars: [],
    };
    for (let i = 0; i < bars; i++) t.bars.push(TC.newTrackBar());
    return t;
  };

  /** Default size: one staff space = 16 px, so neighbouring lines are 8 px apart. */
  TC.DEFAULT_ZOOM = 1.6;

  TC.emptyScore = function (barCount = 8) {
    const doc = { app: 'Tactus', version: 1, meta: TC.emptyMeta(), bars: [], tracks: [], page: TC.newPage(), view: { x: 40, y: 220, zoom: TC.DEFAULT_ZOOM } };
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
    out.orn = n.orn === 'flam' || n.orn === 'drag' ? n.orn : null;
    out.trem = [1, 2, 3].includes(n.trem) ? n.trem : 0;
    out.stick = n.stick === 'R' || n.stick === 'L' ? n.stick : '';
    return out;
  }

  /** Bring any parsed JSON into the current shape (missing parts get defaults, bad parts are dropped). */
  TC.normalizeDoc = function (raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.bars)) throw new Error('Not a Tactus file');
    const doc = TC.emptyScore(0);
    Object.keys(doc.meta).forEach((k) => {
      if (!raw.meta || raw.meta[k] === undefined) return;
      if (k === 'tempo') doc.meta.tempo = TC.clamp(num(raw.meta.tempo, 120), 20, 400);
      else if (k === 'swing') doc.meta.swing = TC.clamp(Math.round(num(Number(raw.meta.swing), 50)), 50, 80);
      else if (k === 'swingUnit') doc.meta.swingUnit = Number(raw.meta.swingUnit) === 16 ? 16 : 8;
      else doc.meta[k] = str(raw.meta[k]);
    });
    doc.bars = raw.bars.map((b, i) => {
      const h = TC.newBarHeader(b && validTs(b.ts) ? b.ts : [4, 4]);
      if (b) {
        h.tempo = typeof b.tempo === 'number' ? TC.clamp(b.tempo, 20, 400) : null;
        h.repeatStart = !!b.repeatStart;
        h.repeatEnd = TC.clamp(Math.round(num(b.repeatEnd, 0)), 0, 99);
        if (h.repeatEnd === 1) h.repeatEnd = 0;
        h.volta = TC.cleanVolta(b.volta);
        h.marker = str(b.marker);
        if (Array.isArray(b.beam) && b.beam.every((x) => Number.isInteger(x) && x > 0) && b.beam.reduce((a, c) => a + c, 0) === h.ts[0]) h.beam = b.beam.slice();
        h.simile = !!b.simile && i > 0;
        h.lineBreak = !!b.lineBreak && i > 0;
      }
      return h;
    });
    if (!doc.bars.length) doc.bars.push(TC.newBarHeader());
    const pg = raw.page && typeof raw.page === 'object' ? raw.page : {};
    if (Number.isInteger(pg.barsPerLine) && pg.barsPerLine >= 0 && pg.barsPerLine <= 12) doc.page.barsPerLine = pg.barsPerLine;
    if (TC.BAR_NUMBERS.includes(pg.barNumbers)) doc.page.barNumbers = pg.barNumbers;
    const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
    doc.tracks = tracks.map((t) => {
      const kind = ['drums', 'pitched', 'tab'].includes(t.kind) ? t.kind : 'drums';
      const out = TC.newTrack(kind, 0);
      if (typeof t.id === 'string') out.id = t.id;
      out.name = str(t.name) || out.name;
      out.channel = TC.clamp(Math.round(num(t.channel, out.channel)), 0, 15);
      out.program = TC.clamp(Math.round(num(t.program, 0)), 0, 127);
      out.volume = TC.clamp(Math.round(num(t.volume, 100)), 0, 127);
      if (['beat', 'next', 'off'].includes(t.fill)) out.fill = t.fill;
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
      if (doc.bars[i].ts.join('/') !== ts.join('/')) doc.bars[i].beam = null;
      doc.bars[i].ts = ts.slice();
      doc.tracks.forEach((t) => SC.fitBar(doc, t, i));
      i++;
    } while (!onlyThis && i < doc.bars.length && doc.bars[i].ts.join('/') === old);
    return true;
  };

  /**
   * Beam groups from bar `bi` on (like the time signature: up to the next bar with another
   * time signature or other groups). groups: null = default.
   */
  SC.setBeam = function (doc, bi, groups) {
    const ts = doc.bars[bi].ts;
    if (groups && groups.reduce((a, b) => a + b, 0) !== ts[0]) return false;
    const key = (h) => h.ts.join('/') + '|' + (h.beam ? h.beam.join('+') : '');
    const old = key(doc.bars[bi]);
    let i = bi;
    do {
      doc.bars[i].beam = groups ? groups.slice() : null;
      i++;
    } while (i < doc.bars.length && key(doc.bars[i]) === old);
    return true;
  };

  /**
   * The order in which the bars are played - repeats and endings written out, as a MIDI file has them:
   * [{ bar, pass, n }]  bar: index of the written bar, pass: 1st, 2nd … time through its repeat,
   * n: number of the played bar (1, 2, …; what Cubase counts).
   *   |: … :|        repeatStart … repeatEnd (n times); a repeat end without a start goes back to
   *                  the bar after the previous repeat end (or to bar 1)
   *   endings        a bar with volta [1] is played in pass 1 only, [2] in pass 2 … (also bars before
   *                  the repeat end, e.g. a two-bar first ending)
   */
  SC.playOrder = function (doc) {
    const bars = doc.bars, out = [], jumps = new Map();
    let i = 0, start = 0, pass = 1, back = false, lastVolta = false;
    while (i < bars.length && out.length < 20000) {
      const h = bars[i], volta = h.volta && h.volta.length ? h.volta : null;
      if (!back) {
        if (h.repeatStart) {
          start = i;
          pass = 1;
        } else if (!volta && lastVolta && pass > 1) {
          start = i; // after the last ending: a new section
          pass = 1;
        }
      }
      back = false;
      if (volta && !volta.includes(pass)) {
        i++;
        continue;
      }
      out.push({ bar: i, pass, n: out.length + 1 });
      lastVolta = !!volta;
      if (h.repeatEnd > 1) {
        const done = jumps.get(i) || 0;
        if (done + 1 < h.repeatEnd) {
          jumps.set(i, done + 1);
          pass = done + 2;
          i = start;
          back = true;
          continue;
        }
        jumps.delete(i);
        start = i + 1;
        pass = 1;
      }
      i++;
    }
    return out;
  };

  /**
   * The played bars from bar `from` up to bar `to` (written bars, e.g. a selection): the play order
   * from the first time `from` is played; bars before `from` that a repeat goes back to are left
   * out, it ends at the first bar after `to`.
   */
  SC.playBars = function (doc, from = 0, to = doc.bars.length - 1) {
    const order = SC.playOrder(doc);
    let k = order.findIndex((o) => o.bar >= from);
    const out = [];
    if (k < 0) return out;
    for (; k < order.length; k++) {
      const o = order[k];
      if (o.bar > to) break;
      if (o.bar >= from) out.push(o);
    }
    return out;
  };

  /** Does the score have repeats or endings? */
  SC.hasRepeats = (doc) => doc.bars.some((h) => h.repeatStart || h.repeatEnd > 1 || (h.volta && h.volta.length));

  /**
   * Write the repeats out in the score itself: every played bar becomes a bar of its own, so the
   * bar numbers are those of Cubase. %-bars are written out too (what they repeat may change).
   */
  SC.unfold = function (doc) {
    const order = SC.playOrder(doc);
    const headers = [], tracks = doc.tracks.map(() => []);
    for (const o of order) {
      const h = TC.clone(doc.bars[o.bar]);
      Object.assign(h, { repeatStart: false, repeatEnd: 0, volta: null, simile: false, lineBreak: false });
      headers.push(h);
      doc.tracks.forEach((t, k) => {
        const bar = TC.clone(t.bars[SC.sourceBar(doc, o.bar)]);
        bar.voices.forEach((v) => v.forEach((ev) => {
          ev.id = TC.uid('e');
          ev.notes.forEach((n) => { n.id = TC.uid('n'); });
        }));
        tracks[k].push(bar);
      });
    }
    doc.bars = headers;
    doc.tracks.forEach((t, k) => { t.bars = tracks[k]; });
    return headers.length;
  };

  /**
   * Put every drum note into the voice its instrument has now (TC.drums.setStems: all up, feet
   * down, feet + low toms down). Notes at the same time in the same voice become one chord (the
   * shorter length wins), the lengths are then cut as usual. Only the notation changes - sound
   * and MIDI do not depend on voices. Returns true if something moved.
   */
  SC.revoice = function (doc) {
    let changed = false;
    const vo = (n) => TC.drums.voiceOf(n.art);
    for (const t of doc.tracks) {
      if (t.kind !== 'drums') continue;
      t.bars.forEach((bar, bi) => {
        if (bar.voices.every((v, vi) => v.every((ev) => ev.notes.every((n) => vo(n) === vi)))) return;
        changed = true;
        const out = [[], []];
        for (const v of bar.voices) {
          for (const ev of v) {
            const groups = new Map();
            ev.notes.forEach((n) => {
              if (!groups.has(vo(n))) groups.set(vo(n), []);
              groups.get(vo(n)).push(n);
            });
            for (const [vi, notes] of groups) {
              while (out.length <= vi) out.push([]);
              const at = out[vi].find((e) => e.tick === ev.tick);
              if (at) {
                at.notes.push(...notes);
                at.dur = Math.min(at.dur, ev.dur);
              } else {
                out[vi].push({ id: notes.length === ev.notes.length ? ev.id : TC.uid('e'), tick: ev.tick, dur: ev.dur, notes });
              }
            }
          }
        }
        bar.voices = out;
        SC.fitBar(doc, t, bi);
      });
    }
    return changed;
  };

  /** Ticks from the start of the score to `tick` in bar `bi` (written bars). */
  SC.absTick = function (doc, bi, tick) {
    let t = 0;
    for (let i = 0; i < bi; i++) t += TC.barTicks(doc.bars[i].ts);
    return t + tick;
  };
  /** The bar and tick of a time counted from the start of the score, or null outside the score. */
  SC.atAbs = function (doc, abs) {
    if (abs < 0) return null;
    let t = 0;
    for (let i = 0; i < doc.bars.length; i++) {
      const L = TC.barTicks(doc.bars[i].ts);
      if (abs < t + L) return { bar: i, tick: abs - t };
      t += L;
    }
    return null;
  };

  /**
   * Move notes (ids) by `delta` ticks (across bars), optionally to instrument `art` (all of them).
   * Each note keeps its length. Nothing happens (false) if a note would leave the score, land in a
   * %-bar, or on a note of the same instrument that does not move.
   */
  SC.moveNotes = function (doc, ids, delta, art) {
    const track = doc.tracks[0], moving = new Set(ids), items = [], slots = new Set();
    for (const id of ids) {
      const h = SC.findNote(doc, id);
      if (!h) continue;
      const pos = SC.atAbs(doc, SC.absTick(doc, h.bar, h.ev.tick) + delta);
      if (!pos || doc.bars[pos.bar].simile) return false;
      const a = art || h.note.art, key = pos.bar + ':' + pos.tick + ':' + a;
      if (slots.has(key)) return false; // two of them onto one place
      slots.add(key);
      for (const v of track.bars[pos.bar].voices) {
        for (const ev of v) {
          if (ev.tick === pos.tick && ev.notes.some((n) => !moving.has(n.id) && sameSlot(n, { art: a }))) return false;
        }
      }
      items.push({ note: h.note, pos, dur: h.ev.dur, art: a });
    }
    if (!items.length) return false;
    SC.removeNotes(doc, ids);
    for (const it of items) {
      const n = Object.assign({}, it.note, { art: it.art });
      SC.place(doc, track, it.pos.bar, TC.drums.voiceOf(it.art), it.pos.tick, it.dur, n);
    }
    return true;
  };

  /** The bar whose notes bar `bi` plays: a simile bar ("%") plays the bar before it. */
  SC.sourceBar = function (doc, bi) {
    while (bi > 0 && doc.bars[bi].simile) bi--;
    return bi;
  };

  /** Copy of the notes of a bar (all tracks), for the clipboard. */
  SC.copyBar = function (doc, bi) {
    const src = SC.sourceBar(doc, bi);
    return { ts: doc.bars[src].ts.slice(), tracks: doc.tracks.map((t) => TC.clone(t.bars[src])) };
  };

  /** Put copied notes into bar `bi` (replaces its notes; new ids; cut to its length). */
  SC.pasteBar = function (doc, bi, clip) {
    if (!clip) return false;
    doc.bars[bi].simile = false;
    doc.tracks.forEach((t, k) => {
      const bar = TC.clone(clip.tracks[k] || clip.tracks[0]);
      bar.voices.forEach((v) => v.forEach((ev) => {
        ev.id = TC.uid('e');
        ev.notes.forEach((n) => { n.id = TC.uid('n'); });
      }));
      t.bars[bi] = bar;
      SC.fitBar(doc, t, bi);
    });
    return true;
  };

  /** Copy of bars a … b: { bars: [ copyBar … ] } (%-bars: what they play). */
  SC.copyBars = function (doc, a, b) {
    const bars = [];
    for (let i = a; i <= b; i++) bars.push(SC.copyBar(doc, i));
    return { bars };
  };
  /**
   * Paste copied bars from bar `at` on (each replaces the notes of one bar); past the end of the
   * score new bars are added with the copied time signature. Also takes a single copyBar.
   * Returns how many bars were pasted.
   */
  SC.pasteBars = function (doc, at, clip) {
    const list = clip && clip.bars ? clip.bars : clip ? [clip] : [];
    list.forEach((c, k) => {
      if (at + k >= doc.bars.length) SC.insertBars(doc, doc.bars.length, 1, c.ts);
      SC.pasteBar(doc, at + k, c);
    });
    return list.length;
  };
  /** A copy of bars a … b right after b (their time signatures and beam groups too). */
  SC.duplicateBars = function (doc, a, b) {
    const clip = SC.copyBars(doc, a, b);
    for (let i = a; i <= b; i++) {
      const at = b + 1 + (i - a);
      SC.insertBars(doc, at, 1, doc.bars[i].ts);
      doc.bars[at].beam = doc.bars[i].beam ? doc.bars[i].beam.slice() : null;
    }
    SC.pasteBars(doc, b + 1, clip);
    return b - a + 1;
  };

  /** A copy of bar `bi` right after it. */
  SC.duplicateBar = function (doc, bi) {
    const clip = SC.copyBar(doc, bi);
    SC.insertBars(doc, bi + 1, 1, doc.bars[bi].ts);
    doc.bars[bi + 1].beam = doc.bars[bi].beam ? doc.bars[bi].beam.slice() : null;
    SC.pasteBar(doc, bi + 1, clip);
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

  /**
   * Strength of a drum note in five steps. Only the outer ones are marked: ghost (head in brackets)
   * and accent (>); soft / normal / strong are plain notes for fine tuning, soft and strong are
   * stored as note.vel. vel: MIDI velocity (played back the same; accent plays a little louder).
   */
  TC.STRENGTHS = [
    { key: 'ghost', label: 'Ghost', vel: 28 },
    { key: 'soft', label: 'soft', vel: 70 },
    { key: 'normal', label: 'normal', vel: 91 },
    { key: 'strong', label: 'strong', vel: 110 },
    { key: 'accent', label: 'Accent', vel: 127 },
  ];
  /** Step 0 … 4 of a note. */
  TC.levelOf = (n) => (n.ghost ? 0 : n.accent ? 4 : typeof n.vel === 'number' ? TC.levelOfVelocity(n.vel, true) : 2);
  /** Sets step 0 … 4 (a marcato stays a marcato). */
  TC.setLevel = function (n, lv) {
    n.ghost = lv === 0;
    n.accent = lv === 4 ? n.accent || 1 : 0;
    n.vel = lv === 1 || lv === 3 ? TC.STRENGTHS[lv].vel : null;
  };
  /** Step of a MIDI velocity: the middle between two steps divides (middle = only soft / normal / strong). */
  TC.levelOfVelocity = function (v, middle) {
    const lv = v < 49 ? 0 : v < 81 ? 1 : v < 101 ? 2 : v < 119 ? 3 : 4;
    return middle ? TC.clamp(lv, 1, 3) : lv;
  };

  /** A new drum note from the input settings. */
  TC.newDrumNote = (art, inp) => ({
    id: TC.uid('n'), art, accent: inp.accent || 0, ghost: !!inp.ghost, head: inp.head || 'auto', vel: null,
    orn: inp.orn || null, trem: inp.trem || 0, stick: inp.stick || '',
  });
})(window.TC);
