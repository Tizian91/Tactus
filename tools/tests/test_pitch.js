'use strict';
// Pitches (pitch.js): scales and their lines, key signatures, spelling, accidentals in a bar, clefs, names.
module.exports = function (T) {
  const TC = T.load(['state.js', 'pitch.js']);
  const P = TC.pitch;
  const sc = (name, id) => {
    const l = 'CDEFGAB'.indexOf(name[0]), a = name.slice(1) === '#' ? 1 : name.slice(1) === 'b' ? -1 : 0;
    return { l, a, id };
  };
  const lines = (s) => P.lineMap(s).map((x, l) => P.name(l, x.a, false) + (x.in ? '' : '(pale)')).join(' ');

  // lines: which tone each letter means
  T.eq('C major: the white keys', lines(sc('C', 'major')), 'C D E F G A B');
  T.eq('A harmonic minor: G♯', lines(sc('A', 'harmMinor')), 'C D E F G♯ A B');
  T.eq('D dorian: no sharps', lines(sc('D', 'dorian')), 'C D E F G A B');
  T.eq('C major pentatonic: F and B pale', lines(sc('C', 'pentaMajor')), 'C D E F(pale) G A B(pale)');
  T.eq('A minor pentatonic: B and F pale', lines(sc('A', 'pentaMinor')), 'C D E F(pale) G A B(pale)');
  T.eq('C blues: lines of C minor, D and A♭ pale (G♭ is a flat by hand)', lines(sc('C', 'blues')), 'C D(pale) E♭ F G A♭(pale) B♭');
  T.eq('C whole tone: B pale', lines(sc('C', 'wholeTone')), 'C D E F♯ G♯ A♯ B(pale)');
  T.eq('C chromatic: nothing pale', lines(sc('C', 'chromatic')), 'C D E F G A B');
  T.eq('C altered: F♭ on the F line', lines(sc('C', 'altered')), 'C D♭ E♭ F♭ G♭ A♭ B♭');
  T.eq('C in-sen: lines of C phrygian', lines(sc('C', 'inSen')), 'C D♭ E♭(pale) F G A♭(pale) B♭');

  // key signatures
  const fifths = (n, id) => P.fifths(sc(n, id));
  T.eq('major keys: G 1♯, F 1♭, E♭ 3♭, B 5♯', [fifths('G', 'major'), fifths('F', 'major'), fifths('Eb', 'major'), fifths('B', 'major')], [1, -1, -3, 5]);
  T.eq('minor keys: A 0, E 1♯, C 3♭', [fifths('A', 'minor'), fifths('E', 'minor'), fifths('C', 'minor')], [0, 1, -3]);
  T.eq('modes: the parent major key (D dorian 0, E phrygian 0, F lydian 0, G mixolydian 0, A dorian 1♯)',
    [fifths('D', 'dorian'), fifths('E', 'phrygian'), fifths('F', 'lydian'), fifths('G', 'mixolydian'), fifths('A', 'dorian')], [0, 0, 0, 0, 1]);
  T.eq('harmonic / melodic minor: the minor key (A: none, C: 3♭)', [fifths('A', 'harmMinor'), fifths('A', 'melMinor'), fifths('C', 'harmMinor')], [0, 0, -3]);
  T.eq('pentatonic / blues: of their 7-tone scale', [fifths('G', 'pentaMajor'), fifths('E', 'pentaMinor'), fifths('A', 'blues')], [1, 1, 0]);
  T.eq('E phrygian dominant: A minor signature (G♯ at the notes)', fifths('E', 'phrygDom'), 0);
  T.eq('C harmonic major: C major (A♭ at the notes)', fifths('C', 'harmMajor'), 0);
  T.eq('signature order: 3♯ F C G, 2♭ B E', [P.signature(3).map((x) => P.name(x.l, x.a)), P.signature(-2).map((x) => P.name(x.l, x.a))], [['F♯', 'C♯', 'G♯'], ['B♭', 'E♭']]);

  // roots spelled
  const root = (pc, id) => { const r = P.bestRoot(pc, id); return P.name(r.l, r.a); };
  T.eq('black keys: D♭ major, C♯ minor, F♯ major or G♭, E♭ minor, B♭ major', [root(1, 'major'), root(1, 'minor'), root(3, 'minor'), root(10, 'major')], ['D♭', 'C♯', 'E♭', 'B♭']);
  T.eq('G♯ minor (not A♭ minor), A♭ major', [root(8, 'minor'), root(8, 'major')], ['G♯', 'A♭']);

  // spelling
  const sp = (pitch, s) => { const x = P.spell(pitch, s); return P.fullName(x.dia, x.a); };
  T.eq('middle C is C4, A4 = 69', [sp(60, sc('C', 'major')), sp(69, sc('C', 'major'))], ['C4', 'A4']);
  T.eq('in A harmonic minor 68 is G♯4', sp(68, sc('A', 'harmMinor')), 'G♯4');
  T.eq('outside the scale: sharp keys sharps, flat keys flats', [sp(61, sc('G', 'major')), sp(61, sc('F', 'major'))], ['C♯4', 'D♭4']);
  T.eq('C blues: the blue note is G♭', sp(66, sc('C', 'blues')), 'G♭4');
  T.eq('the plainest sign first: F in D major (not E♯), B in F major (not C♭)', [sp(65, sc('D', 'major')), sp(71, sc('F', 'major'))], ['F4', 'B4']);
  T.eq('B♯ / C♭ across the octave: C♭5 = 71 in G♭ major', sp(71, sc('Gb', 'major')), 'C♭5');
  T.eq('own spelling of a note wins', P.noteSpell({ pitch: 61, dia: 29 }, sc('C', 'major')), { dia: 29, a: -1 });
  T.eq('own spelling that does not fit: from the scale', P.noteSpell({ pitch: 61, dia: 33 }, sc('C', 'major')), { dia: 28, a: 1 });
  T.eq('line tone: F line in G major = F♯4', P.lineTone(31, sc('G', 'major')), { pitch: 66, dia: 31, a: 1, in: true });

  // accidentals in a bar (C major): F♯ F♯ F ; in G major: F (natural) ; A harmonic minor: G♯ twice
  T.eq('a sign holds to the bar end, natural when it goes back', P.accidentals([{ dia: 31, a: 1 }, { dia: 31, a: 1 }, { dia: 31, a: 0 }], 0), [1, null, 0]);
  T.eq('another octave needs its own sign', P.accidentals([{ dia: 31, a: 1 }, { dia: 38, a: 1 }], 0), [1, 1]);
  T.eq('key signature: F♯ plain, F natural signed', P.accidentals([{ dia: 31, a: 1 }, { dia: 38, a: 0 }], 1), [null, 0]);
  T.eq('tied on from before: no sign', P.accidentals([{ dia: 32, a: 1, cont: true }, { dia: 32, a: 1 }], 0), [null, null]);

  // clefs
  T.eq('treble: top line F5, E4 bottom, middle C one ledger line below', [P.lineOf(38, 'treble'), P.lineOf(30, 'treble'), P.lineOf(28, 'treble')], [0, 8, 10]);
  T.eq('bass: top line A3, bottom G2, middle C one ledger above', [P.lineOf(26, 'bass'), P.lineOf(18, 'bass'), P.lineOf(28, 'bass')], [0, 8, -2]);
  T.eq('tenor (treble 8 below): C4 sounds, written as C5 (line 3)', P.lineOf(28, 'treble8'), 3);
  T.eq('diaAt is the way back', [P.diaAt(3, 'treble8'), P.diaAt(10, 'treble'), P.diaAt(-2, 'bass')], [28, 28, 28]);

  // names
  T.eq('German names', [P.name(3, 1, true), P.name(2, -1, true), P.name(5, -1, true), P.name(6, -1, true), P.name(6, 0, true), P.name(1, -1, true)], ['Fis', 'Es', 'As', 'B', 'H', 'Des']);
  T.eq('scale names', [P.scaleName(sc('D', 'dorian'), true), P.scaleName(sc('A', 'harmMinor'), false)], ['D-Dorisch', 'A Harmonic minor']);
  T.eq('clean scale: bad parts become C major', [P.cleanScale(null), P.cleanScale({ l: 4, a: 1, id: 'nope' })], [{ l: 0, a: 0, id: 'major' }, { l: 4, a: 1, id: 'major' }]);
};
