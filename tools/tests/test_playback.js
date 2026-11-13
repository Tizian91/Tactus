'use strict';
// Playback timeline (js/playback.js): times, velocities, flam / drag / roll, metronome, count-in, %-bars, tempo.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js']);
  const TL = TC.timeline, SC = TC.score, LEAD = TL.LEAD;
  const doc = TC.emptyScore(3);
  doc.meta.tempo = 120; // a quarter = 0.5 s
  TC.state.doc = doc;
  const tr = doc.tracks[0];
  const put = (bar, tick, dur, art, extra) => SC.place(doc, tr, bar, TC.drums.byId(art).voice, tick, dur, Object.assign(TC.newDrumNote(art, {}), extra || {}));
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const hits = (tl) => tl.hits.map((h) => [r3(h.t - LEAD), h.click ? 'click' + h.click : h.art, r3(h.vel)]);

  put(0, 0, 960, 36);
  put(0, 960, 960, 38, { accent: 1 });
  put(0, 1920, 960, 38, { ghost: true });
  let tl = TL.build(doc, { from: 0, to: 0 });
  T.eq('kick, accented snare, ghost snare at 120 bpm', hits(tl), [[0, 36, 0.72], [0.5, 38, 1], [1, 38, 0.3]]);
  T.eq('bar 1 lasts 2 s', [r3(tl.bars[0].t0 - LEAD), r3(tl.bars[0].t1 - LEAD), r3(tl.end - LEAD)], [0, 2, 2]);

  T.eq('metronome: 4 clicks, the first one strong', hits(TL.build(doc, { from: 1, to: 1, metronome: true })),
    [[0, 'click2', 0.8], [0.5, 'click1', 0.8], [1, 'click1', 0.8], [1.5, 'click1', 0.8]]);
  tl = TL.build(doc, { from: 0, to: 0, countIn: true });
  T.eq('count-in: one bar of clicks, then the music', [tl.hits.filter((h) => h.click).length, r3(tl.start - LEAD), r3(tl.hits.find((h) => !h.click).t - LEAD)], [4, 2, 2]);
  T.eq('position: bar and tick at a time', [TL.position(tl, LEAD + 1), TL.position(tl, LEAD + 2.25)], [{ bar: -1, tick: 1920 }, { bar: 0, tick: 480, pass: 1, n: 1 }]);

  // grace notes and rolls
  put(1, 0, 960, 38, { orn: 'flam' });
  put(1, 960, 960, 38, { orn: 'drag' });
  put(1, 1920, 960, 38, { trem: 1 });
  put(1, 2880, 960, 38, { trem: 2 });
  tl = TL.build(doc, { from: 1, to: 1 });
  T.eq('flam: soft stroke 30 ms before', hits(tl).slice(0, 2), [[-0.03, 38, 0.35], [0, 38, 0.72]]);
  T.eq('drag: two strokes before', hits(tl).slice(2, 5).map((h) => h[0]), [0.44, 0.47, 0.5]);
  T.eq('roll with 1 stroke on a quarter: eighths', hits(tl).filter((h) => h[0] >= 1 && h[0] < 1.5).map((h) => h[0]), [1, 1.25]);
  T.eq('roll with 2 strokes: sixteenths', hits(tl).filter((h) => h[0] >= 1.5).map((h) => h[0]), [1.5, 1.625, 1.75, 1.875]);
  T.eq('roll step: eighth note + 3 strokes = 64ths', TL.rollStep(480, 3), 60);

  // %-bar plays the bar before; a bar tempo changes the tempo from there
  doc.bars[2].simile = true;
  tl = TL.build(doc, { from: 1, to: 2 });
  const cut = LEAD + 2 - 0.1; // the flam of bar 3 sounds 30 ms before its bar line
  T.eq('%-bar repeats bar 2', tl.hits.filter((h) => h.t >= cut).length, tl.hits.filter((h) => h.t < cut).length);
  doc.bars[2].tempo = 60;
  tl = TL.build(doc, { from: 2, to: 2 });
  T.eq('tempo 60 from bar 3: the bar lasts 4 s', r3(tl.end - LEAD), 4);
  T.eq('tempo before bar 3 still 120', TL.tempoAt(doc, 1), 120);

  // odd meters: clicks on the beam groups
  SC.setTimeSig(doc, 0, [7, 8], true);
  T.eq('7/8 clicks at 2+2+3', TL.clickTicks(doc.bars[0]), [0, 960, 1920]);
  T.eq('6/8 clicks on dotted quarters', TL.clickTicks({ ts: [6, 8], beam: null }), [0, 1440]);
  T.eq('choke cymbal is marked short', (put(0, 0, 480, 97), TL.build(doc, { from: 0, to: 0 }).hits.find((h) => h.art === 97).choke), true);
};
