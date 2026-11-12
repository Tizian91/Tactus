'use strict';
// MIDI export (js/midi.js): notes, velocity, tempo / time signature / markers, %-bars, kit profiles with fallbacks.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js']);
  const SC = TC.score, M = TC.midi;
  const doc = TC.emptyScore(3);
  doc.meta.tempo = 120;
  doc.meta.title = 'Groove';
  TC.state.doc = doc;
  const tr = doc.tracks[0];
  const put = (bar, tick, art, extra) => SC.place(doc, tr, bar, TC.drums.byId(art).voice, tick, 480, Object.assign(TC.newDrumNote(art, {}), extra || {}));
  put(0, 0, 36);
  put(0, 0, 42);
  put(0, 480, 92);
  put(0, 960, 38, { accent: 1 });
  put(0, 1440, 38, { ghost: true });
  doc.bars[0].marker = 'Intro';
  doc.bars[1].simile = true; // %: repeats bar 1
  doc.bars[2].ts = [3, 4];
  doc.bars[2].tempo = 90;
  put(2, 0, 49, { orn: 'flam' });

  const gm = M.read(M.build(doc, null).bytes);
  T.eq('960 ticks per quarter', gm.tpq, 960);
  const byT = (a, b) => a[0] - b[0] || a[1] - b[1];
  const bar1 = gm.notes.filter((n) => n.t < 3840).map((n) => [n.t, n.note, n.vel, n.ch]).sort(byT);
  T.eq('bar 1 in General MIDI: kick + hi-hat, half-open hi-hat (46), accent loud, ghost soft, channel 10',
    bar1, [[0, 36, 91, 9], [0, 42, 91, 9], [480, 46, 91, 9], [960, 38, 127, 9], [1440, 38, 38, 9]]);
  T.eq('%-bar written out', gm.notes.filter((n) => n.t >= 3840 && n.note !== 49).map((n) => [n.t - 3840, n.note]).sort(byT), bar1.map((n) => [n[0], n[1]]));
  const crash = gm.notes.filter((n) => n.note === 49);
  T.eq('flam: soft grace note 30 ms before (90 BPM = 43 ticks)', crash.map((n) => [n.t - 7680, n.vel]), [[-43, 44], [0, 91]]);
  const metas = (type) => gm.metas.filter((m) => m.type === type);
  T.eq('tempo 120 at the start, 90 in bar 3', metas(0x51).map((m) => [m.t, (m.data[0] << 16) | (m.data[1] << 8) | m.data[2]]), [[0, 500000], [7680, 666667]]);
  T.eq('time signature 4/4, 3/4 in bar 3', metas(0x58).map((m) => [m.t, m.data[0], m.data[1]]), [[0, 4, 2], [7680, 3, 2]]);
  T.eq('bar text as marker, title as track name', [metas(0x06).map((m) => String.fromCharCode(...m.data)), String.fromCharCode(...metas(0x03)[0].data)], [['Intro'], 'Groove']);
  T.eq('end of track at the end of the last bar', metas(0x2f)[0].t, 7680 + 2880);

  // kit profile: own keys, hi-hat half -> open (no key), ghost snare etc.
  const item = (i, o, name, ch = 9) => `<item><int name="INote" value="${i}"/><int name="ONote" value="${o}"/><int name="Channel" value="${ch}"/><int name="DisplayNote" value="${i}"/><string name="Name" value="${name}"/></item>`;
  const drm = `<DrumMap><string name="Name" value="Kit"/><list name="Map" type="list">${[item(24, 24, 'Kick'), item(26, 26, 'Snare'),
    item(30, 30, 'Hihat.Closed'), item(31, 31, 'Hihat.Open'), item(33, 33, 'Crash 1')].join('')}</list></DrumMap>`;
  const p = TC.kits.fromDrm(drm);
  const res = M.build(doc, p);
  const kn = M.read(res.bytes).notes.filter((n) => n.t < 3840).map((n) => [n.t, n.note]).sort(byT);
  T.eq('kit profile: keys of the drum map', kn, [[0, 24], [0, 30], [480, 31], [960, 26], [1440, 26]]);
  T.eq('kit profile: half-open hi-hat played as open (reported)', res.replaced.map((r) => [r.art.id, r.by.id]), [[92, 46]]);
  delete p.assign[49];
  T.eq('kit profile: an instrument without key or relative is left out and reported', M.build(doc, p).missing.map((a) => a.id), [49]);
};
