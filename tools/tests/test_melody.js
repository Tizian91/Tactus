'use strict';
// Melody tracks: adding one, writing notes with pitches (chords, the same pitch twice, moving), scales per bar
// (kept when a bar is cleared, written out with the repeats), saving / loading, playback (tones with their
// length), MIDI export (channel, program, note lengths), MusicXML (pitches, key, clef, accidentals, ties).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js']);
  const SC = TC.score, P = TC.pitch;
  const doc = TC.emptyScore(4);
  doc.meta.tempo = 120;
  TC.state.doc = doc;

  // a melody track after the drums: treble clef, C major, a voice sound (General MIDI 54)
  const mel = SC.addTrack(doc, 'Vocals', doc.tracks[0], 'pitched');
  T.eq('new melody track: kind, clef, scale, program, channel 1, no rest cleanup', [mel.kind, mel.clef, mel.scale, mel.program, mel.channel, mel.fill],
    ['pitched', 'treble', { l: 0, a: 0, id: 'major' }, 53, 0, 'off']);
  T.eq('as many bars as the score', mel.bars.length, 4);

  const put = (bar, tick, dur, pitch, dia) => SC.place(doc, mel, bar, 0, tick, dur, TC.newPitchNote(pitch, dia, {}));
  T.eq('a note', put(0, 0, 960, 64).status, 'added');
  T.eq('another pitch at the same time: a chord', put(0, 0, 960, 67).status, 'chord');
  T.eq('the same pitch again: exists', put(0, 0, 960, 64).status, 'exists');
  put(0, 960, 1920, 66, 31); // F♯4 (written as F♯)
  put(0, 2880, 960, 66, 32); // G♭4 (written as G♭)
  T.eq('bar 1: E+G quarter, F♯ half, G♭ quarter', mel.bars[0].voices[0].map((e) => [e.tick, e.dur, e.notes.map((n) => n.pitch)]),
    [[0, 960, [64, 67]], [960, 1920, [66]], [2880, 960, [66]]]);

  // moving melody notes: in time, and to another pitch
  const fsharp = mel.bars[0].voices[0][1].notes[0];
  T.ok('move a note a quarter later to A4', SC.moveNotes(doc, [fsharp.id], 960, null, () => ({ pitch: 69, dia: 33 })));
  T.eq('… it kept its length and voice', mel.bars[0].voices[0].map((e) => [e.tick, e.dur, e.notes.map((n) => n.pitch)]),
    [[0, 960, [64, 67]], [1920, 960, [69]], [2880, 960, [66]]]);
  const a4 = mel.bars[0].voices[0][1].notes[0];
  T.eq('blocked on the same pitch', SC.moveNotes(doc, [a4.id], 960, null, () => ({ pitch: 66 })), false);

  // scales: from a bar on; the same as before goes away; clearing a bar keeps the change
  SC.setScale(mel, 2, { l: 1, a: 0, id: 'major' }); // D major from bar 3
  T.eq('scale per bar: C, C, D, D', [0, 1, 2, 3].map((i) => P.scaleName(SC.scaleAt(mel, i))), ['C Major', 'C Major', 'D Major', 'D Major']);
  SC.clearBar(doc, 2, mel);
  T.eq('cleared bar keeps its scale change', P.scaleName(SC.scaleAt(mel, 3)), 'D Major');
  SC.setScale(mel, 3, { l: 1, a: 0, id: 'major' });
  T.eq('a change like the scale before it is left out', mel.bars[3].scale || null, null);

  // saving and loading
  put(1, 0, 3840, 62);
  mel.voice = 'tenor';
  mel.clef = 'treble8';
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  const m2 = back.tracks[1];
  T.eq('loaded: kind, clef, voice, scale, the change in bar 3', [m2.kind, m2.clef, m2.voice, m2.scale.id, m2.bars[2].scale], ['pitched', 'treble8', 'tenor', 'major', { l: 1, a: 0, id: 'major' }]);
  T.eq('loaded: pitches and spellings', m2.bars[0].voices[0].map((e) => e.notes.map((n) => [n.pitch, n.dia])), [[[64, null], [67, null]], [[69, 33]], [[66, 32]]]);
  const bad = TC.normalizeDoc({ bars: [{}], tracks: [{ kind: 'pitched', clef: 'alto?', scale: { l: 9, id: 'x' }, bars: [{ voices: [[{ tick: 0, dur: 960, notes: [{ pitch: 61, dia: 40 }] }]] }] }] });
  T.eq('loaded with bad values: treble, C major, a spelling that does not fit is dropped', [bad.tracks[0].clef, bad.tracks[0].scale, bad.tracks[0].bars[0].voices[0][0].notes[0].dia], ['treble', { l: 0, a: 0, id: 'major' }, null]);

  // repeats written out: every played bar keeps its scale
  const d2 = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  d2.bars[3].repeatEnd = 2; // bars 1-4 twice: C C D D C C D D
  SC.unfold(d2);
  T.eq('unfold: scale changes where the played bars change', [d2.tracks[1].scale.l, ...d2.tracks[1].bars.map((b) => (b.scale ? P.name(b.scale.l, b.scale.a) : '-'))],
    [0, '-', '-', 'D', '-', 'C', '-', 'D', '-']);

  // playback: tones with their length (120 BPM: a quarter = 0.5 s)
  const tl = TC.timeline.build(doc, {});
  const tones = tl.hits.filter((h) => h.pitch !== undefined && h.t < tl.start + 2).map((h) => [Math.round((h.t - tl.start) * 100) / 100, h.pitch, Math.round(h.dur * 100) / 100]);
  T.eq('playback bar 1: E+G at 0, A at 1 s, G♭ at 1.5 s, each ~0.5 s', tones, [[0, 64, 0.48], [0, 67, 0.48], [1, 69, 0.48], [1.5, 66, 0.48]]);
  mel.mute = true;
  T.eq('muted melody: no tones', TC.timeline.build(doc, {}).hits.some((h) => h.pitch !== undefined), false);
  mel.mute = false;

  // MIDI: program change, notes on channel 1 with their length; drums stay on channel 10
  const f = TC.midi.read(TC.midi.build(doc, null, { multi: true }).bytes);
  const mt = f.tracks.find((t) => t.name === 'Vocals');
  T.eq('MIDI: program 53 on channel 1 at the start', mt.programs, [{ t: 0, ch: 0, program: 53 }]);
  T.eq('MIDI: bar 1 notes (start, key, channel, length)', mt.notes.filter((n) => n.t < 3840).map((n) => [n.t, n.note, n.ch, n.dur]),
    [[0, 64, 0, 950], [0, 67, 0, 950], [1920, 69, 0, 950], [2880, 66, 0, 950]]);
  mel.midiCh = 3;
  T.eq('MIDI: the track\'s own channel', TC.midi.read(TC.midi.build(doc, null, { tracks: [mel] }).bytes).notes[0].ch, 3);
  mel.midiCh = null;

  // MusicXML: pitch, key, clef, signs as drawn, ties inside a bar
  mel.clef = 'treble';
  put(3, 0, 1440, 73); // C♯5 dotted quarter in D major: no sign (in the key)
  put(3, 1440, 2400, 65); // F natural in D major: a natural sign
  const xml = TC.musicxml.build(doc);
  const part = xml.slice(xml.indexOf('<part id="P2">'));
  T.ok('MusicXML: melody part with its program and channel', /<score-part id="P2"><part-name>Vocals<\/part-name>.*<midi-channel>1<\/midi-channel><midi-program>54<\/midi-program>/.test(xml));
  T.ok('MusicXML: treble clef, C major', part.includes('<key><fifths>0</fifths><mode>major</mode></key>') && part.includes('<clef><sign>G</sign><line>2</line></clef>'));
  T.ok('MusicXML: E4 + G4 as a chord', /<pitch><step>E<\/step><octave>4<\/octave><\/pitch>.*\n<note><chord\/><pitch><step>G<\/step><octave>4<\/octave>/.test(part));
  T.ok('MusicXML: G♭4 spelled with a flat sign', part.includes('<pitch><step>G</step><alter>-1</alter><octave>4</octave></pitch>') && part.includes('<accidental>flat</accidental>'));
  T.ok('MusicXML: D major from bar 3', /<measure number="3">\n<attributes><key><fifths>2<\/fifths><mode>major<\/mode><\/key>/.test(part));
  const m4 = part.slice(part.indexOf('<measure number="4">'), part.indexOf('</measure>', part.indexOf('<measure number="4">')));
  T.ok('MusicXML bar 4: C♯ without a sign (in D major), F with a natural', m4.includes('<step>C</step><alter>1</alter><octave>5</octave>') && !/C<\/step><alter>1<\/alter><octave>5<\/octave><\/pitch><duration>\d+<\/duration>(<tie[^>]*>)*<instrument id="P2-I1"\/><voice>1<\/voice><type>\w+<\/type>(<dot\/>)?<accidental>/.test(m4) && m4.includes('<accidental>natural</accidental>'));
  T.ok('MusicXML bar 4: the F of 2400 ticks is tied (half + eighth or so)', m4.includes('<tie type="start"/>') && m4.includes('<tied type="stop"/>'));
  mel.clef = 'treble8';
  T.ok('MusicXML: tenor clef (treble 8 below)', TC.musicxml.build(doc).includes('<clef-octave-change>-1</clef-octave-change>'));

  // sounds: the program decides the family of the synth, MIDI and MusicXML take the program
  T.eq('sound families', [0, 4, 16, 25, 29, 33, 48, 53, 56, 65, 73, 81, 89, 120].map(TC.soundFamily),
    ['piano', 'epiano', 'organ', 'guitar', 'dist', 'bass', 'strings', 'voice', 'brass', 'reed', 'flute', 'lead', 'pad', 'voice']);
  T.eq('every offered sound has a family and a name', TC.MELODY_SOUNDS.every(([, , l]) => l.every(([p, en, dname]) => TC.soundFamily(p) && en && dname)), true);
  T.eq('sound names (a program not offered: its number)', [TC.soundName(0, true), TC.soundName(33, false), TC.soundName(11, true)], ['Klavier', 'Electric bass', 'Programm 12']);
  mel.program = 0;
  T.eq('MIDI: the chosen sound as program change', TC.midi.read(TC.midi.build(doc, null, { tracks: [mel], multi: true }).bytes).tracks[1].programs, [{ t: 0, ch: 0, program: 0 }]);
  T.ok('MusicXML: the chosen sound', TC.musicxml.build(doc).includes('<midi-program>1</midi-program>'));
};
