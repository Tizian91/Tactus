'use strict';
/*
 * Drum map: which drum sound sits on which line, with which notehead, and which
 * MIDI note it plays. The values follow Guitar Pro 7/8 (its "articulations"; taken
 * from the open source project alphaTab, which reads and writes Guitar Pro files):
 *
 *   id     Guitar Pro articulation number (stored in the file; 1..127)
 *   midi   MIDI note that is played (General MIDI drums, channel 10)
 *   line   position on the staff in half spaces from the top line
 *          (0 = top line F5, 3 = third space C5 = snare, 8 = bottom line E4, -1 = above the staff)
 *   head   notehead (TC.HEADS)
 *   tech   extra symbol: 'edge' (cymbal edge), 'choke' (stopped by hand)
 *   voice  0 = hands (stems up), 1 = feet (stems down)
 *   def    the instrument a click on this line writes when the selected one sits on another line
 */
(function (TC) {
  /**
   * Noteheads (SMuFL glyphs of the Bravura font): [black, half, whole], width in staff
   * spaces, and the stem anchor (y in staff spaces, up = positive as in SMuFL).
   */
  TC.HEADS = {
    normal: { label: 'Normal', g: ['', '', ''], w: [1.18, 1.18, 1.688], stem: 0.168 },
    x: { label: 'Cross', g: ['', '', ''], w: [1.16, 1.336, 1.508], stem: 0.444 },
    circleX: { label: 'Circled cross', g: ['', '', ''], w: [0.996, 0.996, 0.996], stem: 0 },
    circleSlash: { label: 'Circle with slash', g: ['', '', ''], w: [1, 1, 1], stem: 0 },
    heavyX: { label: 'Heavy cross', g: ['', '', ''], w: [1.54, 1.54, 1.54], stem: 0.44 },
    heavyXHat: { label: 'Cross with hat', g: ['', '', ''], w: [1.54, 1.54, 1.54], stem: 0.456 },
    diamond: { label: 'Diamond', g: ['', '', ''], w: [1.128, 1.128, 1.128], stem: 0 },
    triangle: { label: 'Triangle', g: ['', '', ''], w: [1.172, 1.14, 1.276], stem: -0.5 },
    slashed: { label: 'Slashed', g: ['', '', ''], w: [1.18, 1.18, 1.18], stem: 0.164 },
  };

  /** Instrument groups, in the order of the panel. */
  TC.DRUM_ELEMENTS = {
    hihat: { en: 'Hi-hat', de: 'Hi-Hat', short: 'HH' },
    snare: { en: 'Snare', de: 'Snare', short: 'SN' },
    kick: { en: 'Kick', de: 'Bassdrum', short: 'BD' },
    tom: { en: 'Toms', de: 'Toms', short: 'Tom' },
    ride: { en: 'Ride', de: 'Ride', short: 'RD' },
    crash: { en: 'Crash', de: 'Crash', short: 'CR' },
    splash: { en: 'Splash', de: 'Splash', short: 'SP' },
    china: { en: 'China', de: 'China', short: 'CH' },
    cowbell: { en: 'Cowbell', de: 'Cowbell', short: 'CB' },
    perc: { en: 'Percussion', de: 'Percussion', short: 'Perc' },
  };

  // ab: short name in the drum map (the full name is its tooltip)
  const A = (id, el, line, midi, head, ab, en, de, extra) =>
    Object.assign({ id, el, line, midi, head, ab, en, de, tech: null, voice: 0, def: false }, extra || {});

  TC.DRUM_ARTS = [
    A(42, 'hihat', -1, 42, 'x', 'HH', 'Hi-hat (closed)', 'geschlossen', { def: true }),
    A(92, 'hihat', -1, 46, 'circleSlash', 'HH', 'Hi-hat (half)', 'halb offen'),
    A(46, 'hihat', -1, 46, 'circleX', 'HH', 'Hi-hat (open)', 'offen'),
    A(44, 'hihat', 9, 44, 'x', 'HH-P', 'Pedal hi-hat', 'Pedal (Fuß)', { voice: 1, def: true }),

    A(38, 'snare', 3, 38, 'normal', 'SN', 'Snare (hit)', 'Schlag', { def: true }),
    A(37, 'snare', 3, 37, 'x', 'SN', 'Snare (side stick)', 'Sidestick'),
    A(91, 'snare', 3, 38, 'diamond', 'SN', 'Snare (rim shot)', 'Rimshot'),
    A(40, 'snare', 3, 40, 'normal', 'eSN', 'Electric snare', 'E-Snare'),

    A(36, 'kick', 7, 36, 'normal', 'BD', 'Kick', 'Bassdrum', { voice: 1, def: true }),
    A(35, 'kick', 8, 35, 'normal', 'BD2', 'Kick 2 (acoustic)', 'Bassdrum 2 (akustisch)', { voice: 1, def: true }),

    A(50, 'tom', 1, 50, 'normal', 'T1', 'Tom 1 (very high)', 'Tom 1 (sehr hoch)', { def: true }),
    A(48, 'tom', 2, 48, 'normal', 'T2', 'Tom 2 (high)', 'Tom 2 (hoch)', { def: true }),
    A(47, 'tom', 4, 47, 'normal', 'T3', 'Tom 3 (mid)', 'Tom 3 (mittel)', { def: true }),
    A(45, 'tom', 5, 45, 'normal', 'T4', 'Tom 4 (low)', 'Tom 4 (tief)', { def: true }),
    A(43, 'tom', 6, 43, 'normal', 'FT', 'Floor tom (very low)', 'Standtom (sehr tief)', { def: true }),
    A(41, 'tom', 5, 41, 'normal', 'FT2', 'Floor tom 2 (low)', 'Standtom 2 (tief)'),

    A(51, 'ride', 0, 51, 'x', 'RD', 'Ride (middle)', 'Mitte', { def: true }),
    A(93, 'ride', 0, 51, 'x', 'RD', 'Ride (edge)', 'Rand', { tech: 'edge' }),
    A(53, 'ride', 0, 53, 'diamond', 'RD', 'Ride (bell)', 'Glocke'),
    A(94, 'ride', 0, 51, 'x', 'RD', 'Ride (choke)', 'abgestoppt', { tech: 'choke' }),
    A(126, 'ride', 2, 59, 'x', 'RD2', 'Ride 2 (middle)', 'Ride 2 Mitte'),
    A(59, 'ride', 2, 59, 'x', 'RD2', 'Ride 2 (edge)', 'Ride 2 Rand', { tech: 'edge' }),
    A(127, 'ride', 2, 59, 'diamond', 'RD2', 'Ride 2 (bell)', 'Ride 2 Glocke'),

    A(49, 'crash', -2, 49, 'heavyX', 'CR', 'Crash high', 'Crash hoch', { def: true }),
    A(97, 'crash', -2, 49, 'heavyX', 'CR', 'Crash high (choke)', 'Crash hoch abgestoppt', { tech: 'choke' }),
    A(57, 'crash', -1, 57, 'heavyX', 'CR2', 'Crash medium', 'Crash mittel'),
    A(98, 'crash', -1, 57, 'heavyX', 'CR2', 'Crash medium (choke)', 'Crash mittel abgestoppt', { tech: 'choke' }),

    A(55, 'splash', -2, 55, 'x', 'SP', 'Splash', 'Splash'),
    A(95, 'splash', -2, 55, 'x', 'SP', 'Splash (choke)', 'Splash abgestoppt', { tech: 'choke' }),

    A(52, 'china', -3, 52, 'heavyXHat', 'CH', 'China', 'China', { def: true }),
    A(96, 'china', -3, 52, 'heavyXHat', 'CH', 'China (choke)', 'China abgestoppt', { tech: 'choke' }),

    A(56, 'cowbell', 0, 56, 'triangle', 'CB', 'Cowbell medium', 'Cowbell mittel'),
    A(101, 'cowbell', 0, 56, 'x', 'CB', 'Cowbell medium (tip)', 'Cowbell mittel (Spitze)'),
    A(99, 'cowbell', 1, 56, 'triangle', 'CB', 'Cowbell low', 'Cowbell tief'),
    A(100, 'cowbell', 1, 56, 'x', 'CB', 'Cowbell low (tip)', 'Cowbell tief (Spitze)'),
    A(102, 'cowbell', -1, 56, 'triangle', 'CB', 'Cowbell high', 'Cowbell hoch'),
    A(103, 'cowbell', -1, 56, 'x', 'CB', 'Cowbell high (tip)', 'Cowbell hoch (Spitze)'),

    A(39, 'perc', 3, 39, 'normal', 'CL', 'Hand clap', 'Klatschen'),
    A(31, 'perc', 3, 40, 'slashed', 'STK', 'Sticks', 'Sticks'),
    A(54, 'perc', 3, 54, 'triangle', 'TB', 'Tambourine', 'Tamburin'),
    A(30, 'perc', -3, 49, 'x', 'REV', 'Reverse cymbal', 'Reverse-Becken'),
  ];

  const byId = new Map(TC.DRUM_ARTS.map((a) => [a.id, a]));

  /**
   * Notation layouts: where an instrument sits and which head it gets. Only the drawing changes,
   * the score keeps the instrument (Guitar Pro articulation), so exports stay the same.
   *   gp      Guitar Pro (the values above)
   *   tactus  the layout set up by hand in a Cubase drum map (js/cubase.js ROLES): kick and pedal
   *           hi-hat on the bottom line, toms from the top line down, china / splash above crash
   * def: which instrument a click on a shared line writes (see D.resolve).
   */
  const BASE = new Map(TC.DRUM_ARTS.map((a) => [a.id, { line: a.line, head: a.head, def: a.def }]));
  TC.NOTATIONS = {
    tactus: {
      en: 'Tactus', de: 'Tactus',
      set: {
        36: { line: 8 }, 35: { line: 8, def: false }, 44: { line: 8, def: false },
        50: { line: 0, def: false }, 48: { line: 2 }, 47: { line: 4 }, 45: { line: 6 }, 43: { line: 7 }, 41: { line: 9 },
        57: { line: -3 }, 98: { line: -3 }, 52: { line: -4 }, 96: { line: -4 }, 55: { line: -5 }, 95: { line: -5 },
        102: { line: 0 }, 103: { line: 0 }, 56: { line: 1 }, 101: { line: 1 }, 99: { line: 2 }, 100: { line: 2 },
        39: { line: 4, head: 'x' },
      },
    },
    gp: { en: 'Guitar Pro', de: 'Guitar Pro', set: {} },
  };

  /**
   * Drum kits: which instruments the panel and the drum map offer (notes of other
   * instruments in a score are still shown). 'custom' = the list in settings.kitCustom.
   */
  const STANDARD = [42, 92, 46, 44, 38, 37, 91, 36, 50, 48, 45, 51, 93, 53, 94, 49, 97];
  TC.KITS = {
    standard: { en: 'Standard (5-piece)', de: 'Standard (5-teilig)', ids: STANDARD },
    large: { en: 'Large', de: 'Groß', ids: STANDARD.concat([47, 43, 41, 35, 57, 98, 55, 95, 52, 96, 126, 59, 127, 40]) },
    all: { en: 'All instruments', de: 'Alle Instrumente', ids: TC.DRUM_ARTS.map((a) => a.id) },
    custom: { en: 'Custom', de: 'Eigene Auswahl', ids: null },
  };

  const D = (TC.drums = {});
  D.byId = (id) => byId.get(id) || null;

  /** Applies a notation layout (TC.NOTATIONS key) to all instruments. */
  D.notation = 'gp';
  D.setNotation = function (key) {
    if (!TC.NOTATIONS[key]) key = 'tactus';
    for (const a of TC.DRUM_ARTS) Object.assign(a, BASE.get(a.id), TC.NOTATIONS[key].set[a.id] || {});
    D.notation = key;
  };
  /** Guitar Pro line / head of an instrument, whatever layout is shown (sound, exports). */
  D.base = (a) => BASE.get(a.id) || a;
  /** Line / head / def of an instrument in a layout, whatever layout is shown (Cubase drum maps use 'tactus'). */
  D.inLayout = (a, key) => Object.assign({}, BASE.get(a.id), (TC.NOTATIONS[key] || TC.NOTATIONS.tactus).set[a.id] || {});

  /** All articulations on a staff line. */
  D.atLine = (line) => TC.DRUM_ARTS.filter((a) => a.line === line);

  /** Ids of the instruments of a kit (kit = settings.kit, custom = settings.kitCustom). */
  D.kitIds = function (kit, custom) {
    const k = TC.KITS[kit] || TC.KITS.standard;
    const ids = k.ids || (Array.isArray(custom) ? custom : STANDARD);
    return new Set(ids.filter((id) => byId.has(id)));
  };

  /** Ids of the drum notes used in a score. */
  D.usedIds = function (doc) {
    const s = new Set();
    if (doc) TC.score.eachNote(doc, (n) => { if (n.art) s.add(n.art); });
    return s;
  };

  /**
   * The instrument a click at staff position `pos` (half spaces from the top line, may be
   * fractional) writes. Only lines with allowed instruments count; the nearest one within
   * `reach` half spaces wins ("magnet"), the selected instrument's line on a tie.
   * On that line: the selected instrument if it sits there, otherwise the line's default.
   * allowed: Set of ids (null = all). Returns null when no line is near.
   */
  D.resolve = function (pos, selectedId, allowed, reach = 1.5) {
    const sel = D.byId(selectedId);
    const ok = (a) => !allowed || allowed.has(a.id) || a === sel;
    let best = null, bd = Infinity;
    for (const [line, arts] of D.lines()) {
      if (!arts.some(ok)) continue;
      const d = Math.abs(line - pos) - (sel && sel.line === line ? 0.01 : 0);
      if (d < bd) {
        bd = d;
        best = line;
      }
    }
    if (best === null || bd > reach) return null;
    if (sel && sel.line === best) return sel;
    const list = D.atLine(best).filter(ok);
    return list.find((a) => a.def) || list[0] || null;
  };

  /** Lines that carry instruments (only `allowed` ones, if given), each with its articulations. */
  D.lines = function (allowed) {
    const m = new Map();
    for (const a of TC.DRUM_ARTS) {
      if (allowed && !allowed.has(a.id)) continue;
      if (!m.has(a.line)) m.set(a.line, []);
      m.get(a.line).push(a);
    }
    return [...m.entries()].sort((x, y) => x[0] - y[0]);
  };

  // ---- With the app state (settings, open score) ---------------------------------------

  /** Instruments of the chosen kit. */
  D.kit = () => D.kitIds(TC.state.settings.kit, TC.state.settings.kitCustom);

  /** Instruments a click may write: the kit, plus the selected one. */
  D.clickable = function () {
    const s = D.kit();
    s.add(TC.state.input.art);
    return s;
  };

  /** Instruments the drum map shows: kit (or only the used ones) + used in the score + selected. */
  D.mapIds = function () {
    const used = D.usedIds(TC.state.doc);
    const s = TC.state.settings.mapUsedOnly ? new Set(used) : D.kit();
    used.forEach((id) => s.add(id));
    s.add(TC.state.input.art);
    return s;
  };

  /** Name of an articulation in the current language ("Snare – Rimshot"). */
  D.label = function (a, short) {
    if (!a) return '';
    const de = TC.getLang && TC.getLang() === 'de';
    const el = TC.DRUM_ELEMENTS[a.el];
    if (!de) return a.en;
    if (short || a.el === 'tom' || a.el === 'perc' || a.el === 'kick' || a.de.startsWith(el.de)) return a.de;
    return `${el.de} – ${a.de}`;
  };

  /** The notehead a drum note is drawn with. */
  D.headOf = (note) => (note.head && note.head !== 'auto' && TC.HEADS[note.head] ? note.head : (D.byId(note.art) || {}).head || 'normal');
})(window.TC);
