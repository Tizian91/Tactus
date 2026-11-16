'use strict';
// Keyswitches of a VST (js/keyswitch.js, UJAM Iron 2 in Instrument Mode): key names as MIDI notes (C3 = 60 / 48), the
// template, profiles kept with the score, ways of playing held to the next one (playback, MIDI export), slides / stops
// before their note, strokes sent as the VST's own stroke keys (no spreading), notes sent shifted, MusicXML directions.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js', 'accomp.js', 'keyswitch.js']);
  const SC = TC.score, KS = TC.ksw;

  // ---- keys
  T.eq('key names: C3 = 60 (C1 36, F#2 54, Bb2 58)', [KS.noteOf('C3'), KS.noteOf('C1'), KS.noteOf('F#2'), KS.noteOf('Bb2'), KS.noteOf('A#2')], [60, 36, 54, 58, 58]);
  T.eq('… C3 = 48: an octave lower', [KS.noteOf('C1', 48), KS.noteOf('F#2', 48)], [24, 42]);
  T.eq('no key name: null', [KS.noteOf('H2'), KS.noteOf(''), KS.noteOf('C#')], [null, null, null]);
  T.eq('a MIDI note named back', [KS.nameOf(54), KS.nameOf(36), KS.nameOf(42, 48)], ['F#2', 'C1', 'F#2']);
  const iron = KS.fromTemplate('ujam-iron2');
  const keyOf = (id) => iron.keys.find((k) => k.id === id);
  T.eq('Iron 2: open A#2, muted F#2, half G#2, dead D#2, release C#2, downstroke B1 (the manual)', ['open', 'muted', 'half', 'dead', 'release', 'down'].map((id) => keyOf(id).note), ['A#2', 'F#2', 'G#2', 'D#2', 'C#2', 'B1']);
  T.eq('Iron 2: notes an octave up, four tones', [iron.noteShift, iron.poly, iron.c3], [12, 4, 60]);
  T.eq('cleaned: unknown kinds and keys left out', KS.clean({ name: 'x', keys: [{ id: 'a', note: 'C1', kind: 'art' }, { id: 'b', note: 'Q9', kind: 'art' }, { id: 'c', note: 'C1', kind: 'nope' }] }).keys.map((k) => k.id), ['a']);

  // ---- a track with the profile, ways of playing written
  const doc = TC.emptyScore(3);
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const g = SC.addTrack(doc, 'Iron', null, 'pitched');
  g.inst = 'guitar';
  g.ksw = KS.fromTemplate('ujam-iron2');
  [0, 1, 2].forEach((b) => [0, 1920].forEach((t) => SC.place(doc, g, b, 0, t, 1920, TC.newPitchNote(40, null, {}))));
  g.bars[0].ks = [{ t: 0, k: 'muted' }];
  g.bars[1].ks = [{ t: 1920, k: 'open' }, { t: 1920, k: 'slideUp' }];
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded: the profile and the marks', [back.tracks[1].ksw.tpl, back.tracks[1].bars[1].ks], ['ujam-iron2', [{ t: 1920, k: 'open' }, { t: 1920, k: 'slideUp' }]]);
  T.eq('a bar with other ways of playing is not the same bar (no %)', SC.barKey(doc, g, 0) === SC.barKey(doc, g, 2), false);

  // ---- playback: held to the next one, the slide before its note
  const hits = TC.timeline.build(doc).hits.filter((h) => h.ks !== undefined);
  const L0 = TC.timeline.LEAD;
  const muted = hits.find((h) => h.ks === 54), open = hits.find((h) => h.ks === 58), slide = hits.find((h) => h.ks === 36);
  T.eq('muted (F#2) held from bar 1 to bar 2 beat 3, just before', [Math.round((muted.t - L0) * 1000), Math.round(muted.dur * 100) / 100], [-20, 3]);
  T.eq('open then, to the end; the slide at the same place, short', [Math.round((open.t - L0) * 100) / 100, Math.round(open.dur * 100) / 100, Math.round((slide.t - L0) * 100) / 100, slide.dur], [2.98, 3, 2.98, 0.05]);
  const fromBar2 = TC.timeline.build(doc, { from: 1 }).hits.filter((h) => h.ks === 54);
  T.eq('playing from bar 2: the way of playing set before it is sent at the start', fromBar2.length === 1 && Math.abs(fromBar2[0].t - (L0 - 0.02)) < 1e-6, true);

  // ---- strokes: the VST's own stroke key, the chord not spread
  g.bars[2].voices[0] = [];
  const sev = SC.place(doc, g, 2, 0, 0, 1920, Object.assign(TC.newPitchNote(48, null, {}), { stroke: 'd' }));
  SC.place(doc, g, 2, 0, 0, 1920, Object.assign(TC.newPitchNote(52, null, {}), { stroke: 'd' }));
  const h2 = TC.timeline.build(doc).hits.filter((h) => h.trk === g && h.t > L0 + 3.9);
  T.eq('a down stroke: Downstroke (B1 = 47) just before, the tones together', [h2.some((h) => h.ks === 47), new Set(h2.filter((h) => h.pitch !== undefined && h.t < L0 + 4.1).map((h) => h.t)).size], [true, 1]);

  // ---- MIDI export: notes an octave up, the keyswitches with their holds
  const m = TC.midi.read(TC.midi.build(doc, null, { tracks: [g] }).bytes);
  T.eq('MIDI: the notes an octave up (E2 → 52), the keys as they are (F#2 54, A#2 58, C1 36, B1 47)', [m.notes.some((n) => n.note === 52), m.notes.some((n) => n.note === 40), [54, 58, 36, 47].every((k) => m.notes.some((n) => n.note === k))], [true, false, true]);
  const mutedOn = m.notes.find((n) => n.note === 54);
  T.eq('MIDI: muted just before bar 1', mutedOn.t, 0);
  void sev;

  // ---- MusicXML: the ways of playing as directions
  const xml = TC.musicxml.build(doc);
  T.eq('MusicXML: P.M. and the slide as words above', [/<words>P\.M\.<\/words>/.test(xml), /<words>sl\. ↗<\/words>/.test(xml)], [true, true]);
};
