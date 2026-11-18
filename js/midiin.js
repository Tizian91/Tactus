'use strict';
/*
 * MIDI import: a MIDI file becomes a Tactus score - a drum part (e.g. exported from Cubase) or a whole song (Guitar Pro):
 * each MIDI track (a track on several channels: each channel) a drum track with its drum map or a melody track with the
 * keyswitch profile of its VST (MI.toMelody: tones, chords, ties; its keys back into ways of playing).
 *
 *   TC.midiIn.parse(bytes)              -> { tpq, notes: [ {t, note, vel, ch} ], tempos: [ {t, bpm} ],
 *                                            sigs: [ {t, ts} ], markers: [ {t, text} ], names: [] }
 *                                            (all tracks of a type 0 / 1 file, t in the file's ticks)
 *   TC.midiIn.toScore(midi, opts)       -> { doc, notes, unknown: [ {note, count} ], merged }
 *     opts.profile   kit profile (js/kits.js): every key of an instrument counts, also the extra ones;
 *                    null = General MIDI (the MIDI notes of Tactus / Guitar Pro)
 *     opts.grid      finest straight position in ticks (240 = 16th, 120 = 32nd, 480 = 8th)
 *     opts.triplets  a beat may also be a triplet (grid 2/3 of the straight one), when that fits better
 *
 * How the notes are read:
 *   time         per beat: snapped to the straight grid, or to the triplet grid when that fits clearly better
 *   velocity     five steps (TC.STRENGTHS): below 49 ghost, below 81 soft, below 101 normal, below 119 strong, else accent
 *   flam / drag  one / two softer hits of the same instrument shortly before (< 70 ms): grace notes
 *   two hits of one instrument on the same position after snapping: the louder one stays
 *   tempo, time signatures and markers (bar texts) are taken over; the title comes from the file name
 */
