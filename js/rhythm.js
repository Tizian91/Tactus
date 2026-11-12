'use strict';
/*
 * From events to notation: which note values, rests, dots, tuplets and beams a voice
 * of one bar is written with. Pure functions without the DOM (tested in tools/tests).
 *
 *   TC.rhythm.layout(events, ts, drums) -> items, in time order:
 *     { kind: 'note' | 'rest', tick, dur,        actual position and length in ticks
 *       base, dots,                                written value (3840 whole … 60 = 64th) and dots
 *       tup: null | { s, e, n: 3, m: 2 },         inside a triplet (window from s to e)
 *       ev, tie, measure }                         the event (notes), tied to the next item, whole-bar rest
 *
 * Rules (as in printed drum music):
 *   - a note keeps the value it was written with; it ends early at the next event of its voice
 *   - drums: what cannot be shown as one note value becomes a rest (no ties on drums);
 *     other instruments: tied notes
 *   - rests never hide a beat (a half rest only on beat 1 or 3 in 4/4), an empty voice
 *     gets a whole-bar rest
 *   - a beat whose positions only fit a triplet grid is written as a triplet (3 in the time of 2);
 *     quarter triplets (spanning two beats) are found as well
 *   - beams join eighths and shorter notes within one beat (6/8: within a dotted quarter)
 */
