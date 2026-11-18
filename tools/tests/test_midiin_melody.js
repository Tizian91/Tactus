'use strict';
// MIDI import of melody tracks (js/midiin.js MI.toMelody): tones, lengths, chords, ties over the bar line, the sound and
// the scale from the file, keyswitches back into ways of playing / slides / strokes (Iron 2: notes shifted back),
// several tracks mixed (drums + melody), one track on several channels (one entry per channel).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'accomp.js', 'keyswitch.js', 'midiin.js']);
  const SC = TC.score, MI = TC.midiIn, KS = TC.ksw;

  // a score: drums, a guitar with Iron 2 (P.M., slide, downstroke), a plain melody (a tied note over the bar line)
  const doc = TC.emptyScore(3);
  doc.meta.tempo = 110;
  TC.state.doc = doc;
  const dr = doc.tracks[0];
  [0, 960, 1920, 2880].forEach((t) => SC.place(doc, dr, 0, 1, t, 960, TC.newDrumNote(36, {})));
  const g = SC.addTrack(doc, 'Iron', null, 'pitched');
  g.program = 29;
  g.inst = 'guitar';
  g.ksw = KS.fromTemplate('ujam-iron2');
  [0, 1].forEach((b) => [0, 960, 1920, 2880].forEach((t) => SC.place(doc, g, b, 0, t, 960, TC.newPitchNote(52, null, {}))));
  g.bars[0].ks = [{ t: 960, k: 'muted' }];
  g.bars[1].ks = [{ t: 0, k: 'open' }, { t: 1920, k: 'slideUp' }];
  const chord = SC.place(doc, g, 2, 0, 0, 1920, TC.newPitchNote(52, null, {})); // (in Iron's range: sent an octave up, above its keys)
  chord.ev.notes.push(TC.newPitchNote(59, null, {}), TC.newPitchNote(64, null, {}));
  chord.ev.notes.forEach((n) => { n.stroke = 'd'; });
  const m = SC.addTrack(doc, 'Lead', null, 'pitched');
  m.program = 73;
  m.channel = 2;
  m.scale = { l: 2, a: 0, id: 'minor' }; // E minor
  SC.place(doc, m, 0, 0, 0, 960, TC.newPitchNote(64, null, {}));
  SC.place(doc, m, 0, 0, 960, 480, TC.newPitchNote(66, null, {}));
  SC.place(doc, m, 0, 0, 1440, 480, TC.newPitchNote(67, null, {}));
  const long = SC.place(doc, m, 0, 0, 1920, 1920, TC.newPitchNote(71, null, {}));
  SC.setMelodyLength(doc, m, 0, 0, long.ev, 1920 + 960); // half note + a quarter tied into bar 2
  SC.place(doc, m, 1, 0, 960, 640, TC.newPitchNote(69, null, {})); // quarter triplets
  SC.place(doc, m, 1, 0, 1600, 640, TC.newPitchNote(67, null, {}));
  SC.place(doc, m, 1, 0, 2240, 640, TC.newPitchNote(66, null, {}));

  const file = TC.midi.build(doc, null, { multi: true, straight: true });
  const midi = MI.parse(file.bytes);
  const src = MI.sources(midi);
  T.eq('sources: drums, Iron, Lead (each one channel)', src.map((s) => [s.name, s.ch, s.notes > 0]), [['Drums', null, true], ['Iron', null, true], ['Lead', null, true]]);
  T.eq('parse: note lengths and program changes', [midi.notes.every((n) => n.end > n.t), src[1].program, src[2].program], [true, 29, 73]);
  T.eq('a track with a sound is no drum track', [MI.isDrumTrack(src[0]), MI.isDrumTrack(src[1]), MI.isDrumTrack(src[2])], [true, false, false]);

  const evs = (t, bi) => (t.bars[bi].voices[0] || []).map((e) => e.tick + ':' + e.dur + ':' + e.notes.map((n) => n.pitch + (n.tie ? '~' : '') + (n.stroke ? n.stroke : '')).join('+'));
  const lead = MI.toMelody(midi, { track: src[2].i, grid: 240, triplets: true }).doc.tracks[0];
  T.eq('melody: tones and lengths, a tied note over the bar line, triplets', [evs(lead, 0), evs(lead, 1)],
    [['0:960:64', '960:480:66', '1440:480:67', '1920:1920:71'], ['0:960:71~', '960:640:69', '1600:640:67', '2240:640:66']]);
  T.eq('melody: its sound, instrument, channel, scale (E minor from the tones), clef', [lead.kind, lead.program, lead.inst, lead.channel, lead.scale.id, lead.scale.l, lead.clef],
    ['pitched', 73, 'voice', 2, 'minor', 2, 'treble']);

  // the guitar without its profile: the keyswitch keys are low notes, its notes an octave up
  const raw = MI.toMelody(midi, { track: src[1].i, grid: 240 }).doc.tracks[0];
  const pitches = (t, bi) => (t.bars[bi].voices[0] || []).flatMap((e) => e.notes.map((n) => n.pitch));
  T.eq('without a keyswitch profile: the keys are notes (P.M. = F#2 = 54), the tones an octave up (64)', [pitches(raw, 0).includes(54), pitches(raw, 0).includes(64), pitches(raw, 0).includes(52)], [true, true, false]);
  // with Iron 2: shifted back, the keys become marks / strokes again
  const r = MI.toMelody(midi, { track: src[1].i, grid: 240, ksw: KS.fromTemplate('ujam-iron2') });
  const iron = r.doc.tracks[0];
  T.eq('with Iron 2: the notes as written (shifted back)', [evs(iron, 0), evs(iron, 1)],
    [['0:960:52', '960:960:52', '1920:960:52', '2880:960:52'], ['0:960:52', '960:960:52', '1920:960:52', '2880:960:52']]);
  T.eq('… the ways of playing and the slide as marks (the start\'s "let ring" and trigger mode not written)', [iron.bars[0].ks, iron.bars[1].ks],
    [[{ t: 960, k: 'muted' }], [{ t: 0, k: 'open' }, { t: 1920, k: 'slideUp' }]]);
  T.eq('… the downstroke key: a chord struck down', evs(iron, 2), ['0:1920:52d+59d+64d']);
  T.eq('… the profile goes with the track, guitar: treble 8 below', [iron.ksw.tpl, iron.inst, iron.clef, r.switches], ['ujam-iron2', 'guitar', 'treble8', 3]);

  // all three: drums + two melody tracks in one score
  const all = MI.toScoreMulti(midi, [
    { track: src[0].i, kind: 'drums', profile: null, name: 'Drums' },
    { track: src[1].i, kind: 'melody', ksw: KS.fromTemplate('ujam-iron2'), name: 'Iron' },
    { track: src[2].i, kind: 'melody', ksw: null, name: 'Lead' },
  ], { grid: 240, triplets: true });
  T.eq('several tracks: drums and melodies, each its own kind', all.doc.tracks.map((t) => [t.name, t.kind, !!t.ksw]), [['Drums', 'drums', false], ['Iron', 'pitched', true], ['Lead', 'pitched', false]]);
  T.eq('… as many bars as the longest, every track as long', [all.doc.bars.length, all.doc.tracks.every((t) => t.bars.length === all.doc.bars.length)], [3, true]);
  T.eq('… a melody first: the drums still get their place', MI.toScoreMulti(midi, [{ track: src[2].i, kind: 'melody', name: 'Lead' }, { track: src[0].i, kind: 'drums', profile: null, name: 'Drums' }], { grid: 240 }).doc.tracks.map((t) => t.kind), ['pitched', 'drums']);
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(all.doc)));
  T.eq('saved and loaded: the marks and the profile stay', [back.tracks[1].bars[0].ks, back.tracks[1].ksw.tpl], [[{ t: 960, k: 'muted' }], 'ujam-iron2']);

  // a type 0 file: everything in one MIDI track - drums on channel 10, a bass on channel 1: one entry per channel
  const one = TC.midi.build(doc, null, { tracks: [dr, m] });
  const m0 = MI.parse(one.bytes);
  const s0 = MI.sources(m0);
  T.eq('one track on two channels: one entry per channel', s0.map((s) => [s.i, s.ch]), [[0, 2], [0, 9]]);
  const leadOnly = MI.toMelody(m0, { track: s0[0].i, ch: s0[0].ch, grid: 240, triplets: true }).doc.tracks[0];
  T.eq('… the melody of its channel alone (no drum notes)', evs(leadOnly, 0), ['0:960:64', '960:480:66', '1440:480:67', '1920:1920:71']);
  T.eq('… the drums of channel 10 alone', MI.toScore(m0, { track: s0[1].i, ch: 9, grid: 240 }).notes, 4);
  T.eq('takes: track and channel', [MI.takes({ track: 0, ch: 9 }, { trk: 0, ch: 9 }), MI.takes({ track: 0, ch: 9 }, { trk: 0, ch: 2 }), MI.takes({ track: 0 }, { trk: 0, ch: 2 })], [true, false, true]);

  // a key signature in the file wins over the tones
  const ks = MI.guessScale({ keys: [{ t: 0, sf: -3, mi: 1 }], tpq: 960 }, []);
  T.eq('key signature 3 flats, minor: C minor', [ks.id, ks.l, ks.a], ['minor', 0, 0]);
  const ks2 = MI.guessScale({ keys: [], tpq: 960 }, [62, 66, 69, 62, 71, 73].map((p) => ({ pitch: p, t: 0, end: 960 })));
  T.eq('no key signature: D major from the tones', [ks2.id, ks2.l, ks2.a], ['major', 1, 0]);
};
