'use strict';
// Turning pages: the page turning MIDI file (js/midi.js pageTurns: a note when a new page comes, bars
// before, repeats written out) and what a received MIDI message means (js/remote.js decode).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'remote.js']);
  const M = TC.midi, R = TC.remote, BAR = 3840;
  const doc = TC.emptyScore(4);
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const turns = (pageOf, lead) => M.read(M.build(doc, null, { tracks: [], name: 'Pages', pageTurns: { pageOf, lead, ch: 15 } }).bytes).notes.map((n) => [n.t, n.note, n.ch]);

  T.eq('page 1 at the start, page 2 one bar before it begins (channel 16)', turns([0, 0, 1, 1], 1), [[0, 1, 15], [BAR, 2, 15]]);
  T.eq('lead 0: when the new page begins', turns([0, 0, 1, 1], 0), [[0, 1, 15], [2 * BAR, 2, 15]]);
  T.eq('lead 2', turns([0, 0, 0, 1], 2), [[0, 1, 15], [BAR, 2, 15]]);
  T.eq('a page of one bar: its turn after the one before', turns([0, 1, 2, 2], 1).map((x) => x[1]), [1, 2, 3]);
  T.ok('… in time order, never two at once', turns([0, 1, 2, 2], 1).every((x, i, a) => !i || x[0] > a[i - 1][0]));
  T.eq('the tempo and the time signature are in the file (it lines up with the backing tracks)',
    [M.read(M.build(doc, null, { tracks: [], pageTurns: { pageOf: [0, 0, 1, 1] } }).bytes).metas.some((m) => m.type === 0x51), M.read(M.build(doc, null, { tracks: [] }).bytes).metas.some((m) => m.type === 0x58)], [true, true]);
  // repeats: back to the first page and on again, as played
  doc.bars[3].repeatEnd = 2;
  T.eq('repeat of all four bars: page 2, back to page 1, page 2 again', turns([0, 0, 1, 1], 1), [[0, 1, 15], [BAR, 2, 15], [3 * BAR, 1, 15], [5 * BAR, 2, 15]]);
  doc.bars[3].repeatEnd = 0;
  T.eq('no notes of the tracks in the page turning file', M.read(M.build(doc, null, { tracks: [], pageTurns: { pageOf: [0, 0, 0, 0] } }).bytes).notes.length, 1);

  // received messages
  const page = { remoteMode: 'page', remoteCh: 'all' };
  T.eq('note n = page n (note-on, velocity > 0)', [R.decode([0x90, 3, 100], page), R.decode([0x9f, 1, 64], page)], [{ page: 2 }, { page: 0 }]);
  T.eq('note-off, note-on with velocity 0, note 0, a controller: nothing', [R.decode([0x80, 3, 0], page), R.decode([0x90, 3, 0], page), R.decode([0x90, 0, 100], page), R.decode([0xb0, 64, 127], page)], [null, null, null, null]);
  T.eq('program change n = page n + 1', R.decode([0xc0, 4], page), { page: 4 });
  T.eq('clock / start are no page', [R.decode([0xf8], page), R.decode([0xfa], page)], [null, null]);
  T.eq('only one channel: others are ignored', [R.decode([0x92, 3, 100], { remoteMode: 'page', remoteCh: 2 }), R.decode([0x93, 3, 100], { remoteMode: 'page', remoteCh: 2 })], [{ page: 2 }, null]);
  const step = { remoteMode: 'step', remoteCh: 'all', remoteNext: { type: 0xb0, ch: 0, d1: 64 }, remotePrev: { type: 0x90, ch: 0, d1: 36 } };
  T.eq('learnt: a pedal (CC 64) pressed = next page, released = nothing', [R.decode([0xb0, 64, 127], step), R.decode([0xb0, 64, 0], step)], [{ step: 1 }, null]);
  T.eq('learnt: note 36 = page before; another note / channel: nothing', [R.decode([0x90, 36, 90], step), R.decode([0x90, 37, 90], step), R.decode([0x91, 36, 90], step)], [{ step: -1 }, null, null]);
  T.eq('describe a learnt message', [R.describe({ type: 0x90, ch: 0, d1: 36 }), R.describe({ type: 0xb0, ch: 9, d1: 64 })], ['Note 36, channel 1', 'CC 64, channel 10']);
};
