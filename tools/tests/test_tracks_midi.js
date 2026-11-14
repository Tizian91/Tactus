'use strict';
// Several tracks and MIDI: mute / solo, a kit profile per track, the MIDI export (one file per track,
// or one file with a MIDI track each), the MIDI import of several tracks (each its own Tactus track).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'midiin.js']);
  const SC = TC.score, S = TC.state, K = TC.kits, M = TC.midi, MI = TC.midiIn;
  const item = (n, name) => `<item><int name="INote" value="${n}"/><int name="ONote" value="${n}"/><int name="Channel" value="9"/><string name="Name" value="${name}"/></item>`;
  const ez = K.fromDrm(`<DrumMap><string name="Name" value="EZ"/><list name="Map" type="list">${[item(34, 'Kick'), item(61, 'Hi-Hat Closed Tip'), item(38, 'Snare Center')].join('')}</list></DrumMap>`);
  const sd = K.fromDrm(`<DrumMap><string name="Name" value="SD"/><list name="Map" type="list">${[item(70, 'Snare Center'), item(36, 'Kick')].join('')}</list></DrumMap>`);
  ez.id = 'ez';
  sd.id = 'sd';
  K.list = [ez, sd];

  const doc = TC.emptyScore(2);
  doc.meta.tempo = 120;
  S.doc = doc;
  const drums = doc.tracks[0];
  drums.name = 'Drums';
  const snare = SC.addTrack(doc, 'Snare');
  const put = (t, bar, tick, art) => SC.place(doc, t, bar, TC.drums.byId(art).voice, tick, 960, TC.newDrumNote(art, {}));
  put(drums, 0, 0, 36);
  put(drums, 0, 960, 42);
  put(snare, 0, 1920, 38);

  // mute / solo
  const arts = () => TC.timeline.build(doc, { from: 0, to: 0 }).hits.map((h) => h.art).sort();
  T.eq('all tracks are played', arts(), [36, 38, 42]);
  T.eq('every stroke knows its track', TC.timeline.build(doc, { from: 0, to: 0 }).hits.map((h) => h.trk.name).sort(), ['Drums', 'Drums', 'Snare']);
  drums.mute = true;
  T.eq('muted: not played', arts(), [38]);
  drums.mute = false;
  snare.solo = true;
  T.eq('solo: only the solo tracks', arts(), [38]);
  drums.solo = true;
  T.eq('two solo tracks: both', arts(), [36, 38, 42]);
  drums.solo = snare.solo = false;

  // kit profile per track
  doc.meta.kit = 'ez';
  doc.meta.kitName = 'EZ';
  T.eq('no own profile: the one of the score', [K.ofTrack(doc, drums), K.ofTrack(doc, snare)].map((p) => p && p.name), ['EZ', 'EZ']);
  snare.profile = 'sd';
  snare.profileName = 'SD';
  T.eq('own profile', K.ofTrack(doc, snare).name, 'SD');
  snare.profile = 'gone';
  T.eq('own profile by name on another computer', K.ofTrack(doc, snare).name, 'SD');
  snare.profileName = 'Nowhere';
  T.eq('a profile not here: General MIDI, reported', [K.ofTrack(doc, snare), K.trackMissing(doc, snare)], [null, true]);
  snare.profile = 'gm';
  T.eq('General MIDI chosen', [K.ofTrack(doc, snare), K.trackMissing(doc, snare)], [null, false]);
  snare.profile = 'sd';
  snare.profileName = 'SD';
  T.eq('what a profile lacks: only in the tracks that play with it', [[...K.used(doc, ez).keys()].sort(), [...K.used(doc, sd).keys()]], [[36, 42], [38]]);

  // MIDI export: one file per track, each with the keys of its drum map
  const one = (t, p) => M.read(M.build(doc, p, { tracks: [t], name: t.name }).bytes);
  const fd = one(drums, ez), fs = one(snare, sd);
  T.eq('file of the drums: kick 34, hi-hat 61 (EZ), no snare; named like the track', [fd.notes.map((n) => n.note).sort(), fd.tracks[0].name, fd.format], [[34, 61], 'Drums', 0]);
  T.eq('file of the snare: snare on 70 (SD)', fs.notes.map((n) => n.note), [70]);
  T.eq('both files: tempo and time signature', [fd.metas.some((m) => m.type === 0x51), fs.metas.some((m) => m.type === 0x58)], [true, true]);
  // … or one file, a MIDI track each
  const of = new Map([[drums, ez], [snare, sd]]);
  const all = M.read(M.build(doc, null, { tracks: [drums, snare], targetOf: (t) => of.get(t), multi: true }).bytes);
  T.eq('one file (type 1): first track tempo / title, then one per Tactus track', [all.format, all.tracks.length, all.tracks.map((t) => t.name).slice(1), all.tracks[0].notes.length],
    [1, 3, ['Drums', 'Snare'], 0]);
  T.eq('… each with the keys of its drum map', [all.tracks[1].notes.map((n) => n.note).sort(), all.tracks[2].notes.map((n) => n.note)], [[34, 61], [70]]);
  T.eq('default export unchanged: one MIDI track (type 0), all tracks', [M.read(M.build(doc, null).bytes).format, M.read(M.build(doc, null).bytes).notes.length], [0, 3]);

  // MIDI import: several tracks of a file, each a Tactus track with its name
  const bytes = M.build(doc, null, { tracks: [drums, snare], multi: true }).bytes;
  const midi = MI.parse(bytes);
  T.eq('read back: the track names', midi.tracks.map((t) => t.name), ['Tactus', 'Drums', 'Snare']);
  T.eq('drum tracks are found (channel 10), the tempo track not (no notes)', MI.drumTracks(midi), [1, 2]);
  const res = MI.toScoreMulti(midi, [{ track: 1, profile: null, name: 'Drums' }, { track: 2, profile: sd, name: 'Snare' }], { grid: 240 });
  const notes = (t) => t.bars.flatMap((b) => b.voices.flat()).flatMap((e) => e.notes.map((n) => e.tick + ':' + n.art)).sort();
  T.eq('two Tactus tracks with the names of the file', res.doc.tracks.map((t) => t.name), ['Drums', 'Snare']);
  T.eq('… each with its notes', [notes(res.doc.tracks[0]), notes(res.doc.tracks[1])], [['0:36', '960:42'], []]);
  const res2 = MI.toScoreMulti(midi, [{ track: 1, profile: null, name: 'Drums' }, { track: 2, profile: null, name: 'Snare' }], { grid: 240 });
  T.eq('read with the right drum map: the snare is there', notes(res2.doc.tracks[1]), ['1920:38']);
  T.eq('another drum map than the first track: the track keeps it', [res.doc.tracks[1].profile, res2.doc.tracks[1].profile], ['sd', '']);
  T.eq('same bars in every track', res.doc.tracks.map((t) => t.bars.length), [res.doc.bars.length, res.doc.bars.length]);

  // saved and loaded
  Object.assign(drums, { mute: true, midiOut: 'loopMIDI Port 2', midiCh: 3 });
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded: mute, solo, kit profile, MIDI output and channel',
    [back.tracks[0].mute, back.tracks[0].midiOut, back.tracks[0].midiCh, back.tracks[1].profile, back.tracks[1].profileName, back.tracks[1].solo],
    [true, 'loopMIDI Port 2', 3, 'sd', 'SD', false]);
  T.eq('bad channel: none', TC.normalizeDoc({ bars: [{}], tracks: [{ kind: 'drums', midiCh: 16, bars: [] }] }).tracks[0].midiCh, null);
};
