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
   * The tone of a place while a chord sounds (writing a melody): guide 'mark' - the tone of the scale, chord: is it
   * a chord tone; 'lock' - a line of a chord tone's letter writes that chord tone (E7 in A minor: G♯ on the G line),
   * the other lines chord: false (P.lockedLine finds the nearest chord tone). { pitch, dia, a, in, chord }.
   */
  P.guideTone = function (dia, scale, ch, guide) {
    const t = P.lineTone(dia, scale);
    if (!ch || !guide || guide === 'off') return Object.assign(t, { chord: false });
    const root = P.pc(ch.root.l, ch.root.a); // (root: the tone the chord is built on - marked stronger)
    if (guide === 'lock') {
      const ct = P.chordTones(ch).find((x) => x.l === mod(dia, 7));
      if (!ct) return Object.assign(t, { chord: false });
      const pitch = P.pitchOf(dia, ct.a);
      return { pitch, dia, a: ct.a, in: true, chord: true, root: mod(pitch, 12) === root };
    }
    const chord = P.chordPcs(ch).includes(mod(t.pitch, 12));
    return Object.assign(t, { chord, root: chord && mod(t.pitch, 12) === root });
  };
  /**
   * Chords locked: the nearest line (staff step) with a chord tone to line l. Equally near: from - the line coming
   * from (dragging: the side it comes from), else the lower one. isChord(line) says whether a line holds one.
   */
  P.lockedLine = function (l, isChord, from) {
    if (isChord(l)) return l;
    for (let k = 1; k <= 7; k++) {
      const up = isChord(l - k), down = isChord(l + k);
      if (up && down) return from !== undefined && from < l ? l - k : l + k; // (larger steps are lower)
      if (up) return l - k;
      if (down) return l + k;
    }
    return l;
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
  /**
   * The name of a scale as written above the music ("d-Moll", "D-Dorisch", "In-Sen auf D" / "D minor", "D Dorian",
   * "In-Sen on D"); null for the free chromatic one (no scale to name).
   */
  P.scaleTitle = function (scale, de) {
    const s = P.scaleById(scale.id), root = P.name(scale.l, scale.a, de);
    if (s.free) return null;
    const minor = ['minor', 'harmMinor', 'melMinor'].includes(s.id), r = de && minor ? root.toLowerCase() : root; // (German: minor keys in small letters)
    const SHORT = { major: ['major', 'Dur'], minor: ['minor', 'Moll'], harmMinor: ['harmonic minor', 'Moll harmonisch'], melMinor: ['melodic minor', 'Moll melodisch'],
      harmMajor: ['harmonic major', 'Dur harmonisch'] };
    if (SHORT[s.id]) return de ? `${r}-${SHORT[s.id][1]}` : `${r} ${SHORT[s.id][0]}`;
    if (s.group === 'modes') return de ? `${r}-${s.de}` : `${r} ${s.en}`;
    return de ? `${s.de} auf ${r}` : `${s.en} on ${r}`;
  };
  /** The 12 roots offered: [pc, label]. */
  P.ROOTS = [[0, 'C'], [1, 'C♯ / D♭'], [2, 'D'], [3, 'D♯ / E♭'], [4, 'E'], [5, 'F'], [6, 'F♯ / G♭'], [7, 'G'], [8, 'G♯ / A♭'], [9, 'A'], [10, 'A♯ / B♭'], [11, 'B']];
  P.ROOTS_DE = [[0, 'C'], [1, 'Cis / Des'], [2, 'D'], [3, 'Dis / Es'], [4, 'E'], [5, 'F'], [6, 'Fis / Ges'], [7, 'G'], [8, 'Gis / As'], [9, 'A'], [10, 'Ais / B'], [11, 'H']];

  // ---- Chords ----------------------------------------------------------------------------------
  //
  // A chord: { root: { l, a }, q: quality id (P.QUALS), bass: { l, a } | null, sfx?: own suffix as typed }.
  // Scale-degree chords: on every degree of the scale the tones a third apart are stacked (every second
  // tone) - a triad, or with sev a seventh chord. Scales with fewer tones take the chords of their
  // 7-tone scale (and mark those made only of their own tones), blues: I7 · IV7 · V7, whole tone: C+ D+ …

  /**
   * Chord qualities: iv semitones above the root, sym as written after the root, xml: MusicXML <kind>
   * (deg: added / altered degrees [value, alter, type]), alias: how it may be typed (♭ / ♯ as b / #).
   */
  P.QUALS = [
    { id: 'maj', iv: [0, 4, 7], sym: '', xml: 'major', alias: ['', 'maj', 'M', 'dur'] },
    { id: 'm', iv: [0, 3, 7], sym: 'm', xml: 'minor', alias: ['m', 'min', 'mi', '-', 'moll'] },
    { id: 'dim', iv: [0, 3, 6], sym: '°', xml: 'diminished', alias: ['dim', '°', 'o'] },
    { id: 'aug', iv: [0, 4, 8], sym: '+', xml: 'augmented', alias: ['aug', '+', '#5', '(#5)'] },
    { id: 'b5', iv: [0, 4, 6], sym: '(♭5)', xml: 'major', deg: [[5, -1, 'alter']], alias: ['b5', '(b5)', '-5'] },
    { id: 'sus2', iv: [0, 2, 7], sym: 'sus2', xml: 'suspended-second', alias: ['sus2'] },
    { id: 'sus4', iv: [0, 5, 7], sym: 'sus4', xml: 'suspended-fourth', alias: ['sus4', 'sus'] },
    { id: '5', iv: [0, 7], sym: '5', xml: 'power', alias: ['5'] },
    { id: '7', iv: [0, 4, 7, 10], sym: '7', xml: 'dominant', alias: ['7', 'dom7'] },
    { id: 'maj7', iv: [0, 4, 7, 11], sym: 'maj7', xml: 'major-seventh', alias: ['maj7', 'M7', 'Δ', 'Δ7', 'j7', 'ma7'] },
    { id: 'm7', iv: [0, 3, 7, 10], sym: 'm7', xml: 'minor-seventh', alias: ['m7', 'min7', 'mi7', '-7'] },
    { id: 'm7b5', iv: [0, 3, 6, 10], sym: 'm7♭5', xml: 'half-diminished', alias: ['m7b5', 'ø', 'ø7', '-7b5', 'min7b5'] },
    { id: 'dim7', iv: [0, 3, 6, 9], sym: '°7', xml: 'diminished-seventh', alias: ['dim7', '°7', 'o7'] },
    { id: 'mMaj7', iv: [0, 3, 7, 11], sym: 'm(maj7)', xml: 'major-minor', alias: ['m(maj7)', 'mmaj7', 'mMaj7', 'm(M7)', 'mM7', '-maj7'] },
    { id: 'augMaj7', iv: [0, 4, 8, 11], sym: '+maj7', xml: 'major-seventh', deg: [[5, 1, 'alter']], alias: ['+maj7', 'augmaj7', 'maj7#5', 'maj7(#5)'] },
    { id: 'aug7', iv: [0, 4, 8, 10], sym: '+7', xml: 'augmented-seventh', alias: ['+7', 'aug7', '7#5', '7(#5)'] },
    { id: '7b5', iv: [0, 4, 6, 10], sym: '7♭5', xml: 'dominant', deg: [[5, -1, 'alter']], alias: ['7b5', '7(b5)'] },
    { id: 'maj7b5', iv: [0, 4, 6, 11], sym: 'maj7♭5', xml: 'major-seventh', deg: [[5, -1, 'alter']], alias: ['maj7b5', 'maj7(b5)'] },
    { id: '7sus4', iv: [0, 5, 7, 10], sym: '7sus4', xml: 'suspended-fourth', deg: [[7, -1, 'add']], alias: ['7sus4', '7sus'] },
    { id: '6', iv: [0, 4, 7, 9], sym: '6', xml: 'major-sixth', alias: ['6'] },
    { id: 'm6', iv: [0, 3, 7, 9], sym: 'm6', xml: 'minor-sixth', alias: ['m6', '-6'] },
    { id: 'add9', iv: [0, 4, 7, 14], sym: 'add9', xml: 'major', deg: [[9, 0, 'add']], alias: ['add9', 'add2', '(add9)'] },
    { id: 'madd9', iv: [0, 3, 7, 14], sym: 'madd9', xml: 'minor', deg: [[9, 0, 'add']], alias: ['madd9', 'm(add9)', 'madd2'] },
    { id: '9', iv: [0, 4, 7, 10, 14], sym: '9', xml: 'dominant-ninth', alias: ['9'] },
    { id: 'maj9', iv: [0, 4, 7, 11, 14], sym: 'maj9', xml: 'major-ninth', alias: ['maj9', 'M9', 'Δ9'] },
    { id: 'm9', iv: [0, 3, 7, 10, 14], sym: 'm9', xml: 'minor-ninth', alias: ['m9', '-9'] },
  ];
  const qById = new Map(P.QUALS.map((q) => [q.id, q]));
  const qByAlias = new Map();
  P.QUALS.forEach((q) => q.alias.forEach((s) => { if (!qByAlias.has(s)) qByAlias.set(s, q); }));
  P.qual = (id) => qById.get(id) || null;
  const sameIv = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);
  /** The quality with these semitones above the root, or null. */
  const qualOf = (iv) => P.QUALS.find((q) => sameIv(q.iv, iv)) || null;

  /** Pitch classes of a chord (root first; an odd chord of an exotic scale keeps its own tones in ch.iv). */
  P.chordPcs = function (ch) {
    const r = P.pc(ch.root.l, ch.root.a), q = P.qual(ch.q);
    return (q ? q.iv : ch.iv || [0, 4, 7]).map((i) => mod(r + i, 12));
  };

  /**
   * The tones of a chord as spelled: [{ l, a }] (E7: E G♯ B D) - each on the letter of its step above the root
   * (third, fifth, seventh …; a diminished seventh on the seventh's letter). Writing a melody with the chord
   * locked, a line of such a letter writes this tone.
   */
  P.chordTones = function (ch) {
    const q = P.qual(ch.q), iv = q ? q.iv : ch.iv || [0, 4, 7], r = P.pc(ch.root.l, ch.root.a);
    const STEP = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: ch.q === 'dim7' ? 6 : 5, 10: 6, 11: 6, 13: 1, 14: 1, 15: 1 };
    const out = new Map();
    for (const i of iv) {
      const l = (ch.root.l + (STEP[i] !== undefined ? STEP[i] : 0)) % 7;
      if (!out.has(l)) out.set(l, { l, a: near(r + i - NAT[l]) });
    }
    if (ch.bass && !out.has(ch.bass.l)) out.set(ch.bass.l, { l: ch.bass.l, a: ch.bass.a });
    return [...out.values()];
  };

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  /**
   * The chord on degree `deg` (1 …) of a scale: { deg, root, q, roman, inScale } (iv: its semitones if
   * no quality fits); null if the scale has no such degree. sev: a seventh chord.
   */
  P.degreeChord = function (scale, deg, sev) {
    const s = P.scaleById(scale.id), rootPc = P.pc(scale.l, scale.a);
    const k = deg - 1;
    if (s.chords === 'blues') { // blues: dominant sevenths on I, IV, V
      if (![0, 3, 4].includes(k)) return null;
      const iv = [0, 2, 4, 5, 7, 9, 11][k], l = (scale.l + k) % 7;
      return { deg, root: { l, a: near(rootPc + iv - NAT[l]) }, q: '7', roman: ROMAN[k] + '7', inScale: false };
    }
    const own = s.iv.length === 7 || s.id === 'wholeTone' ? s.iv : P.scaleById(s.parent).iv;
    if (k < 0 || k >= own.length) return null;
    const n = own.length;
    // the tones a third apart: every second tone of the scale (above the root of the degree)
    const at = (j) => own[(k + j) % n] + 12 * Math.floor((k + j) / n) - own[k];
    let iv;
    if (s.id === 'wholeTone') iv = sev ? [0, 4, 8, 10] : [0, 4, 8]; // (6 tones: every second one is a major third)
    else iv = (sev ? [0, 2, 4, 6] : [0, 2, 4]).map(at);
    const l = (scale.l + k) % 7, pc = mod(rootPc + own[k], 12);
    const root = { l, a: near(pc - NAT[l]) };
    const q = qualOf(iv);
    const ch = { deg, root, q: q ? q.id : null, roman: '' };
    if (!q) ch.iv = iv;
    // Roman numeral: small for a minor third; ° diminished, + augmented; ♭ / ♯ where the root differs from major
    const minor = iv[1] === 3 || iv[1] === 2;
    const off = near(own[k] - [0, 2, 4, 5, 7, 9, 11][k]);
    const rsym = { dim: '°', aug: '+', maj7: 'maj7', '7': '7', m7: '7', m7b5: 'ø7', dim7: '°7', mMaj7: '(maj7)', augMaj7: '+maj7', aug7: '+7', b5: '(♭5)', '7b5': '7♭5', maj7b5: 'maj7♭5' }[ch.q] || (q ? '' : '?');
    ch.roman = (off > 0 ? '♯' : off < 0 ? '♭' : '') + (minor ? ROMAN[k].toLowerCase() : ROMAN[k]) + rsym;
    const pcs = P.pcs(scale);
    ch.inScale = P.chordPcs(ch).every((x) => pcs.has(x));
    return ch;
  };
  /** All scale-degree chords of a scale (blues: 3, whole tone: 6, else 7). */
  P.degreeChords = function (scale, sev) {
    const out = [];
    for (let d = 1; d <= 7; d++) {
      const c = P.degreeChord(scale, d, sev);
      if (c) out.push(c);
    }
    return out;
  };
  /** Does the scale take the chords of another scale (fewer than 7 tones): then mark those of its own tones. */
  P.borrowsChords = (scale) => { const s = P.scaleById(scale.id); return !!s.parent && s.chords !== 'blues' && !s.free; };

  /** Root name for chord symbols: C, F♯, B♭ (German: H, and B for B♭). */
  P.chordRoot = function (r, de) {
    if (de && r.l === 6) return { 0: 'H', '-1': 'B', 1: 'H♯', '-2': 'B♭' }[r.a] || 'H';
    return P.name(r.l, r.a, false);
  };
  /** The name of a chord as written above the staff ("F♯m7", "C/G"). */
  P.chordName = function (ch, de) {
    if (!ch) return '';
    const q = P.qual(ch.q);
    const sfx = ch.sfx !== undefined ? ch.sfx : q ? q.sym : '(' + (ch.iv || []).slice(1).join(',') + ')';
    return P.chordRoot(ch.root, de) + sfx + (ch.bass ? '/' + P.chordRoot(ch.bass, de) : '');
  };
  /** The chord as plain text to keep (language-free, ♯ / ♭ as # / b): "F#m7", "Bb/D". */
  P.chordText = function (ch) {
    const r = (x) => LETTERS[x.l] + (x.a > 0 ? '#'.repeat(x.a) : 'b'.repeat(-x.a));
    const q = P.qual(ch.q);
    const sfx = (ch.sfx !== undefined ? ch.sfx : q ? q.sym : '').replace(/♭/g, 'b').replace(/♯/g, '#');
    return r(ch.root) + sfx + (ch.bass ? '/' + r(ch.bass) : '');
  };

  /** A root as typed: C, F#, Fis, Bb, Es, H (German: B = B♭) -> { l, a, len } or null. */
  function parseRoot(s, de) {
    const m = /^([A-Ha-h])(is|es|s|##|#|♯|bb|b|♭)?/.exec(s);
    if (!m) return null;
    let L = m[1].toUpperCase(), acc = m[2] || '';
    // "Es" / "As" are German (E♭ / A♭); a lone "s" after other letters is not an accidental
    if (acc === 's' && L !== 'E' && L !== 'A') acc = '';
    let a = { '': 0, '#': 1, '♯': 1, is: 1, '##': 2, b: -1, '♭': -1, es: -1, s: -1, bb: -2 }[acc];
    if (L === 'H') L = 'B';
    else if (L === 'B' && de && !acc) a = -1; // German: B = B♭
    const len = m[1].length + acc.length;
    // "Bm" / "Bes": fine; "b" alone after a letter: a flat ("Eb"), unless it starts a word ("Ebadd9" stays E♭ add9)
    return { l: LETTERS.indexOf(L), a, len };
  }
  /**
   * A chord as typed ("Am", "F#m7", "Bb/D", "Cmaj7", German "Fis-Moll" style "fism" is not read) -> chord,
   * or null if no root is found. An unknown suffix is kept as typed (sfx), sounding like the longest
   * known start of it (else major).
   */
  P.parseChord = function (text, de) {
    let s = String(text || '').trim().replace(/\s+/g, '');
    if (!s) return null;
    let bass = null;
    const slash = s.lastIndexOf('/');
    if (slash > 0) {
      const b = parseRoot(s.slice(slash + 1), de);
      if (b && b.len === s.length - slash - 1) {
        bass = { l: b.l, a: b.a };
        s = s.slice(0, slash);
      }
    }
    const r = parseRoot(s, de);
    if (!r) return null;
    const rest = s.slice(r.len), norm = rest.replace(/♭/g, 'b').replace(/♯/g, '#');
    const root = { l: r.l, a: r.a };
    let q = qByAlias.get(norm) || qByAlias.get(norm.toLowerCase());
    if (norm === 'M') q = qById.get('maj');
    if (q) return { root, q: q.id, bass };
    // unknown: the longest known start decides how it sounds, the text stays as typed
    let best = qById.get('maj');
    for (let n = norm.length; n > 0; n--) {
      const k = qByAlias.get(norm.slice(0, n));
      if (k) { best = k; break; }
    }
    return { root, q: best.id, bass, sfx: rest.replace(/b(?=\d)/g, '♭').replace(/#(?=\d)/g, '♯') };
  };

  /**
   * Pitches to play a chord softly: the bass (root or the slash bass) in the low octave, the tones close
   * together around the middle (MIDI 55 … 66), so changing chords move little. { bass, tones }.
   */
  P.chordVoicing = function (ch) {
    const pcs = P.chordPcs(ch);
    const b = ch.bass ? P.pc(ch.bass.l, ch.bass.a) : pcs[0];
    const tones = [...new Set(pcs)].map((pc) => 55 + mod(pc - 55, 12)).sort((x, y) => x - y);
    return { bass: 36 + mod(b - 36, 12), tones };
  };

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
