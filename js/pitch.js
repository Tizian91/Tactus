'use strict';
/*
 * Pitches for melody tracks: scales, how a note is spelled (C♯ or D♭), key signatures, clefs.
 * Pure functions without the DOM (tested in tools/tests/test_pitch.js).
 *
 * Words used here:
 *   pitch   MIDI note number of the sound (60 = middle C, C4)
 *   letter  0 … 6 = C D E F G A B (German: H)
 *   alter   -2 … 2: flats (−) or sharps (+) on that letter
 *   dia     diatonic number: octave * 7 + letter (C4 = 28); the place on the staff
 *   scale   { l, a, id }: root (letter and alter) and the kind of scale (P.SCALES)
 *
 * The scale says which tone a line (or space) of the staff means - it locks nothing: a tap on a
 * line writes the tone of the scale there, leaving the scale is a sharp / flat by hand.
 *   - scales with 7 tones: every line holds one tone of the scale
 *   - fewer tones (pentatonic, blues, Japanese scales): the lines of a related 7-tone scale; the lines
 *     outside the scale are marked ("pale") but still write their tone; blues: the blue note (G♭ in C)
 *     shares the line of G - it is a flat by hand
 *   - whole tone: C D E F♯ G♯ A♯, the B line is pale
 * The key signature drawn is always a usual one (P.fifths): the one that needs the fewest
 * accidentals at the notes, the major / minor key of the root preferred. What it lacks (A harmonic
 * minor: G♯) is written at the note.
 */
