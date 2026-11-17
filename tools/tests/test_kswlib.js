'use strict';
// Own keyswitch profiles (js/kswlib.js) on the ways of playing Tactus knows (js/keyswitch.js KS.CATALOG): a key per way
// of playing, switches of the VST, kept in the browser, export / import, a track takes a copy (lib) saved with the
// score, changes reach the tracks that use it; the start's way of playing (a latching VST does not stay in the last
// one), signs at the notes (staccato, tremolo), MusicXML; Cubase expression maps read; profiles from before the catalog.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js', 'accomp.js', 'keyswitch.js', 'kswlib.js']);
  const SC = TC.score, KS = TC.ksw, L = TC.kswLib;

  // ---- making profiles: the ways of playing are Tactus' (the catalog), a profile gives each its key
  const sketch = L.blank('Iconica Sketch Strings');
  T.eq('an empty profile: no keys, C3 = 60, notes not shifted', [sketch.keys.length, sketch.c3, sketch.noteShift, sketch.tpl], [0, 60, 0, '']);
  T.eq('… kept although it has no keys yet (cleaned)', L.clean(sketch) && L.clean(sketch).name, 'Iconica Sketch Strings');
  T.eq('keys set: staccato C0, tremolo F0, sustain D#0 - in the order of the catalog', [L.setKey(sketch, 'stacc', 'C0'), L.setKey(sketch, 'trem', 'f0'), L.setKey(sketch, 'sus', 'D♯0'), sketch.keys.map((k) => k.id + ' ' + k.note)],
    [true, true, true, ['sus D#0', 'stacc C0', 'trem F0']]);
  T.eq('… with what the catalog says: staccato a dot at each note, sustain the start, tremolo strokes', [sketch.keys[1].sign, sketch.keys[0].def, sketch.keys[2].sign, sketch.keys[1].group], ['stacc', true, 'trem', 'art']);
  T.eq('no key: refused; not in the catalog: refused', [L.setKey(sketch, 'pizz', 'H2'), L.setKey(sketch, 'nope', 'C1'), sketch.keys.length], [false, false, 3]);
  L.setKey(sketch, 'pizz', 'C#0');
  T.eq('a key taken out again (empty)', [L.setKey(sketch, 'pizz', ''), sketch.keys.some((k) => k.id === 'pizz')], [true, false]);
  const swk = L.newSwitch(sketch);
  T.eq('a switch of the VST: named by the profile, on the key after the highest (F#0)', [swk.kind, swk.note, swk.id], ['mode', 'F#0', 'sw1']);
  L.setKey(sketch, 'pizz', 'C0');
  T.eq('the same key twice is found (a typing slip)', L.sameKeys(sketch).map((l) => l.map((k) => k.id)), [['stacc', 'pizz']]);
  L.setKey(sketch, 'pizz', '');

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
  [0, 960, 1920, 2880].forEach((t) => SC.place(doc, s, 0, 0, t, 960, TC.newPitchNote(60, null, {})));
  SC.place(doc, s, 1, 0, 0, 960, TC.newPitchNote(62, null, {}));
  const stacc = 'stacc', trem = 'trem';
  s.bars[0].ks = [{ t: 0, k: stacc }, { t: 960, k: trem }];
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded with the score (lib kept, the marks too)', [back.tracks[1].ksw.lib, back.tracks[1].ksw.keys.length, back.tracks[1].bars[0].ks.length], [sid, 3, 2]);
  const ev = KS.events(doc, s, [{ bar: 0, t0: 0 }], (o, k) => k, 3840, []);
  T.eq('played: staccato (C0 = 24) held until tremolo (F0 = 29), tremolo to the end - sustain not sent (replaced at once)', ev.map((e) => [e.key, e.at, e.hold]), [[24, 0, 960], [29, 960, 2880]]);
  s.bars[0].ks = [{ t: 960, k: stacc }];
  const ev2 = KS.events(doc, s, [{ bar: 0, t0: 0 }], (o, k) => k, 3840, []);
  T.eq('nothing written at the start: sustain (D#0 = 27) from the start - the VST does not stay in what was played last', ev2.map((e) => [e.key, e.at, e.hold]), [[27, 0, 960], [24, 960, 2880]]);
  s.bars[0].ks = [{ t: 0, k: stacc }, { t: 960, k: trem }];
  const sg = KS.signer(s);
  T.eq('signs at the notes: dots from the staccato, strokes from the tremolo on (next bar too)', [sg(0, 0), sg(0, 480), sg(0, 960), sg(1, 0)], [['stacc'], ['stacc'], ['trem'], ['trem']]);
  T.eq('… no text under the staff for them; sustain "ord.", no dashed line', [KS.markText(KS.keyOf(s, stacc)), KS.markText(KS.keyOf(s, 'sus')), KS.hasLine(KS.keyOf(s, stacc))], ['', 'ord.', false]);
  const xml = TC.musicxml.build(doc);
  T.eq('MusicXML: staccato and tremolo at the notes, no words for them', [/<staccato\/>/.test(xml), /<tremolo type="single">3<\/tremolo>/.test(xml), /<words>(Staccato|Tremolo)<\/words>/.test(xml)], [true, true, false]);

  // ---- changes reach the tracks that use the profile
  L.setKey(L.byId(sid), 'stacc', 'G0');
  T.eq('a key changed in the profile: the track takes it (one track)', [L.syncScore(doc), KS.keyOf(s, 'stacc').note], [1, 'G0']);
  T.eq('… nothing more to take the second time', L.syncScore(doc), 0);
  const other = SC.addTrack(doc, 'Other', null, 'pitched');
  other.ksw = KS.fromTemplate('ujam-rowdy');
  T.eq('a track with a template is left alone', [L.syncScore(doc), other.ksw.tpl], [0, 'ujam-rowdy']);
  L.list = L.list.filter((p) => p.id !== sid);
  T.eq('profile deleted: the track keeps its copy', [L.syncScore(doc), s.ksw.keys.length], [0, 3]);

  // ---- from a track (as corrected there)
  other.ksw.keys[0].note = 'C#0';
  const fromT = L.fromTrack(other.ksw, 'Rowdy (mine)');
  T.eq('from a track: its corrected keys, a new id, no template', [fromT.keys[0].note, fromT.tpl, typeof fromT.id, fromT.name], ['C#0', '', 'string', 'Rowdy (mine)']);

  // ---- Cubase expression maps (a map written here like Iconica Sketch's: a key per sound slot)
  const slot = (name, ev, ch = -1) => '<obj class="PSoundSlot" ID="1"><obj class="PSlotThruTrigger" name="remote" ID="2"><int name="status" value="144"/><int name="data1" value="0"/></obj>' +
    '<obj class="PSlotMidiAction" name="action" ID="3"><int name="version" value="600"/><member name="noteChanger"><int name="ownership" value="1"/><list name="obj" type="obj"><obj class="PSlotNoteChanger" ID="4"><int name="channel" value="-1"/></obj></list></member>' +
    '<member name="midiMessages"><int name="ownership" value="1"/><list name="obj" type="obj">' +
    ev.map(([st, d]) => '<obj class="POutputEvent" ID="5"><int name="status" value="' + st + '"/><int name="data1" value="' + d + '"/><int name="data2" value="120"/></obj>').join('') + '</list></member>' +
    '<int name="channel" value="' + ch + '"/><int name="key" value="0"/></obj><member name="sv"><int name="ownership" value="2"/></member><member name="name"><string name="s" value="' + name + '" wide="true"/></member><int name="color" value="1"/></obj>';
  const map = '<?xml version="1.0" encoding="utf-8"?><InstrumentMap><string name="name" value="Violin 2" wide="true"/><member name="slots"><int name="ownership" value="1"/><list name="obj" type="obj">' +
    [slot('Violins2 Staccato', [[144, 24]]), slot('Violins2 Pizzicato', [[144, 25]]), slot('Violins2 Sustain', [[144, 27]]), slot('Violins2 Tremolo', [[144, 29]]),
      slot('Violins2 Sustain Vibrato', [[144, 30]]), slot('Violins2 Swells', [[144, 31]]), slot('Violins2 Con Sordino', [[176, 1]]), slot('Violins2 Staccato Short', [[144, 33]]),
      slot('Violins2 Legato', [[144, 28]], 2)].join('') + '</list></member></InstrumentMap>';
  const xm = L.fromExpressionMap(map, 'file');
  T.eq('expression map: its name, a key per slot on the way of playing its name says (the common "Violins2" left out)', [xm.profile.name, xm.profile.keys.map((k) => k.id + ' ' + k.note)],
    ['Violin 2', ['sus D#0', 'vib F#0', 'stacc C0', 'trem F0', 'pizz C#0']]);
  T.eq('… not taken: an unknown name, a controller, a second staccato, another channel', xm.missed.map((m) => [m.name, m.why]), [['Swells', 'unknown'], ['Con Sordino', 'other'], ['Staccato Short', 'twice'], ['Legato', 'other']]);
  T.eq('… names: ways of playing as the makers write them', ['Long Arco', 'Spiccato', 'Trill minor 2nd', 'Trill', 'Bartok Pizz', 'Non Vibrato', 'Harmonics', 'Sul Pont'].map(KS.matchName),
    ['sus', 'spicc', 'trill1', 'trill2', 'bartok', 'nonvib', 'harm', 'sulPont']);
  T.eq('no expression map: null', L.fromExpressionMap('<DrumMap></DrumMap>'), null);

  // ---- profiles made before the catalog: their free keys stay; the templates are on the catalog
  const oldP = L.clean({ id: 'o', name: 'old', keys: [{ id: 'key1', name: 'Way 1', short: 'w1', note: 'C0', kind: 'art', group: 'art' }] });
  T.eq('a profile from before the catalog: its own key kept as it was', [oldP.keys[0].id, oldP.keys[0].name, KS.markText(oldP.keys[0])], ['key1', 'Way 1', 'w1']);
  const iron = KS.fromTemplate('ujam-iron2');
  T.eq('Iron on the catalog: P.M. with its line, let ring the start, the switches named by the template', [iron.keys.find((k) => k.id === 'muted').line, iron.keys.find((k) => k.id === 'open').def, iron.keys.filter((k) => k.kind === 'mode').map((k) => k.id)],
    [true, true, ['trigOff', 'trigOn', 'noArtStrum', 'strumAuto']]);

  // ---- dynamics through a controller (Iconica: the modulation wheel)
  T.eq('dynamics: a controller offered, its range cleaned (off: none)', [KS.cleanDyn({ cc: 1 }), KS.cleanDyn({ cc: 1, lo: -5, hi: 300 }), KS.cleanDyn({ cc: 64 }), KS.cleanDyn(null)],
    [{ cc: 1, lo: 20, hi: 127 }, { cc: 1, lo: 0, hi: 127 }, null, null]);
  T.eq('… ppp = lo, fff = hi, the levels between evenly (20 … 127: mf 81)', [0, 4, 7].map((l) => KS.dynValue({ lo: 20, hi: 127 }, l)), [20, 81, 127]);
  const onlyDyn = L.clean({ id: 'd', name: 'Iconica', keys: [], dyn: { cc: 1, lo: 20, hi: 127 } });
  L.list.push(onlyDyn);
  T.eq('… a profile with dynamics only (no keys) can be taken by a track', !!L.toTrack('d') && L.toTrack('d').dyn.cc, 1);
  const dd = TC.emptyScore(2);
  const ic = SC.addTrack(dd, 'Iconica', null, 'pitched');
  ic.ksw = L.toTrack('d');
  SC.place(dd, ic, 0, 0, 0, 3840, TC.newPitchNote(60, null, {}));
  SC.place(dd, ic, 1, 0, 0, 3840, TC.newPitchNote(60, null, {}));
  SC.setDyn(dd, ic, 0, 0, { v: 'p' });
  SC.setDyn(dd, ic, 0, 1920, { w: 'cresc', len: 1920, to: 'f' });
  const order = [{ bar: 0, t: 0 }, { bar: 1, t: 3840 }], cc = KS.dynCC(dd, ic, order, (o, k) => o.t + k);
  T.eq('… played: p (51) from the start, a cresc. (from its first step) gliding up to f (96) where it ends, then f holds', [cc[0], cc[1].at, cc[cc.length - 1]], [{ at: 0, val: 51 }, 2040, { at: 3840, val: 96 }]);
  T.eq('… gliding: a step every 32nd, always louder', cc.slice(1).every((e, i) => e.val > cc[i].val) && cc.length >= 15, true);
  const start2 = KS.dynCC(dd, ic, [{ bar: 1, t: 0 }], (o, k) => o.t + k);
  T.eq('… playing starts in bar 2: the value holding there first (f)', start2, [{ at: 0, val: 96 }]);
  const mb = Array.from(TC.midi.build(dd, null, { tracks: [ic] }).bytes);
  const hasCC = (v) => mb.some((b, i) => (b & 0xf0) === 0xb0 && mb[i + 1] === 1 && mb[i + 2] === v);
  T.eq('… MIDI export: CC 1 with p and f', [hasCC(51), hasCC(96)], [true, true]);
  TC.state.doc = dd;
  const tl = TC.timeline.build(dd);
  T.eq('… playback: controller hits for the track (MIDI only)', tl.hits.filter((h) => h.cc === 1 && h.trk === ic).length, cc.length);
  ic.ksw = KS.clean({ name: 'x', keys: [] });
  T.eq('… a track profile with neither keys nor dynamics is none', ic.ksw, null);
};
