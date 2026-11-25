'use strict';
/*
 * Checking notes (right panel "Check notes"): notes of the melody tracks that do not fit the chord sounding there,
 * leave the scale of their bar, or leave the range of their voice / instrument - found, marked in colour in the score,
 * and set right on request. Pure functions on the doc (tested in tools/tests/test_check.js).
 *
 *   TC.check.KINDS                    ['chord', 'scale', 'range']
 *   TC.check.tracked(doc, track)      is the track checked? (its own choice track.check, else: a melody, no left hand,
 *                                     not mostly chords - accompaniment is not checked)
 *   TC.check.find(doc, opts)          -> [Find] in score order; opts { chord, scale, range: on / off, strict: every note
 *                                     against its chord (else only where it stands out), tracks: only these }
 *   TC.check.fix(doc, finds, kind)    sets the notes of these finds right (the whole tied chain); -> { done, skipped }
 *
 *   Find: { kind, id (note), track, bar, voice, tick, pitch, ch (chord, kind 'chord'), why: 'start' | 'into' | 'long'
 *           | 'any' (chord) , scale (kind 'scale'), range: [lo, hi], key (kind 'range'), prev: pitch of the note before }
 *
 * The chord rule (not strict): a melody passes through tones outside the chord all the time - only a note that stands
 * out is found: one starting right on a chord change ('start'), one still sounding when the chord changes under it
 * ('into': Am -> F, the E held on), and a long one (a quarter or more, tied on included) on a beat ('long').
 */