(function (TC) {
  const P = (TC.pitch = {});
  const NAT = (P.NAT = [0, 2, 4, 5, 7, 9, 11]); // semitones of C D E F G A B
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const mod = (n, m) => ((n % m) + m) % m;

  /**
   * The scales. iv: semitones above the root. parent: the 7-tone scale whose lines (and chords) a
   * scale with fewer tones uses. lines: own line map (whole tone). free: every line in the scale.
   */
  P.SCALES = [
    { id: 'major', group: 'common', iv: [0, 2, 4, 5, 7, 9, 11], en: 'Major', de: 'Dur', alias: ['Ionian', 'Ionisch'] },
    { id: 'minor', group: 'common', iv: [0, 2, 3, 5, 7, 8, 10], en: 'Minor (natural)', de: 'Moll (natürlich)', alias: ['Aeolian', 'Äolisch'] },
    { id: 'pentaMajor', group: 'common', iv: [0, 2, 4, 7, 9], parent: 'major', en: 'Major pentatonic', de: 'Dur-Pentatonik' },
    { id: 'pentaMinor', group: 'common', iv: [0, 3, 5, 7, 10], parent: 'minor', en: 'Minor pentatonic', de: 'Moll-Pentatonik' },
    { id: 'blues', group: 'common', iv: [0, 3, 5, 6, 7, 10], parent: 'minor', chords: 'blues', en: 'Blues', de: 'Blues' },
    { id: 'harmMinor', group: 'minor', iv: [0, 2, 3, 5, 7, 8, 11], en: 'Harmonic minor', de: 'Harmonisch Moll', desc: ['classical, "oriental" step', 'klassisch, „orientalischer“ Sprung'] },
    { id: 'melMinor', group: 'minor', iv: [0, 2, 3, 5, 7, 9, 11], en: 'Melodic minor', de: 'Melodisch Moll', desc: ['jazz, soft', 'Jazz, weich'] },
    { id: 'dorian', group: 'modes', iv: [0, 2, 3, 5, 7, 9, 10], en: 'Dorian', de: 'Dorisch', desc: ['minor with a bright sixth', 'Moll mit heller Sexte'] },
    { id: 'phrygian', group: 'modes', iv: [0, 1, 3, 5, 7, 8, 10], en: 'Phrygian', de: 'Phrygisch', desc: ['dark, Spanish, metal', 'dunkel, spanisch, Metal'], alias: ['Spanish', 'Spanisch'] },
    { id: 'lydian', group: 'modes', iv: [0, 2, 4, 6, 7, 9, 11], en: 'Lydian', de: 'Lydisch', desc: ['floating, film music', 'schwebend, Filmmusik'] },
    { id: 'mixolydian', group: 'modes', iv: [0, 2, 4, 5, 7, 9, 10], en: 'Mixolydian', de: 'Mixolydisch', desc: ['rock, blues rock', 'Rock, Blues-Rock'] },
    { id: 'locrian', group: 'modes', iv: [0, 1, 3, 5, 6, 8, 10], en: 'Locrian', de: 'Lokrisch', desc: ['very unstable', 'sehr instabil'] },
    { id: 'bluesMajor', group: 'more', iv: [0, 2, 3, 4, 7, 9], parent: 'major', chords: 'blues', en: 'Major blues', de: 'Dur-Blues', desc: ['country, boogie', 'Country, Boogie'] },
    { id: 'phrygDom', group: 'more', iv: [0, 1, 4, 5, 7, 8, 10], en: 'Phrygian dominant', de: 'Phrygisch-Dominant', desc: ['flamenco, klezmer, metal', 'Flamenco, Klezmer, Metal'], alias: ['Spanish', 'Spanisch'] },
    { id: 'harmMajor', group: 'more', iv: [0, 2, 4, 5, 7, 8, 11], en: 'Harmonic major', de: 'Harmonisch Dur', desc: ['major with a minor colour', 'Dur mit Moll-Färbung'] },
    { id: 'lydDom', group: 'more', iv: [0, 2, 4, 6, 7, 9, 10], en: 'Lydian dominant', de: 'Lydisch-Dominant', desc: ['jazz', 'Jazz'], alias: ['Acoustic', 'Akustisch'] },
    { id: 'hungMinor', group: 'more', iv: [0, 2, 3, 6, 7, 8, 11], en: 'Hungarian minor', de: 'Ungarisch Moll', desc: ['gypsy minor', 'Zigeunermoll'], alias: ['Gypsy minor', 'Zigeunermoll'] },
    { id: 'doubleHarm', group: 'more', iv: [0, 1, 4, 5, 7, 8, 11], en: 'Double harmonic', de: 'Doppelt harmonisch', desc: ['Arabic, Byzantine', 'arabisch, byzantinisch'], alias: ['Arabic', 'Arabisch', 'Byzantine', 'Byzantinisch'] },
    { id: 'altered', group: 'more', iv: [0, 1, 3, 4, 6, 8, 10], en: 'Altered', de: 'Alteriert', desc: ['jazz over dominants', 'Jazz über Dominanten'], alias: ['Super Locrian', 'Superlokrisch'] },
    { id: 'wholeTone', group: 'more', iv: [0, 2, 4, 6, 8, 10], lines: [0, 2, 4, 6, 8, 10, 11], en: 'Whole tone', de: 'Ganzton', desc: ['dreamlike, Debussy', 'traumartig, Debussy'] },
    { id: 'hirajoshi', group: 'more', iv: [0, 2, 3, 7, 8], parent: 'minor', en: 'Hirajoshi', de: 'Hirajoshi', desc: ['Japanese', 'japanisch'] },
    { id: 'inSen', group: 'more', iv: [0, 1, 5, 7, 10], parent: 'phrygian', en: 'In-Sen', de: 'In-Sen', desc: ['Japanese', 'japanisch'] },
    { id: 'chromatic', group: 'chromatic', iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], parent: 'major', free: true, en: 'Chromatic (free)', de: 'Chromatisch (frei)' },
  ];
  P.GROUPS = [['common', 'Common', 'Häufig'], ['minor', 'Minor variants', 'Moll-Varianten'], ['modes', 'Church modes', 'Kirchentonarten'],
    ['more', 'More', 'Weitere'], ['chromatic', 'Chromatic', 'Chromatisch']];
  const byId = new Map(P.SCALES.map((s) => [s.id, s]));
  P.scaleById = (id) => byId.get(id) || byId.get('major');

  P.DEFAULT_SCALE = { l: 0, a: 0, id: 'major' };
  /** A valid scale { l, a, id } from anything (default C major). */
  P.cleanScale = function (s) {
    if (!s || typeof s !== 'object') return Object.assign({}, P.DEFAULT_SCALE);
    const l = Number.isInteger(s.l) && s.l >= 0 && s.l <= 6 ? s.l : 0;
    const a = [-1, 0, 1].includes(s.a) ? s.a : 0;
    return { l, a, id: byId.has(s.id) ? s.id : 'major' };
  };

  /** Pitch class (0 … 11) of a letter with alter. */
  P.pc = (l, a) => mod(NAT[l] + a, 12);
  /** Sounding pitch of a place on the staff (dia) with an alter. */
  P.pitchOf = (dia, a = 0) => (Math.floor(dia / 7) + 1) * 12 + NAT[mod(dia, 7)] + a;
  /** The dia of a letter in the octave of `pitch` (the one that fits with alter a), or null. */
  function diaFor(pitch, l, a) {
    const o = (pitch - NAT[l] - a) / 12 - 1;
    return Number.isInteger(o) ? o * 7 + l : null;
  }
  /** -6 … 5 -> the alter closest to 0 (a pitch class difference). */
  const near = (d) => { d = mod(d, 12); return d > 6 ? d - 12 : d; };

  /**
   * The line map of a scale: for each letter (C … B) the alter of the tone its lines mean and whether
   * that tone is in the scale: [{ a, in }] × 7.
   */
  P.lineMap = function (scale) {
    const s = P.scaleById(scale.id), rootPc = P.pc(scale.l, scale.a);
    const pcs = new Set(s.iv.map((i) => mod(rootPc + i, 12)));
    const lines = s.lines || (s.iv.length === 7 ? s.iv : P.scaleById(s.parent).iv);
    const out = Array(7);
    lines.forEach((iv, k) => {
      const l = (scale.l + k) % 7, pc = mod(rootPc + iv, 12);
      out[l] = { a: near(pc - NAT[l]), in: s.free || pcs.has(pc) };
    });
    return out;
  };
  /** Pitch classes of a scale. */
  P.pcs = (scale) => new Set(P.scaleById(scale.id).iv.map((i) => mod(P.pc(scale.l, scale.a) + i, 12)));

  // ---- Key signatures (fifths: −7 … 7, flats negative) -----------------------------------------

  const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3]; // F C G D A E B / B E A D G C F
  /** Alter of a letter in a key signature. */
  P.sigAlter = (fifths, l) => (fifths > 0 ? (SHARPS.indexOf(l) < fifths ? 1 : 0) : fifths < 0 ? (FLATS.indexOf(l) < -fifths ? -1 : 0) : 0);
  /** The letters of a key signature in the order they are written: [{ l, a }]. */
  P.signature = (fifths) => (fifths > 0 ? SHARPS.slice(0, fifths).map((l) => ({ l, a: 1 })) : FLATS.slice(0, -fifths).map((l) => ({ l, a: -1 })));
  /** Fifths of the major key on a root. */
  P.majorFifths = (l, a) => [0, 2, 4, -1, 1, 3, 5][l] + 7 * a;
  /** Is the third of a scale major (the major key on its root is its own) - else minor. */
  P.majorThird = (scale) => {
    const iv = P.scaleById(scale.id).iv;
    return iv.includes(4) && !iv.includes(3);
  };
  /** The key signature of the root's own major / minor key. */
  P.homeFifths = (scale) => (P.majorThird(scale) ? P.majorFifths(scale.l, scale.a) : P.majorFifths(scale.l, scale.a) - 3);

  /**
   * The key signature drawn for a scale: the usual one (−7 … 7) that needs the fewest accidentals
   * at the notes; the major / minor key of the root counts as 1.5 accidentals better (A melodic
   * minor: no sharps, F♯ and G♯ at the notes), then the smaller one.
   */
  P.fifths = function (scale) {
    const lm = P.lineMap(scale), home = P.homeFifths(scale);
    const misses = (f) => lm.filter((x, l) => x.a !== P.sigAlter(f, l)).length;
    for (let f = -7; f <= 7; f++) if (!misses(f)) return f; // a key signature that fits exactly (church modes: the parent key)
    let best = 0, bc = Infinity;
    for (let f = -7; f <= 7; f++) {
      const c = (f === home ? 0 : 1.5) + misses(f);
      if (c < bc || (c === bc && Math.abs(f) < Math.abs(best))) {
        bc = c;
        best = f;
      }
    }
    return best;
  };

  /**
   * The root spelled best for a pitch class and a kind of scale (D♭ major, but C♯ minor): no double
   * sharps / flats on the lines, then the smallest key signature. { l, a }.
   */
  P.bestRoot = function (pc, id) {
    const options = [];
    for (let l = 0; l < 7; l++) {
      const a = near(pc - NAT[l]);
      if (Math.abs(a) <= 1) options.push({ l, a });
    }
    let best = null, bc = Infinity;
    for (const r of options) {
      const sc = { l: r.l, a: r.a, id };
      const dbl = P.lineMap(sc).filter((x) => Math.abs(x.a) > 1).length;
      const c = dbl * 100 + Math.abs(P.fifths(sc)) * 2 + (r.a > 0 ? 1 : 0); // a tie: flats (E♭ minor, G♭ major)
      if (c < bc) {
        bc = c;
        best = r;
      }
    }
    return best;
  };

  // ---- Spelling ----------------------------------------------------------------------------------

  /**
   * How a pitch is written in a scale: { dia, a }. A tone of a line: that line. Else a sharp on the
   * line below or a flat on the line above (sharp keys: sharps, flat keys: flats). prefer: 1 sharp,
   * -1 flat.
   */
  P.spell = function (pitch, scale, prefer) {
    const lm = P.lineMap(scale), pc = mod(pitch, 12);
    for (let l = 0; l < 7; l++) {
      if (P.pc(l, lm[l].a) === pc) return { dia: diaFor(pitch, l, lm[l].a), a: lm[l].a };
    }
    // the plainest sign first (F natural in D major, not E♯), then the direction (sharp keys: sharps)
    const dir = prefer || (P.fifths(scale) >= 0 ? 1 : -1);
    let best = null;
    for (const want of [dir, -dir]) {
      for (let l = 0; l < 7; l++) {
        const a = lm[l].a + want;
        if (Math.abs(a) <= 2 && P.pc(l, a) === pc && (!best || Math.abs(a) < Math.abs(best.a))) best = { dia: diaFor(pitch, l, a), a };
      }
    }
    if (best) return best;
    for (let l = 0; l < 7; l++) { // (should not be needed)
      const a = near(pc - NAT[l]);
      if (Math.abs(a) <= 1) return { dia: diaFor(pitch, l, a), a };
    }
    return { dia: diaFor(pitch, 0, 0), a: 0 };
  };
  /** The spelling of a note: its own (note.dia), if it fits its pitch, else from the scale. */
  P.noteSpell = function (n, scale) {
    if (Number.isInteger(n.dia)) {
      const a = n.pitch - P.pitchOf(n.dia, 0);
      if (Math.abs(a) <= 2) return { dia: n.dia, a };
    }
    return P.spell(n.pitch, scale);
  };
  /** The other ways to write a pitch (F♯ -> G♭; C -> B♯, D♭♭), the plainest first: [{ dia, a }]. */
  P.enharmonics = function (pitch, dia) {
    const out = [];
    for (const d of [dia - 1, dia + 1, dia - 2, dia + 2]) {
      const a = pitch - P.pitchOf(d, 0);
      if (Math.abs(a) <= 2) out.push({ dia: d, a });
    }
    return out.sort((x, y) => Math.abs(x.a) - Math.abs(y.a));
  };
  /** Sharpen / flatten a spelled note by `by` semitones on its own line (at most a double sharp / flat): { pitch, dia } or null. */
  P.alter = function (sp, by) {
    const a = sp.a + by;
    return Math.abs(a) > 2 ? null : { pitch: P.pitchOf(sp.dia, a), dia: sp.dia };
  };

  /** The tone a place of the staff means in a scale: { pitch, dia, a, in }. */
  P.lineTone = function (dia, scale) {
    const x = P.lineMap(scale)[mod(dia, 7)];
    return { pitch: P.pitchOf(dia, x.a), dia, a: x.a, in: x.in };
  };

  /**
   * Accidentals of the notes of one bar, in time order: [{ dia, a, cont }] -> the sign each needs
   * (2, 1, 0 = natural, -1, -2) or null. A sign holds for its line up to the end of the bar; the
   * key signature holds for every octave. cont: tied on from before (no sign, it keeps its alter).
   */
  P.accidentals = function (list, fifths) {
    const now = new Map();
    return list.map((x) => {
      const cur = now.has(x.dia) ? now.get(x.dia) : P.sigAlter(fifths, mod(x.dia, 7));
      now.set(x.dia, x.a);
      return x.cont || cur === x.a ? null : x.a;
    });
  };

  /**
   * The notes of one bar of a melody track as written: list [{ tick, cont, n }] (any order) ->
   * { spell: note id -> { dia, a, line }, acc: "tick:note id" -> the sign written (or nothing) }.
   */
  P.spellBar = function (list, scale, clef) {
    const fifths = P.fifths(scale), spell = new Map(), acc = new Map();
    const sorted = list.slice().sort((x, y) => x.tick - y.tick);
    const marks = sorted.map(({ cont, n }) => {
      let s = spell.get(n.id);
      if (!s) {
        s = P.noteSpell(n, scale);
        s.line = P.lineOf(s.dia, clef);
        spell.set(n.id, s);
      }
      return { dia: s.dia, a: s.a, cont: !!cont };
    });
    P.accidentals(marks, fifths).forEach((a, k) => { if (a !== null) acc.set(sorted[k].tick + ':' + sorted[k].n.id, a); });
    return { spell, acc, fifths };
  };

  // ---- Names ---------------------------------------------------------------------------------

  const DE = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];
  /** Name of a letter with alter: "F♯" / German "Fis", "B♭" / "B", "E♭" / "Es". */
  P.name = function (l, a, de) {
    if (!de) return LETTERS[l] + (a > 0 ? '♯'.repeat(a) : a < 0 ? '♭'.repeat(-a) : '');
    if (l === 6 && a === -1) return 'B';
    if (l === 6 && a === -2) return 'Heses';
    const base = DE[l];
    if (a > 0) return base + 'is'.repeat(a);
    if (a < 0) return (l === 2 || l === 5 ? base + 's' + 'es'.repeat(-a - 1) : base + 'es'.repeat(-a));
    return base;
  };
  /** Name with octave (scientific: C4 = middle C). */
  P.fullName = (dia, a, de) => P.name(mod(dia, 7), a, de) + (Math.floor(dia / 7));
  /** Name of a scale ("D Dorian" / "D-Dorisch"). */
  P.scaleName = function (scale, de) {
    const s = P.scaleById(scale.id), root = P.name(scale.l, scale.a, de);
    return de ? `${root}-${s.de}` : `${root} ${s.en}`;
  };
  /** The 12 roots offered: [pc, label]. */
  P.ROOTS = [[0, 'C'], [1, 'C♯ / D♭'], [2, 'D'], [3, 'D♯ / E♭'], [4, 'E'], [5, 'F'], [6, 'F♯ / G♭'], [7, 'G'], [8, 'G♯ / A♭'], [9, 'A'], [10, 'A♯ / B♭'], [11, 'B']];
  P.ROOTS_DE = [[0, 'C'], [1, 'Cis / Des'], [2, 'D'], [3, 'Dis / Es'], [4, 'E'], [5, 'F'], [6, 'Fis / Ges'], [7, 'G'], [8, 'Gis / As'], [9, 'A'], [10, 'Ais / B'], [11, 'H']];

  // ---- Clefs and voices ----------------------------------------------------------------------

  /**
   * Clefs: top: dia of the top staff line as written; oct: written = sounding + oct (the tenor
   * clef - treble with an 8 below - sounds an octave lower); glyph and its line.
   */
  P.CLEFS = {
    treble: { top: 38, oct: 0, glyph: 0xe050, line: 6, en: 'Treble', de: 'Violinschlüssel' },
    treble8: { top: 38, oct: 7, glyph: 0xe052, line: 6, en: 'Treble 8 below (tenor)', de: 'Violin 8 unten (Tenor)' },
    bass: { top: 26, oct: 0, glyph: 0xe062, line: 2, en: 'Bass', de: 'Bassschlüssel' },
  };
  P.clef = (id) => P.CLEFS[id] || P.CLEFS.treble;
  /** Staff step (half spaces from the top line) of a written place. */
  P.lineOf = (dia, clef) => P.clef(clef).top - (dia + P.clef(clef).oct);
  /** The (sounding) dia at a staff step. */
  P.diaAt = (line, clef) => P.clef(clef).top - line - P.clef(clef).oct;

  /** Voices: range (sounding pitches) and clef. */
  P.VOICES = {
    soprano: { range: [60, 81], clef: 'treble', en: 'Soprano', de: 'Sopran' },
    alto: { range: [53, 74], clef: 'treble', en: 'Alto', de: 'Alt' },
    tenor: { range: [48, 69], clef: 'treble8', en: 'Tenor', de: 'Tenor' },
    baritone: { range: [43, 65], clef: 'bass', en: 'Baritone', de: 'Bariton' },
    bass: { range: [40, 62], clef: 'bass', en: 'Bass', de: 'Bass' },
  };
})(window.TC);
