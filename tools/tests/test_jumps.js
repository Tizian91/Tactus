'use strict';
// Signs and jumps as in Guitar Pro: Segno Segno, Double Coda, D.S.S., "al Double Coda" (play order, what is
// missing), their MusicXML, and the export for Guitar Pro (repeats and jumps written out, tempo kept).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'musicxml.js']);
  const SC = TC.score, X = TC.musicxml;
  const order = (doc) => SC.playOrder(doc).map((o) => o.bar + 1).join(' ');
  const score = (n, set) => {
    const doc = TC.emptyScore(n);
    set(doc.bars);
    return doc;
  };

  T.eq('jump info', ['dc', 'dsFine', 'dssCoda', 'dcDoubleCoda', 'dssDoubleCoda'].map((j) => { const i = TC.jumpInfo(j); return i.to + '/' + i.al; }),
    ['start/null', 'segno/fine', 'segnoSegno/coda', 'start/doubleCoda', 'segnoSegno/doubleCoda']);
  // D.S. al Coda as before
  T.eq('D.S. al Coda (as before)', order(score(10, (b) => { b[2].mark = 'segno'; b[4].end = 'toCoda'; b[7].jump = 'dsCoda'; b[8].mark = 'coda'; })),
    '1 2 3 4 5 6 7 8 3 4 5 9 10');
  // Segno and Segno Segno: D.S. back to 𝄋, later D.S.S. back to 𝄋𝄋
  T.eq('D.S. to 𝄋, later D.S.S. to 𝄋𝄋', order(score(8, (b) => { b[1].mark = 'segno'; b[3].mark = 'segnoSegno'; b[4].jump = 'ds'; b[6].jump = 'dss'; })),
    '1 2 3 4 5 2 3 4 5 6 7 4 5 6 7 8');
  // al Double Coda: To Coda ⊕⊕ goes on to the double coda; a plain To Coda is passed
  T.eq('D.S.S. al Double Coda: To Coda ⊕⊕ on to ⊕⊕, To Coda ⊕ is passed', order(score(10, (b) => {
    b[1].mark = 'segnoSegno'; b[2].end = 'toCoda'; b[3].end = 'toDoubleCoda'; b[5].jump = 'dssDoubleCoda'; b[6].mark = 'coda'; b[8].mark = 'doubleCoda';
  })), '1 2 3 4 5 6 2 3 4 9 10');
  T.eq('D.C. al Coda goes to ⊕, not to ⊕⊕', order(score(8, (b) => { b[1].end = 'toCoda'; b[3].jump = 'dcCoda'; b[5].mark = 'doubleCoda'; b[6].mark = 'coda'; })),
    '1 2 3 4 1 2 7 8');
  // what is missing
  const miss = (set) => SC.jumpProblems(score(6, set)).map((p) => p.problem).sort();
  T.eq('missing: 𝄋𝄋, To Coda ⊕⊕, ⊕⊕', miss((b) => { b[4].jump = 'dssDoubleCoda'; }), ['noDoubleCoda', 'noSegnoSegno', 'noToDoubleCoda']);
  T.eq('nothing missing', miss((b) => { b[1].mark = 'segnoSegno'; b[2].end = 'toDoubleCoda'; b[3].mark = 'doubleCoda'; b[4].jump = 'dssDoubleCoda'; }), []);
  T.eq('saved and loaded: the new signs and jumps', (() => {
    const d = TC.normalizeDoc(JSON.parse(JSON.stringify(score(4, (b) => { b[0].mark = 'segnoSegno'; b[1].end = 'toDoubleCoda'; b[2].jump = 'dcDoubleCoda'; b[3].mark = 'doubleCoda'; }))));
    return [d.bars[0].mark, d.bars[1].end, d.bars[2].jump, d.bars[3].mark];
  })(), ['segnoSegno', 'toDoubleCoda', 'dcDoubleCoda', 'doubleCoda']);

  // MusicXML: doubled signs with their own names
  const bars = (doc, opts) => [...X.build(doc, opts).matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g)].map((m) => m[1]);
  const xd = bars(score(4, (b) => { b[0].mark = 'segnoSegno'; b[1].end = 'toDoubleCoda'; b[2].jump = 'dssDoubleCoda'; b[3].mark = 'doubleCoda'; }));
  T.ok('MusicXML: 𝄋𝄋 = two segno signs, named segno2', /<segno\/><segno\/><\/direction-type><sound segno="segno2"\/>/.test(xd[0]));
  T.ok('MusicXML: To Coda ⊕⊕ goes to coda2', /<words>To Coda<\/words><\/direction-type><direction-type><coda\/><coda\/><\/direction-type><sound tocoda="coda2"\/>/.test(xd[1]));
  T.ok('MusicXML: D.S.S. al Double Coda jumps to segno2', /<words>D\.S\.S\. al Double Coda<\/words><\/direction-type><sound dalsegno="segno2"\/>/.test(xd[2]));
  T.ok('MusicXML: ⊕⊕ = two coda signs, named coda2', /<coda\/><coda\/><\/direction-type><sound coda="coda2"\/>/.test(xd[3]));
  T.ok('Guitar Pro words: Dal Segno Segno al Double Coda, Da Double Coda', (() => {
    const g = bars(score(4, (b) => { b[0].mark = 'segnoSegno'; b[1].end = 'toDoubleCoda'; b[2].jump = 'dssDoubleCoda'; b[3].mark = 'doubleCoda'; }), { jumps: { gp: true } });
    return /Dal Segno Segno al Double Coda/.test(g[2]) && /<words>Da Double Coda<\/words>/.test(g[1]);
  })());

  // for Guitar Pro: written out, the tempo where the music is
  const tdoc = score(4, (b) => { b[2].tempo = 140; b[3].jump = 'dc'; });
  tdoc.meta.tempo = 100;
  const n = SC.unfold(tdoc);
  T.eq('written out: D.C. = 8 bars, no signs left', [n, tdoc.bars.every((h) => !h.jump && !h.mark && !h.end && !h.repeatEnd)], [8, true]);
  T.eq('written out: 140 from bar 3, back to 100 after the D.C., 140 again', tdoc.bars.map((h) => h.tempo), [null, null, 140, null, 100, null, 140, null]);
  T.ok('… its MusicXML has no repeat or jump left', (() => { const x = X.build(tdoc); return !/<repeat|dacapo|dalsegno|<ending/.test(x) && (x.match(/<measure /g) || []).length === 8; })());
};
