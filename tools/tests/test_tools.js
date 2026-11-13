'use strict';
// Moving several notes at once (model.js moveNotes, absTick / atAbs) - used by the select tool and the arrow keys.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js']);
  const SC = TC.score;
  const doc = TC.emptyScore(3);
  TC.state.doc = doc;
  SC.setTimeSig(doc, 1, [3, 4], true); // bar 2 in 3/4
  const tr = doc.tracks[0];
  const put = (bar, tick, art, dur = 480) => SC.place(doc, tr, bar, TC.drums.voiceOf(art), tick, dur, TC.newDrumNote(art, {})).note;
  const all = () => {
    const out = [];
    SC.eachNote(doc, (n, ev, vi, bi) => out.push(`${bi + 1}:${ev.tick}:${n.art}`));
    return out.sort().join(' ');
  };

  T.eq('absTick / atAbs over bars of different length', [SC.absTick(doc, 2, 480), SC.atAbs(doc, 3840 + 2880 + 480), SC.atAbs(doc, 3840 + 2880 + 3840)],
    [3840 + 2880 + 480, { bar: 2, tick: 480 }, null]);

  const a = put(0, 2880, 38), b = put(0, 3360, 38), k = put(0, 2880, 36);
  T.ok('move two snares and a kick one beat later, into bar 2', SC.moveNotes(doc, [a.id, b.id, k.id], 960));
  T.eq('… across the bar line', all(), '2:0:36 2:0:38 2:480:38');
  T.eq('… ids kept', [SC.findNote(doc, a.id).bar, SC.findNote(doc, k.id).bar], [1, 1]);
  T.ok('move back', SC.moveNotes(doc, [a.id, b.id, k.id], -960) && all() === '1:2880:36 1:2880:38 1:3360:38');

  T.eq('out of the score: nothing moves', [SC.moveNotes(doc, [a.id], -99999), all()], [false, '1:2880:36 1:2880:38 1:3360:38']);
  put(1, 0, 38);
  T.eq('onto a snare that stays: nothing moves', [SC.moveNotes(doc, [a.id], 960), all()], [false, '1:2880:36 1:2880:38 1:3360:38 2:0:38']);
  T.ok('but onto it together with the one that moves away from there', SC.moveNotes(doc, [b.id, SC.findNote(doc, tr.bars[1].voices[0][0].notes[0].id).note.id], 480));

  const d2 = TC.emptyScore(2);
  TC.state.doc = d2;
  const t2 = d2.tracks[0];
  const n1 = SC.place(d2, t2, 0, 0, 0, 480, TC.newDrumNote(42, {})).note;
  const n2 = SC.place(d2, t2, 0, 0, 480, 480, TC.newDrumNote(42, {})).note;
  T.ok('to another instrument (all hi-hats -> ride)', SC.moveNotes(d2, [n1.id, n2.id], 0, 51));
  T.eq('… now rides, same times', t2.bars[0].voices[0].map((e) => e.tick + ':' + e.notes[0].art), ['0:51', '480:51']);
  d2.bars[1].simile = true;
  T.eq('into a %-bar: nothing moves', SC.moveNotes(d2, [n1.id], 3840), false);
};
