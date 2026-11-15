'use strict';
// Chords (pitch.js): scale-degree chords of every kind of scale, names, typing a chord, voicing.
module.exports = function (T) {
  const TC = T.load(['state.js', 'pitch.js']);
  const P = TC.pitch;
  const sc = (name, id) => {
    const l = 'CDEFGAB'.indexOf(name[0]), a = name.slice(1) === '#' ? 1 : name.slice(1) === 'b' ? -1 : 0;
    return { l, a, id };
  };
  const names = (s, sev, de) => P.degreeChords(s, sev).map((c) => P.chordName(c, de)).join(' ');
  const romans = (s, sev) => P.degreeChords(s, sev).map((c) => c.roman).join(' ');

  // triads
  T.eq('C major: C Dm Em F G Am B°', names(sc('C', 'major')), 'C Dm Em F G Am B°');
  T.eq('C major: I ii iii IV V vi vii°', romans(sc('C', 'major')), 'I ii iii IV V vi vii°');
  T.eq('A minor: Am B° C Dm Em F G', names(sc('A', 'minor')), 'Am B° C Dm Em F G');
  T.eq('minor: i ii° ♭III iv v ♭VI ♭VII', romans(sc('A', 'minor')), 'i ii° ♭III iv v ♭VI ♭VII');
  T.eq('D major: D Em F♯m G A Bm C♯°', names(sc('D', 'major')), 'D Em F♯m G A Bm C♯°');
  T.eq('A harmonic minor: augmented III, major V', names(sc('A', 'harmMinor')), 'Am B° C+ Dm E F G♯°');
  T.eq('E phrygian: F on ♭II', romans(sc('E', 'phrygian')).split(' ')[1], '♭II');
  T.eq('G mixolydian: F on ♭VII', names(sc('G', 'mixolydian')), 'G Am B° C Dm Em F');
  T.eq('E♭ major: flats', names(sc('Eb', 'major')), 'E♭ Fm Gm A♭ B♭ Cm D°');

  // sevenths
  T.eq('C major sevenths', names(sc('C', 'major'), true), 'Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7♭5');
  T.eq('romans of sevenths', romans(sc('C', 'major'), true), 'Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7');
  T.eq('A harmonic minor sevenths: m(maj7), +maj7, °7', names(sc('A', 'harmMinor'), true), 'Am(maj7) Bm7♭5 C+maj7 Dm7 E7 Fmaj7 G♯°7');

  // fewer tones, blues, whole tone, chromatic
  const pm = P.degreeChords(sc('A', 'pentaMinor'));
  T.eq('A minor pentatonic: the chords of A minor', pm.map((c) => P.chordName(c)).join(' '), 'Am B° C Dm Em F G');
  T.eq('… only Am and C are made of its own tones', pm.filter((c) => c.inScale).map((c) => P.chordName(c)), ['Am', 'C']);
  T.ok('pentatonic borrows chords, blues does not', P.borrowsChords(sc('A', 'pentaMinor')) && !P.borrowsChords(sc('A', 'blues')));
  T.eq('A blues: A7 D7 E7', names(sc('A', 'blues')), 'A7 D7 E7');
  T.eq('blues romans I7 IV7 V7', romans(sc('A', 'blues')), 'I7 IV7 V7');
  T.eq('C major blues: C7 F7 G7', names(sc('C', 'bluesMajor')), 'C7 F7 G7');
  T.eq('C whole tone: augmented only', names(sc('C', 'wholeTone')), 'C+ D+ E+ F♯+ G♯+ A♯+');
  T.eq('chromatic: the chords of major on the root', names(sc('G', 'chromatic')), 'G Am Bm C D Em F♯°');
  const hu = P.degreeChords(sc('C', 'hungMinor'));
  T.eq('Hungarian minor: (♭5) on II, an odd chord keeps its tones', [P.chordName(hu[1]), hu[3].q, hu[3].iv], ['D(♭5)', null, [0, 2, 6]]);
  T.ok('every scale gives chords without crashing', P.SCALES.every((s) => P.degreeChords({ l: 2, a: -1, id: s.id }, true).length >= 3));

  // names
  T.eq('German: H, and B for B♭', [P.chordName({ root: { l: 6, a: 0 }, q: 'm' }, true), P.chordName({ root: { l: 6, a: -1 }, q: 'maj' }, true), P.chordName({ root: { l: 6, a: -1 }, q: 'maj' }, false)], ['Hm', 'B', 'B♭']);
  T.eq('G major in German: … H m', names(sc('G', 'major'), false, true), 'G Am Hm C D Em F♯°');
  T.eq('slash chord', P.chordName({ root: { l: 0, a: 0 }, q: 'maj', bass: { l: 4, a: 0 } }), 'C/G');

  // typing
  const p = (s, de) => { const c = P.parseChord(s, de); return c ? P.chordText(c) : null; };
  T.eq('typed: Am F#m7 Bb Cmaj7 G7 Dsus4', ['Am', 'F#m7', 'Bb', 'Cmaj7', 'G7', 'Dsus4'].map((s) => p(s)), ['Am', 'F#m7', 'Bb', 'Cmaj7', 'G7', 'Dsus4']);
  T.eq('aliases: CΔ7, C-7, Cø, Cdim, C+, Cmin', ['CΔ7', 'C-7', 'Cø', 'Cdim', 'C+', 'Cmin'].map((s) => P.parseChord(s).q), ['maj7', 'm7', 'm7b5', 'dim', 'aug', 'm']);
  T.eq('♯ / ♭ signs and slash chords', [p('F♯m'), p('E♭/G'), p('C/E')], ['F#m', 'Eb/G', 'C/E']);
  T.eq('German roots: H, B = B♭, Fis, Es, As', ['H7', 'B', 'Fism', 'Es', 'As'].map((s) => p(s, true)), ['B7', 'Bb', 'F#m', 'Eb', 'Ab']);
  T.eq('English: B is B', p('B', false), 'B');
  T.eq('unknown suffix: kept, sounds like the known start', [p('C7#9'), P.parseChord('C7#9').q, P.chordName(P.parseChord('C7#9'))], ['C7#9', '7', 'C7♯9']);
  T.eq('no root: null', [P.parseChord('xyz'), P.parseChord('')], [null, null]);
  T.eq('text and back is the same chord', P.chordText(P.parseChord(P.chordText(P.parseChord('Bbm7b5/Ab')))), 'Bbm7b5/Ab');

  // sound
  T.eq('C: bass C2, tones G3 C4 E4', P.chordVoicing(P.parseChord('C')), { bass: 36, tones: [55, 60, 64] });
  T.eq('Am/G: bass G2', P.chordVoicing(P.parseChord('Am/G')).bass, 43);
  T.eq('chord tones', P.chordPcs(P.parseChord('G7')), [7, 11, 2, 5]);

  // writing a melody with chords: tones spelled, marked, locked, the nearest chord tone
  const tones = (s) => P.chordTones(P.parseChord(s)).map((x) => P.name(x.l, x.a)).join(' ');
  T.eq('chord tones spelled: E7 = E G♯ B D, B°7 = B D F A♭, Dm/C adds C', [tones('E7'), tones('Bdim7'), tones('Dm/C')], ['E G♯ B D', 'B D F A♭', 'D F A C']);
  const am = { l: 5, a: 0, id: 'minor' }, e7 = P.parseChord('E7');
  T.eq('mark: G line in A minor stays G, not a chord tone of E7', [P.guideTone(32, am, e7, 'mark').pitch, P.guideTone(32, am, e7, 'mark').chord], [67, false]);
  T.eq('lock: G line writes G♯ (chord tone of E7)', [P.guideTone(32, am, e7, 'lock').pitch, P.guideTone(32, am, e7, 'lock').chord], [68, true]);
  T.eq('lock: A line is no chord tone of E7', P.guideTone(33, am, e7, 'lock').chord, false);
  T.eq('off: just the scale', P.guideTone(32, am, e7, 'off'), { pitch: 67, dia: 32, a: 0, in: true, chord: false });
  T.eq('the root: every E line is marked as root of E7, the third (G♯) is not', [P.guideTone(30, am, e7, 'mark').root, P.guideTone(37, am, e7, 'mark').root, P.guideTone(23, am, e7, 'lock').root, P.guideTone(32, am, e7, 'lock').root, P.guideTone(33, am, e7, 'mark').root], [true, true, true, false, false]);
  const isC = (l) => [0, 2, 4].includes(((l % 7) + 7) % 7); // lines 0, 2, 4, 7 … hold chord tones
  T.eq('nearest chord tone: on one; one step off; equally near: the lower, or from the side it comes from',
    [P.lockedLine(2, isC), P.lockedLine(5, isC), P.lockedLine(3, isC), P.lockedLine(3, isC, 1), P.lockedLine(3, isC, 6)], [2, 4, 4, 2, 4]);
};