(function (TC) {
  const R = (TC.rhythm = {});
  const UNIT = 60; // a 64th: the finest binary position
  const PLAIN = [3840, 1920, 960, 480, 240, 120, 60];

  /** Length of one beat (what rests may not hide): 6/8, 9/8, 12/8 count dotted quarters. */
  R.beatTicks = (ts) => (ts[1] === 8 && ts[0] % 3 === 0 && ts[0] > 3 ? 1440 : (4 * TC.TPQ) / ts[1]);
  /** Length of a beam group. */
  R.beamTicks = (ts) => {
    if (ts[1] === 8 && ts[0] % 3 === 0 && ts[0] > 3) return 1440;
    if (ts[1] === 16) return 480;
    return 960;
  };

  /** Notes and the gaps between them, from 0 to the bar end. */
  function segments(events, L) {
    const evs = events.filter((e) => e.tick >= 0 && e.tick < L && e.notes && e.notes.length).sort((a, b) => a.tick - b.tick);
    const segs = [];
    let pos = 0;
    evs.forEach((e, i) => {
      if (e.tick < pos) return; // overlaps the one before (should not happen)
      if (e.tick > pos) segs.push({ s: pos, e: e.tick, ev: null });
      const next = i + 1 < evs.length ? evs[i + 1].tick : L;
      let end = Math.min(e.tick + e.dur, next, L);
      if (!(end > e.tick)) end = Math.min(next, L);
      segs.push({ s: e.tick, e: end, ev: e });
      pos = end;
    });
    if (pos < L) segs.push({ s: pos, e: L, ev: null });
    return segs;
  }

  /** Split the bar into binary stretches and triplet windows. */
  function regions(segs, L, B) {
    const pts = [];
    segs.forEach((g) => {
      if (g.s > 0) pts.push(g.s);
      if (g.e < L) pts.push(g.e);
    });
    const inside = (a, b) => pts.filter((p) => p > a && p < b);
    const binary = (a, b) => inside(a, b).every((p) => p % UNIT === 0);
    const tripOk = (rel) => (rel * 3) % 2 === 0 && ((rel * 3) / 2) % UNIT === 0;
    const trip = (a, b) => tripOk(b - a) && inside(a, b).every((p) => tripOk(p - a));
    const crosses = (x) => segs.some((g) => g.ev && g.s < x && g.e > x);
    // eighth triplets of a beat: every position on a third of the beat
    const coarse = (a, b) => inside(a, b).every((p) => ((p - a) * 3) % (b - a) === 0);
    const out = [];
    const pushBinary = (s, e) => {
      const last = out[out.length - 1];
      if (last && !last.tup && last.e === s) last.e = e;
      else out.push({ s, e, tup: null });
    };
    const pushTrip = (s, e) => out.push({ s, e, tup: { s, e, n: 3, m: 2 } });
    for (let w = 0; w < L;) {
      const e1 = Math.min(w + B, L), e2 = Math.min(w + 2 * B, L), h = w + B / 2;
      const halfOk = (a, b) => binary(a, b) || (trip(a, b) && !crosses(b));
      if (binary(w, e1)) {
        pushBinary(w, e1);
        w = e1;
      } else if (trip(w, e1) && coarse(w, e1) && !crosses(e1)) {
        pushTrip(w, e1); // eighth triplets
        w = e1;
      } else if (e1 - w === B && h % UNIT === 0 && !crosses(h) && halfOk(w, h) && halfOk(h, e1)) {
        // sixteenth triplets on half a beat (the other half may be plain)
        for (const [a, b] of [[w, h], [h, e1]]) {
          if (binary(a, b)) pushBinary(a, b);
          else pushTrip(a, b);
        }
        w = e1;
      } else if (e2 > e1 && trip(w, e2)) {
        pushTrip(w, e2); // quarter triplets over two beats
        w = e2;
      } else if (trip(w, e1)) {
        pushTrip(w, e1);
        w = e1;
      } else {
        pushBinary(w, e1); // positions off every grid: written as close as possible
        w = e1;
      }
    }
    return out;
  }

  /** Largest note value that may start at `pos` (written ticks) and fits into `len`. */
  function pickNote(pos, len, beat) {
    for (const v of PLAIN) {
      const d = v * 1.5;
      if (v >= 120 && d <= len && (pos % v === 0 ||
        (pos % (v / 2) === 0 && Math.floor(pos / beat) === Math.floor((pos + d - 1) / beat)))) return [v, 1];
      if (v <= len && pos % (v / 2) === 0 && (v < 3840 || pos === 0)) return [v, 0];
    }
    return [UNIT, 0];
  }

  /** Largest rest that may start at `pos` without hiding a beat. */
  function pickRest(pos, len, beat) {
    const dotted = (beat * 2) / 3;
    if (PLAIN.includes(dotted) && len >= beat && pos % beat === 0) return [dotted, 1];
    for (const v of PLAIN) {
      if (v <= len && pos % v === 0 && (v <= beat || pos % beat === 0)) return [v, 0];
    }
    return [UNIT, 0];
  }

  /**
   * Note values, rests and tuplets of one voice in one bar.
   * drums: what is left of a note after its value becomes rests instead of tied notes.
   */
  R.layout = function (events, ts, drums = true) {
    const L = TC.barTicks(ts), B = R.beatTicks(ts);
    if (!events.some((e) => e.notes && e.notes.length && e.tick < L)) {
      return [{ kind: 'rest', tick: 0, dur: L, base: 3840, dots: 0, tup: null, ev: null, tie: false, measure: true }];
    }
    const segs = segments(events, L);
    const items = [];
    for (const r of regions(segs, L, B)) {
      const f = r.tup ? 1.5 : 1;           // written = actual * f
      const origin = r.tup ? r.s : 0;      // metric positions count from here
      const beat = r.tup ? (r.e - r.s) * f : B;
      for (const g of segs) {
        const s = Math.max(g.s, r.s), e = Math.min(g.e, r.e);
        if (e <= s) continue;
        const cont = g.s < r.s; // a note that started before this region
        let kind = g.ev && !(cont && drums) ? 'note' : 'rest';
        let pos = (s - origin) * f;
        const end = (e - origin) * f;
        let first = !cont;
        while (end - pos > 1e-6) {
          const len = end - pos;
          const [v, dots] = kind === 'note' ? pickNote(pos, len, beat) : pickRest(pos, len, beat);
          const d = Math.min(v * (dots ? 1.5 : 1), len);
          const it = {
            kind, tick: Math.round(origin + pos / f), dur: Math.round(d / f), base: v, dots,
            tup: r.tup, ev: kind === 'note' ? g.ev : null, tie: false, measure: false, cont: kind === 'note' && !first,
          };
          if (it.cont) items[items.length - 1].tie = true;
          items.push(it);
          pos += d;
          if (kind === 'note') {
            first = false;
            if (drums) kind = 'rest';
          }
        }
      }
    }
    return items.sort((a, b) => a.tick - b.tick);
  };

  /** Groups of note items joined by a beam (each group has 2 or more notes). */
  R.beams = function (items, ts) {
    const BT = R.beamTicks(ts);
    const groups = [];
    let cur = [], key = null;
    const flush = () => {
      if (cur.length > 1) groups.push(cur);
      cur = [];
      key = null;
    };
    for (const it of items) {
      const beamable = it.kind === 'note' && it.base <= 480;
      const k = it.tup ? 't' + it.tup.s : 'b' + Math.floor(it.tick / BT);
      if (!beamable) {
        flush();
        continue;
      }
      if (k !== key) flush();
      cur.push(it);
      key = k;
    }
    flush();
    return groups;
  };

  /** Number of flags / beams of a written value (8th = 1, 16th = 2 …). */
  R.flags = (base) => Math.max(0, Math.round(Math.log2(480 / base)) + 1);

  /**
   * Counting name of a position, e.g. "2", "2 e", "2 +", "2 a" (sixteenths) or
   * "2 trip" for triplets; beats are numbered from 1.
   */
  R.countLabel = function (tick, ts) {
    const B = (4 * TC.TPQ) / ts[1];
    const beat = Math.floor(tick / B) + 1, rel = tick % B;
    if (!rel) return String(beat);
    const de = TC.getLang && TC.getLang() === 'de';
    const sixteenths = { [B / 4]: 'e', [B / 2]: de ? 'und' : '+', [(3 * B) / 4]: 'a' };
    if (sixteenths[rel]) return `${beat} ${sixteenths[rel]}`;
    if (rel === B / 3) return `${beat} trip`;
    if (rel === (2 * B) / 3) return `${beat} let`;
    return `${beat} + ${rel}/${B}`;
  };
})(window.TC);
