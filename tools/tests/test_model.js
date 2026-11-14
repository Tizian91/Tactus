'use strict';
// Writing and removing notes, bars and time signatures, loading files (js/model.js, js/drummap.js).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js']);
  const SC = TC.score;
  const doc = TC.emptyScore(4);
  TC.state.doc = doc;
  const tr = doc.tracks[0];
  const inp = { accent: 0, ghost: false, head: 'auto' };
  const put = (bar, voice, tick, dur, art) => SC.place(doc, tr, bar, voice, tick, dur, TC.newDrumNote(art, inp));
  const ticks = (bar, voice) => tr.bars[bar].voices[voice].map((e) => [e.tick, e.dur, e.notes.map((n) => n.art)]);

  T.eq('empty score: 4 bars, one drum track', [doc.bars.length, doc.tracks.length, tr.kind, tr.bars.length], [4, 1, 'drums', 4]);

  [0, 480, 960, 1440].forEach((t) => put(0, 0, t, 480, 42));
  T.eq('hi-hat eighths', ticks(0, 0).map((x) => x[0]), [0, 480, 960, 1440]);
  T.eq('snare on 2 joins the hi-hat (chord)', put(0, 0, 960, 960, 38).status, 'chord');
  T.eq('chord keeps the eighth', ticks(0, 0)[2], [960, 480, [42, 38]]);
  T.eq('same instrument again: exists', put(0, 0, 960, 480, 38).status, 'exists');
  T.eq('open hi-hat on a closed one: changed', put(0, 0, 0, 480, 46).status, 'changed');
  T.eq('… and the closed one is gone', ticks(0, 0)[0][2], [46]);
  T.eq('a sixteenth between two eighths shortens the first', (put(0, 0, 240, 240, 38), ticks(0, 0).slice(0, 3).map((x) => [x[0], x[1]])),
    [[0, 240], [240, 240], [480, 480]]);
  T.eq('a quarter is cut at the next event', (put(0, 0, 2880, 960, 42), put(0, 0, 2400, 960, 42).ev.dur), 480);
  T.eq('outside the bar', put(0, 0, 3840, 480, 42).status, 'outside');

  const kick = put(0, 1, 0, 960, 36).note;
  T.eq('kick in voice 2', ticks(0, 1), [[0, 960, [36]]]);
  T.eq('remove the kick: voice empty again', (SC.removeNotes(doc, [kick.id]), ticks(0, 1)), []);
  T.ok('findNote', SC.findNote(doc, tr.bars[0].voices[0][0].notes[0].id).bar === 0);

  // time signatures and bars
  put(1, 0, 2880, 960, 38);
  SC.setTimeSig(doc, 1, [3, 4]);
  T.eq('3/4 from bar 2 on (up to the next change)', doc.bars.map((b) => b.ts.join('/')), ['4/4', '3/4', '3/4', '3/4']);
  T.eq('notes beyond the shorter bar are gone', ticks(1, 0), []);
  SC.setTimeSig(doc, 2, [7, 8], true);
  T.eq('only this bar', doc.bars.map((b) => b.ts.join('/')), ['4/4', '3/4', '7/8', '3/4']);
  SC.insertBars(doc, 4, 2);
  T.eq('bars added at the end take the time signature before', doc.bars.map((b) => b.ts.join('/')), ['4/4', '3/4', '7/8', '3/4', '3/4', '3/4']);
  T.eq('… in every track', tr.bars.length, 6);
  SC.deleteBars(doc, 0, 1);
  T.eq('bar deleted', [doc.bars.length, doc.bars[0].ts.join('/')], [5, '3/4']);
  T.eq('never the last bar', (SC.deleteBars(doc, 0, 99), doc.bars.length), 1);

  // durations of selected notes
  const d2 = TC.emptyScore(1), t2 = d2.tracks[0];
  const a = SC.place(d2, t2, 0, 0, 0, 480, TC.newDrumNote(38, inp)).note;
  SC.place(d2, t2, 0, 0, 960, 480, TC.newDrumNote(38, inp));
  SC.setDuration(d2, [a.id], 1920);
  T.eq('longer value stops at the next event', t2.bars[0].voices[0][0].dur, 960);

  // loading
  const raw = JSON.parse(JSON.stringify(d2));
  raw.tracks[0].bars[0].voices[0].push({ tick: 2000, dur: 480, notes: [{ art: 9999 }] }); // unknown instrument
  raw.bars[0].ts = [4, 3]; // invalid
  raw.meta.tempo = 'fast';
  const back = TC.normalizeDoc(raw);
  T.eq('load: unknown instrument dropped, bad values replaced', [back.tracks[0].bars[0].voices[0].length, back.bars[0].ts, back.meta.tempo], [2, [4, 4], 120]);
  T.eq('load: notes kept with their ids', back.tracks[0].bars[0].voices[0][0].notes[0].id, a.id);
  let threw = false;
  try { TC.normalizeDoc({ foo: 1 }); } catch (e) { threw = true; }
  T.ok('load: not a score -> error', threw);

  // drum map
  T.eq('click on the snare line writes the snare', TC.drums.resolve(3, 42).id, 38);
  T.eq('selected rimshot is kept on its line', TC.drums.resolve(3, 91).id, 91);
  T.eq('hi-hat line', TC.drums.resolve(-1, 38).id, 42);
  T.eq('kick and pedal hi-hat are written with stems down', [36, 44].map((id) => TC.drums.byId(id).voice), [1, 1]);
  T.eq('every line with instruments has a default', TC.drums.lines().every(([, list]) => list.some((x) => x.def) || list.length), true);
  // drum kits and the "magnet" (nearest line of the kit)
  const D = TC.drums, std = D.kitIds('standard');
  T.eq('standard kit: 9 lines', D.lines(std).map(([l]) => l), [-2, -1, 0, 1, 2, 3, 5, 7, 9]);
  T.eq('magnet: between snare and tom 4, nearer the tom', D.resolve(4.2, 42, std).id, 45);
  T.eq('magnet: a little below the snare', D.resolve(3.9, 42, std).id, 38);
  T.eq('magnet: between floor tom and kick, nearer the kick', D.resolve(6.4, 42, std).id, 36);
  T.eq('magnet: far below the staff -> nothing', D.resolve(14, 42, std), null);
  T.eq('selected open hi-hat on its line', D.resolve(-1.3, 46, std).id, 46);
  T.eq('selected instrument outside the kit still works', D.resolve(6, 43, std).id, 43);
  T.eq('all instruments: every position has one', D.resolve(4, 42, D.kitIds('all')).id, 47);
  T.eq('custom kit keeps only known ids', [...D.kitIds('custom', [38, 999])], [38]);
  T.eq('unknown kit -> standard', D.kitIds('nonsense').size, std.size);
  SC.place(d2, t2, 0, 1, 0, 480, TC.newDrumNote(36, inp));
  T.eq('instruments used in a score', [...D.usedIds(d2)].sort(), [36, 38]);

  T.eq('input ticks', [TC.inputTicks({ value: 8 }), TC.inputTicks({ value: 8, dotted: true }), TC.inputTicks({ value: 8, triplet: true })], [480, 720, 320]);
  T.eq('grid ticks', [TC.gridTicks({ value: 16 }), TC.gridTicks({ value: 8, dotted: true }), TC.gridTicks({ value: 8, triplet: true })], [240, 240, 320]);

  // rest cleanup setting of a track
  const fillOf = (t) => TC.normalizeDoc({ bars: [{}], tracks: [t] }).tracks[0].fill;
  T.eq('fill: drums default beat, saved value kept, bad value dropped',
    [TC.emptyScore(1).tracks[0].fill, fillOf({ kind: 'drums' }), fillOf({ kind: 'drums', fill: 'next' }), fillOf({ kind: 'drums', fill: 'x' }), fillOf({ kind: 'pitched' })],
    ['beat', 'beat', 'next', 'beat', 'off']);

  // page view: bar text, line breaks, bars per line, bar numbers (saved with the score)
  const pd = TC.normalizeDoc({ bars: [{ marker: 'Intro', lineBreak: true }, { marker: 'Chorus', lineBreak: true }, {}],
    tracks: [{ kind: 'drums' }], page: { barsPerLine: 4, barNumbers: 'every' } });
  T.eq('page: markers and line breaks loaded (bar 1 never breaks)',
    pd.bars.map((h) => [h.marker, h.lineBreak]), [['Intro', false], ['Chorus', true], ['', false]]);
  T.eq('page: settings loaded', pd.page, { barsPerLine: 4, barNumbers: 'every', margin: 15, header: true, multiRest: true, multiSimile: true });
  T.eq('page: defaults and bad values', [TC.emptyScore(1).page, TC.normalizeDoc({ bars: [{}], page: { barsPerLine: 99, barNumbers: 'x', margin: 13, header: 'no' } }).page],
    [{ barsPerLine: 0, barNumbers: 'system', margin: 15, header: true, multiRest: true, multiSimile: true }, { barsPerLine: 0, barNumbers: 'system', margin: 15, header: true, multiRest: true, multiSimile: true }]);
  T.eq('page: margin and running header loaded', TC.normalizeDoc({ bars: [{}], page: { margin: 25, header: false, multiRest: true, multiSimile: true } }).page,
    { barsPerLine: 0, barNumbers: 'system', margin: 25, header: false, multiRest: true, multiSimile: true });
};
