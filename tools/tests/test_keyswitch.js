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
  T.eq('Iron 2: notes an octave up, four tones, trigger mode on (D#1) at the start', [iron.noteShift, iron.poly, iron.c3, iron.init], [12, 4, 60, ['trigOn']]);
  T.eq('Iron 2: C1 free - the slides start on D1, pick slide G1, upstroke A1', ['slideUp', 'slideDown', 'slideUpDown', 'pickSlide', 'up'].map((id) => keyOf(id).note), ['D1', 'E1', 'F1', 'G1', 'A1']);
  const oldP = KS.clean({ tpl: 'ujam-iron2', name: 'x', c3: 48, keys: [{ id: 'slideUp', name: 'Slide up', note: 'C1', kind: 'once' }] });
  T.eq('a profile saved before the correction: the corrected template, its C3 kept', [oldP.keys.find((k) => k.id === 'slideUp').note, oldP.init, oldP.c3], ['D1', ['trigOn'], 48]);
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
  const muted = hits.find((h) => h.ks === 54), open = hits.find((h) => h.ks === 58), slide = hits.find((h) => h.ks === 38);
  T.eq('muted (F#2) held from bar 1 to bar 2 beat 3, just before', [Math.round((muted.t - L0) * 1000), Math.round(muted.dur * 100) / 100], [-20, 3]);
  T.eq('let ring then, to the end; the slide at the same place - held over the next note too (to the end of bar 3, beat 2)', [Math.round((open.t - L0) * 100) / 100, Math.round(open.dur * 100) / 100, Math.round((slide.t - L0) * 100) / 100, Math.round(slide.dur * 100) / 100], [2.98, 3, 2.98, 2]);
  T.eq('Iron 2: open is called let ring', [keyOf('open').short, KS.clean(Object.assign(KS.fromTemplate('ujam-iron2'), { v: 1, keys: [{ id: 'open', name: 'Open', short: 'open', note: 'A#2', kind: 'art' }], init: ['trigOn'] })).keys.find((k) => k.id === 'open').short], ['let ring', 'let ring']);
  T.eq('trigger mode on (D#1 = 39) at the start, before everything', hits.filter((h) => h.ks === 39).map((h) => Math.round((h.t - L0) * 1000)), [-20]);
  const fromBar2 = TC.timeline.build(doc, { from: 1 }).hits.filter((h) => h.ks === 54);
  T.eq('playing from bar 2: the way of playing set before it is sent at the start', fromBar2.length === 1 && Math.abs(fromBar2[0].t - (L0 - 0.02)) < 1e-6, true);

  // ---- strokes: the VST's own stroke key, the chord not spread
  g.bars[2].voices[0] = [];
  const sev = SC.place(doc, g, 2, 0, 0, 1920, Object.assign(TC.newPitchNote(48, null, {}), { stroke: 'd' }));
  SC.place(doc, g, 2, 0, 0, 1920, Object.assign(TC.newPitchNote(52, null, {}), { stroke: 'd' }));
  const h2 = TC.timeline.build(doc).hits.filter((h) => h.trk === g && h.t > L0 + 3.9);
  const dk = h2.find((h) => h.ks === 47);
  T.eq('a down stroke: Downstroke (B1 = 47) just before, held while the chord sounds, the tones together', [!!dk, dk && Math.round(dk.dur * 100) / 100, new Set(h2.filter((h) => h.pitch !== undefined && h.t < L0 + 4.1).map((h) => h.t)).size], [true, 1.01, 1]);
  // picking is its own group: held alongside the muting
  const gp = KS.events(doc, Object.assign({}, g, { bars: [{ ks: [{ t: 0, k: 'muted' }, { t: 0, k: 'pick1' }] }, { ks: [{ t: 0, k: 'dead' }] }, {}] }), [{ bar: 0, t0: 0 }, { bar: 1, t0: 10 }, { bar: 2, t0: 20 }], (o, k) => o.t0, 30, []);
  T.eq('groups: dead replaces muted (bar 2), picking holds on to the end', gp.filter((e) => !e.init).map((e) => [e.key, e.at, e.hold]), [[54, 0, 10], [48, 0, 30], [51, 10, 20]]);

  // ---- MIDI export: notes an octave up, the keyswitches with their holds
  const m = TC.midi.read(TC.midi.build(doc, null, { tracks: [g] }).bytes);
  T.eq('MIDI: the notes an octave up (E2 → 52), the keys as they are (F#2 54, A#2 58, D1 38, B1 47, D#1 39)', [m.notes.some((n) => n.note === 52), m.notes.some((n) => n.note === 40), [54, 58, 38, 47, 39].every((k) => m.notes.some((n) => n.note === k))], [true, false, true]);
  const mutedOn = m.notes.find((n) => n.note === 54);
  T.eq('MIDI: muted just before bar 1', mutedOn.t, 0);
  void sev;


  // ---- UJAM Virtual Bassist Rowdy: the lowest octave C0 … B0
  const rowdy = KS.fromTemplate('ujam-rowdy'), rk = (id) => KS.noteOf(rowdy.keys.find((k) => k.id === id).note, rowdy.c3);
  T.eq('Rowdy: slides C0 D0 E0, legato off C#0 / on F#0, silent dead G0, dead A0 B0, full stop Bb0 (MIDI)', ['slide1', 'slide2', 'slide3', 'legOff', 'legOn', 'deadMode', 'dead1', 'dead2', 'stop'].map(rk), [24, 26, 28, 25, 30, 31, 33, 35, 34]);
  T.eq('Rowdy: notes two octaves up, one tone at a time, no start keys', [rowdy.noteShift, rowdy.poly, rowdy.init], [24, 1, []]);
  const bd = TC.emptyScore(1), bt = SC.addTrack(bd, 'Bass', null, 'pitched');
  bt.ksw = rowdy;
  [0, 960, 1920].forEach((t) => SC.place(bd, bt, 0, 0, t, 960, TC.newPitchNote(28, null, {})));
  bt.bars[0].ks = [{ t: 0, k: 'slide1' }, { t: 0, k: 'legOn' }];
  const be = KS.events(bd, bt, [{ bar: 0, t0: 0 }], (o, k) => k, 3840, []);
  T.eq('Rowdy: a pre-intro slide held over its note only (not the next), legato on to the end', [be.find((e) => e.key === 24).hold, be.find((e) => e.key === 30).hold], [960, 3840]);
  const bm = TC.midi.read(TC.midi.build(bd, null, { tracks: [bt] }).bytes);
  T.eq('Rowdy: the low E (E1 = 28) goes to it two octaves up (52)', bm.notes.some((n) => n.note === 52) && !bm.notes.some((n) => n.note === 28), true);
  // ---- MusicXML: the ways of playing as directions
  const xml = TC.musicxml.build(doc);
  T.eq('MusicXML: P.M. and the slide as words above', [/<words>P\.M\.<\/words>/.test(xml), /<words>sl\. ↗<\/words>/.test(xml)], [true, true]);
};
