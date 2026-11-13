'use strict';
/*
 * MIDI export (Standard MIDI File, type 0, 960 ticks per quarter = Tactus ticks).
 *
 *   TC.midi.build(doc, target, { straight }) -> { bytes: Uint8Array, replaced: [ {art, by} ], missing: [art] }
 *     straight         true: no swing (otherwise swing / shuffle of the score as heard)
 *     target null       General MIDI (channel 10): the MIDI note of each instrument as in Guitar Pro,
 *                       so the file also opens in Guitar Pro and any GM drum sound
 *     target = profile  a kit profile (js/kits.js): the first key of each instrument, the channel of
 *                       that key in the drum map; an instrument without a key takes a related one
 *                       (hi-hat half -> open, crash choke -> crash …) and is reported
 *
 * Contents: track name (title), tempo and time signature (also where they change), bar texts as
 * markers, the notes with velocity (ghost soft, accent loud, as played back), flam / drag grace notes
 * and rolls written out as single strokes, %-bars written out, repeats and endings written out as
 * played (a MIDI file knows no repeats; Cubase gets every bar, with a marker where a repeat starts again).
 */
(function (TC) {
  const M = (TC.midi = {});
  const NOTE_LEN = 120; // a 32nd: drum hits are short, the length does not matter to a drum VST
  const tr = (s, v) => (TC.tr ? TC.tr(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => v[k]));

  /** Related instruments to fall back on when a profile has no key for one. */
  const FALLBACK = {
    92: [46, 42], 46: [92, 42], 42: [92, 46], 44: [42],
    37: [38], 91: [38], 40: [38], 39: [38], 31: [37, 38],
    35: [36], 36: [35],
    50: [48, 47], 48: [50, 47], 47: [48, 45], 45: [47, 43], 43: [41, 45], 41: [43, 45],
    93: [51], 94: [51], 53: [51], 126: [51], 59: [93, 51], 127: [53, 51],
    97: [49], 57: [49], 98: [57, 97, 49], 55: [49], 95: [55, 49], 52: [49], 96: [52, 49], 30: [49],
    101: [56], 99: [56], 100: [56], 102: [56], 103: [56], 54: [56],
    244: [46, 44], 82: [54], 75: [37, 31],
  };

  /** MIDI note (and channel) of an instrument for a target; records fallbacks. */
  M.keyFor = keyFor;
  function keyFor(art, target, report) {
    if (!target) return { note: art.midi, ch: 9 };
    const map = TC.kits.map(target), by = new Map(map.entries.map((e) => [e.inote, e]));
    const pick = (id) => {
      const n = (target.assign[id] || [])[0];
      return n === undefined ? null : { note: n, ch: (by.get(n) || {}).channel || 0 };
    };
    let k = pick(art.id);
    if (k) return k;
    for (const id of (FALLBACK[art.id] || []).concat(art.tom ? [art.tom] : [])) { // tom rim shot / rim -> the tom
      k = pick(id);
      if (k) {
        report.replaced.set(art.id, id);
        return k;
      }
    }
    report.missing.add(art.id);
    return null;
  }

  // ---- bytes ----------------------------------------------------------------------------

  const vlq = (n) => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const text = (s) => Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0)); // UTF-8
  const meta = (type, data) => [0xff, type].concat(vlq(data.length), data);

  M.build = function (doc, target, opts = {}) {
    const track = doc.tracks[0], T = TC.timeline, R = TC.rhythm;
    const report = { replaced: new Map(), missing: new Set() };
    const ev = []; // { t, order, bytes } order: 0 meta, 1 note off, 2 note on
    const add = (t, order, bytes) => ev.push({ t: Math.max(0, Math.round(t)), order, bytes });
    add(0, 0, meta(0x03, text(doc.meta.title || 'Tactus')));

    let t0 = 0, tempo = null, ts = null, prev = -1;
    // swing / shuffle as heard (opts.straight: the notes on the grid, e.g. to swing them in the DAW)
    const sw = (k) => (opts.straight ? k : Math.round(TC.swingTick(k, doc.meta.swing || 50, doc.meta.swingUnit || 8)));
    // repeats and endings written out, bar after bar as played (model.js playOrder); a marker where a
    // repeat begins again ("Bar 5 – 2nd time"), so the bars in Cubase can be told apart
    for (const o of TC.score.playOrder(doc)) {
      const bi = o.bar;
      const h = doc.bars[bi], L = TC.barTicks(h.ts), bpm = T.tempoAt(doc, bi);
      if (o.pass > 1 && bi <= prev) add(t0, 0, meta(0x06, text(tr('Bar {n} – {p}. time', { n: bi + 1, p: o.pass }))));
      prev = bi;
      if (bpm !== tempo) {
        tempo = bpm;
        add(t0, 0, meta(0x51, u32(Math.round(60000000 / bpm)).slice(1)));
      }
      if (!ts || ts[0] !== h.ts[0] || ts[1] !== h.ts[1]) {
        ts = h.ts;
        add(t0, 0, meta(0x58, [ts[0], Math.round(Math.log2(ts[1])), 24, 8]));
      }
      if (h.marker) add(t0, 0, meta(0x06, text(h.marker)));
      const msTicks = (ms) => (ms / 1000) * (bpm / 60) * TC.TPQ; // grace notes: fixed time before the beat

      const src = TC.score.sourceBar(doc, bi);
      for (const voice of track.bars[src].voices) {
        const ends = track.kind === 'drums' && R ? R.ends(voice, h.ts, doc.bars[src].beam, track.fill) : null;
        for (const e of voice) {
          if (e.tick >= L) continue;
          const dur = ends && ends.has(e) ? ends.get(e) - e.tick : Math.min(e.dur, L - e.tick);
          for (const n of e.notes) {
            const art = TC.drums.byId(n.art);
            if (!art) continue;
            const k = keyFor(art, target, report);
            if (!k) continue;
            const hit = (t, vel) => {
              const v = Math.max(1, Math.min(127, Math.round(vel * 127)));
              add(t, 2, [0x90 | k.ch, k.note, v]);
              add(t + NOTE_LEN, 1, [0x80 | k.ch, k.note, 0]);
            };
            const at = t0 + sw(e.tick), vel = T.velocity(n); // swing: an offbeat comes later
            if (n.orn === 'flam') hit(at - msTicks(30), 0.35);
            if (n.orn === 'drag') {
              hit(at - msTicks(60), 0.33);
              hit(at - msTicks(30), 0.38);
            }
            hit(at, vel);
            if (n.trem) {
              const step = T.rollStep(dur, n.trem);
              for (let s = step, j = 1; s < dur - 1; s += step, j++) hit(t0 + sw(e.tick + s), vel * (j % 2 ? 0.7 : 0.8));
            }
          }
        }
      }
      t0 += L;
    }
    ev.sort((a, b) => a.t - b.t || a.order - b.order);
    const data = [];
    let last = 0;
    for (const e of ev) {
      data.push(...vlq(e.t - last), ...e.bytes);
      last = e.t;
    }
    data.push(...vlq(Math.max(0, t0 - last)), 0xff, 0x2f, 0x00); // end of track at the end of the last bar
    const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (TC.TPQ >> 8) & 255, TC.TPQ & 255];
    const bytes = new Uint8Array(head.concat([0x4d, 0x54, 0x72, 0x6b], u32(data.length), data));
    return {
      bytes,
      replaced: [...report.replaced].map(([a, b]) => ({ art: TC.drums.byId(a), by: TC.drums.byId(b) })),
      missing: [...report.missing].map((a) => TC.drums.byId(a)),
    };
  };

  /** Reads the note events of a MIDI file made by M.build (for the tests): [ {t, note, vel, ch} ] and metas. */
  M.read = function (bytes) {
    let p = 14 + 8; // header + "MTrk" + length
    const tpq = (bytes[12] << 8) | bytes[13], notes = [], metas = [];
    let t = 0, status = 0;
    const vl = () => {
      let n = 0, b;
      do { b = bytes[p++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80);
      return n;
    };
    while (p < bytes.length) {
      t += vl();
      let b = bytes[p++];
      if (b === 0xff) {
        const type = bytes[p++], len = vl();
        metas.push({ t, type, data: Array.from(bytes.slice(p, p + len)) });
        p += len;
        if (type === 0x2f) break;
        continue;
      }
      if (b & 0x80) status = b;
      else p--;
      const d1 = bytes[p++], d2 = bytes[p++];
      if ((status & 0xf0) === 0x90 && d2 > 0) notes.push({ t, note: d1, vel: d2, ch: status & 15 });
    }
    return { tpq, notes, metas };
  };
})(window.TC);
