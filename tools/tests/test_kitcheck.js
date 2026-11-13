'use strict';
// What a kit profile lacks for a score (js/kits.js K.check): fallbacks, the user's choice (p.subst),
// a free key of the VST, replacing an instrument in the score.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js']);
  const SC = TC.score, K = TC.kits, M = TC.midi;
  TC.drums.setNotation('tactus');
  const doc = TC.emptyScore(2);
  TC.state.doc = doc;
  const tr = doc.tracks[0];
  const put = (bar, tick, art) => SC.place(doc, tr, bar, TC.drums.byId(art).voice, tick, 480, TC.newDrumNote(art, {}));
  put(0, 0, 36); put(0, 0, 52); put(0, 960, 52); put(0, 960, 49); put(1, 0, 52); put(1, 480, 38); put(1, 960, 75);

  const item = (i, name) => `<item><int name="INote" value="${i}"/><int name="ONote" value="${i}"/><int name="Channel" value="9"/><int name="DisplayNote" value="${i}"/><string name="Name" value="${name}"/></item>`;
  const drm = `<DrumMap><string name="Name" value="Kit"/><list name="Map" type="list">${[item(36, 'Kick'), item(38, 'Snare'),
    item(49, 'Crash 1'), item(60, 'FX 3')].join('')}</list></DrumMap>`;
  const p = K.fromDrm(drm, 'Kit');
  const view = () => K.check(doc, p).map((r) => [r.art, r.count, r.by, r.silent, r.chosen]);

  T.eq('used instruments counted', [...K.used(doc)].sort((a, b) => a[0] - b[0]), [[36, 1], [38, 1], [49, 1], [52, 3], [75, 1]]);
  T.eq('lacking: China (3x, played as crash), claves (1x, nothing related)', view(), [[52, 3, 49, false, false], [75, 1, null, true, false]]);
  T.eq('a free key of the VST is offered', K.freeKeys(p).map((e) => e.inote), [60]);

  K.setSubst(p, 52, 38);
  T.eq('chosen: China played as snare', view()[0], [52, 3, 38, false, true]);
  T.eq('… also in the MIDI export', M.build(doc, p).replaced.map((r) => [r.art.id, r.by.id]), [[52, 38]]);
  K.setSubst(p, 52, 0);
  T.eq('chosen: China not played (not reported as missing)', [view()[0], M.build(doc, p).missing.map((a) => a.id)], [[52, 3, null, true, true], [75]]);
  K.setSubst(p, 52, 'auto');
  T.eq('back to automatic', [view()[0], p.subst], [[52, 3, 49, false, false], undefined]);

  K.setSubst(p, 75, 0);
  K.setKeys(p, 75, [60]);
  T.eq('claves on the free key "FX 3": no longer lacking, the choice is gone', [view().map((r) => r[0]), p.assign[75], p.subst], [[52], [60], undefined]);

  // in the score: China -> crash; where a crash already sounds, the China note goes
  const n = K.replaceInScore(doc, 52, 49);
  const arts = (bar) => tr.bars[bar].voices.flat().map((ev) => ev.tick + ':' + ev.notes.map((x) => x.art).sort().join('+'));
  T.eq('replaced in the score: 3 beats, no double crash', [n, K.used(doc).get(52), K.used(doc).get(49)], [3, undefined, 3]);
  T.ok('bar 1: crash at 0 and 960, kick at 0', arts(0).join(' ').includes('960:49') && arts(0).some((s) => s.startsWith('0:') && s.includes('49')));
  T.eq('nothing lacking any more', view(), []);
};
