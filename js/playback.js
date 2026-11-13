'use strict';
/*
 * Timeline for playback: which drum hits happen at which second. Pure (no sound, no DOM),
 * so it can be tested; audio.js turns it into sound.
 *
 *   TC.timeline.build(doc, { from, to, metronome, countIn }) ->
 *     { hits:  [ { t, art, vel, choke, click } ],   t in seconds from the start, sorted
 *       bars:  [ { bar, t0, t1, spt, ts } ],         bar -1 = count-in; spt = seconds per tick
 *       start, end }                                  where the music starts (after the count-in) and ends
 *
 * How notes sound:
 *   velocity   five steps (TC.STRENGTHS): ghost 0.22 · soft / strong note.vel · normal 0.72 · accent 1.15
 *   flam       one soft grace stroke 30 ms before · drag: two, 60 / 30 ms before
 *   roll       strokes fill the note: 1 stroke = eighths on a quarter, each further stroke halves
 *              (stroke count + flags of the note), 3 strokes are a closed (buzz) roll
 *   %-bar      plays the bar it repeats
 *   tempo      score tempo; a bar with its own tempo changes it from there on
 */
(function (TC) {
  const T = (TC.timeline = {});
  const PLAIN = [3840, 1920, 960, 480, 240, 120, 60];
  T.LEAD = 0.1;

  /** Tempo (quarters per minute) that applies in bar bi. */
  T.tempoAt = function (doc, bi) {
    let tempo = doc.meta.tempo || 120;
    for (let i = 0; i <= bi && i < doc.bars.length; i++) if (doc.bars[i].tempo) tempo = doc.bars[i].tempo;
    return tempo;
  };

  T.velocity = function (n) {
    if (n.ghost) return 0.22;
    if (n.accent) return 1.15; // a little louder than the loudest plain note (MIDI: 127)
    if (typeof n.vel === 'number') return n.vel / 127; // soft / strong (TC.STRENGTHS)
    return 0.72;
  };

  /** Ticks between two roll strokes of an event of `dur` ticks with `trem` strokes. */
  T.rollStep = function (dur, trem) {
    const base = PLAIN.find((v) => v <= dur) || 60;
    const flags = TC.rhythm ? TC.rhythm.flags(base) : 0;
    return Math.max(60, 3840 / Math.pow(2, 2 + flags + trem));
  };

  /** Ticks where the metronome clicks in a bar (beats; odd meters: beam groups), first = accent. */
  T.clickTicks = function (h) {
    const G = TC.rhythm && TC.rhythm.groupSpans(h.ts, h.beam);
    if (G && !TC.isCompound(h.ts)) return G.map((g) => g[0]);
    const beat = TC.rhythm ? TC.rhythm.beatTicks(h.ts) : 960;
    const out = [];
    for (let t = 0; t < TC.barTicks(h.ts); t += beat) out.push(t);
    return out;
  };

  T.build = function (doc, opts = {}) {
    const from = TC.clamp(opts.from || 0, 0, doc.bars.length - 1);
    const to = TC.clamp(opts.to === undefined ? doc.bars.length - 1 : opts.to, from, doc.bars.length - 1);
    const track = doc.tracks[0];
    const hits = [], bars = [];
    let t = T.LEAD; // a moment of silence, so grace notes before the first beat fit
    const tick = (h, tempo) => 60 / (tempo * TC.TPQ);

    if (opts.countIn) {
      const h = doc.bars[from], spt = tick(h, T.tempoAt(doc, from)), L = TC.barTicks(h.ts);
      T.clickTicks(h).forEach((k, i) => hits.push({ t: t + k * spt, click: i === 0 ? 2 : 1, vel: 1 }));
      bars.push({ bar: -1, t0: t, t1: t + L * spt, spt, ts: h.ts });
      t += L * spt;
    }
    const start = t;
    const sw = doc.meta.swing || 50, su = doc.meta.swingUnit || 8, st = (k) => TC.swingTick(k, sw, su); // swing / shuffle
    // repeats and endings written out (model.js playOrder): the same order as the MIDI export
    for (const o of TC.score.playBars(doc, from, to)) {
      const bi = o.bar;
      const h = doc.bars[bi], spt = tick(h, T.tempoAt(doc, bi)), L = TC.barTicks(h.ts);
      const src = TC.score.sourceBar(doc, bi);
      for (const voice of track.bars[src].voices) {
        // a roll fills the note as it is shown (rest cleanup, rhythm.js R.ends)
        const ends = track.kind === 'drums' && TC.rhythm ? TC.rhythm.ends(voice, h.ts, doc.bars[src].beam, track.fill) : null;
        for (const ev of voice) {
          if (ev.tick >= L) continue;
          const t0 = t + st(ev.tick) * spt; // swing: an offbeat comes later
          const dur = ends && ends.has(ev) ? ends.get(ev) - ev.tick : Math.min(ev.dur, L - ev.tick);
          for (const n of ev.notes) {
            const art = TC.drums.byId(n.art);
            if (!art) continue;
            const vel = T.velocity(n), choke = art.tech === 'choke';
            if (n.orn === 'flam') hits.push({ t: t0 - 0.03, art: n.art, vel: 0.35 });
            if (n.orn === 'drag') {
              hits.push({ t: t0 - 0.06, art: n.art, vel: 0.33 });
              hits.push({ t: t0 - 0.03, art: n.art, vel: 0.38 });
            }
            hits.push({ t: t0, art: n.art, vel, choke, accent: n.accent || 0 });
            if (n.trem) {
              const step = T.rollStep(dur, n.trem);
              for (let k = step, j = 1; k < dur - 1; k += step, j++) {
                hits.push({ t: t + st(ev.tick + k) * spt, art: n.art, vel: vel * (j % 2 ? 0.7 : 0.8), choke, roll: true });
              }
            }
          }
        }
      }
      if (opts.metronome) T.clickTicks(h).forEach((k, i) => hits.push({ t: t + k * spt, click: i === 0 ? 2 : 1, vel: 0.8 }));
      bars.push({ bar: bi, pass: o.pass, n: o.n, t0: t, t1: t + L * spt, spt, ts: h.ts });
      t += L * spt;
    }
    hits.forEach((x) => { x.t = Math.max(0, x.t); });
    hits.sort((a, b) => a.t - b.t);
    return { hits, bars, start, end: t };
  };

  /**
   * Where the music is at time `sec` of a timeline: { bar, tick, pass, n } (null after the end);
   * pass: time through a repeat, n: played bar number (as counted in Cubase).
   */
  T.position = function (tl, sec) {
    const b = tl.bars.find((x) => sec >= x.t0 && sec < x.t1);
    if (!b) return null;
    const pos = { bar: b.bar, tick: (sec - b.t0) / b.spt };
    if (b.n) Object.assign(pos, { pass: b.pass, n: b.n });
    return pos;
  };
})(window.TC);
