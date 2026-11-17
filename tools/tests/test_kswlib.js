'use strict';
// Own keyswitch profiles (js/kswlib.js): made empty / from a template / from a track, keys added, kept in the browser,
// export / import, a track takes a copy (lib) that is saved with the score, changes reach the tracks that use it,
// Dropbox joins both sides by id (js/dropbox.js mergeById).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js', 'accomp.js', 'keyswitch.js', 'kswlib.js']);
  const SC = TC.score, KS = TC.ksw, L = TC.kswLib;

  // ---- making profiles
  const sketch = L.blank('Iconica Sketch Strings');
  T.eq('an empty profile: no keys, C3 = 60, notes not shifted', [sketch.keys.length, sketch.c3, sketch.noteShift, sketch.tpl], [0, 60, 0, '']);
  T.eq('… kept although it has no keys yet (cleaned)', L.clean(sketch) && L.clean(sketch).name, 'Iconica Sketch Strings');
  sketch.keys.push(L.newKey(sketch));
  sketch.keys.push(L.newKey(sketch));
  T.eq('new keys: C0, then the key after it, ways of playing with ids of their own', [sketch.keys.map((k) => k.note), sketch.keys.map((k) => k.kind), new Set(sketch.keys.map((k) => k.id)).size], [['C0', 'C#0'], ['art', 'art'], 2]);
  Object.assign(sketch.keys[0], { name: 'Sustain', short: 'arco', group: 'art' });
  Object.assign(sketch.keys[1], { name: 'Staccato', short: 'stacc.', group: 'art' });
  sketch.keys.push(Object.assign(L.newKey(sketch), { name: 'Tremolo', short: 'trem.', group: 'art' }));
  T.eq('a third key after the highest one (D0)', sketch.keys[2].note, 'D0');

  const carbon = L.fromTemplate('ujam-iron2', 'UJAM Carbon');
  T.eq('from a template: its keys, a name of its own, no template (never replaced by a newer template version)', [carbon.name, carbon.keys.length === KS.template('ujam-iron2').keys.length, carbon.tpl, carbon.init, carbon.noteShift], ['UJAM Carbon', true, '', ['trigOn'], 12]);
  T.eq('a template copy: the template itself unchanged', KS.TEMPLATES[0].name, 'UJAM Iron 2 (Instrument Mode)');

  // ---- storage
  L.list = [sketch, carbon];
  L.save();
  L.list = [];
  L.load();
  T.eq('kept in the browser and loaded again', L.list.map((p) => [p.name, p.keys.length]), [['Iconica Sketch Strings', 3], ['UJAM Carbon', carbon.keys.length]]);
  const text = L.exportText();
  L.list = [L.list[0]];
  L.list[0].name = 'renamed';
  T.eq('import: same id replaced, new ones added', [L.importText(text), L.list.map((p) => p.name)], [2, ['Iconica Sketch Strings', 'UJAM Carbon']]);
  let bad = false;
  try { L.importText('{"format":"tactus-kits","profiles":[]}'); } catch (e) { bad = true; }
  T.eq('a kit file is no keyswitch file', bad, true);
  T.eq('broken keys left out when loading (unknown kind, no key)', L.clean({ id: 'x', name: 'x', keys: [{ id: 'a', note: 'C1', kind: 'art' }, { id: 'b', note: 'Q', kind: 'art' }, { id: 'c', note: 'C1', kind: '?' }] }).keys.map((k) => k.id), ['a']);
  T.eq('a profile without id is not one of the library', L.clean({ name: 'x', keys: [] }), null);

  // ---- a track takes a copy
  const doc = TC.emptyScore(2);
  TC.state.doc = doc;
  const s = SC.addTrack(doc, 'Strings', null, 'pitched');
  const sid = L.list[0].id;
  s.ksw = L.toTrack(sid);
  T.eq('the track: a copy that knows where it came from', [s.ksw.lib, s.ksw.name, s.ksw.keys.length, 'id' in s.ksw], [sid, 'Iconica Sketch Strings', 3, false]);
  T.eq('an empty profile cannot be taken by a track', L.toTrack(L.blank('x').id), null);
  [0, 960].forEach((t) => SC.place(doc, s, 0, 0, t, 960, TC.newPitchNote(60, null, {})));
  const stacc = s.ksw.keys[1].id, trem = s.ksw.keys[2].id;
  s.bars[0].ks = [{ t: 0, k: stacc }, { t: 960, k: trem }];
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded with the score (lib kept, the marks too)', [back.tracks[1].ksw.lib, back.tracks[1].ksw.keys.length, back.tracks[1].bars[0].ks.length], [sid, 3, 2]);
  const ev = KS.events(doc, s, [{ bar: 0, t0: 0 }], (o, k) => k, 3840, []);
  T.eq('played: staccato (C#0 = 25) held until tremolo (D0 = 26), tremolo to the end', ev.map((e) => [e.key, e.at, e.hold]), [[25, 0, 960], [26, 960, 2880]]);

  // ---- changes reach the tracks that use the profile
  L.byId(sid).keys[1].note = 'F0';
  T.eq('a key changed in the profile: the track takes it (one track)', [L.syncScore(doc), s.ksw.keys[1].note], [1, 'F0']);
  T.eq('… nothing more to take the second time', L.syncScore(doc), 0);
  const other = SC.addTrack(doc, 'Other', null, 'pitched');
  other.ksw = Object.assign(KS.fromTemplate('ujam-rowdy'));
  T.eq('a track with a template is left alone', [L.syncScore(doc), other.ksw.tpl], [0, 'ujam-rowdy']);
  L.list = L.list.filter((p) => p.id !== sid);
  T.eq('profile deleted: the track keeps its copy', [L.syncScore(doc), s.ksw.keys.length], [0, 3]);

  // ---- from a track (as corrected there)
  other.ksw.keys[0].note = 'C#0';
  const fromT = L.fromTrack(other.ksw, 'Rowdy (mine)');
  T.eq('from a track: its corrected keys, a new id, no template', [fromT.keys[0].note, fromT.tpl, typeof fromT.id, fromT.name], ['C#0', '', 'string', 'Rowdy (mine)']);
};
