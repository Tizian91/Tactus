'use strict';
// Finding repeats (e.g. after a MIDI import): bars that play the bar before (-> %), sections that come again right
// after themselves in all tracks (-> |: :| n×), the strength counting or not, folding a section.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js']);
  const SC = TC.score;
  // a score from a pattern: one letter per bar (A, B … grooves; '.' empty)
  const make = (pattern, tracks = 1) => {
    const doc = TC.emptyScore(pattern.length);
    for (let k = 1; k < tracks; k++) SC.addTrack(doc, 'T' + k);
    [...pattern].forEach((c, i) => {
      if (c === '.') return;
      doc.tracks.forEach((t) => {
        SC.place(doc, t, i, 0, 0, 480, TC.newDrumNote(42, {}));
        SC.place(doc, t, i, 0, 480 * (c.charCodeAt(0) - 64), 480, TC.newDrumNote(38, {}));
      });
    });
    return doc;
  };
  const sim = (r) => r.simile.map((s) => `${s.from + 1}:${s.bars.map((b) => b + 1).join(',')}`);
  const sec = (r) => r.sections.map((s) => `${s.from + 1}+${s.len}x${s.times}`);

  const d1 = make('AAAB');
  T.eq('A A A B: bars 2, 3 repeat bar 1', sim(SC.findRepeats(d1)), ['1:2,3']);
  T.eq('… no section (one bar again and again is %)', sec(SC.findRepeats(d1)), []);
  T.eq('empty bars are no repeats', sim(SC.findRepeats(make('A..A'))), []);

  const d2 = make('AAABAAAB');
  T.eq('A A A B A A A B: a section of 4 bars, twice', sec(SC.findRepeats(d2)), ['1+4x2']);
  T.eq('… and the % runs', sim(SC.findRepeats(d2)), ['1:2,3', '5:6,7']);
  T.eq('A B A B A B: 2 bars three times', sec(SC.findRepeats(make('ABABAB'))), ['1+2x3']);
  T.eq('C A B A B: the section starts at bar 2', sec(SC.findRepeats(make('CABAB'))), ['2+2x2']);

  // several tracks: a section only if all tracks repeat; % per track
  const d3 = make('ABAB', 2);
  T.eq('two tracks alike: section', sec(SC.findRepeats(d3)), ['1+2x2']);
  SC.place(d3, d3.tracks[1], 3, 0, 1920, 480, TC.newDrumNote(36, {}));
  T.eq('the second track differs in bar 4: no section', sec(SC.findRepeats(d3)), []);

  // strength: an accent makes a bar different, unless loose
  const d4 = make('AA');
  d4.tracks[0].bars[1].voices[0][0].notes[0].accent = 1;
  T.eq('accent: not the same', sim(SC.findRepeats(d4)), []);
  T.eq('loose: the same', sim(SC.findRepeats(d4, { loose: true })), ['1:2']);

  // a % already there: not found again, but the run goes on after it
  const d5 = make('AAAA');
  SC.setSimile(d5, d5.tracks[0], 1, true);
  T.eq('% in bar 2 already: bars 3, 4 still found', sim(SC.findRepeats(d5)), ['1:3,4']);

  // headers: another time signature / repeat signs stop it
  const d6 = make('AA');
  d6.bars[1].ts = [3, 4];
  T.eq('another time signature: no %', sim(SC.findRepeats(d6)), []);
  const d7 = make('ABAB');
  d7.bars[2].marker = 'Chorus';
  T.eq('a text in the copy: no section (it would get lost)', sec(SC.findRepeats(d7)), []);
  const d8 = make('ABABAB');
  d8.bars[0].repeatStart = true;
  T.eq('repeat signs there already: no section over them', sec(SC.findRepeats(d8)).length, 1);

  // folding
  const d9 = make('CABABABD');
  const s = SC.findRepeats(d9).sections[0];
  T.eq('found: bars 2–3 three times', [s.from, s.len, s.times], [1, 2, 3]);
  SC.foldSection(d9, s);
  T.eq('folded: 4 bars left, |: on bar 2, :| 3× on bar 3', [d9.bars.length, d9.bars[1].repeatStart, d9.bars[2].repeatEnd], [4, true, 3]);
  T.eq('… it plays as before: 8 bars', SC.playBars(d9).map((o) => o.bar), [0, 1, 2, 1, 2, 1, 2, 3]);

  // everything at once (MIDI import): sections first, then %-bars; it plays as before
  const d10 = make('AAABAAABCC');
  const before = SC.playBars(d10).map((o) => SC.barKey(d10, d10.tracks[0], o.bar));
  const res = SC.autoRepeats(d10);
  T.eq('auto: one section, % in bars 2, 3 and the second C', [res.sections, res.similes, d10.bars.length], [1, 3, 6]);
  T.eq('auto: |: 1 … 4 :| 2×, then C %', [d10.bars[0].repeatStart, d10.bars[3].repeatEnd, d10.tracks[0].bars.map((b) => !!b.simile)], [true, 2, [false, true, true, false, false, true]]);
  T.eq('auto: plays the same notes as before', SC.playBars(d10).map((o) => SC.barKey(d10, d10.tracks[0], o.bar)), before);

  // back to the notes: one repeat written out again
  T.eq('the repeat around bar 2: bars 1–4, twice', SC.repeatAround(d10, 1), { from: 0, to: 3, times: 2 });
  T.eq('no repeat around bar 5', SC.repeatAround(d10, 4), null);
  SC.unfoldSection(d10, 2);
  T.eq('written out: 10 bars, no signs', [d10.bars.length, d10.bars.some((h) => h.repeatStart || h.repeatEnd)], [10, false]);
  T.eq('… the same notes in the same order', d10.bars.map((h, i) => SC.barKey(d10, d10.tracks[0], i)), before);
  T.eq('… the copy has notes (not %)', d10.tracks[0].bars.slice(4, 8).map((b) => !!b.simile), [false, false, false, false]);
};
