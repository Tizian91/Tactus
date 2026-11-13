'use strict';
// Share links (js/share.js): the compact JSON leaves out ids, view and defaults - loading it gives the same score.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'share.js']);
  const SC = TC.score;
  const doc = TC.emptyScore(3);
  TC.state.doc = doc;
  doc.meta.title = 'Groove';
  doc.meta.swing = 67;
  doc.bars[1].repeatStart = true;
  doc.bars[2].repeatEnd = 2;
  doc.bars[2].tempo = 140;
  const tr = doc.tracks[0];
  SC.place(doc, tr, 0, 0, 0, 480, Object.assign(TC.newDrumNote(38, {}), { accent: 1, orn: 'flam', stick: 'R' }));
  SC.place(doc, tr, 0, 1, 0, 960, TC.newDrumNote(36, {}));
  SC.place(doc, tr, 2, 0, 480, 240, Object.assign(TC.newDrumNote(42, {}), { ghost: true, trem: 2 }));

  const text = TC.share.pack(doc);
  T.ok('compact: no ids, no view, no default values', !/"id"|"view"|"ghost":false|"simile":false|"subtitle"/.test(text));
  T.ok('… much shorter than the saved file', text.length < JSON.stringify(doc).length * 0.5);
  const back = TC.normalizeDoc(JSON.parse(text));
  const notes = (d) => {
    const out = [];
    SC.eachNote(d, (n, ev, vi, bi) => out.push([bi, vi, ev.tick, ev.dur, n.art, n.accent, n.ghost, n.orn, n.trem, n.stick].join(':')));
    return out;
  };
  T.eq('loaded again: the same notes', notes(back), notes(doc));
  T.eq('… bars, repeats, tempo and score data', [back.bars.length, back.bars[1].repeatStart, back.bars[2].repeatEnd, back.bars[2].tempo, back.meta.title, back.meta.swing],
    [3, true, 2, 140, 'Groove', 67]);
  T.eq('link address offline: the online version', TC.share.base(), 'https://tizian91.github.io/Tactus/');
};
