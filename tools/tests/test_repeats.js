'use strict';
// Repeats and endings: the play order (model.js), playback timeline and MIDI export follow it, writing them out.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js']);
  const SC = TC.score;
  const score = (n, set) => {
    const doc = TC.emptyScore(n);
    TC.state.doc = doc;
    set(doc.bars);
    return doc;
  };
  const order = (doc) => SC.playOrder(doc).map((o) => o.bar + 1 + (o.pass > 1 ? "'".repeat(o.pass - 1) : '')).join(' ');

  T.eq('no repeats: bar after bar', order(score(4, () => {})), '1 2 3 4');
  T.eq('|: 2 3 :| twice', order(score(5, (b) => { b[1].repeatStart = true; b[2].repeatEnd = 2; })), "1 2 3 2' 3' 4 5");
  T.eq('three times', order(score(3, (b) => { b[0].repeatStart = true; b[1].repeatEnd = 3; })), "1 2 1' 2' 1'' 2'' 3");
  T.eq('end without start: back to bar 1', order(score(3, (b) => { b[1].repeatEnd = 2; })), "1 2 1' 2' 3");
  T.eq('second repeat without start: back to after the first one',
    order(score(5, (b) => { b[1].repeatEnd = 2; b[3].repeatEnd = 2; })), "1 2 1' 2' 3 4 3' 4' 5");
  T.eq('1st / 2nd ending', order(score(6, (b) => {
    b[1].repeatStart = true; b[3].volta = [1]; b[3].repeatEnd = 2; b[4].volta = [2];
  })), "1 2 3 4 2' 3' 5' 6");
  T.eq('two-bar first ending', order(score(7, (b) => {
    b[0].repeatStart = true; b[2].volta = [1]; b[3].volta = [1]; b[3].repeatEnd = 2; b[4].volta = [2];
  })), "1 2 3 4 1' 2' 5' 6 7");
  T.eq('endings 1.+2. and 3. (three times)', order(score(5, (b) => {
    b[0].repeatStart = true; b[2].volta = [1, 2]; b[2].repeatEnd = 3; b[3].volta = [3];
  })), "1 2 3 1' 2' 3' 1'' 2'' 4'' 5");
  T.eq('a new section after the endings starts from pass 1 again', order(score(8, (b) => {
    b[0].repeatStart = true; b[1].volta = [1]; b[1].repeatEnd = 2; b[2].volta = [2];
    b[3].repeatStart = true; b[4].volta = [1]; b[4].repeatEnd = 2; b[5].volta = [2];
  })), "1 2 1' 3' 4 5 4' 6' 7 8");
  T.eq('played bar numbers count on', SC.playOrder(score(3, (b) => { b[1].repeatEnd = 2; })).map((o) => o.n), [1, 2, 3, 4, 5]);

  // part of the score (a selection): from its first time, bars before it left out, ends after it
  const d = score(6, (b) => { b[1].repeatStart = true; b[3].repeatEnd = 2; });
  const part = (a, z) => SC.playBars(d, a, z).map((o) => o.bar + 1).join(' ');
  T.eq('selection around the repeat: written out', part(1, 3), '2 3 4 2 3 4');
  T.eq('selection starting in the repeat: the second time too, without bar 2', part(2, 5), '3 4 3 4 5 6');
  T.eq('selection inside the repeat: once', part(2, 2), '3');

  // timeline (playback) and MIDI export: as often as played
  const m = score(3, (b) => { b[0].repeatStart = true; b[1].repeatEnd = 2; });
  const tr0 = m.tracks[0];
  [0, 1, 2].forEach((bi) => SC.place(m, tr0, bi, 0, 0, 960, TC.newDrumNote(38, {})));
  m.bars[0].marker = 'Verse';
  const tl = TC.timeline.build(m, {});
  T.eq('playback: 5 bars played, 5 snares', [tl.bars.map((b) => b.bar + 1).join(' '), tl.hits.length], ['1 2 1 2 3', 5]);
  T.eq('playback: position knows the pass and the played bar', (({ bar, pass, n }) => [bar, pass, n])(TC.timeline.position(tl, tl.bars[2].t0 + 0.1)), [0, 2, 3]);
  const midi = TC.midi.read(TC.midi.build(m, null).bytes);
  T.eq('MIDI: 5 bars of notes (1 2 1 2 3)', midi.notes.map((n) => n.t / 3840), [0, 1, 2, 3, 4]);
  const markers = midi.metas.filter((x) => x.type === 6).map((x) => [x.t / 3840, decodeURIComponent(escape(String.fromCharCode(...x.data)))]);
  T.eq('MIDI: bar text each time, a marker where the repeat starts again', markers, [[0, 'Verse'], [2, 'Bar 1 – 2. time'], [2, 'Verse']]);
  const end = midi.metas.find((x) => x.type === 0x2f);
  T.eq('MIDI: the file ends after 5 bars', end.t, 5 * 3840);

  // write the repeats out in the score: bar numbers as in Cubase
  const u = score(4, (b) => { b[1].repeatStart = true; b[2].volta = [1]; b[2].repeatEnd = 2; b[3].volta = [2]; });
  SC.place(u, u.tracks[0], 1, 0, 0, 960, TC.newDrumNote(36, {}));
  T.eq('unfold: 5 bars, no repeat marks left', [SC.unfold(u), SC.hasRepeats(u)], [5, false]);
  T.eq('unfold: the repeated bar has its notes twice (new ids)', [u.tracks[0].bars[1].voices[0].length, u.tracks[0].bars[3].voices[0].length,
    u.tracks[0].bars[1].voices[0][0].notes[0].id !== u.tracks[0].bars[3].voices[0][0].notes[0].id], [1, 1, true]);

  // saved and loaded
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(score(3, (b) => { b[1].repeatStart = true; b[1].volta = [2, 1, 1, 9]; b[2].repeatEnd = 1; }))));
  T.eq('loading: endings sorted, bad ones dropped, "1 time" is no repeat', [back.bars[1].volta, back.bars[2].repeatEnd, back.bars[1].repeatStart], [[1, 2], 0, true]);

  // D.C. / D.S. / Fine / Coda
  T.eq('D.C.: back to the start once', order(score(3, (b) => { b[2].jump = 'dc'; })), '1 2 3 1 2 3');
  T.eq('D.C. al Fine', order(score(4, (b) => { b[1].end = 'fine'; b[3].jump = 'dcFine'; })), '1 2 3 4 1 2');
  T.eq('D.S. al Coda (the example of the help)', order(score(10, (b) => {
    b[2].mark = 'segno'; b[5].end = 'toCoda'; b[7].jump = 'dsCoda'; b[8].mark = 'coda';
  })), '1 2 3 4 5 6 7 8 3 4 5 6 9 10');
  T.eq('D.S. al Fine with a repeat and endings: after the jump once, last ending', order(score(6, (b) => {
    b[1].mark = 'segno'; b[2].repeatStart = true; b[3].volta = [1]; b[3].repeatEnd = 2; b[4].volta = [2]; b[4].end = 'fine'; b[5].jump = 'dsFine';
  })), "1 2 3 4 3' 5' 6 2 3 5");
  T.eq('… with "play the repeats after the jump"', order(score(6, (b) => {
    b[1].mark = 'segno'; b[2].repeatStart = true; b[3].volta = [1]; b[3].repeatEnd = 2; b[4].volta = [2]; b[4].end = 'fine'; b[5].jump = 'dsFine'; b[5].jumpRep = true;
  })), "1 2 3 4 3' 5' 6 2 3 4 3' 5'");
  T.eq('a jump at the end of a repeat: after the last time through', order(score(3, (b) => { b[0].repeatStart = true; b[1].repeatEnd = 2; b[1].jump = 'dc'; })),
    "1 2 1' 2' 1 2 3");
  T.eq('D.S. without a segno: from the start; al Coda without coda: ends at To Coda', order(score(4, (b) => { b[1].end = 'toCoda'; b[3].jump = 'dsCoda'; })),
    '1 2 3 4 1 2');
  const jd = score(10, (b) => { b[2].mark = 'segno'; b[5].end = 'toCoda'; b[7].jump = 'dsCoda'; b[8].mark = 'coda'; });
  T.eq('the bar after a jump knows it (markers)', SC.playOrder(jd).filter((o) => o.via).map((o) => [o.bar + 1, o.via]), [[3, 'ds'], [9, 'coda']]);
  T.eq('problems: none', SC.jumpProblems(jd), []);
  const jp = score(3, (b) => { b[2].jump = 'dsCoda'; });
  T.eq('problems: no segno, no To Coda, no coda', SC.jumpProblems(jp).map((p) => p.problem), ['noSegno', 'noToCoda', 'noCoda']);
  const jm = TC.midi.read(TC.midi.build(jd, null).bytes).metas.filter((x) => x.type === 6).map((x) => [x.t / 3840, decodeURIComponent(escape(String.fromCharCode(...x.data)))]);
  T.eq('MIDI: markers at the jumps', jm, [[8, 'D.S. – bar 3'], [12, 'Coda – bar 9']]);
  const jl = TC.normalizeDoc(JSON.parse(JSON.stringify(score(3, (b) => { b[0].mark = 'segno'; b[1].end = 'toCoda'; b[2].jump = 'dsCoda'; b[2].jumpRep = true; b[1].mark = 'x'; }))));
  T.eq('loading: signs and jumps kept, bad ones dropped', jl.bars.map((h) => [h.mark, h.end, h.jump, h.jumpRep]),
    [['segno', '', '', false], ['', 'toCoda', '', false], ['', '', 'dsCoda', true]]);
  T.eq('unfold: jumps written out too', [SC.unfold(jd), SC.hasRepeats(jd)], [14, false]);
};