(function (TC) {
  const MI = (TC.midiIn = {});

  // ---- reading the file ------------------------------------------------------------------

  MI.parse = function (bytes) {
    const str = (p, n) => String.fromCharCode(...bytes.slice(p, p + n));
    if (str(0, 4) !== 'MThd') throw new Error('not a MIDI file');
    const u16 = (p) => (bytes[p] << 8) | bytes[p + 1];
    const u32 = (p) => ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
    const ntr = u16(10), div = u16(12);
    if (div & 0x8000) throw new Error('SMPTE time is not supported');
    // tracks: { name, notes, channels, program (its first program change, null none), programs: { channel: program } };
    // keys: key signatures { t, sf, mi }
    const out = { tpq: div, notes: [], tempos: [], sigs: [], markers: [], names: [], tracks: [], keys: [] };
    const utf8 = (arr) => {
      try { return decodeURIComponent(escape(String.fromCharCode(...arr))); } catch (e) { return String.fromCharCode(...arr); }
    };
    let p = 8 + u32(4);
    for (let k = 0; k < ntr && p < bytes.length; k++) {
      if (str(p, 4) !== 'MTrk') { p += 8 + u32(p + 4); k--; continue; } // skip unknown chunks
      const end = p + 8 + u32(p + 4);
      p += 8;
      const trk = { name: '', notes: 0, channels: new Set(), program: null, programs: {} };
      out.tracks.push(trk);
      const sounding = new Map(); // channel:key -> the notes struck and not let go yet (their end: the note off)
      let t = 0, status = 0;
      const vl = () => {
        let n = 0, b;
        do { b = bytes[p++]; n = n * 128 + (b & 0x7f); } while (b & 0x80 && p < end);
        return n;
      };
      while (p < end) {
        t += vl();
        let b = bytes[p];
        if (b === 0xff) {
          const type = bytes[p + 1];
          p += 2;
          const len = vl(), data = Array.from(bytes.slice(p, p + len));
          p += len;
          if (type === 0x51 && len === 3) out.tempos.push({ t, bpm: 60000000 / ((data[0] << 16) | (data[1] << 8) | data[2]) });
          else if (type === 0x58 && len >= 2) out.sigs.push({ t, ts: [data[0], Math.pow(2, data[1])] });
          else if (type === 0x06 || type === 0x07) out.markers.push({ t, text: utf8(data).trim() });
          else if (type === 0x03) { out.names.push(utf8(data).trim()); if (!trk.name) trk.name = utf8(data).trim(); }
          else if (type === 0x59 && len === 2) out.keys.push({ t, sf: data[0] > 127 ? data[0] - 256 : data[0], mi: data[1] ? 1 : 0 });
          else if (type === 0x2f) break;
          continue;
        }
        if (b === 0xf0 || b === 0xf7) { p++; p += vl(); continue; } // sysex
        if (b & 0x80) { status = b; p++; }
        const hi = status & 0xf0;
        const d1 = bytes[p++], d2 = hi === 0xc0 || hi === 0xd0 ? 0 : bytes[p++];
        const key = (status & 15) + ':' + d1;
        if (hi === 0x90 && d2 > 0) {
          const n = { t, end: null, note: d1, vel: d2, ch: status & 15, trk: out.tracks.length - 1 };
          out.notes.push(n);
          if (!sounding.has(key)) sounding.set(key, []);
          sounding.get(key).push(n);
          trk.notes++;
          trk.channels.add(status & 15);
        } else if (hi === 0x80 || hi === 0x90) {
          const list = sounding.get(key); // (the one struck first is let go first)
          if (list && list.length) list.shift().end = t;
        } else if (hi === 0xc0 && (status & 15) !== 9) {
          if (trk.program === null) trk.program = d1;
          if (trk.programs[status & 15] === undefined) trk.programs[status & 15] = d1; // (per channel: a type 0 file)
        }
      }
      sounding.forEach((list) => list.forEach((n) => { n.end = t; })); // (never let go: up to the end of its track)
      p = end;
    }
    out.notes.sort((a, b) => a.t - b.t || a.note - b.note);
    out.tempos.sort((a, b) => a.t - b.t);
    out.sigs.sort((a, b) => a.t - b.t);
    return out;
  };

  // ---- notes -> instruments ----------------------------------------------------------------

  /** General MIDI note -> Tactus instrument (the one whose number is the note, else the first). */
  MI.gmArt = function (note) {
    const own = TC.drums.byId(note);
    if (own && own.midi === note) return own.id;
    const a = TC.DRUM_ARTS.find((x) => x.midi === note);
    return a ? a.id : null;
  };

  const artOf = (note, profile) => (profile ? TC.kits.artOfKey(profile, note) : MI.gmArt(note));

  /** Is note n (of midi.notes) read for opts - opts.track the MIDI track (null: all), opts.ch only its channel (null: all)? */
  MI.takes = (opts, n) => (opts.track === undefined || opts.track === null || n.trk === opts.track) &&
    (opts.ch === undefined || opts.ch === null || n.ch === opts.ch);

  /**
   * What can be imported: one entry per MIDI track with notes - a track playing on several channels (a type 0 file: all
   * in one) one per channel. [{ key ('3' / '0:9'), i (the track), ch (its channel, null: the whole track), name,
   * notes, channels, program }]
   */
  MI.sources = function (midi) {
    const out = [];
    midi.tracks.forEach((t, i) => {
      if (!t.notes) return;
      if (t.channels.size <= 1) { out.push(Object.assign({}, t, { key: String(i), i, ch: null })); return; }
      [...t.channels].sort((a, b) => a - b).forEach((ch) => {
        const notes = midi.notes.filter((n) => n.trk === i && n.ch === ch).length;
        const program = t.programs && t.programs[ch] !== undefined ? t.programs[ch] : null;
        out.push(Object.assign({}, t, { key: i + ':' + ch, i, ch, notes, channels: new Set([ch]), program }));
      });
    });
    return out;
  };

  // ---- bars and the grid (drums and melody) -------------------------------------------------

  /**
   * The bars of a file: its time signatures (at bar starts), 4/4 otherwise, up to tick `last` (Tactus ticks; scale:
   * Tactus ticks per tick of the file). { bars: [{ t0, L, ts }], barAt(t), pos(t) -> { bar, tick } - bars are added at
   * the end when t lies beyond them }.
   */
  function fileBars(midi, scale, last) {
    const sigs = midi.sigs.map((s) => ({ t: s.t * scale, ts: s.ts })).filter((s) => s.ts[0] > 0 && [1, 2, 4, 8, 16, 32].includes(s.ts[1]));
    const bars = [];
    let t0 = 0, ts = [4, 4], si = 0;
    const add = () => {
      while (si < sigs.length && sigs[si].t <= t0 + 1) ts = sigs[si++].ts.slice();
      const L = TC.barTicks(ts);
      bars.push({ t0, L, ts: ts.slice() });
      t0 += L;
    };
    while ((t0 < last || !bars.length) && bars.length <= 2000) add();
    const barAt = (t) => {
      for (let i = bars.length - 1; i >= 0; i--) if (t >= bars[i].t0 - 0.5) return i;
      return 0;
    };
    const pos = (t) => {
      while (t >= t0 - 0.5 && bars.length <= 4000) add();
      const bi = barAt(t);
      return { bar: bi, tick: Math.round(t - bars[bi].t0) };
    };
    return { bars, barAt, pos };
  }

  /**
   * Snapping, beat by beat: each item { t } gets st (its place, in Tactus ticks from the start) and step (the grid it
   * was snapped to) - the straight grid, or the triplet grid where that fits clearly better.
   */
  function snapStarts(list, B, grid, useT) {
    const tgrid = (grid * 2) / 3, byBeat = new Map();
    for (const h of list) {
      const bi = B.barAt(h.t), b = B.bars[bi], beat = TC.rhythm.beatTicks(b.ts);
      const k = Math.floor((h.t - b.t0 + grid / 2) / beat); // a note just before the next beat belongs to it
      const key = bi + ':' + k;
      if (!byBeat.has(key)) byBeat.set(key, { bi, k, beat, list: [] });
      byBeat.get(key).list.push(h);
    }
    for (const g of byBeat.values()) {
      const b = B.bars[g.bi], base = b.t0 + g.k * g.beat;
      const snap = (t, step) => base + Math.round((t - base) / step) * step;
      const err = (step) => g.list.reduce((s, h) => s + Math.abs(h.t - snap(h.t, step)), 0);
      const eS = err(grid), eT = useT && g.beat % tgrid === 0 ? err(tgrid) : Infinity;
      // triplet only when the straight grid misses clearly and the triplet grid fits much better
      const step = eT < eS * 0.5 && eS > g.list.length * grid * 0.12 ? tgrid : grid;
      for (const h of g.list) { h.st = snap(h.t, step); h.step = step; }
    }
  }

  /** Tempo, time signatures, tempo changes and markers (bar texts) of the file into the bars of doc. */
  function fileHeaders(doc, midi, B, scale, bpm0) {
    doc.meta.tempo = TC.clamp(Math.round(bpm0), 20, 400);
    B.bars.forEach((b, i) => { doc.bars[i].ts = b.ts.slice(); });
    for (const tm of midi.tempos.slice(1)) {
      const bi = B.barAt(tm.t * scale), bpm = TC.clamp(Math.round(tm.bpm), 20, 400);
      if (bi > 0 || bpm !== doc.meta.tempo) doc.bars[bi].tempo = bpm;
    }
    for (const m of midi.markers) {
      const bi = B.barAt(m.t * scale);
      if (m.text) doc.bars[bi].marker = doc.bars[bi].marker ? doc.bars[bi].marker + ' / ' + m.text : m.text;
    }
  }

  // ---- building the score -----------------------------------------------------------------

  MI.toScore = function (midi, opts = {}) {
    if (opts.kind === 'melody') return MI.toMelody(midi, opts);
    const TPQ = TC.TPQ, scale = TPQ / midi.tpq;
    const grid = opts.grid || 240, useT = opts.triplets !== false;
    const bpm0 = opts.tempo || (midi.tempos.length ? midi.tempos[0].bpm : 120);
    const msTicks = (ms) => (ms / 1000) * (bpm0 / 60) * TPQ;

    // instruments, times in Tactus ticks
    const unknown = new Map();
    let hits = [];
    for (const n of midi.notes) {
      if (!MI.takes(opts, n)) continue;
      const art = artOf(n.note, opts.profile);
      if (art === null || !TC.drums.byId(art)) {
        unknown.set(n.note, (unknown.get(n.note) || 0) + 1);
        continue;
      }
      hits.push({ t: n.t * scale, art, vel: n.vel });
    }
    hits.sort((a, b) => a.t - b.t);

    // flam / drag: softer hits of the same instrument shortly before a main hit
    const graceWin = msTicks(70);
    const gone = new Set();
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const before = [];
      for (let j = i - 1; j >= 0 && h.t - hits[j].t < graceWin; j--) {
        if (hits[j].art === h.art && !gone.has(hits[j]) && hits[j].vel < h.vel && h.t - hits[j].t > 0) before.push(hits[j]);
      }
      if (before.length) {
        before.slice(0, 2).forEach((g) => gone.add(g));
        h.orn = before.length >= 2 ? 'drag' : 'flam';
      }
    }
    hits = hits.filter((h) => !gone.has(h));

    // bars of the file; snapping, beat by beat: straight or triplet grid
    const B = fileBars(midi, scale, hits.length ? hits[hits.length - 1].t + 1 : 1);
    snapStarts(hits, B, grid, useT);
    const placed = hits.map((h) => Object.assign(B.pos(h.st), { art: h.art, vel: h.vel, orn: h.orn || null })); // { bar, tick, art, vel, orn }
    const bars = B.bars;

    // the score
    const doc = TC.emptyScore(bars.length);
    fileHeaders(doc, midi, B, scale, bpm0);
    if (opts.profile) {
      doc.meta.kit = opts.profile.id;
      doc.meta.kitName = opts.profile.name;
    }

    // same instrument twice on one position: the louder one
    const best = new Map();
    for (const q of placed) {
      const k = q.bar + ':' + q.tick + ':' + q.art;
      if (!best.has(k) || best.get(k).vel < q.vel) best.set(k, q);
    }
    const track = doc.tracks[0];
    const list = [...best.values()].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
    // length of a note: up to the next one of its voice, at most to the end of its beat
    for (const q of list) {
      const art = TC.drums.byId(q.art), b = bars[q.bar], beat = TC.rhythm.beatTicks(b.ts);
      const next = list.find((x) => x.bar === q.bar && x.tick > q.tick && TC.drums.byId(x.art).voice === art.voice);
      const beatEnd = Math.min(b.L, (Math.floor(q.tick / beat) + 1) * beat);
      const dur = Math.max(1, Math.min(next ? next.tick : b.L, beatEnd) - q.tick);
      const note = TC.newDrumNote(q.art, {});
      TC.setLevel(note, TC.levelOfVelocity(q.vel)); // five steps: ghost · soft · normal · strong · accent
      if (q.orn) note.orn = q.orn;
      TC.score.place(doc, track, q.bar, art.voice, q.tick, dur, note);
    }
    // trailing empty bars (e.g. after the last note) are not needed
    while (doc.bars.length > 1 && track.bars[doc.bars.length - 1].voices.every((v) => !v.length) && !doc.bars[doc.bars.length - 1].marker) {
      doc.bars.pop();
      track.bars.pop();
    }
    return {
      doc, notes: list.length, merged: hits.length - list.length,
      unknown: [...unknown].map(([note, count]) => ({ note, count })).sort((a, b) => a.note - b.note),
    };
  };

  /**
   * The scale of a melody: the key signature of the file (major / minor), else the major or minor key its tones fit
   * best (weighted by how long they sound). null without js/pitch.js.
   */
  MI.guessScale = function (midi, tones) {
    const P = TC.pitch;
    if (!P) return null;
    const mod = (n) => ((n % 12) + 12) % 12;
    const key = midi.keys && midi.keys.find((k) => k.t <= midi.tpq);
    if (key) {
      const id = key.mi ? 'minor' : 'major';
      return Object.assign(P.bestRoot(mod(key.sf * 7 + (key.mi ? 9 : 0)), id), { id });
    }
    if (!tones.length) return null;
    const w = new Array(12).fill(0);
    tones.forEach((h) => { w[mod(h.pitch)] += Math.max(1, h.end - h.t); });
    // the major keys whose tones hold (nearly) all that sounds; of those (and their minor keys) the one whose triad
    // sounds most (E G B: E minor, not D major - the same tones)
    const MAJ = [0, 2, 4, 5, 7, 9, 11];
    const fit = [...Array(12).keys()].map((r) => MAJ.reduce((a, iv) => a + w[mod(r + iv)], 0));
    const top = Math.max(...fit);
    const triad = (r, third) => w[mod(r)] + w[mod(r + third)] + w[mod(r + 7)];
    let best = null;
    fit.forEach((f, r) => {
      if (f < top * 0.97) return;
      [{ pc: r, id: 'major', s: triad(r, 4) }, { pc: mod(r + 9), id: 'minor', s: triad(r + 9, 3) }].forEach((c) => { if (!best || c.s > best.s) best = c; });
    });
    return Object.assign(P.bestRoot(best.pc, best.id), { id: best.id });
  };

  /**
   * Was this part of the file (opts.track / opts.ch) played for the VST of keyswitch profile ksw? Tactus (and a part
   * played into Cubase with the VST) sends its start keys right at the beginning: trigger mode (Iron), the way of playing
   * to start from (let ring, legato off, sustain …). A file of Guitar Pro has none of them there.
   */
  MI.playedFor = function (midi, opts, ksw) {
    if (!ksw || !TC.ksw) return false;
    const start = new Set(ksw.keys.filter((k) => (ksw.init || []).includes(k.id) || (k.def && k.kind === 'art'))
      .map((k) => TC.ksw.noteOf(k.note, ksw.c3)).filter((n) => n !== null));
    if (!start.size) return midi.notes.some((n) => MI.takes(opts, n) && ksw.keys.some((k) => TC.ksw.noteOf(k.note, ksw.c3) === n.note)); // (no start keys: any key)
    const first = midi.notes.find((n) => MI.takes(opts, n));
    return !!first && midi.notes.some((n) => MI.takes(opts, n) && n.t <= first.t + midi.tpq / 8 && start.has(n.note));
  };

  /**
   * A melody track of a file (a guitar, a bass, a voice …) as a score: opts.track the MIDI track, opts.ksw the keyswitch
   * profile of its VST (as a track keeps it, js/keyswitch.js) - its keys become ways of playing, slides, stops and
   * strokes again (not notes), the notes are shifted back (noteShift) - only when the file was played for the VST
   * (opts.forVst; not given: MI.playedFor). A file of Guitar Pro has every note as it sounds - a low bass E (28) is no
   * Rowdy key - and keeps the profile only for playing. grid / triplets / tempo as MI.toScore.
   * Tones struck together are a chord; a tone still sounding when the next one comes is cut there (one voice); a long
   * one goes on over the bar line as tied notes. The sound (program change), the scale (key signature or the tones)
   * and the clef (guitar: treble 8 below, bass: bass 8 below - as Guitar Pro writes them, low tones: bass) come from the file.
   * Returns { doc, notes, merged, unknown: [], switches } like MI.toScore.
   */
  MI.toMelody = function (midi, opts = {}) {
    const SC = TC.score, KS = TC.ksw, scale = TC.TPQ / midi.tpq;
    const grid = opts.grid || 240, tgrid = (grid * 2) / 3, useT = opts.triplets !== false;
    const bpm0 = opts.tempo || (midi.tempos.length ? midi.tempos[0].bpm : 120);
    const ksw = opts.ksw && KS ? opts.ksw : null;
    const forVst = !!ksw && (opts.forVst !== undefined ? !!opts.forVst : MI.playedFor(midi, opts, ksw));
    // played for the VST: the keys of the profile (MIDI note -> key), everything else is a tone (shifted back)
    const keys = new Map();
    if (forVst) ksw.keys.forEach((k) => { const n = KS.noteOf(k.note, ksw.c3); if (n !== null && !keys.has(n)) keys.set(n, k); });
    const shift = (forVst && ksw.noteShift) || 0;
    const tones = [], switches = [];
    for (const n of midi.notes) {
      if (!MI.takes(opts, n)) continue;
      const t = n.t * scale, k = keys.get(n.note);
      if (k) { switches.push({ t, k }); continue; }
      const end = (n.end !== null && n.end !== undefined ? n.end : n.t + midi.tpq / 4) * scale;
      tones.push({ t, end: Math.max(end, t + 1), pitch: n.note, vel: n.vel });
    }
    tones.forEach((h) => { h.pitch = TC.clamp(h.pitch - shift, 0, 127); });
    const last = Math.max(1, tones.reduce((m, h) => Math.max(m, h.end), 0), switches.reduce((m, s) => Math.max(m, s.t + 1), 0));
    const B = fileBars(midi, scale, last);
    snapStarts(tones, B, grid, useT);
    // ends: to the nearest place of the straight or triplet grid, at least one step after the start
    for (const h of tones) {
      const b0 = B.bars[B.barAt(h.end)].t0, near = (s) => b0 + Math.round((h.end - b0) / s) * s;
      let e = near(grid);
      if (useT) { const e3 = near(tgrid); if (Math.abs(e3 - h.end) < Math.abs(e - h.end) - 1) e = e3; }
      h.se = Math.max(e, h.st + h.step);
    }
    // chords: the tones struck at one place (the same tone twice: once, the louder)
    const at = new Map();
    let merged = 0;
    for (const h of tones) {
      if (!at.has(h.st)) at.set(h.st, { st: h.st, se: h.se, tones: [] });
      const c = at.get(h.st), same = c.tones.find((x) => x.pitch === h.pitch);
      if (same) { merged++; same.vel = Math.max(same.vel, h.vel); } else c.tones.push(h);
      c.se = Math.max(c.se, h.se);
    }
    const chords = [...at.values()].sort((a, b) => a.st - b.st);

    // keyswitches: at the chord they were sent for (a little before it), else on the grid
    const nearChord = (t) => {
      let best = null;
      for (const c of chords) if (Math.abs(c.st - t) <= grid / 2 && (!best || Math.abs(c.st - t) < Math.abs(best.st - t))) best = c;
      return best;
    };
    const marks = [], held = new Map(); // (the way of playing held now, per group: the start's one first - not written)
    if (ksw) ksw.keys.forEach((k) => { if (k.kind === 'art' && k.def && !held.has(k.group || 'art')) held.set(k.group || 'art', k.id); });
    for (const s of switches.sort((a, b) => a.t - b.t)) {
      const k = s.k, c = nearChord(s.t);
      if (k.kind === 'mode') continue; // (a switch of the VST: sent at the start, not in the score)
      if (k.kind === 'down' || k.kind === 'up') { if (c) c.stroke = k.kind === 'up' ? 'u' : 'd'; continue; }
      if (k.kind === 'art') {
        const g = k.group || 'art';
        if (held.get(g) === k.id) continue; // (held on: sent again for the next stretch)
        held.set(g, k.id);
      }
      const b = B.bars[B.barAt(s.t)];
      marks.push({ st: c ? c.st : b.t0 + Math.round((s.t - b.t0) / grid) * grid, k: k.id });
    }
    chords.forEach((c) => B.pos(Math.max(c.st, c.se - 1)));
    marks.forEach((m) => B.pos(m.st));

    // the score: one melody track
    const doc = TC.emptyScore(B.bars.length);
    fileHeaders(doc, midi, B, scale, bpm0);
    const track = TC.newTrack('pitched', B.bars.length);
    doc.tracks = [track];
    const mt = opts.track !== undefined && opts.track !== null ? midi.tracks[opts.track] : null;
    const ch = Number.isInteger(opts.ch) ? opts.ch : mt ? [...mt.channels][0] : undefined;
    if (Number.isInteger(ch) && ch !== 9) track.channel = ch;
    const prog = mt ? (Number.isInteger(opts.ch) && mt.programs && mt.programs[opts.ch] !== undefined ? mt.programs[opts.ch] : mt.program) : null;
    if (prog !== null && prog !== undefined) { track.program = prog; track.inst = TC.instFromProgram(prog); }
    if (ksw) track.ksw = TC.clone(ksw);
    const sc = MI.guessScale(midi, tones);
    if (sc) track.scale = sc;
    const ps = tones.map((h) => h.pitch).sort((a, b) => a - b), mid = ps.length ? ps[ps.length >> 1] : 64;
    track.clef = track.inst === 'guitar' ? 'treble8' : track.inst === 'bass' ? 'bass8' : mid < 55 ? 'bass' : 'treble';

    let count = 0;
    chords.forEach((c, i) => {
      const next = chords[i + 1], len = (next ? Math.min(c.se, next.st) : c.se) - c.st, p = B.pos(c.st);
      const notes = c.tones.sort((a, b) => a.pitch - b.pitch).map((h) => {
        const x = TC.newPitchNote(h.pitch, null);
        TC.setLevel(x, TC.clamp(TC.levelOfVelocity(h.vel), 1, 4)); // (no ghost notes in a melody)
        if (c.stroke) x.stroke = c.stroke;
        return x;
      });
      const res = SC.place(doc, track, p.bar, 0, p.tick, len, notes[0]);
      if (!res.ev) return;
      res.ev.notes.push(...notes.slice(1));
      count += notes.length;
      if (len > res.ev.dur) SC.setMelodyLength(doc, track, p.bar, 0, res.ev, len); // (over the bar line: tied)
    });
    for (const m of marks) {
      const p = B.pos(m.st), bar = track.bars[p.bar];
      if (!bar) continue;
      if (!bar.ks) bar.ks = [];
      if (!bar.ks.some((x) => x.t === p.tick && x.k === m.k)) bar.ks.push({ t: p.tick, k: m.k });
    }
    // trailing empty bars are not needed
    const empty = (i) => track.bars[i].voices.every((v) => !v.length) && !(track.bars[i].ks && track.bars[i].ks.length) && !doc.bars[i].marker;
    while (doc.bars.length > 1 && empty(doc.bars.length - 1)) {
      doc.bars.pop();
      track.bars.pop();
    }
    return { doc, notes: count, merged, unknown: [], switches: marks.length };
  };

  /**
   * Several MIDI tracks, each its own Tactus track: parts [{ track: index in midi.tracks, kind: 'drums' | 'melody',
   * profile (drums: kit profile), ksw (melody: keyswitch profile), name }].
   * Every part is read on its own (MI.toScore with its own drum map, MI.toMelody with its keyswitches); the bars are
   * those of the file, as long as the longest part. The kit profile of the first drum part becomes the score's,
   * another one the track's own. Returns { doc, notes, merged, unknown } like MI.toScore.
   */
  MI.toScoreMulti = function (midi, parts, opts = {}) {
    const res = parts.map((p) => MI.toScore(midi, Object.assign({}, opts, { track: p.track, ch: p.ch, kind: p.kind, profile: p.profile, ksw: p.ksw, forVst: p.forVst })));
    const doc = res[0].doc;
    const drum0 = parts.find((p) => p.kind !== 'melody'), kit = drum0 ? drum0.profile || null : null;
    if (kit) {
      doc.meta.kit = kit.id;
      doc.meta.kitName = kit.name;
    }
    const longest = res.reduce((a, r) => (r.doc.bars.length > a.doc.bars.length ? r : a)).doc;
    while (doc.bars.length < longest.bars.length) {
      doc.bars.push(TC.clone(longest.bars[doc.bars.length]));
      doc.tracks[0].bars.push(TC.newTrackBar());
    }
    doc.tracks[0].name = parts[0].name || doc.tracks[0].name;
    res.slice(1).forEach((r, k) => {
      const p = parts[k + 1], t = r.doc.tracks[0];
      t.name = p.name || TC.score.freeTrackName(doc, t.kind === 'pitched' ? 'Melody' : 'Drums');
      t.bars = doc.bars.map((h, i) => (t.bars[i] ? t.bars[i] : TC.newTrackBar()));
      if (t.kind === 'drums' && (p.profile || null) !== kit) {
        t.profile = p.profile ? p.profile.id : 'gm';
        t.profileName = p.profile ? p.profile.name : '';
      }
      doc.tracks.push(t);
      doc.bars.forEach((h, i) => TC.score.fitBar(doc, t, i));
    });
    const unknown = new Map();
    res.forEach((r) => r.unknown.forEach((u) => unknown.set(u.note, (unknown.get(u.note) || 0) + u.count)));
    return {
      doc, notes: res.reduce((a, r) => a + r.notes, 0), merged: res.reduce((a, r) => a + r.merged, 0), switches: res.reduce((a, r) => a + (r.switches || 0), 0),
      unknown: [...unknown].map(([note, count]) => ({ note, count })).sort((a, b) => a.note - b.note),
    };
  };

  /** Does a MIDI track (of midi.tracks) look like drums - by its name or channel 10? */
  MI.isDrumTrack = (t) => DRUM_NAME.test(t.name || '') || t.channels.has(9);

  /** The MIDI tracks that look like drums (by name or channel 10); none: the drum track of MI.drumTrack. */
  MI.drumTracks = function (midi) {
    const list = midi.tracks.map((t, i) => Object.assign({ i }, t)).filter((t) => t.notes);
    const drums = list.filter((t) => DRUM_NAME.test(t.name) || t.channels.has(9)).map((t) => t.i);
    if (drums.length) return drums;
    const one = MI.drumTrack(midi);
    return one === null ? [] : [one];
  };

  // ---- dialog -----------------------------------------------------------------------------

  /**
   * Put bars `from` … `to` of an imported score (src) into `doc` from bar `at` on: their notes replace
   * those bars' notes, bars are added at the end if needed; takeTs: those bars get the time
   * signature of the file (otherwise notes beyond a shorter bar are cut); only: the track that gets the
   * notes (default: the first). Returns how many bars.
   */
  MI.insertInto = function (doc, src, at, from = 0, to = src.bars.length - 1, takeTs = true, only = doc.tracks[0]) {
    from = TC.clamp(from, 0, src.bars.length - 1);
    to = TC.clamp(to, from, src.bars.length - 1);
    const clip = TC.score.copyBars(src, from, to);
    if (takeTs) {
      clip.bars.forEach((c, k) => {
        const i = at + k;
        if (i < doc.bars.length && doc.bars[i].ts.join('/') !== c.ts.join('/')) TC.score.setTimeSig(doc, i, c.ts, true);
      });
    }
    return TC.score.pasteBars(doc, at, clip, only);
  };

  const tr = (s, v) => TC.tr(s, v);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const GRIDS = [
    { key: '16t', label: '1/16 + triplets', grid: 240, triplets: true },
    { key: '32t', label: '1/32 + triplets', grid: 120, triplets: true },
    { key: '8t', label: '1/8 + triplets', grid: 480, triplets: true },
    { key: '16', label: '1/16 (no triplets)', grid: 240, triplets: false },
    { key: '32', label: '1/32 (no triplets)', grid: 120, triplets: false },
  ];
  let root = null;

  MI.isOpen = () => !!root;
  MI.close = () => { if (root) root.remove(); root = null; };

  /** Choose a .mid file, then where it comes from and the grid; the result replaces the open score. */
  MI.pick = function () {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.mid,.midi,audio/midi';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => MI.open(new Uint8Array(r.result), f.name);
      r.readAsArrayBuffer(f);
    });
    inp.click();
  };

  /** Names of drum tracks (Drum, EZdrummer, Groove Agent, UJAM …). */
  const DRUM_NAME = /drum|schlag|ezd|groove ?agent|ujam|beat ?maker|superior|addictive|bfd|perc/i;
  /** The drum track of a file: by its name, by channel 10, else the fullest. */
  MI.drumTrack = function (midi) {
    const list = midi.tracks.map((t, i) => Object.assign({ i }, t)).filter((t) => t.notes);
    if (list.length <= 1) return list.length ? list[0].i : null;
    const named = list.filter((t) => DRUM_NAME.test(t.name));
    const ch10 = list.filter((t) => t.channels.has(9));
    const pool = named.length ? named : ch10.length ? ch10 : list;
    return pool.reduce((a, b) => (b.notes > a.notes ? b : a)).i;
  };

  MI.open = function (bytes, fileName) {
    let midi;
    try {
      midi = MI.parse(bytes);
    } catch (e) {
      alert(tr('This is not a MIDI file.'));
      return;
    }
    TC.kits.load();
    if (TC.kswLib) TC.kswLib.load();
    const S = TC.state;
    // the MIDI tracks with notes (tracks of automation only have none and are left out) - all ticked
    const withNotes = MI.sources(midi); // (a track on several channels: one entry per channel - each its own Tactus track)
    const trackName = (t) => (t.name || tr('Track {n}', { n: t.i + 1 })) + (t.ch !== null && t.ch !== undefined ? ' · ' + tr('channel {n}', { n: t.ch + 1 }) : '');
    // where it comes from: the kit profile of the open score, else the last import (track names say little:
    // a track called "EZdrummer" may play Groove Agent)
    const cur = TC.kits.current(S.doc);
    const fileBpm = midi.tempos.length ? Math.round(midi.tempos[0].bpm) : 120;
    // what was chosen for a track of this name the last time (Guitar Pro: "Guitar Lead" again and again)
    const memo = S.settings.importTracks && typeof S.settings.importTracks === 'object' ? S.settings.importTracks : {};
    const kitOk = (id) => !id || !!TC.kits.byId(id);
    const kswOk = (v) => !v || (/^tpl:/.test(v) ? !!(TC.ksw && TC.ksw.template(v.slice(4))) : /^lib:/.test(v) && !!(TC.kswLib && TC.kswLib.byId(v.slice(4))));
    const st = {
      source: cur ? cur.id : S.settings.importKit && TC.kits.byId(S.settings.importKit) ? S.settings.importKit : '',
      grid: S.settings.importGrid || '16t',
      sel: new Set(withNotes.map((t) => t.key)), // the MIDI tracks to take, each becomes a Tactus track
      kind: {},                         // … drums or a melody ('drums' | 'melody')
      src: {},                          // … drums: where each one comes from (kit profile id, '' = General MIDI)
      ks: {},                           // … melody: its keyswitch profile ('' none, 'tpl:<template>', 'lib:<own profile>')
      vst: {},                          // … … the file played for that VST? (true / false; not set: MI.playedFor)
      tempo: fileBpm,
      auto: S.settings.importAuto !== false, // new score: set repeats at once (|: :|, %-bars)
      // into the open score (from a bar on) or as a new score
      target: S.settings.importTarget === 'into' ? 'into' : 'new',
      at: (S.selBar !== null ? S.selBar : 0) + 1,
      from: 1, to: 0, takeTs: true,
    };
    // drums or a melody: as chosen for its name the last time, else by its name / channel 10; a track with a sound
    // (program change: Guitar Pro) is a melody; else the drum track MI.drumTracks would take (a Cubase part on channel 1)
    const drumGuess = new Set(MI.drumTracks(midi));
    withNotes.forEach((t) => {
      const m = memo[trackName(t)] || {};
      st.kind[t.key] = m.kind === 'drums' || m.kind === 'melody' ? m.kind
        : t.ch !== null ? (t.ch === 9 ? 'drums' : 'melody') // (one channel of a track: channel 10 is the drums)
        : MI.isDrumTrack(t) || (t.program === null && drumGuess.has(t.i)) ? 'drums' : 'melody';
      if (typeof m.kit === 'string' && kitOk(m.kit) && !cur) st.src[t.key] = m.kit;
      if (typeof m.ks === 'string' && kswOk(m.ks)) st.ks[t.key] = m.ks;
    });
    MI.close();
    root = document.createElement('div');
    root.className = 'dialog-backdrop';
    root.innerHTML = '<div class="dialog midi-dialog" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(root);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) MI.close(); });

    const srcOf = (i) => (st.src[i] !== undefined ? st.src[i] : st.source);
    const readOpts = () => {
      const g = GRIDS.find((x) => x.key === st.grid) || GRIDS[0];
      return { grid: g.grid, triplets: g.triplets, tempo: st.tempo };
    };
    /** A track's copy of a keyswitch profile ('tpl:…' a template, 'lib:…' an own one), or null. */
    const kswOf = (v) => (!v || !TC.ksw ? null : /^lib:/.test(v) ? (TC.kswLib ? TC.kswLib.toTrack(v.slice(4)) : null) : TC.ksw.fromTemplate(v.slice(4)));
    /** Was the file (this row) played for the VST of its keyswitch profile - as ticked, else as Tactus sees it at the start keys. */
    const forVstOf = (t) => (st.vst[t.key] !== undefined ? st.vst[t.key] : MI.playedFor(midi, { track: t.i, ch: t.ch }, kswOf(st.ks[t.key])));
    /** The ticked MIDI tracks: [{ track, kind, profile, ksw, name }] (a file with one track: that one). */
    const parts = () => (withNotes.length > 1 ? withNotes.filter((t) => st.sel.has(t.key)) : withNotes)
      .map((t) => st.kind[t.key] === 'melody'
        ? { track: t.i, ch: t.ch, kind: 'melody', ksw: kswOf(st.ks[t.key]), forVst: forVstOf(t), name: withNotes.length > 1 ? trackName(t) : '' }
        : { track: t.i, ch: t.ch, kind: 'drums', profile: srcOf(t.key) ? TC.kits.byId(srcOf(t.key)) : null, name: withNotes.length > 1 ? trackName(t) : '' });
    /** Keep what was chosen for each track (by its name) for the next import. */
    const remember = () => {
      const m = Object.assign({}, memo);
      withNotes.forEach((t) => {
        const name = trackName(t);
        delete m[name];
        m[name] = { kind: st.kind[t.key], kit: srcOf(t.key), ks: st.ks[t.key] || '' };
      });
      const names = Object.keys(m);
      names.slice(0, Math.max(0, names.length - 80)).forEach((n) => delete m[n]); // (the newest 80)
      S.settings.importTracks = m;
    };
    const result = () => {
      const ps = parts();
      if (!ps.length) return MI.toScore(midi, Object.assign(readOpts(), { track: -1 })); // nothing ticked: empty
      return MI.toScoreMulti(midi, ps, readOpts());
    };
    /** Name of a key in the chosen drum map ("73 Floortom 2 Rimshot"), or just the number. */
    const keyName = (note) => {
      const p = st.source ? TC.kits.byId(st.source) : null;
      const e = p && TC.kits.map(p).entries.find((x) => x.inote === note);
      return e && !TC.kits.noName(e) ? note + ' ' + e.name : String(note);
    };
    const draw = () => {
      const res = result();
      const nb = res.doc.bars.length;
      const sources = [`<option value="">General MIDI (Guitar Pro …)</option>`]
        .concat(TC.kits.list.map((p) => `<option value="${p.id}"${p.id === st.source ? ' selected' : ''}>${esc(tr('Kit profile: {name}', { name: p.name }))}</option>`)).join('');
      const grids = GRIDS.map((g) => `<option value="${g.key}"${g.key === st.grid ? ' selected' : ''}>${esc(tr(g.label))}</option>`).join('');
      const srcOpts = (v) => [`<option value="">General MIDI (Guitar Pro …)</option>`]
        .concat(TC.kits.list.map((p) => `<option value="${p.id}"${p.id === v ? ' selected' : ''}>${esc(p.name)}</option>`)).join('');
      // a melody: no keyswitches, a template (Iron 2, Rowdy …) or an own keyswitch profile
      const own = TC.kswLib ? TC.kswLib.list : [];
      const kswOpts = (v) => `<option value="">${esc(tr('No keyswitch profile'))}</option>` +
        (TC.ksw ? `<optgroup label="${esc(tr('Templates'))}">${TC.ksw.TEMPLATES.map((x) => `<option value="tpl:${esc(x.tpl)}"${'tpl:' + x.tpl === v ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>` : '') +
        (own.length ? `<optgroup label="${esc(tr('Own profiles'))}">${own.map((q) => `<option value="lib:${esc(q.id)}"${'lib:' + q.id === v ? ' selected' : ''}>${esc(q.name)}</option>`).join('')}</optgroup>` : '');
      const kindSel = (t, off) => `<select data-k="kind" data-i="${t.key}"${off ? ' disabled' : ''} title="${esc(tr('Drums: a drum track with its drum map · Melody: tones, with the keyswitches of its VST'))}">
          <option value="drums"${st.kind[t.key] !== 'melody' ? ' selected' : ''}>${tr('Drums')}</option>
          <option value="melody"${st.kind[t.key] === 'melody' ? ' selected' : ''}>${tr('Melody')}</option></select>`;
      const profSel = (t, off) => st.kind[t.key] === 'melody'
        ? `<select data-k="ks" data-i="${t.key}"${off ? ' disabled' : ''} title="${esc(tr('Its keys become ways of playing again (P.M., slides, staccato …), its notes are shifted back'))}">${kswOpts(st.ks[t.key] || '')}</select>`
        : `<select data-k="src" data-i="${t.key}"${off ? ' disabled' : ''} title="${esc(tr('The drum map its keys come from'))}">${srcOpts(srcOf(t.key))}</select>`;
      // a melody with a keyswitch profile: was the file played for that VST (its keys in it, notes shifted) or not
      // (Guitar Pro: every note as it sounds, the profile only for playing)? Tactus sees it at the start keys.
      const vstBox = (t, off) => st.kind[t.key] === 'melody' && st.ks[t.key]
        ? `<label class="check midi-in-vst" title="${esc(tr('On: the file was played for this VST (exported from Tactus / Cubase) - its keyswitches become ways of playing, the notes are shifted back. Off (Guitar Pro): every note as it sounds, the profile only for playing.'))}">
            <input type="checkbox" data-k="vst" data-i="${t.key}"${forVstOf(t) ? ' checked' : ''}${off ? ' disabled' : ''}> ${tr('File played for this VST (keyswitches in it)')}</label>` : '';
      // several tracks: a tick for each (its name, its notes; channel 10 = drums), drums or a melody, and its profile
      const tracks = withNotes.map((t) => `<div class="export-row">
          <label class="check"><input type="checkbox" data-k="sel" data-i="${t.key}"${st.sel.has(t.key) ? ' checked' : ''}> <b>${esc(trackName(t))}</b>
            <span class="muted">${tr('{n} notes', { n: t.notes })}${t.ch === null ? ' · ' + tr('channel {n}', { n: [...t.channels].sort((a, b) => a - b).map((c) => c + 1).join(', ') }) : ''}</span></label>
          <span class="midi-in-kind">${kindSel(t, !st.sel.has(t.key))}${profSel(t, !st.sel.has(t.key))}</span>${vstBox(t, !st.sel.has(t.key))}</div>`).join('');
      const one = withNotes.length === 1 ? withNotes[0] : null;
      const anyDrums = withNotes.some((t) => st.kind[t.key] !== 'melody' && (one || st.sel.has(t.key)));
      const unk = res.unknown.length
        ? `<p class="hint warn"><b>${tr('Keys without an instrument (left out):')}</b> ${res.unknown.map((u) => esc(keyName(u.note)) + ` (${u.count}×)`).join(', ')}</p>` : '';
      root.querySelector('.dialog').innerHTML = `<header><h2>${tr('Import MIDI')} <a class="help-link" href="hilfe.html#midi-import" target="tactus-help" title="${tr('Help: how this works')}">ⓘ</a></h2><button type="button" class="icon" data-k="close" title="${tr('Close')}">✕</button></header>
        <div class="kit-body">
          <p><b>${esc(fileName)}</b></p>
          ${!one ? `<p class="hint tight">${tr('Which tracks to take - each becomes a track of its own - drums or a melody, and the drum map / keyswitch profile of each:')}</p>
          <div class="export-list">${tracks}</div>
          ${anyDrums ? `<div class="row"><label>${tr('All drums from')}</label><select data-k="source">${sources}</select></div>` : ''}`
          : `<div class="row"><label>${tr('Track')}</label>${kindSel(one)}</div>
          ${st.kind[one.key] === 'melody' ? `<div class="row"><label>${tr('Keyswitches')}</label>${profSel(one)}</div>${vstBox(one)}`
          : `<div class="row"><label>${tr('Comes from')}</label><select data-k="source">${sources}</select></div>`}`}
          <div class="row"><label>${tr('Grid')}</label><select data-k="grid">${grids}</select></div>
          <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-k="tempo" value="${st.tempo}"> <span class="muted">BPM${st.tempo !== fileBpm ? ' · ' + tr('in the file: {t}', { t: fileBpm }) : ''}</span></div>
          <p class="hint">${tr('{n} notes in {b} bars.', { n: res.notes, b: res.doc.bars.length })}
            ${res.merged ? tr('{m} hits merged (flam / drag or the same position).', { m: res.merged }) : ''}
            ${res.switches ? tr('{k} keyswitches become ways of playing / slides.', { k: res.switches }) : ''}</p>
          ${unk}
          <div class="row"><label>${tr('Target')}</label><select data-k="target">
            <option value="new"${st.target === 'new' ? ' selected' : ''}>${tr('New score (replaces the open one)')}</option>
            <option value="into"${st.target === 'into' ? ' selected' : ''}>${tr('Into the open score')}</option></select></div>
          ${st.target === 'into' ? `
          <div class="row"><label>${tr('From bar')}</label><input type="number" min="1" max="${S.doc.bars.length + 1}" data-k="at" value="${st.at}">
            <span class="muted">${tr('of the open score')}</span></div>
          <div class="row"><label>${tr('From the file')}</label>${tr('bar')} <input type="number" min="1" max="${nb}" data-k="from" value="${st.from}">
            ${tr('to')} <input type="number" min="1" max="${nb}" data-k="to" value="${st.to || nb}"> <span class="muted">${tr('of {n}', { n: nb })}</span></div>
          <label class="check"><input type="checkbox" data-k="takeTs"${st.takeTs ? ' checked' : ''}> ${tr('Take the time signatures of the file')}</label>
          <p class="hint">${tr('The notes of those bars are replaced, bars are added at the end if needed. One undo step.')}</p>`
          : `<p class="hint">${tr('The import replaces the open score.')}</p>
          <label class="check"><input type="checkbox" data-k="auto"${st.auto ? ' checked' : ''}> ${tr('Set repeats automatically (|: :| and %-bars where bars play the same)')}</label>
          <p class="hint tight">${tr('Back to the notes: right-click a bar (finger: hold it).')}</p>`}
          ${anyDrums ? `<p class="hint">${tr('Velocity: soft = ghost note, loud = accent.')}</p>` : ''}
        </div>
        <footer><span class="grow"></span><button type="button" data-k="close">${tr('Cancel')}</button>
          <button type="button" class="primary" data-k="ok"${parts().length ? '' : ' disabled'}>${tr('Import')}</button></footer>`;
    };
    root.addEventListener('change', (e) => {
      const k = e.target.dataset.k, i = e.target.dataset.i;
      if (k === 'sel') { if (e.target.checked) st.sel.add(i); else st.sel.delete(i); draw(); }
      if (k === 'src') { st.src[i] = e.target.value; draw(); }
      if (k === 'kind') { st.kind[i] = e.target.value === 'melody' ? 'melody' : 'drums'; draw(); }
      if (k === 'ks') { st.ks[i] = e.target.value; delete st.vst[i]; draw(); }
      if (k === 'vst') { st.vst[i] = e.target.checked; draw(); }
      if (k === 'source') { st.source = e.target.value; st.src = {}; draw(); } // (every track)
      if (k === 'grid') { st.grid = e.target.value; draw(); }
      if (k === 'tempo') { st.tempo = TC.clamp(Math.round(Number(e.target.value) || fileBpm), 20, 400); draw(); }
      if (k === 'target') { st.target = e.target.value; draw(); }
      if (k === 'at' || k === 'from' || k === 'to') st[k] = Math.max(1, Math.round(Number(e.target.value) || 1));
      if (k === 'takeTs') st.takeTs = e.target.checked;
      if (k === 'auto') st.auto = e.target.checked;
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      if (b.dataset.k === 'close') MI.close();
      if (b.dataset.k === 'ok' && st.target === 'into') {
        // into the open score: those bars' notes are replaced - one undo step
        const res = result(), nb = res.doc.bars.length;
        const at = TC.clamp(st.at - 1, 0, S.doc.bars.length);
        const from = TC.clamp(st.from - 1, 0, nb - 1), to = TC.clamp((st.to || nb) - 1, from, nb - 1);
        S.settings.importKit = st.source;
        S.settings.importGrid = st.grid;
        S.settings.importTarget = 'into';
        remember();
        TC.saveSettings();
        MI.close();
        // one MIDI track: into the track being written (if it is of its kind); several: each into the track of its name
        // and kind - or a new one (a melody: with the sound, scale, clef and keyswitches read from the file)
        const ps = parts();
        let n = 0;
        ps.forEach((p) => {
          const r = MI.toScore(midi, Object.assign(readOpts(), { track: p.track, ch: p.ch, kind: p.kind, profile: p.profile, ksw: p.ksw, forVst: p.forVst }));
          const want = p.kind === 'melody' ? 'pitched' : 'drums', now = TC.curTrack(), got = r.doc.tracks[0];
          let into = (ps.length === 1 && now && now.kind === want ? now : null) || S.doc.tracks.find((t) => t.name === p.name && t.kind === want && !t.lh);
          if (!into) {
            into = TC.score.addTrack(S.doc, p.name || TC.score.freeTrackName(S.doc, want === 'pitched' ? 'Melody' : 'Drums'), undefined, want);
            if (want === 'pitched') ['clef', 'scale', 'inst', 'program', 'channel'].forEach((f) => { into[f] = TC.clone(got[f]); });
          }
          if (want === 'pitched' && got.ksw && !into.ksw) into.ksw = got.ksw;
          n = Math.max(n, MI.insertInto(S.doc, r.doc, at, from, to, st.takeTs, into));
        });
        S.selection.clear();
        TC.selectBar(at);
        if (n > 1) TC.selectBar(at + n - 1, true);
        TC.commit();
        TC.ui.hint(tr('MIDI bars {a}–{b} imported into bars {c}–{d}', { a: from + 1, b: to + 1, c: at + 1, d: at + n }));
        return;
      }
      if (b.dataset.k === 'ok') {
        if (S.dirty && !confirm(tr('Discard the changes of the open score?'))) return;
        S.settings.importTarget = 'new';
        const res = result();
        const title = fileName.replace(/\.midi?$/i, '');
        res.doc.meta.title = title;
        S.settings.importKit = st.source;
        S.settings.importGrid = st.grid;
        S.settings.importAuto = st.auto;
        remember();
        TC.saveSettings();
        MI.close();
        // repeats: set at once (sections |: :|, then %-bars) - or only shown in colour (panel: Find repeats)
        const auto = st.auto ? TC.score.autoRepeats(res.doc) : null;
        TC.storage.setDoc(res.doc, title + '.tactus.json');
        S.dirty = true;
        const f = auto ? null : TC.score.findRepeats(S.doc);
        S.analyze = !!(f && (f.simile.length || f.sections.length));
        TC.actions.home();
        TC.refresh();
        TC.ui.hint(tr('MIDI imported: {n} notes', { n: res.notes }) + (auto && (auto.sections || auto.similes)
          ? ' · ' + tr('Repeats set: {a} sections, {b} %-bars – right-click a bar: back to the notes', { a: auto.sections, b: auto.similes })
          : S.analyze ? ' · ' + tr('Bars that play the same are marked in colour (panel: Find repeats)') : ''));
      }
    });
    draw();
  };
})(window.TC);
