'use strict';
// Time signature of one bar, the notes after it move along (a MIDI import whose 2/4 bar was written into 4/4 bars):
// shorter pulls the music forward, longer pushes it back (new bars at the end), the other bars keep their time
// signatures, bar signs stay, chord symbols move along, %-bars are written out, melody notes over a new bar line
// are split and tied, drum notes are cut. "Only this bar" without moving.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js']);
  const SC = TC.score, Q = 960;
  const drums = (doc, bi) => doc.tracks[0].bars[bi].voices[0].map((e) => e.tick / Q + ':' + e.notes.map((n) => n.art).join('+'));
  const hits = (doc, bi, arts) => arts.forEach((a, k) => a && SC.place(doc, doc.tracks[0], bi, 0, k * Q, Q, { id: TC.uid('n'), art: a }));

  // the MIDI file: 4/4 throughout, but bar 2 was really a 2/4 bar - bar 2 holds 2 beats of it and 2 beats of the next bar
  const doc = TC.emptyScore(4);
  TC.state.doc = doc;
  hits(doc, 0, [36, 38, 36, 38]);
  hits(doc, 1, [36, 38, 49, 38]); // 49 (crash) = beat 1 of the real bar 3
  hits(doc, 2, [36, 38, 49, 38]);
  hits(doc, 3, [36, 38]);
  doc.bars[2].marker = 'Chorus';
  doc.bars[1].chords = [{ t: 0, deg: 1 }, { t: 2 * Q, deg: 4 }];
  T.eq('2/4 with the notes moving along', SC.setTimeSigShift(doc, 1, [2, 4]), true);
  T.eq('… time signatures: only bar 2 changes', doc.bars.map((h) => h.ts.join('/')), ['4/4', '2/4', '4/4', '4/4']);
  T.eq('… bar 2: its first two beats', drums(doc, 1), ['0:36', '1:38']);
  T.eq('… bar 3: the crash on beat 1, then what came after it', drums(doc, 2), ['0:49', '1:38', '2:36', '3:38']);
  T.eq('… bar 4', drums(doc, 3), ['0:49', '1:38', '2:36', '3:38']);
  T.eq('… no bar added', doc.bars.length, 4);
  T.eq('… the chord on beat 3 moves to bar 3, beat 1', [doc.bars[1].chords, doc.bars[2].chords], [[{ t: 0, deg: 1 }], [{ t: 0, deg: 4 }]]);
  T.eq('… bar texts stay with their bars', doc.bars[2].marker, 'Chorus');
  T.eq('… bar 1 untouched', drums(doc, 0), ['0:36', '1:38', '2:36', '3:38']);

  // longer: pushed back (the last bar gets room at its end)
  const d2 = TC.emptyScore(2);
  TC.state.doc = d2;
  hits(d2, 0, [36, 38, 36, 38]);
  hits(d2, 1, [36, 38, 36, 38]);
  SC.setTimeSigShift(d2, 0, [6, 4]);
  T.eq('6/4: the next bar comes 2 beats later', [d2.bars.map((h) => h.ts.join('/')), drums(d2, 0), drums(d2, 1), d2.bars[2]],
    [['6/4', '4/4'], ['0:36', '1:38', '2:36', '3:38', '4:36', '5:38'], ['0:36', '1:38'], undefined]);

  // %-bars after it are written out first (they would play something else otherwise); the last bar overflows: a bar is added
  const d3 = TC.emptyScore(3);
  TC.state.doc = d3;
  hits(d3, 0, [36, 38, 36, 38]);
  SC.setSimile(d3, d3.tracks[0], 1, true);
  SC.setSimile(d3, d3.tracks[0], 2, true);
  SC.setTimeSigShift(d3, 1, [3, 4]);
  T.eq('%-bars: written out, then moved', [d3.tracks[0].bars.map((b) => !!b.simile), drums(d3, 1), drums(d3, 2), drums(d3, 3)],
    [[false, false, false, false], ['0:36', '1:38', '2:36'], ['0:38', '1:36', '2:38', '3:36'], ['0:38']]);

  // melody: a note over the new bar line is split and tied; drums are cut at it
  const d4 = TC.emptyScore(2);
  TC.state.doc = d4;
  const mel = SC.addTrack(d4, 'Melody', null, 'pitched');
  SC.place(d4, mel, 0, 0, 2 * Q, 2 * Q, TC.newPitchNote(67, null, {})); // G half note on beat 3
  SC.place(d4, d4.tracks[0], 0, 0, 2 * Q, 2 * Q, { id: TC.uid('n'), art: 49 });
  SC.setTimeSigShift(d4, 0, [3, 4]);
  const m = (bi) => mel.bars[bi].voices[0].map((e) => [e.tick / Q, e.dur / Q, e.notes.map((n) => n.pitch + (n.tie ? '~' : '')).join()]);
  T.eq('3/4: the G half note becomes a quarter tied into the next bar', [m(0), m(1)], [[[2, 1, '67']], [[0, 1, '67~']]]);
  T.eq('… the drum note is cut', d4.tracks[0].bars[0].voices[0].map((e) => e.dur / Q), [1]);
  T.eq('… and does not go on', drums(d4, 1), []);

  // the same time signature: nothing happens; "only this bar" does not move anything
  const d5 = TC.emptyScore(3);
  TC.state.doc = d5;
  hits(d5, 1, [36, 38, 36, 38]);
  hits(d5, 2, [36, 38, 36, 38]);
  T.eq('same time signature: nothing to do', [SC.setTimeSigShift(d5, 1, [4, 4]), drums(d5, 1).length], [true, 4]);
  SC.setTimeSig(d5, 1, [2, 4], true);
  T.eq('only this bar: the next bars keep 4/4 and their notes', [d5.bars.map((h) => h.ts.join('/')), drums(d5, 1), drums(d5, 2).length],
    [['4/4', '2/4', '4/4'], ['0:36', '1:38'], 4]);
  T.eq('bad time signature', SC.setTimeSigShift(d5, 1, [0, 4]), false);
};