(function (TC) {
  const CK = (TC.check = {});
  const P = () => TC.pitch, SC = () => TC.score;
  const mod = (x, m) => ((x % m) + m) % m;

  CK.KINDS = ['chord', 'scale', 'range'];

  /** Pitch classes of a chord, its slash bass included. */
  CK.chordSet = function (ch) {
    const s = new Set(P().chordPcs(ch));
    if (ch.bass) s.add(P().pc(ch.bass.l, ch.bass.a));
    return s;
  };

  /** Is a melody track mostly chords (accompaniment: chords as notes, a strummed guitar)? */
  CK.chordy = function (track) {
    let evs = 0, chords = 0;
    track.bars.forEach((b) => b.voices.forEach((v) => v.forEach((ev) => {
      if (!ev.notes.length) return;
      evs++;
      if (ev.notes.length > 1) chords++;
    })));
    return evs > 0 && chords * 2 > evs;
  };
  /** Is the track checked by default: a melody, not a left hand, not mostly chords. */
  CK.trackedByDefault = (doc, track) => track.kind === 'pitched' && !track.lh && !CK.chordy(track);
  /** Is the track checked: its own choice (track.check), else the default. */
  CK.tracked = (doc, track) => track.kind === 'pitched' && (typeof track.check === 'boolean' ? track.check : CK.trackedByDefault(doc, track));

  /** The range of a track: { key, range: [lo, hi] } or null (a piano: the piano's, both hands). */
  CK.rangeOf = function (doc, track) {
    const up = SC().instrumentOf(doc, track);
    const key = SC().isPiano(doc, up) ? 'piano' : P().rangeKey(up);
    const r = key && P().range(key);
    return r ? { key, range: r.range } : null;
  };

  /**
   * The notes of a melody track in score order, one entry per event: [{ bar, voice, ev, abs }] per voice (abs: ticks
   * from the start of the score, as written). %-bars are skipped (they play the bar before them).
   */
  function voicesOf(doc, track) {
    const out = [];
    let start = 0;
    track.bars.forEach((b, bi) => {
      if (!b.simile) b.voices.forEach((v, vi) => v.forEach((ev) => {
        if (!ev.notes.length) return;
        (out[vi] = out[vi] || []).push({ bar: bi, voice: vi, ev, abs: start + ev.tick });
      }));
      start += TC.barTicks(doc.bars[bi].ts);
    });
    return out.filter(Boolean);
  }

  /** The chord changes of a bar between two ticks (from < t < to): [{ t, ch }]. */
  const changesIn = (doc, bi, from, to, prefer) => SC().chordsIn(doc, bi, prefer).filter((x) => x.t > from && x.t < to);

  /**
   * Notes that do not fit. opts: { chord, scale, range (true: checked), strict, tracks: [track] (default: the tracked
   * ones) }. -> [Find], in the order of the tracks, then the time.
   */
  CK.find = function (doc, opts = {}) {
    const out = [];
    if (!opts.chord && !opts.scale && !opts.range) return out;
    const tracks = opts.tracks || doc.tracks.filter((t) => CK.tracked(doc, t));
    const hasChords = doc.bars.some((h) => h.chords && h.chords.length);
    for (const track of tracks) {
      if (track.kind !== 'pitched') continue;
      const up = SC().instrumentOf(doc, track), rg = opts.range ? CK.rangeOf(doc, track) : null;
      const list = [];
      for (const evs of voicesOf(doc, track)) {
        evs.forEach((e, k) => {
          const { bar: bi, voice: vi, ev } = e, beat = TC.rhythm ? TC.rhythm.beatTicks(doc.bars[bi].ts) : 960;
          const prevEv = k > 0 ? evs[k - 1].ev : null;
          for (const n of ev.notes) {
            if (n.pitch === undefined) continue;
            const pc = mod(n.pitch, 12);
            const prev = prevEv ? prevEv.notes.reduce((a, x) => (a === null || Math.abs(x.pitch - n.pitch) < Math.abs(a - n.pitch) ? x.pitch : a), null) : null;
            const base = { id: n.id, track, bar: bi, voice: vi, tick: ev.tick, abs: e.abs, pitch: n.pitch, prev };
            const cont = !!(n.tie && SC().tiedFrom(doc, track, bi, vi, ev, n)); // tied on: the same tone as before
            const here = hasChords ? SC().chordAt(doc, bi, ev.tick, up) : null;
            // the chord
            if (opts.chord && hasChords) {
              let hit = null;
              const fits = (c) => CK.chordSet(c).has(pc);
              if (here && opts.strict && !cont && !fits(here.ch)) hit = { ch: here.ch, why: 'any' };
              if (!hit && here && here.bar === bi && here.t === ev.tick && !fits(here.ch)) hit = { ch: here.ch, why: cont ? 'into' : 'start' };
              if (!hit) {
                const into = changesIn(doc, bi, ev.tick, ev.tick + ev.dur, up).find((x) => !fits(x.ch));
                if (into) hit = { ch: into.ch, why: 'into', at: into.t };
              }
              if (!hit && here && !cont && ev.tick % beat === 0 && !fits(here.ch)) {
                const len = SC().chainTicks(SC().tieChain(doc, n.id));
                if (len >= TC.TPQ) hit = { ch: here.ch, why: 'long' };
              }
              if (hit) list.push(Object.assign({ kind: 'chord' }, base, hit));
            }
            // the scale (a tone of the chord sounding there is meant: E7 in A minor, the G♯)
            if (opts.scale && !cont) {
              const scale = SC().scaleAt(up, bi), s = P().scaleById(scale.id);
              if (!s.free && !P().pcs(scale).has(pc) && !(here && CK.chordSet(here.ch).has(pc))) list.push(Object.assign({ kind: 'scale', scale }, base));
            }
            // the range
            if (rg && !cont && (n.pitch < rg.range[0] || n.pitch > rg.range[1])) list.push(Object.assign({ kind: 'range', range: rg.range, key: rg.key }, base));
          }
        });
      }
      list.sort((a, b) => a.abs - b.abs || a.voice - b.voice || CK.KINDS.indexOf(a.kind) - CK.KINDS.indexOf(b.kind));
      out.push(...list);
    }
    return out;
  };

  /**
   * The pitch a find is set to - its kind: the nearest chord tone / tone of the scale (equally near: towards the note
   * before, so the line stays smooth; the scale: a sharp goes up, a flat down, as the note is spelled), into the range
   * by octaves; never a pitch of `avoid`. { pitch, dia } (dia: how it is spelled; null = from the scale), or null.
   */
  CK.target = function (doc, f, n, avoid) {
    const p = f.pitch;
    const toward = f.prev === null || f.prev === undefined || f.prev === p ? -1 : f.prev < p ? -1 : 1;
    const nearest = (ok, first) => {
      for (let d = 1; d <= 12; d++) {
        if (ok(p + first * d)) return p + first * d;
        if (ok(p - first * d)) return p - first * d;
      }
      return null;
    };
    const inMidi = (x) => x >= 0 && x <= 127 && !(avoid && avoid.has(x)); // (avoid: tones its chord has already)
    if (f.kind === 'chord') {
      // held into a new chord: a tone of both chords, if they share one (Am -> F: A or C), so it fits all along
      let set = CK.chordSet(f.ch);
      if (f.before) {
        const both = new Set([...set].filter((x) => CK.chordSet(f.before).has(x)));
        if (both.size) set = both;
      }
      const to = nearest((x) => inMidi(x) && set.has(mod(x, 12)), toward);
      if (to === null) return null;
      const t = P().chordTones(f.ch).find((x) => P().pc(x.l, x.a) === mod(to, 12));
      return { pitch: to, dia: t ? P().diaOf(to, t.l, t.a) : null };
    }
    if (f.kind === 'scale') {
      const pcs = P().pcs(f.scale), sp = P().noteSpell(n, f.scale), line = P().lineMap(f.scale)[mod(sp.dia, 7)];
      const dir = sp.a > line.a ? 1 : sp.a < line.a ? -1 : toward;
      const to = nearest((x) => inMidi(x) && pcs.has(mod(x, 12)), dir);
      return to === null ? null : { pitch: to, dia: null };
    }
    if (f.kind === 'range') {
      const [lo, hi] = f.range;
      let to = p;
      while (to < lo) to += 12;
      while (to > hi) to -= 12;
      if (to < lo || to > hi) return null;
      return { pitch: to, dia: Number.isInteger(n.dia) ? n.dia + (7 * (to - p)) / 12 : null };
    }
    return null;
  };

  /**
   * Sets the notes of these finds right (only the finds of `kind`, if given): each note with its whole tied chain. A
   * note whose new tone its chord already holds stays. -> { done (notes changed), skipped }.
   */
  CK.fix = function (doc, finds, kind) {
    let done = 0, skipped = 0;
    const seen = new Set();
    for (const f of finds) {
      if (kind && f.kind !== kind) continue;
      if (seen.has(f.id)) continue;
      const chain = SC().tieChain(doc, f.id);
      if (!chain.length) continue;
      chain.forEach((c) => seen.add(c.note.id));
      const h = chain.find((c) => c.note.id === f.id) || chain[0];
      let before = null;
      if (f.kind === 'chord' && f.why === 'into') { // (the chord where the chain starts)
        const c0 = SC().chordAt(doc, chain[0].bar, chain[0].ev.tick, SC().instrumentOf(doc, h.track));
        if (c0 && c0.ch !== f.ch && P().chordText(c0.ch) !== P().chordText(f.ch)) before = c0.ch;
      }
      const avoid = new Set(h.ev.notes.filter((x) => x !== h.note).map((x) => x.pitch));
      const to = CK.target(doc, Object.assign({}, f, { pitch: h.note.pitch, before }), h.note, avoid);
      if (!to || to.pitch === h.note.pitch || chain.some((c) => c.ev.notes.some((x) => x !== c.note && x.pitch === to.pitch))) {
        skipped++;
        continue;
      }
      chain.forEach((c) => {
        c.note.pitch = to.pitch;
        c.note.dia = to.dia;
      });
      done++;
    }
    return { done, skipped };
  };
})(window.TC);
