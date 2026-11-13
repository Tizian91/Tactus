'use strict';
// Stems (drummap.js setStems, model.js revoice): all up / feet down / feet + low toms down.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js']);
  const SC = TC.score, D = TC.drums;
  const doc = TC.emptyScore(1);
  TC.state.doc = doc;
  const tr = doc.tracks[0];
  const put = (tick, dur, art) => SC.place(doc, tr, 0, D.byId(art).voice, tick, dur, TC.newDrumNote(art, {}));
  const voices = () => tr.bars[0].voices.map((v) => v.map((e) => e.tick + ':' + e.dur + ':' + e.notes.map((n) => n.art).join('+')).join(' '));

  D.setStems('feet');
  [0, 480, 960, 1440].forEach((t) => put(t, 480, 42)); // hi-hat eighths
  put(0, 960, 36); // kick quarter
  put(960, 960, 43); // floor tom
  T.eq('feet down: kick below, floor tom with the hands', voices(), ['0:480:42 480:480:42 960:480:42+43 1440:480:42', '0:960:36']);

  D.setStems('low');
  T.eq('low: the floor tom goes to the lower voice', [SC.revoice(doc), voices()], [true, ['0:480:42 480:480:42 960:480:42 1440:480:42', '0:960:36 960:480:43']]);
  T.eq('nothing to move: false', SC.revoice(doc), false);

  D.setStems('up');
  SC.revoice(doc);
  T.eq('all up: one voice, kick joins the hi-hat chord (shorter length)', voices(), ['0:480:42+36 480:480:42 960:480:42+43 1440:480:42', '']);
  const ids = new Set();
  SC.eachNote(doc, (n) => ids.add(n.id));
  T.eq('notes keep their ids (selection survives)', ids.size, 6);

  D.setStems('low', [43, 41, 45]);
  SC.revoice(doc);
  T.eq('chosen low toms: tom 4 joins too', [D.voiceOf(45), D.voiceOf(47), D.voiceOf(36), D.voiceOf(44)], [1, 0, 1, 1]);
  T.eq('back to two voices', voices()[1].startsWith('0:'), true);
  D.setStems('feet');
  SC.revoice(doc);
  T.eq('feet again: same as at first (lengths cut in the chord stay cut)', voices()[0], '0:480:42 480:480:42 960:480:42+43 1440:480:42');
};
