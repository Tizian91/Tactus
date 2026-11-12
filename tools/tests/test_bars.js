'use strict';
// Beam groups in odd meters, copy / paste / duplicate bars, simile bars, ornaments in files.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js']);
  const R = TC.rhythm, SC = TC.score;
  const ev = (tick, dur) => ({ tick, dur, notes: [{ art: 38 }] });
  const show = (items) => items.map((it) => it.measure ? 'M' :
    (it.kind === 'note' ? 'n' : 'r') + it.tick + ':' + it.base + (it.dots ? '.' : '') + (it.tup ? 't' : ''));
  const beams = (evs, ts, beam) => R.beams(R.layout(evs, ts, true, beam), ts, beam).map((g) => g.map((it) => it.tick));
  const eighths = (n) => Array.from({ length: n }, (_, k) => ev(k * 480, 480));

  // default groups
  T.eq('beam groups 7/8, 5/8, 4/8, 6/8, 4/4, 7/16', [[7, 8], [5, 8], [4, 8], [6, 8], [4, 4], [7, 16]].map((ts) => TC.beamGroups(ts, null)),
    [[2, 2, 3], [3, 2], [2, 2], [3, 3], null, [2, 2, 3]]);
  T.eq('own groups win if they add up', [TC.beamGroups([7, 8], [3, 2, 2]), TC.beamGroups([7, 8], [3, 3])], [[3, 2, 2], [2, 2, 3]]);
  T.eq('choices for 7/8: default first', TC.beamChoices([7, 8]).map((g) => g.join('+')), ['2+2+3', '2+3+2', '3+2+2']);
  T.eq('no choices for 4/4', TC.beamChoices([4, 4]), []);

  // beams and rests follow the groups
  T.eq('7/8 eighths: 2+2+3', beams(eighths(7), [7, 8]), [[0, 480], [960, 1440], [1920, 2400, 2880]]);
  T.eq('7/8 eighths: 3+2+2', beams(eighths(7), [7, 8], [3, 2, 2]), [[0, 480, 960], [1440, 1920], [2400, 2880]]);
  T.eq('5/8 eighths: 3+2', beams(eighths(5), [5, 8]), [[0, 480, 960], [1440, 1920]]);
  T.eq('7/8 one eighth: rests fill the groups', show(R.layout([ev(0, 480)], [7, 8])), ['n0:480', 'r480:480', 'r960:960', 'r1920:960.']);
  T.eq('7/8 as 3+2+2: dotted quarter rest first', show(R.layout([ev(2880, 480)], [7, 8], true, [3, 2, 2])), ['r0:960.', 'r1440:960', 'r2400:480', 'n2880:480']);
  T.eq('4/4 is unchanged', beams(eighths(8), [4, 4]), [[0, 480], [960, 1440], [1920, 2400], [2880, 3360]]);

  // setBeam: from here to the next change
  const doc = TC.emptyScore(4);
  TC.state.doc = doc;
  SC.setTimeSig(doc, 0, [7, 8]);
  SC.setBeam(doc, 1, [3, 2, 2]);
  T.eq('groups from bar 2 on', doc.bars.map((h) => h.beam && h.beam.join('+')), [null, '3+2+2', '3+2+2', '3+2+2']);
  T.eq('wrong sum is refused', SC.setBeam(doc, 0, [3, 3]), false);
  SC.setTimeSig(doc, 2, [5, 8]);
  T.eq('new time signature: default groups again', doc.bars.map((h) => h.beam && h.beam.join('+')), [null, '3+2+2', null, null]);

  // copy / paste / duplicate / simile
  const d2 = TC.emptyScore(3);
  TC.state.doc = d2;
  const tr = d2.tracks[0];
  const put = (bar, tick, art, extra) => SC.place(d2, tr, bar, TC.drums.byId(art).voice, tick, 480, Object.assign(TC.newDrumNote(art, {}), extra || {}));
  [0, 480, 960].forEach((t) => put(0, t, 42));
  put(0, 0, 36);
  const clip = SC.copyBar(d2, 0);
  SC.pasteBar(d2, 2, clip);
  const arts = (bi) => tr.bars[bi].voices.map((v) => v.map((e) => e.tick + ':' + e.notes.map((n) => n.art).join('+')).join(' '));
  T.eq('paste: same notes in bar 3', arts(2), arts(0));
  T.ok('paste: new ids', tr.bars[2].voices[0][0].notes[0].id !== tr.bars[0].voices[0][0].notes[0].id);
  SC.duplicateBar(d2, 0);
  T.eq('duplicate: 4 bars, bar 2 is the copy', [d2.bars.length, arts(1)], [4, arts(0)]);
  d2.bars[2].simile = true;
  d2.bars[3].simile = true;
  T.eq('simile bars play the bar before (chains too)', [SC.sourceBar(d2, 2), SC.sourceBar(d2, 3), SC.sourceBar(d2, 1)], [1, 1, 1]);
  T.eq('copying a simile bar copies what it plays', SC.copyBar(d2, 3).tracks[0].voices[0].length, 3);

  // ornaments, sticking and the new header fields survive saving and loading
  put(1, 1440, 38, { orn: 'flam', trem: 2, stick: 'L' });
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(d2)));
  const n = back.tracks[0].bars[1].voices[0].find((e) => e.tick === 1440).notes[0];
  T.eq('flam, roll, sticking are kept', [n.orn, n.trem, n.stick], ['flam', 2, 'L']);
  T.eq('simile is kept', back.bars.map((h) => h.simile), [false, false, true, true]);
  const bad = TC.normalizeDoc({ bars: [{ ts: [7, 8], beam: [3, 3], simile: true }], tracks: [{ kind: 'drums', bars: [{ voices: [[{ tick: 0, dur: 480, notes: [{ art: 38, orn: 'x', trem: 9, stick: 'Q' }] }]] }] }] });
  T.eq('bad values are dropped', [bad.bars[0].beam, bad.bars[0].simile, bad.tracks[0].bars[0].voices[0][0].notes[0].orn, bad.tracks[0].bars[0].voices[0][0].notes[0].trem, bad.tracks[0].bars[0].voices[0][0].notes[0].stick],
    [null, false, null, 0, '']);
};
