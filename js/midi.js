'use strict';
/*
 * MIDI export (Standard MIDI File, type 0 - or type 1, one MIDI track per Tactus track; 960 ticks per quarter = Tactus ticks).
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
  const KS_TICKS = 12; // a keyswitch goes this much before the notes it is for (js/keyswitch.js)
  const tr = (s, v) => (TC.tr ? TC.tr(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => v[k]));

  /** Related instruments to fall back on when a profile has no key for one. */
  const FALLBACK = {
    92: [46, 42], 46: [92, 42], 42: [92, 46], 44: [42],
    37: [38], 91: [38], 40: [38], 39: [38], 31: [37, 38],
    35: [36], 36: [35],
    // toms: the nearest tom the kit has
    50: [48, 47, 45, 43, 41], 48: [50, 47, 45, 43, 41], 47: [48, 45, 50, 43, 41], 45: [47, 43, 48, 41, 50], 43: [41, 45, 47, 48, 50], 41: [43, 45, 47, 48, 50],
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
      return n === undefined ? null : { note: n, ch: TC.kits.channel(by.get(n)) };
    };
    let k = pick(art.id);
    if (k) return k;
    // the user's choice for an instrument the profile lacks (js/kits.js K.setSubst)
    const sub = target.subst && target.subst[art.id];
    if (sub === 0) return null;
    if (sub && (k = pick(sub))) {
      report.replaced.set(art.id, sub);
      return k;
    }
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

  /**
   * The MIDI file of a score.
   *   target          kit profile (null: General MIDI) - for every track, unless opts.targetOf says otherwise
   *   opts.tracks     the tracks to write (default: all); opts.targetOf(track): a track's own kit profile
   *   opts.multi      several tracks: one file of type 1 - a first track with tempo, time signatures and
   *                   markers, then one MIDI track per Tactus track, named like it (Cubase: one track each);
   *                   otherwise type 0, everything in one MIDI track
   *   opts.name       name of the MIDI track (type 0; default: the title of the score)
   *   opts.straight   no swing
   *   opts.pageTurns  { pageOf: [page of every bar, 0 = first], lead: bars before (default 1), ch: 0 … 15 }:
   *                   a page turning track (with opts.tracks = []): note n = page n (note 1 = page 1), as the
   *                   pages come while playing (repeats, jumps), `lead` bars before the new page begins
   *                   (TC.remote turns the page when it receives it - e.g. from a player of backing tracks)
   */
  M.build = function (doc, target, opts = {}) {
    const T = TC.timeline, R = TC.rhythm;
    const report = { replaced: new Map(), missing: new Set() };
    // (a piano: its left hand goes along with it, into the same MIDI track)
    const tracks = [].concat(...(opts.tracks || doc.tracks).filter((t) => !t.lh).map((t) => TC.score.handsOf(doc, t)));
    const targetOf = opts.targetOf || (() => target);
    const metaEv = []; // { t, order, bytes } order: 0 meta, 1 note off, 2 note on
    const starts = []; // { bar, t } of every played bar (page turns)
    const noteEv = tracks.map(() => []);
    const addTo = (list) => (t, order, bytes) => list.push({ t: Math.max(0, Math.round(t)), order, bytes });
    const add = addTo(metaEv);
    // melody tracks: their channel (own MIDI channel, else the track's) and their sound (program change at the start)
    const melodyCh = (track) => (Number.isInteger(track.midiCh) ? track.midiCh : track.channel || 0);
    const held = new Map(); // melody: the last note of each track, channel and pitch (a tied note lengthens it)
    tracks.forEach((track, ti) => {
      if (track.kind === 'pitched' && !track.lh) addTo(noteEv[ti])(0, 0, [0xc0 | melodyCh(track), track.program || 0]);
      // a melody track's volume (fader, 100 = as before): channel volume CC 7 at the start - its strengths stay
      // (a drum track's fader: its strengths, below - drum VSTs mostly ignore CC 7)
      const vol = Number.isInteger(track.volume) ? track.volume : 100;
      if (vol !== 100 && track.kind === 'pitched' && !track.lh) addTo(noteEv[ti])(0, 0, [0xb0 | melodyCh(track), 7, TC.clamp(vol, 0, 127)]);
    });
    // dynamics (ppp … fff, hairpins) of each track: the strengths of its notes (as heard)
    const dynOf = tracks.map((t) => TC.score.dynFactor(doc, t));
    // lyrics: a lyric event per syllable (karaoke: the word ends with a space); verse n on the n-th pass of a repeat
    const lyrOf = tracks.map((t) => (TC.score.lyricVerses(t) ? TC.score.lyricInfo(doc, t) : null));

    // chord symbols (opts.chords): a MIDI track of their own, a pad on channel 15
    const chordEv = [], CHORD_CH = Number.isInteger(doc.harmony && doc.harmony.midiCh) ? doc.harmony.midiCh : TC.timeline.CHORD_TRACK.channel;
    let chordNow = null;
    if (opts.chords) chordEv.push({ t: 0, order: 0, bytes: [0xc0 | CHORD_CH, TC.timeline.CHORD_TRACK.program] });
    let t0 = 0, tempo = null, ts = null, prev = -1;
    // swing / shuffle as heard (opts.straight: the notes on the grid, e.g. to swing them in the DAW)
    const sw = (k) => (opts.straight ? k : Math.round(TC.swingTick(k, doc.meta.swing || 50, doc.meta.swingUnit || 8)));
    // repeats and endings written out, bar after bar as played (model.js playOrder); a marker where a
    // repeat begins again ("Bar 5 – 2nd time"), so the bars in Cubase can be told apart
    for (const o of TC.score.playOrder(doc)) {
      const bi = o.bar;
      const h = doc.bars[bi], L = TC.barTicks(h.ts), bpm = T.tempoAt(doc, bi);
      if (o.via) add(t0, 0, meta(0x06, text(tr(o.via === 'coda' ? 'Coda – bar {n}' : o.via === 'ds' ? 'D.S. – bar {n}' : 'D.C. – bar {n}', { n: bi + 1 }))));
      else if (o.pass > 1 && bi <= prev) add(t0, 0, meta(0x06, text(tr('Bar {n} – {p}. time', { n: bi + 1, p: o.pass }))));
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
      starts.push({ bar: bi, t: t0 });

      tracks.forEach((track, ti) => { // every track on the keys of its kit profile
        const tgt = targetOf(track), put = addTo(noteEv[ti]);
        const src = TC.score.sourceBar(doc, bi, track), df = dynOf[ti];
        if (lyrOf[ti] && src === bi) {
          for (const e of track.bars[bi].voices[0] || []) {
            const list = lyrOf[ti].get(e);
            const y = list && (list.find((q) => q.v === o.pass - 1) || list.find((q) => q.v === 0));
            if (y && e.tick < L) put(t0 + sw(e.tick), 0, meta(0x05, text(y.text + (y.hyphen ? '' : ' '))));
          }
        }
        for (const voice of track.bars[src].voices) {
          const ends = track.kind === 'drums' && R ? R.ends(voice, h.ts, doc.bars[src].beam, track.fill) : null;
          for (const e of voice) {
            if (e.tick >= L) continue;
            const dur = ends && ends.has(e) ? ends.get(e) - e.tick : Math.min(e.dur, L - e.tick);
            for (const n of e.notes) {
              if (n.pitch !== undefined) {
                // melody: the note on the track's channel, as long as written (swing moves start and end)
                // a tied note is not struck again: the note before it (same pitch, ending here) gets longer
                const ch = melodyCh(track), v = Math.max(1, Math.min(127, Math.round(T.velocity(n) * df(bi, e.tick) * 127)));
                const a = t0 + sw(e.tick), end = t0 + sw(e.tick + dur), key = ti + ':' + ch + ':' + n.pitch, before = held.get(key);
                if (n.tie && before && Math.abs(before.end - a) < 1e-6) {
                  before.end = end;
                  before.off.t = Math.max(before.on + 1, Math.round(end - 10));
                  continue;
                }
                // a stroke: the strings one after the other - or, a VST with stroke keys (Iron), its key just before the chord
                const own = n.stroke && TC.ksw && TC.ksw.strums(track);
                if (own && n === e.notes[0]) {
                  const k = track.ksw.keys.find((x) => x.kind === (n.stroke === 'u' ? 'up' : 'down')), kn = k && TC.ksw.noteOf(k.note, track.ksw.c3);
                  if (kn !== null && kn !== undefined) { put(Math.max(0, a - KS_TICKS), 0, [0x90 | ch, kn, 100]); put(Math.max(0, a - KS_TICKS) + NOTE_LEN, 1, [0x80 | ch, kn, 0]); }
                }
                const sp = n.stroke && !own ? msTicks(T.strum(e, n) * 1000) : 0;
                // (a VST that plays its notes shifted - keyswitch profile, Iron: an octave up)
                const p = track.ksw && track.ksw.noteShift ? Math.max(0, Math.min(127, n.pitch + track.ksw.noteShift)) : n.pitch;
                put(a + sp, 2, [0x90 | ch, p, v]);
                const off = { t: Math.max(Math.round(a) + 1, Math.round(end - 10)), order: 1, bytes: [0x80 | ch, p, 0] };
                noteEv[ti].push(off);
                held.set(key, { on: Math.round(a), end, off });
                continue;
              }
              const art = TC.drums.byId(n.art);
              if (!art) continue;
              const k = keyFor(art, tgt, report);
              if (!k) continue;
              const hit = (t, vel) => {
                const v = Math.max(1, Math.min(127, Math.round(vel * 127)));
                put(t, 2, [0x90 | k.ch, k.note, v]);
                put(t + NOTE_LEN, 1, [0x80 | k.ch, k.note, 0]);
              };
              // (the dynamics, and the drum track's fader)
              const f = df(bi, e.tick) * (Number.isInteger(track.volume) ? track.volume / 100 : 1), at = t0 + sw(e.tick), vel = T.velocity(n) * f; // swing: an offbeat comes later
              if (n.orn === 'flam') hit(at - msTicks(30), 0.35 * f);
              if (n.orn === 'drag') {
                hit(at - msTicks(60), 0.33 * f);
                hit(at - msTicks(30), 0.38 * f);
              }
              hit(at, vel);
              if (n.trem) {
                const step = T.rollStep(dur, n.trem);
                for (let s = step, j = 1; s < dur - 1; s += step, j++) hit(t0 + sw(e.tick + s), vel * (j % 2 ? 0.7 : 0.8));
              }
            }
          }
        }
      });
      if (opts.chords && TC.pitch) {
        // chord symbols: the chord held from its place to the next one (over the bar line when it goes on), its name as text
        const list = TC.score.chordsIn(doc, bi);
        if (!list.length || list[0].t > 0) {
          const before = TC.score.chordAt(doc, bi, 0);
          if (before) list.unshift({ t: 0, ch: before.ch, carry: true });
        }
        list.forEach((x, k) => {
          const a = t0 + sw(x.t), b = t0 + (k + 1 < list.length ? sw(list[k + 1].t) : L);
          const key = TC.pitch.chordText(x.ch);
          if (chordNow && chordNow.key === key && chordNow.end === a) {
            chordNow.end = b;
            chordNow.offs.forEach((e) => { e.t = Math.round(b - 10); });
            return;
          }
          const v = TC.pitch.chordVoicing(x.ch), ch = CHORD_CH;
          chordEv.push({ t: Math.round(a), order: 0, bytes: meta(0x01, text(TC.pitch.chordName(x.ch))) });
          const offs = [v.bass].concat(v.tones).map((p) => {
            chordEv.push({ t: Math.round(a), order: 2, bytes: [0x90 | ch, p, 80] });
            const off = { t: Math.round(b - 10), order: 1, bytes: [0x80 | ch, p, 0] };
            chordEv.push(off);
            return off;
          });
          chordNow = { key, end: b, offs };
        });
      }
      t0 += L;
    }
    // keyswitches (js/keyswitch.js): a way of playing held while it holds, slides / stops at their place - a little before
    if (TC.ksw && starts.length) {
      tracks.forEach((track, ti) => {
        if (!track.ksw) return;
        const ch = melodyCh(track);
        TC.ksw.events(doc, track, starts, (o, k) => o.t + sw(k), t0, null).forEach((x) => {
          const on = Math.max(0, Math.round(x.at - KS_TICKS));
          noteEv[ti].push({ t: on, order: 0, bytes: [0x90 | ch, x.key, 100] }, { t: Math.max(on + 1, Math.round(x.at + (x.hold || NOTE_LEN) - KS_TICKS - 1)), order: 1, bytes: [0x80 | ch, x.key, 0] });
        });
      });
    }
    // page turns: a note when the played bar is on another page (the first page at the start)
    const pt = opts.pageTurns;
    if (pt && starts.length) {
      const lead = pt.lead === undefined ? 1 : Math.max(0, pt.lead | 0), ch = TC.clamp(pt.ch === undefined ? 15 : pt.ch | 0, 0, 15);
      const turn = (t, page) => {
        const n = TC.clamp(page + 1, 1, 127);
        add(t, 2, [0x90 | ch, n, 100]);
        add(t + NOTE_LEN, 1, [0x80 | ch, n, 0]);
      };
      let last = -1;
      starts.forEach((s, j) => {
        const page = pt.pageOf[s.bar] || 0;
        if (j && page === (pt.pageOf[starts[j - 1].bar] || 0)) return;
        // `lead` bars earlier, but after the turn before (a page of one bar)
        const t = j ? Math.max(last + NOTE_LEN + 1, starts[Math.max(0, j - lead)].t) : 0;
        turn(t, page);
        last = t;
      });
    }
    // one MIDI track: its events in time order, ended at the end of the last bar
    const chunk = (name, events) => {
      const ev = (name !== null ? [{ t: 0, order: -1, bytes: meta(0x03, text(name)) }] : []).concat(events);
      ev.sort((a, b) => a.t - b.t || a.order - b.order);
      const data = [];
      let last = 0;
      for (const e of ev) {
        data.push(...vlq(e.t - last), ...e.bytes);
        last = e.t;
      }
      data.push(...vlq(Math.max(0, t0 - last)), 0xff, 0x2f, 0x00);
      return [0x4d, 0x54, 0x72, 0x6b].concat(u32(data.length), data);
    };
    const multi = !!opts.multi && tracks.length > 0;
    const chordName = TC.tr ? TC.tr('Chords') : 'Chords';
    const chunks = multi
      ? [chunk(doc.meta.title || 'Tactus', metaEv)].concat(tracks.map((t, ti) => (t.lh ? null : chunk(t.name, noteEv[ti].concat(tracks[ti + 1] && tracks[ti + 1].lh ? noteEv[ti + 1] : [])))).filter(Boolean),
        opts.chords ? [chunk(chordName, chordEv)] : [])
      : [chunk(opts.name || doc.meta.title || 'Tactus', metaEv.concat(...noteEv, chordEv))];
    const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, multi ? 1 : 0, 0, chunks.length, (TC.TPQ >> 8) & 255, TC.TPQ & 255];
    const bytes = new Uint8Array(head.concat(...chunks));
    return {
      bytes,
      replaced: [...report.replaced].map(([a, b]) => ({ art: TC.drums.byId(a), by: TC.drums.byId(b) })),
      missing: [...report.missing].map((a) => TC.drums.byId(a)),
    };
  };

  /**
   * Reads a MIDI file made by M.build (for the tests): { tpq, format, notes: [ {t, note, vel, ch, track} ],
   * metas, tracks: [ {name, notes} ] } - the notes of all MIDI tracks together, and per track.
   */
  M.read = function (bytes) {
    const tpq = (bytes[12] << 8) | bytes[13], format = (bytes[8] << 8) | bytes[9];
    const notes = [], metas = [], tracks = [];
    let p = 14;
    while (p + 8 <= bytes.length) {
      const len = (bytes[p + 4] << 24) | (bytes[p + 5] << 16) | (bytes[p + 6] << 8) | bytes[p + 7];
      const end = p + 8 + len, ti = tracks.length, tk = { name: '', notes: [] };
      tracks.push(tk);
      p += 8;
      let t = 0, status = 0;
      const open = {}; // notes still sounding: channel * 128 + key -> [note]
      const vl = () => {
        let n = 0, b;
        do { b = bytes[p++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80);
        return n;
      };
      while (p < end) {
        t += vl();
        const b = bytes[p++];
        if (b === 0xff) {
          const type = bytes[p++], ml = vl();
          const data = Array.from(bytes.slice(p, p + ml));
          metas.push({ t, type, data, track: ti });
          if (type === 0x03) tk.name = decodeURIComponent(escape(String.fromCharCode(...data)));
          p += ml;
          continue;
        }
        if (b & 0x80) status = b;
        else p--;
        // program change / channel pressure carry one data byte, the other channel messages two
        const one = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0;
        const d1 = bytes[p++], d2 = one ? 0 : bytes[p++];
        if ((status & 0xf0) === 0xc0) (tk.programs || (tk.programs = [])).push({ t, ch: status & 15, program: d1 });
        if ((status & 0xf0) === 0x90 && d2 > 0) {
          const n = { t, note: d1, vel: d2, ch: status & 15, track: ti };
          notes.push(n);
          tk.notes.push(n);
          (open[(status & 15) * 128 + d1] || (open[(status & 15) * 128 + d1] = [])).push(n);
        } else if ((status & 0xf0) === 0x80 || (status & 0xf0) === 0x90) {
          const q = open[(status & 15) * 128 + d1]; // note off: the length of the note it ends
          const n = q && q.shift();
          if (n) n.dur = t - n.t;
        }
      }
      p = end;
    }
    notes.sort((a, b) => a.t - b.t);
    return { tpq, format, notes, metas, tracks };
  };
})(window.TC);
