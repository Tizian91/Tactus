'use strict';
// Swing / shuffle (model.js TC.swingTick): where notes sound; playback and MIDI export follow it.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js']);
  const sw = TC.swingTick;
  T.eq('straight (50 %): nothing moves', [480, 240].map((t) => sw(t, 50, 8)), [480, 240]);
  T.eq('shuffle 2:1 (eighths): the offbeat moves to the third triplet', [sw(0, 67, 8), Math.round(sw(480, 67, 8)), sw(960, 67, 8), Math.round(sw(1440, 67, 8))], [0, 643, 960, 1603]);
  T.eq('sixteenths in between stretch along', [Math.round(sw(240, 67, 8)), Math.round(sw(720, 67, 8))], [322, 802]);
  T.eq('16th swing: the second sixteenth of each pair later', [Math.round(sw(240, 67, 16)), sw(480, 67, 16), Math.round(sw(720, 67, 16))], [322, 480, 802]);
  T.eq('triplets stay where they are', [sw(320, 67, 8), sw(640, 67, 8)], [320, 640]);

  const doc = TC.emptyScore(1);
  TC.state.doc = doc;
  doc.meta.tempo = 120;
  [0, 480, 960, 1440].forEach((t) => TC.score.place(doc, doc.tracks[0], 0, 0, t, 480, TC.newDrumNote(42, {})));
  doc.meta.swing = 67;
  const tl = TC.timeline.build(doc, {});
  T.eq('playback: offbeats later (120 bpm, 2:1)', tl.hits.map((h) => Math.round((h.t - TC.timeline.LEAD) * 1000)), [0, 335, 500, 835]);
  const ticks = (opts) => TC.midi.read(TC.midi.build(doc, null, opts).bytes).notes.map((n) => n.t);
  T.eq('MIDI export: swung as heard', ticks(), [0, 643, 960, 1603]);
  T.eq('MIDI export straight (to swing in the DAW)', ticks({ straight: true }), [0, 480, 960, 1440]);
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(Object.assign({}, doc, { meta: Object.assign({}, doc.meta, { swing: '67', swingUnit: 16 }) }))));
  T.eq('saved and loaded: numbers', [back.meta.swing, back.meta.swingUnit, TC.normalizeDoc({ bars: [{}], meta: { swing: 999 } }).meta.swing], [67, 16, 80]);
};
