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
  tr.bars[2].simile = true;
  tr.bars[3].simile = true;
  T.eq('simile bars play the bar before (chains too)', [SC.sourceBar(d2, 2), SC.sourceBar(d2, 3), SC.sourceBar(d2, 1)], [1, 1, 1]);
  T.eq('copying a simile bar copies what it plays', SC.copyBar(d2, 3).tracks[0].voices[0].length, 3);

  // ornaments, sticking and the new header fields survive saving and loading
  put(1, 1440, 38, { orn: 'flam', trem: 2, stick: 'L' });
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(d2)));
  const n = back.tracks[0].bars[1].voices[0].find((e) => e.tick === 1440).notes[0];
  T.eq('flam, roll, sticking are kept', [n.orn, n.trem, n.stick], ['flam', 2, 'L']);
  T.eq('simile is kept (in the track)', back.tracks[0].bars.map((b) => b.simile), [false, false, true, true]);
  T.ok('simile is not in the bar header', back.bars.every((h) => !('simile' in h)));
  const old = TC.normalizeDoc({ bars: [{}, { simile: true }], tracks: [{ kind: 'drums', bars: [{ voices: [] }, { voices: [] }] }, { kind: 'drums', bars: [] }] });
  T.eq('older files: % in the header becomes % of every track', old.tracks.map((t) => t.bars.map((b) => b.simile)), [[false, true], [false, true]]);
  // the % belongs to one track: the other track keeps its own notes
  const d4 = TC.emptyScore(2);
  d4.tracks.push(TC.newTrack('drums', 2));
  const [ta, tb] = d4.tracks;
  SC.place(d4, ta, 0, 0, 0, 960, TC.newDrumNote(38, {}));
  SC.place(d4, tb, 1, 0, 0, 960, TC.newDrumNote(49, {}));
  T.eq('% on in one track only', [SC.setSimile(d4, ta, 1, true), ta.bars[1].simile, tb.bars[1].simile, tb.bars[1].voices[0].length], [true, true, false, 1]);
  T.eq('sourceBar per track', [SC.sourceBar(d4, 1, ta), SC.sourceBar(d4, 1, tb)], [0, 1]);
  T.eq('copying: the % track gives what it plays, the other its own', SC.copyBar(d4, 1).tracks.map((b) => [b.simile, b.voices[0][0].notes[0].art]), [[false, 38], [false, 49]]);
  T.eq('% off writes the repeated notes out (new ids)', [SC.setSimile(d4, ta, 1, false), ta.bars[1].simile, ta.bars[1].voices[0][0].notes[0].art, ta.bars[1].voices[0][0].id !== ta.bars[0].voices[0][0].id], [true, false, 38, true]);
  T.eq('no % in the first bar', SC.setSimile(d4, ta, 0, true), false);
  SC.setSimile(d4, ta, 1, true);
  SC.deleteBars(d4, 0, 1);
  T.eq('deleting bar 1: the new first bar is no % any more', ta.bars[0].simile, false);
  const bad = TC.normalizeDoc({ bars: [{ ts: [7, 8], beam: [3, 3], simile: true }], tracks: [{ kind: 'drums', bars: [{ voices: [[{ tick: 0, dur: 480, notes: [{ art: 38, orn: 'x', trem: 9, stick: 'Q' }] }]] }] }] });
  T.eq('bad values are dropped', [bad.bars[0].beam, bad.tracks[0].bars[0].simile, bad.tracks[0].bars[0].voices[0][0].notes[0].orn, bad.tracks[0].bars[0].voices[0][0].notes[0].trem, bad.tracks[0].bars[0].voices[0][0].notes[0].stick],
    [null, false, null, 0, '']);

  // several bars: copy, paste (new bars at the end), duplicate
  const d3 = TC.emptyScore(3);
  TC.state.doc = d3;
  const t3 = d3.tracks[0];
  SC.setTimeSig(d3, 1, [3, 4], true);
  [[0, 36], [1, 38], [2, 42]].forEach(([bi, art]) => SC.place(d3, t3, bi, TC.drums.byId(art).voice, 0, 480, TC.newDrumNote(art, {})));
  const first = (bi) => (t3.bars[bi].voices.flat()[0] || { notes: [{}] }).notes[0].art;
  const clip3 = SC.copyBars(d3, 0, 1);
  T.eq('copy bars 1-2: two bars', clip3.bars.length, 2);
  T.eq('paste them from bar 3: bar 4 is added with the copied 3/4', [SC.pasteBars(d3, 2, clip3), d3.bars.length, first(2), first(3), d3.bars[3].ts.join('/')], [2, 4, 36, 38, '3/4']);
  T.eq('a single copyBar can be pasted too', [SC.pasteBars(d3, 0, SC.copyBar(d3, 1)), first(0)], [1, 38]);
  T.eq('duplicate bars 2-3: copies right after, time signatures kept', [SC.duplicateBars(d3, 1, 2), d3.bars.length, first(3), first(4), d3.bars[3].ts.join('/')], [2, 6, 38, 36, '3/4']);
};
