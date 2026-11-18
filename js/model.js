'use strict';
/*
 * Document model of a score (this is also the saved JSON format, *.tactus.json).
 * Built like Guitar Pro: bar headers shared by all tracks, every track has its own
 * bars with up to four voices.
 *
 *   {
 *     app: 'Tactus', version: 1,
 *     meta:   { title, subtitle, artist, album, music, words, transcriber, copyright, notes, tempo, kit, kitName },
 *     bars:   [ BarHeader ],            // one per bar, for all tracks
 *     tracks: [ Track ],
 *     page:   { barsPerLine: 0 (auto) | 1 … 12, barNumbers: 'system' | 'every' | 'off',
 *               margin: 10 … 30 (mm), header: true (title and page number on the pages after the first),
 *               multiRest: true (empty bars in a row as one multi-bar rest), simile: 'combine' (%-bars in a row: one % with the number) | 'count' (each narrow, counted 2, 3 …) | 'single',
 *               staffGap: 80 (space between the staves of several tracks, %), lineGap: 100 (between the lines of the page view, %) }   page view / PDF
 *     harmony: { key: { l, a, id }       scale of the chords when there is no melody track (js/pitch.js)
 *                pad: true               the chords sound along softly when playing
 *                vol: 60                 … this loud (0 … 100)
 *                guide: 'mark'           writing a melody: 'off' | 'mark' (the chord tones marked) | 'lock' (only chord tones)
 *                midiOut: ''             the pad plays on Tactus' synth ('') or on this MIDI output (e.g. a synth VST) …
 *                midiCh: 14 }            … on this channel (0 … 15; 14 = channel 15)
 *     view:   { x, y, zoom }            // scroll / zoom, not part of the undo history
 *   }
 *
 *   BarHeader: { ts: [4, 4], tempo: null | bpm,
 *                repeatStart: false      a repeat begins here (|:)
 *                repeatEnd: 0            a repeat ends here (:|), the number is how often it is played (2 = twice)
 *                volta: null | [1]       ending (1st / 2nd time bar): played only in these passes, e.g. [1], [2], [1, 2]
 *                marker: ''               text above the bar (Verse, Chorus …)
 *                lineBreak: false        page view: this bar starts a new line
 *                beam: null | [2, 2, 3]  beam groups in units of the lower number (7/8: eighths), null = default
 *                mark: '' | 'segno' | 'coda'   sign at the start: 𝄋 (D.S. jumps here), ⊕ (the coda starts here)
 *                end: '' | 'fine' | 'toCoda'   at the end: Fine (after a jump: the end), To Coda (after a jump: on to ⊕)
 *                jump: '' | 'dc' | 'dcFine' | 'dcCoda' | 'ds' | 'dsFine' | 'dsCoda'   at the end: back to bar 1 / 𝄋
 *                jumpRep: false          after the jump the repeats are played again (default: once, last ending)
 *                chords: [ { t, deg, sev } | { t, name } ]   (only when set) chord symbols, for all tracks: from tick t
 *                                        on up to the next one; deg: scale-degree chord 1 … 7 of the scale that applies
 *                                        here (SC.harmonyScale: it follows a change of scale), sev: seventh chord;
 *                                        name: typed, as plain text (js/pitch.js P.chordText: "F#m7", "Bb/D")
 *                guide: 'off' | 'mark' | 'lock'   (only when set) writing a melody from this bar on: chord tones
 *                                        marked / only chord tones; not set = as before (harmony.guide) }
 *   Track:     { id, name, kind: 'drums' | 'pitched' | 'tab', channel, program, volume, fill, kit, oneLine, hidden,
 *                mute, solo, profile, profileName, midiOut, midiCh,
 *                melody tracks (pitched): clef: 'treble' | 'treble8' | 'bass', scale: { l, a, id } (js/pitch.js),
 *                                         voice: '' | 'soprano' | 'alto' | 'tenor' | 'baritone' | 'bass' (range)
 *                                         inst: 'voice' | 'keys' | 'guitar' | 'bass' | 'ensemble' | 'pad'   the
 *                                                    instrument: how chords are written for it (js/accomp.js)
 *                                         ksw: { tpl, name, c3, noteShift, poly, keys }   (only when set) the
 *                                                    keyswitches of its VST (js/keyswitch.js)
 *                                         lh: true   piano: the lower staff (left hand) of the melody track right
 *                                                    before it - one instrument; sound, scale, mute / solo, hidden
 *                                                    and name follow the upper one (SC.syncHands)
 *                bars: [ { voices: [ [Event], [Event] ],   // bars[i] belongs to header bars[i]
 *                          simile: false,         // true = "repeat the bar before" in this track (% sign; plays its bar before)
 *                          scale: null,           // melody: another scale from this bar on
 *                          ks: [ { t, k } ]     (only when set) keyswitches of the track's VST at tick t (k: the id of a
 *                                                 key of track.ksw, js/keyswitch.js): a way of playing, a slide, a stop
 *                          dyn: [ { t, v } | { t, w, len, to } ] } ] }   (only when set) dynamics of this track: from
 *                                                 tick t on the level v ('ppp' … 'fff', SC.DYN_LEVELS), or a hairpin w
 *                                                 ('cresc' | 'dim') len ticks long (over bar lines) to the level `to`
 *                                                 (written at its end, holds after it) - see SC.dynFactor
 *   Event:     { id, tick, dur, notes: [Note] }   // a chord / beat; tick from the bar start
 *   Note:      drums:   { id, art, accent, ghost, head, vel,
 *                         orn: null | 'flam' | 'drag'   grace notes before the note
 *                         trem: 0 … 3                   roll: strokes through the stem
 *                         stick: '' | 'R' | 'L' }       sticking (right / left hand), written under the staff
 *              pitched: { id, pitch, dia, accent, ghost, vel }   pitch: MIDI note (sounding), dia: how it is spelled
 *                                                                (place on the staff, see js/pitch.js; null = from the scale)
 *                         stroke: 'd' | 'u'       (only when set) struck as a stroke down / up (a strummed guitar,
 *                                                 js/accomp.js): a mark above it, played a little spread
 *                         chordNote: true         (only when set) written as a chord (note panel "Write: chord"):
 *                                                 held and moved down / up it gets a stroke (else ♯ / ♭)
 *                         lyr: ['Lie-', 'Son-']   (only when set) lyrics: the syllable of each verse (1st, 2nd ...); a
 *                                                 trailing "-" joins it to the next syllable of the word ('' = none).
 *                                                 Kept on the first note of an event in voice 1 (SC.lyricOf).
 *              (later)  tab: { id, string, fret, ... }
 *
 * Time is counted in ticks: 960 per quarter note (as in Guitar Pro / MIDI files).
 * An event keeps the duration chosen when it was written; render.js / rhythm.js
 * turn the events into note values, rests, beams and tuplets.
 */
(function (TC) {
  const TPQ = (TC.TPQ = 960);

  TC.VALUES = [1, 2, 4, 8, 16, 32, 64];
  /** Ticks of a plain note value (4 = quarter = 960). */
  TC.valueTicks = (v) => (4 * TPQ) / v;
  /** Ticks of the note the input settings write. */
  TC.inputTicks = (inp) => {
    let t = TC.valueTicks(inp.value);
    if (inp.triplet) t = (t * 2) / 3;
    else if (inp.dotted) t *= 1.5;
    return t;
  };
  /** The note value of a length in ticks: { value, dotted, triplet }, or null when it is no single value (e.g. a tied one). */
  TC.valueOfTicks = function (ticks) {
    for (const value of TC.VALUES) {
      for (const [dotted, triplet] of [[false, false], [true, false], [false, true]]) {
        if (triplet && value <= 1) continue;
        if (TC.inputTicks({ value, dotted, triplet }) === ticks) return { value, dotted, triplet };
      }
    }
    return null;
  };
  /** Grid of the clickable positions for the input settings. */
  /** The grids to choose (note panel "Grid"): '' = the note value's, else a value of its own ('16', '8t' a triplet eighth). */
  TC.GRIDS = ['', '4', '8', '16', '32', '8t', '16t'];
  TC.gridTicks = (inp) => {
    // a grid of its own (e.g. sixteenths while writing quarters: a chord on every sixteenth)
    if (inp.grid && TC.GRIDS.includes(inp.grid)) {
      const g = TC.valueTicks(parseInt(inp.grid, 10));
      return /t$/.test(inp.grid) ? (g * 2) / 3 : g;
    }
    const t = TC.valueTicks(inp.value);
    if (inp.triplet) return (t * 2) / 3;
    if (inp.dotted) return t / 2; // a dotted eighth may start on every sixteenth
    return t;
  };
  TC.barTicks = (ts) => (ts[0] * 4 * TPQ) / ts[1];

  TC.TIME_SIGS = [[4, 4], [3, 4], [2, 4], [5, 4], [6, 4], [6, 8], [7, 8], [9, 8], [12, 8], [5, 8], [2, 2]];
  const validTs = (ts) => Array.isArray(ts) && ts.length === 2 && Number.isInteger(ts[0]) && ts[0] >= 1 && ts[0] <= 32 &&
    [1, 2, 4, 8, 16, 32].includes(ts[1]);

  TC.emptyMeta = () => ({
    title: '', subtitle: '', artist: '', album: '', music: '', words: '', transcriber: '', copyright: '', notes: '', tempo: 120,
    kit: '', kitName: '', // kit profile for MIDI export / import (js/kits.js): id, and the name to find it on another computer
    swing: 50,            // swing / shuffle in %: 50 straight, 67 shuffle (triplet feel), up to 75 (see TC.swingTick)
    swingUnit: 8,         // which notes swing: 8 eighths, 16 sixteenths
  });

  /** Swing amounts offered (%): straight, light, swing, shuffle (triplet feel), hard. */
  TC.SWINGS = [[50, 'Straight'], [58, 'Light swing'], [62, 'Swing'], [67, 'Shuffle (triplet feel)'], [75, 'Hard shuffle']];

  /**
   * Where a note at `tick` (from the bar start) sounds with swing: within every pair of eighths
   * (unit 8; sixteenths: unit 16) the second one comes later - at `amount` % of the pair instead of
   * 50 %; the positions in between stretch along. Triplets (and other positions off the 64th grid)
   * stay where they are. Used by playback and the MIDI export.
   */
  TC.swingTick = function (tick, amount, unit) {
    if (!amount || amount === 50 || tick % 60 !== 0) return tick;
    const pair = unit === 16 ? 480 : 960, split = (pair * amount) / 100;
    const base = Math.floor(tick / pair) * pair, pos = tick - base, half = pair / 2;
    return base + (pos < half ? (pos * split) / half : split + ((pos - half) * (pair - split)) / half);
  };

  TC.newBarHeader = (ts) => ({ ts: ts ? ts.slice() : [4, 4], tempo: null, repeatStart: false, repeatEnd: 0, volta: null, marker: '', beam: null, lineBreak: false,
    mark: '', end: '', jump: '', jumpRep: false });
  /** Signs at the start of a bar, at its end, and the jumps back (D.C. / D.S.), see SC.playOrder. */
  // signs and jumps as in Guitar Pro: targets (𝄋 Segno, 𝄋𝄋 Segno Segno, ⊕ Coda, ⊕⊕ Double Coda, Fine) and jumps
  // (Da Capo / Dal Segno / Dal Segno Segno, each alone or "al Fine / al Coda / al Double Coda"; To Coda, To Double Coda)
  TC.MARKS = ['segno', 'segnoSegno', 'coda', 'doubleCoda'];
  TC.ENDS = ['fine', 'toCoda', 'toDoubleCoda'];
  TC.JUMPS = ['dc', 'dcFine', 'dcCoda', 'dcDoubleCoda', 'ds', 'dsFine', 'dsCoda', 'dsDoubleCoda', 'dss', 'dssFine', 'dssCoda', 'dssDoubleCoda'];
  /** What a jump does: { to: 'start' | 'segno' | 'segnoSegno', al: null | 'fine' | 'coda' | 'doubleCoda' }. */
  TC.jumpInfo = (j) => ({
    to: /^dss/.test(j) ? 'segnoSegno' : /^ds/.test(j) ? 'segno' : 'start',
    al: /DoubleCoda$/.test(j) ? 'doubleCoda' : /Coda$/.test(j) ? 'coda' : /Fine$/.test(j) ? 'fine' : null,
  });
  TC.newHarmony = () => ({ key: { l: 0, a: 0, id: 'major' }, pad: true, vol: 60, guide: 'mark', midiOut: '', midiCh: 14 });
  TC.GUIDES = ['off', 'mark', 'lock'];
  TC.newPage = () => ({ barsPerLine: 0, barNumbers: 'system', margin: 15, header: true, multiRest: true, simile: 'combine', staffGap: 80, lineGap: 100, scaleNames: true, lyrics: true });
  // space between the staves of several tracks / between the lines of the page view, % of the basic space
  TC.STAFF_GAPS = [40, 50, 60, 70, 80, 90, 100, 120, 140, 160];
  TC.LINE_GAPS = [40, 50, 60, 70, 80, 90, 100, 120, 140, 160];
  TC.SIMILE_MODES = ['single', 'count', 'combine'];
  TC.MARGINS = [10, 12, 15, 20, 25, 30];
  TC.BAR_NUMBERS = ['system', 'every', 'off'];

  /** Endings of a bar: sorted passes 1 … 8, or null. */
  TC.cleanVolta = function (v) {
    if (!Array.isArray(v)) return null;
    const out = [...new Set(v.filter((x) => Number.isInteger(x) && x >= 1 && x <= 8))].sort((a, b) => a - b);
    return out.length ? out : null;
  };

  /** Is the time signature compound (6/8, 9/8, 12/8: counted in dotted quarters)? */
  TC.isCompound = (ts) => ts[1] === 8 && ts[0] % 3 === 0 && ts[0] > 3;

  /**
   * Beam groups of a bar in units of the lower number (7/8 -> [2, 2, 3] eighths), or null when
   * the beats decide (4/4, 3/4, 2/2 …: one beam per quarter). Odd eighth / sixteenth meters get
   * the usual grouping; any bar may have its own (header.beam).
   */
  const ODD = { 5: [3, 2], 7: [2, 2, 3], 11: [3, 3, 3, 2], 13: [3, 3, 3, 2, 2] };
  TC.beamGroups = function (ts, beam) {
    if (Array.isArray(beam) && beam.reduce((a, b) => a + b, 0) === ts[0]) return beam.slice();
    if (ts[1] < 8) return null;
    if (TC.isCompound(ts)) return Array(ts[0] / 3).fill(3);
    const per = ts[1] === 8 ? 2 : 4; // eighths in quarters, sixteenths in fours
    if (ts[0] % per === 0) return Array(ts[0] / per).fill(per);
    if (ODD[ts[0]]) return ODD[ts[0]].slice();
    const g = Array(Math.floor(ts[0] / 2)).fill(2);
    if (ts[0] % 2) g[g.length - 1] = 3;
    return g;
  };
  /** Ways to group a bar of n units into 2s, 3s (and 4s for sixteenths), the default first. */
  TC.beamChoices = function (ts) {
    const n = ts[0], out = [];
    const sizes = ts[1] >= 16 ? [2, 3, 4] : [2, 3];
    const walk = (rest, cur) => {
      if (out.length > 30) return;
      if (rest === 0) return void out.push(cur);
      sizes.forEach((k) => { if (rest >= k) walk(rest - k, cur.concat(k)); });
    };
    if (ts[1] >= 8 && n >= 4 && n <= 13) walk(n, []);
    const def = TC.beamGroups(ts, null);
    const key = (g) => g && g.join('+');
    const list = out.filter((g) => key(g) !== key(def));
    return def ? [def].concat(list) : list;
  };
  TC.newTrackBar = (voices = 2) => ({ voices: Array.from({ length: voices }, () => []), simile: false });

  /** General MIDI program of a new melody track: 54 Voice Oohs (0-based 53) - a singing voice. */
  TC.MELODY_PROGRAM = 53;

  /**
   * Sounds offered for melody tracks: [General MIDI program (0-based), English, German], grouped. The program
   * goes to MIDI (playback through a VST, export, MusicXML); Tactus' own synth plays its family (TC.soundFamily).
   */
  TC.MELODY_SOUNDS = [
    ['Voice', 'Gesang', [[53, 'Voice (oohs)', 'Stimme (Uuh)'], [52, 'Choir (aahs)', 'Chor (Aah)']]],
    ['Keys', 'Tasten', [[0, 'Piano', 'Klavier'], [4, 'Electric piano', 'E-Piano'], [16, 'Organ', 'Orgel']]],
    ['Guitar', 'Gitarre', [[24, 'Guitar (nylon)', 'Gitarre (Nylon)'], [25, 'Guitar (steel)', 'Gitarre (Stahl)'],
      [27, 'Electric guitar (clean)', 'E-Gitarre (clean)'], [29, 'Electric guitar (overdrive)', 'E-Gitarre (verzerrt)']]],
    ['Bass', 'Bass', [[33, 'Electric bass', 'E-Bass'], [32, 'Double bass', 'Kontrabass'], [38, 'Synth bass', 'Synth-Bass']]],
    ['Strings & winds', 'Streicher & Bläser', [[48, 'Strings', 'Streicher'], [40, 'Violin', 'Violine'], [42, 'Cello', 'Cello'],
      [56, 'Trumpet', 'Trompete'], [65, 'Alto sax', 'Altsaxofon'], [73, 'Flute', 'Flöte']]],
    ['Synth', 'Synthesizer', [[80, 'Synth lead (square)', 'Synth-Lead (Rechteck)'], [81, 'Synth lead (saw)', 'Synth-Lead (Säge)'], [89, 'Synth pad', 'Synth-Fläche']]],
  ];
  /** The family of a General MIDI program, for Tactus' own melody synth (js/audio.js). */
  TC.soundFamily = function (p) {
    p = Number(p) || 0;
    if (p === 4 || p === 5) return 'epiano'; // (the electric pianos are in the piano group of General MIDI)
    if (p <= 7) return 'piano';
    if (p <= 15) return 'epiano';
    if (p <= 23) return 'organ';
    if (p <= 28) return 'guitar';
    if (p <= 31) return 'dist';
    if (p <= 39) return 'bass';
    if (p <= 51) return 'strings';
    if (p <= 54) return 'voice';
    if (p <= 63) return 'brass';
    if (p <= 71) return 'reed';
    if (p <= 79) return 'flute';
    if (p <= 87) return 'lead';
    if (p <= 95) return 'pad';
    return 'voice';
  };
  /** Name of a melody sound (a program not in the list: "Program 12"). */
  TC.soundName = function (p, de) {
    for (const [, , list] of TC.MELODY_SOUNDS) for (const [q, en, dname] of list) if (q === p) return de ? dname : en;
    return (de ? 'Programm ' : 'Program ') + (p + 1);
  };

  /**
   * Instruments of melody tracks (track.inst): how chords are written for it (js/accomp.js) - its sound is free.
   * The one a sound suggests: older scores (they had none) once when loaded.
   */
  TC.INSTRUMENTS = ['voice', 'keys', 'guitar', 'bass', 'ensemble', 'pad'];
  TC.instFromProgram = function (p, lh) {
    if (lh) return 'keys';
    if (p >= 24 && p <= 31) return 'guitar';
    if (p >= 32 && p <= 39) return 'bass';
    if (p >= 0 && p <= 23) return 'keys';
    if ((p >= 40 && p <= 51) || (p >= 56 && p <= 63)) return 'ensemble';
    if (p >= 88 && p <= 95) return 'pad';
    return 'voice';
  };

  TC.newTrack = function (kind = 'drums', bars = 0) {
    const t = {
      id: TC.uid('t'),
      name: kind === 'drums' ? 'Drums' : kind === 'pitched' ? 'Melody' : 'Track',
      kind,
      channel: kind === 'drums' ? 9 : 0, // MIDI channel 10 = drums
      program: kind === 'pitched' ? TC.MELODY_PROGRAM : 0,
      volume: 100,
      fill: kind === 'drums' ? 'beat' : 'off', // rest cleanup on screen (rhythm.js R.ends): beat | next | off
      kit: null,         // instruments of its own (ids; e.g. only the snare), null = the kit of the settings
      oneLine: false,    // with instruments of its own: one staff line, every note on it
      hidden: false,     // not shown (still played)
      mute: false,       // not played (playback; the MIDI export asks for itself)
      solo: false,       // only the solo tracks are played
      profile: '',       // kit profile (js/kits.js) for its keys: '' = the one of the score, 'gm' = General MIDI, or an id
      profileName: '',   // … its name (to find it on another computer)
      midiOut: '',       // MIDI output while playing ('' = the one chosen in the panel)
      midiCh: null,      // MIDI channel 0 … 15 while playing (null = the one of the kit profile)
      bars: [],
    };
    if (kind === 'pitched') {
      t.clef = 'treble';
      t.scale = { l: 0, a: 0, id: 'major' }; // C major
      t.voice = '';
      t.inst = 'voice';  // the instrument (how chords are written; the sound is free)
    }
    for (let i = 0; i < bars; i++) t.bars.push(TC.newTrackBar());
    return t;
  };

  /** Default size: one staff space = 16 px, so neighbouring lines are 8 px apart. */
  TC.DEFAULT_ZOOM = 1.6;

  TC.emptyScore = function (barCount = 8) {
    const doc = { app: 'Tactus', version: 1, meta: TC.emptyMeta(), bars: [], tracks: [], page: TC.newPage(), harmony: TC.newHarmony(), view: { x: 40, y: 220, zoom: TC.DEFAULT_ZOOM } };
    for (let i = 0; i < barCount; i++) doc.bars.push(TC.newBarHeader());
    doc.tracks.push(TC.newTrack('drums', barCount));
    return doc;
  };

  // ---- Loading: accept anything, keep what is valid ---------------------------------

  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v) => (v === null || v === undefined ? '' : String(v));

  function cleanNote(n, kind) {
    if (!n || typeof n !== 'object') return null;
    const out = { id: typeof n.id === 'string' ? n.id : TC.uid('n') };
    if (kind === 'drums') {
      if (!TC.drums.byId(n.art)) return null;
      out.art = n.art;
    } else {
      out.pitch = TC.clamp(Math.round(num(n.pitch, 60)), 0, 127);
      // its spelling (place on the staff): only if it fits the pitch (at most a double sharp / flat away)
      const dia = Number.isInteger(n.dia) ? n.dia : null;
      out.dia = dia !== null && TC.pitch && Math.abs(out.pitch - TC.pitch.pitchOf(dia, 0)) <= 2 ? dia : null;
    }
    out.accent = [0, 1, 2].includes(n.accent) ? n.accent : 0;
    out.ghost = !!n.ghost;
    out.head = typeof n.head === 'string' && (n.head === 'auto' || TC.HEADS[n.head]) ? n.head : 'auto';
    out.vel = n.vel === null || n.vel === undefined ? null : TC.clamp(Math.round(num(n.vel, 100)), 1, 127);
    out.orn = n.orn === 'flam' || n.orn === 'drag' ? n.orn : null;
    out.trem = [1, 2, 3].includes(n.trem) ? n.trem : 0;
    out.stick = n.stick === 'R' || n.stick === 'L' ? n.stick : '';
    if (kind !== 'drums' && n.tie) out.tie = true; // melody: tied on from the note before (same pitch)
    if (kind !== 'drums' && (n.stroke === 'd' || n.stroke === 'u')) out.stroke = n.stroke; // struck as a stroke ↓ / ↑ (js/accomp.js)
    if (kind !== 'drums' && n.chordNote) out.chordNote = true; // written as a chord (held + down / up: its stroke)
    if (kind !== 'drums' && Array.isArray(n.lyr)) { // lyrics: a syllable per verse
      const lyr = n.lyr.slice(0, SC.LYRIC_VERSES).map((x) => SC.cleanSyllable(x));
      while (lyr.length && !lyr[lyr.length - 1]) lyr.pop();
      if (lyr.length) out.lyr = lyr;
    }
    return out;
  }

  /** Chord symbols of a bar: sorted by tick, one per tick, inside the bar; null if none. */
  function cleanChords(list, L) {
    if (!Array.isArray(list)) return null;
    const out = new Map();
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const t = Math.round(num(c.t, 0));
      if (t < 0 || t >= L) continue;
      if (Number.isInteger(c.deg) && c.deg >= 1 && c.deg <= 7) out.set(t, c.sev ? { t, deg: c.deg, sev: true } : { t, deg: c.deg });
      else if (typeof c.name === 'string' && c.name.trim()) out.set(t, { t, name: c.name.trim().slice(0, 16) });
    }
    return out.size ? [...out.values()].sort((a, b) => a.t - b.t) : null;
  }
  TC.cleanChords = cleanChords;

  /** Bring any parsed JSON into the current shape (missing parts get defaults, bad parts are dropped). */
  TC.normalizeDoc = function (raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.bars)) throw new Error('Not a Tactus file');
    const doc = TC.emptyScore(0);
    Object.keys(doc.meta).forEach((k) => {
      if (!raw.meta || raw.meta[k] === undefined) return;
      if (k === 'tempo') doc.meta.tempo = TC.clamp(num(raw.meta.tempo, 120), 20, 400);
      else if (k === 'swing') doc.meta.swing = TC.clamp(Math.round(num(Number(raw.meta.swing), 50)), 50, 80);
      else if (k === 'swingUnit') doc.meta.swingUnit = Number(raw.meta.swingUnit) === 16 ? 16 : 8;
      else doc.meta[k] = str(raw.meta[k]);
    });
    doc.bars = raw.bars.map((b, i) => {
      const h = TC.newBarHeader(b && validTs(b.ts) ? b.ts : [4, 4]);
      if (b) {
        h.tempo = typeof b.tempo === 'number' ? TC.clamp(b.tempo, 20, 400) : null;
        h.repeatStart = !!b.repeatStart;
        h.repeatEnd = TC.clamp(Math.round(num(b.repeatEnd, 0)), 0, 99);
        if (h.repeatEnd === 1) h.repeatEnd = 0;
        h.volta = TC.cleanVolta(b.volta);
        h.marker = str(b.marker);
        if (Array.isArray(b.beam) && b.beam.every((x) => Number.isInteger(x) && x > 0) && b.beam.reduce((a, c) => a + c, 0) === h.ts[0]) h.beam = b.beam.slice();
        h.lineBreak = !!b.lineBreak && i > 0;
        if (TC.MARKS.includes(b.mark)) h.mark = b.mark;
        if (TC.ENDS.includes(b.end)) h.end = b.end;
        if (TC.JUMPS.includes(b.jump)) { h.jump = b.jump; h.jumpRep = !!b.jumpRep; }
        const ch = cleanChords(b.chords, TC.barTicks(h.ts));
        if (ch) h.chords = ch;
        if (TC.GUIDES.includes(b.guide)) h.guide = b.guide;
      }
      return h;
    });
    if (!doc.bars.length) doc.bars.push(TC.newBarHeader());
    const hm = raw.harmony && typeof raw.harmony === 'object' ? raw.harmony : {};
    if (TC.pitch) doc.harmony.key = TC.pitch.cleanScale(hm.key);
    if (hm.pad === false) doc.harmony.pad = false;
    doc.harmony.vol = TC.clamp(Math.round(num(hm.vol, 60)), 0, 100);
    if (TC.GUIDES.includes(hm.guide)) doc.harmony.guide = hm.guide;
    doc.harmony.midiOut = str(hm.midiOut);
    if (Number.isInteger(hm.midiCh) && hm.midiCh >= 0 && hm.midiCh <= 15) doc.harmony.midiCh = hm.midiCh;
    const pg = raw.page && typeof raw.page === 'object' ? raw.page : {};
    if (Number.isInteger(pg.barsPerLine) && pg.barsPerLine >= 0 && pg.barsPerLine <= 12) doc.page.barsPerLine = pg.barsPerLine;
    if (TC.BAR_NUMBERS.includes(pg.barNumbers)) doc.page.barNumbers = pg.barNumbers;
    if (TC.MARGINS.includes(pg.margin)) doc.page.margin = pg.margin;
    if (TC.STAFF_GAPS.includes(pg.staffGap)) doc.page.staffGap = pg.staffGap;
    if (TC.LINE_GAPS.includes(pg.lineGap)) doc.page.lineGap = pg.lineGap;
    if (pg.header === false) doc.page.header = false;
    if (pg.multiRest === false) doc.page.multiRest = false;
    if (pg.scaleNames === false) doc.page.scaleNames = false;
    if (pg.lyrics === false) doc.page.lyrics = false;
    if (TC.SIMILE_MODES.includes(pg.simile)) doc.page.simile = pg.simile;
    else if (pg.multiSimile === false) doc.page.simile = 'single'; // older files: a switch
    const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
    doc.tracks = tracks.map((t) => {
      const kind = ['drums', 'pitched', 'tab'].includes(t.kind) ? t.kind : 'drums';
      const out = TC.newTrack(kind, 0);
      if (typeof t.id === 'string') out.id = t.id;
      out.name = str(t.name) || out.name;
      out.channel = TC.clamp(Math.round(num(t.channel, out.channel)), 0, 15);
      out.program = TC.clamp(Math.round(num(t.program, 0)), 0, 127);
      out.volume = TC.clamp(Math.round(num(t.volume, 100)), 0, 127);
      if (['beat', 'next', 'off'].includes(t.fill)) out.fill = t.fill;
      if (Array.isArray(t.kit)) out.kit = [...new Set(t.kit.map(Number).filter((id) => TC.drums && TC.drums.byId(id)))];
      if (out.kit && !out.kit.length) out.kit = null;
      out.oneLine = !!t.oneLine && !!out.kit;
      out.hidden = !!t.hidden;
      out.mute = !!t.mute;
      out.solo = !!t.solo;
      if (typeof t.profile === 'string') out.profile = t.profile;
      out.profileName = str(t.profileName);
      out.midiOut = str(t.midiOut);
      out.midiCh = Number.isInteger(t.midiCh) && t.midiCh >= 0 && t.midiCh <= 15 ? t.midiCh : null;
      if (kind === 'pitched') {
        if (TC.pitch && TC.pitch.CLEFS[t.clef]) out.clef = t.clef;
        out.scale = TC.pitch ? TC.pitch.cleanScale(t.scale) : out.scale;
        if (TC.pitch && TC.pitch.VOICES[t.voice]) out.voice = t.voice;
        if (t.lh) out.lh = true;
        out.inst = TC.INSTRUMENTS.includes(t.inst) ? t.inst : TC.instFromProgram(out.program, !!t.lh);
        // keyswitches of its VST (js/keyswitch.js) - kept with the score
        if (t.ksw) { const k = TC.ksw ? TC.ksw.clean(t.ksw) : JSON.parse(JSON.stringify(t.ksw)); if (k) out.ksw = k; }
      }
      out.bars = doc.bars.map((h, i) => {
        const src = Array.isArray(t.bars) ? t.bars[i] : null;
        const bar = TC.newTrackBar();
        // "%" of this track (older files: in the bar header, for all tracks)
        bar.simile = i > 0 && (!!(src && src.simile) || !!(raw.bars[i] && raw.bars[i].simile));
        if (kind === 'pitched' && i > 0 && src && src.scale && TC.pitch) bar.scale = TC.pitch.cleanScale(src.scale); // a new scale from here
        const dyn = src && TC.score.cleanDyn(src.dyn, TC.barTicks(h.ts));
        if (dyn) bar.dyn = dyn;
        // keyswitches written here (a way of playing, a slide …): { t, k } inside the bar, one per place and key
        if (kind === 'pitched' && src && Array.isArray(src.ks)) {
          const L = TC.barTicks(h.ts), seen = new Set();
          const ks = src.ks.filter((m) => m && typeof m.k === 'string' && Number.isInteger(m.t) && m.t >= 0 && m.t < L && !seen.has(m.t + m.k) && seen.add(m.t + m.k))
            .map((m) => ({ t: m.t, k: m.k.slice(0, 40) })).sort((a, b) => a.t - b.t);
          if (ks.length) bar.ks = ks;
        }
        const voices = src && Array.isArray(src.voices) ? src.voices : [];
        voices.slice(0, 4).forEach((v, vi) => {
          bar.voices[vi] = (Array.isArray(v) ? v : []).map((e) => {
            if (!e || typeof e !== 'object') return null;
            const notes = (Array.isArray(e.notes) ? e.notes : []).map((n) => cleanNote(n, kind)).filter(Boolean);
            if (!notes.length) return null;
            return { id: typeof e.id === 'string' ? e.id : TC.uid('e'), tick: Math.max(0, Math.round(num(e.tick, 0))), dur: Math.max(1, Math.round(num(e.dur, 960))), notes };
          }).filter(Boolean);
        });
        return bar;
      });
      return out;
    });
    if (!doc.tracks.length) doc.tracks.push(TC.newTrack('drums', doc.bars.length));
    // piano: a left hand only right after a melody track that is no left hand itself
    doc.tracks.forEach((t, i) => { if (t.lh && !(i > 0 && doc.tracks[i - 1].kind === 'pitched' && !doc.tracks[i - 1].lh)) delete t.lh; });
    TC.score.syncHands(doc);
    if (doc.tracks.every((t) => t.hidden)) doc.tracks[0].hidden = false; // one track is always shown
    doc.tracks.forEach((t) => doc.bars.forEach((h, i) => TC.score.fitBar(doc, t, i)));
    if (raw.view && typeof raw.view === 'object') {
      doc.view = { x: num(raw.view.x, 40), y: num(raw.view.y, 140), zoom: TC.clamp(num(raw.view.zoom, 1), 0.25, 4) };
    }
    return doc;
  };

  // ---- Operations on a score (pure: they change the doc passed in) ------------------

  const SC = (TC.score = {});

  // ---- Tracks: they share the bar headers (time signature, tempo, repeats, jumps), each has its own
  // notes and its own %-bars

  /** A new track (drums, or a melody: kind 'pitched') at the end (or after track `after`), as many bars as the score. */
  SC.addTrack = function (doc, name, after, kind = 'drums') {
    const t = TC.newTrack(kind, doc.bars.length);
    t.name = name || SC.freeTrackName(doc, t.name);
    if (after) after = SC.handsOf(doc, after).slice(-1)[0]; // (after a piano: after both of its staves)
    // a melody track: the scale of the song (the first melody track's, with its changes) - not C major beside an A minor song
    const key = kind === 'pitched' && doc.tracks.find((x) => x.kind === 'pitched' && !x.lh);
    if (key) {
      t.scale = Object.assign({}, key.scale);
      t.bars.forEach((b, k) => { if (k > 0 && key.bars[k] && key.bars[k].scale) b.scale = Object.assign({}, key.bars[k].scale); });
    }
    const at = after ? doc.tracks.indexOf(after) + 1 : doc.tracks.length;
    doc.tracks.splice(at > 0 ? at : doc.tracks.length, 0, t);
    return t;
  };
  /** "Drums", "Drums 2", "Drums 3" … whichever is not taken yet. */
  SC.freeTrackName = function (doc, base) {
    const taken = new Set(doc.tracks.map((t) => t.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(base + ' ' + n)) return base + ' ' + n;
  };
  /** Remove a track - a piano with both of its staves (the last one stays). */
  SC.deleteTrack = function (doc, track) {
    const hands = SC.handsOf(doc, track);
    if (!doc.tracks.includes(track) || doc.tracks.length - hands.length < 1) return false;
    doc.tracks = doc.tracks.filter((t) => !hands.includes(t));
    return true;
  };
  /** Move a track up (-1) or down (+1) in the list (a piano: both staves, past a piano: past both). */
  SC.moveTrack = function (doc, track, dir) {
    const units = SC.instruments(doc).map((t) => SC.handsOf(doc, t));
    const i = units.findIndex((u) => u.includes(track)), j = i + dir;
    if (i < 0 || j < 0 || j >= units.length) return false;
    const [u] = units.splice(i, 1);
    units.splice(j, 0, u);
    doc.tracks = [].concat(...units);
    return true;
  };
  /** A copy of a track (new ids) right after it - a piano: both staves. */
  SC.duplicateTrack = function (doc, track) {
    const hands = SC.handsOf(doc, track), name = SC.freeTrackName(doc, hands[0].name);
    const copies = hands.map((h) => {
      const t = TC.clone(h);
      t.id = TC.uid('t');
      t.name = name;
      t.bars.forEach((b) => b.voices.forEach((v) => v.forEach((ev) => {
        ev.id = TC.uid('e');
        ev.notes.forEach((n) => { n.id = TC.uid('n'); });
      })));
      return t;
    });
    doc.tracks.splice(doc.tracks.indexOf(hands[hands.length - 1]) + 1, 0, ...copies);
    return copies[0];
  };

  // ---- Piano: one instrument on two staves - a melody track (right hand, upper staff) and the track right after it
  // with lh: true (left hand, lower staff). Each staff has its own notes, voices and clef; the rest is the instrument's.

  /** What both hands of a piano share (the upper one decides; SC.syncHands copies it). */
  SC.HAND_SHARED = ['name', 'program', 'volume', 'mute', 'solo', 'hidden', 'midiOut', 'midiCh', 'channel', 'inst'];
  /** The left hand (lower staff) of a piano's upper track, or null. */
  SC.leftHand = function (doc, t) {
    const n = t && !t.lh ? doc.tracks[doc.tracks.indexOf(t) + 1] : null;
    return n && n.lh ? n : null;
  };
  /** The upper track (right hand) of a left hand, or null. */
  SC.rightHand = (doc, t) => (t && t.lh ? doc.tracks[doc.tracks.indexOf(t) - 1] || null : null);
  /** The tracks of the instrument t belongs to: [upper, lower] of a piano, else [t]. */
  SC.handsOf = function (doc, t) {
    const up = SC.rightHand(doc, t) || t, lh = SC.leftHand(doc, up);
    return lh ? [up, lh] : [t];
  };
  /** The instrument's track (a piano: its upper one) - the one listed, named, exported as a part. */
  SC.instrumentOf = (doc, t) => SC.rightHand(doc, t) || t;
  /** The instruments (no left hands): the tracks listed in the panel. */
  SC.instruments = (doc) => doc.tracks.filter((t) => !t.lh);
  /** Is t a piano (either of its staves)? */
  SC.isPiano = (doc, t) => SC.handsOf(doc, t).length > 1;
  /**
   * The other hand gets what the instrument shares (SC.HAND_SHARED, the scale and its changes) from `from`
   * (default: the upper one) - of every piano, or only of from's.
   */
  SC.syncHands = function (doc, from) {
    doc.tracks.forEach((lh, i) => {
      if (!lh.lh) return;
      const up = doc.tracks[i - 1];
      if (from && from !== up && from !== lh) return;
      const src = from || up, dst = src === up ? lh : up;
      SC.HAND_SHARED.forEach((k) => { dst[k] = src[k]; });
      dst.scale = Object.assign({}, src.scale);
      dst.bars.forEach((b, k) => { b.scale = src.bars[k] && src.bars[k].scale ? Object.assign({}, src.bars[k].scale) : null; });
    });
  };
  /**
   * A melody track becomes a piano (on: a lower staff in the bass clef after it, its left hand) or one
   * staff again (off: the left hand goes, with its notes - the action asks first). Returns the left hand.
   */
  SC.setPiano = function (doc, t, on) {
    const up = SC.instrumentOf(doc, t);
    if (!up || up.kind !== 'pitched') return null;
    let lh = SC.leftHand(doc, up);
    if (on && !lh) {
      lh = TC.newTrack('pitched', doc.bars.length);
      lh.lh = true;
      lh.clef = 'bass';
      doc.tracks.splice(doc.tracks.indexOf(up) + 1, 0, lh);
      SC.syncHands(doc, up);
    } else if (!on && lh) {
      doc.tracks.splice(doc.tracks.indexOf(lh), 1);
    }
    return lh;
  };

  /** The scale of a melody track in bar `bi`: the last one set up to there (bar.scale), else its own. */
  SC.scaleAt = function (track, bi) {
    for (let i = Math.min(bi, track.bars.length - 1); i > 0; i--) if (track.bars[i] && track.bars[i].scale) return track.bars[i].scale;
    return track.scale || { l: 0, a: 0, id: 'major' };
  };
  /**
   * Set the scale of a melody track from bar `bi` on (bar 0: the track's own). The notes keep their
   * pitches; a change that ends up like the scale before it is removed.
   */
  SC.setScale = function (track, bi, scale) {
    if (bi <= 0) track.scale = Object.assign({}, scale);
    else track.bars[bi].scale = Object.assign({}, scale);
    const same = (a, b) => a.l === b.l && a.a === b.a && a.id === b.id;
    for (let i = 1; i < track.bars.length; i++) {
      const b = track.bars[i];
      if (b.scale && same(b.scale, SC.scaleAt(track, i - 1))) b.scale = null;
    }
  };

  // ---- Chord symbols (bar headers: for all tracks) --------------------------------------------------

  /** The melody track whose scale the chords follow: the one being written if it is a melody, else the first one; or null. */
  SC.harmonyTrack = function (doc, prefer) {
    if (prefer && prefer.kind === 'pitched' && doc.tracks.includes(prefer)) return SC.instrumentOf(doc, prefer);
    return doc.tracks.find((t) => t.kind === 'pitched') || null;
  };
  /** The scale the chords of bar bi are built on: of the melody track (SC.harmonyTrack), else the key of the score. */
  SC.harmonyScale = function (doc, bi, prefer) {
    const t = SC.harmonyTrack(doc, prefer);
    if (t) return SC.scaleAt(t, bi);
    return (doc.harmony && doc.harmony.key) || { l: 0, a: 0, id: 'major' };
  };
  /** A chord symbol entry ({ t, deg, sev } | { t, name }) as a chord (js/pitch.js), or null. */
  SC.chordOf = function (doc, bi, c, prefer) {
    const P = TC.pitch;
    if (!c || !P) return null;
    if (c.deg) {
      const ch = P.degreeChord(SC.harmonyScale(doc, bi, prefer), c.deg, !!c.sev);
      return ch || P.degreeChord(SC.harmonyScale(doc, bi, prefer), 1, !!c.sev); // (blues has no ii: its I)
    }
    return c.name ? P.parseChord(c.name, false) : null;
  };
  /** The chord symbols of bar bi as chords: [{ t, c (entry), ch (chord) }]. */
  SC.chordsIn = function (doc, bi, prefer) {
    const h = doc.bars[bi];
    return h && h.chords ? h.chords.map((c) => ({ t: c.t, c, ch: SC.chordOf(doc, bi, c, prefer) })).filter((x) => x.ch) : [];
  };
  /**
   * The chord that sounds at (bar bi, tick): the last one written up to there - also in the bars before
   * (in written order). { bar, t, c, ch } or null.
   */
  SC.chordAt = function (doc, bi, tick, prefer) {
    for (let i = Math.min(bi, doc.bars.length - 1); i >= 0; i--) {
      const list = SC.chordsIn(doc, i, prefer).filter((x) => i < bi || x.t <= tick);
      if (list.length) return Object.assign({ bar: i }, list[list.length - 1]);
    }
    return null;
  };
  /** Set the chord symbol at (bar bi, tick t) - entry { deg, sev } or { name } - or remove it (null). */
  SC.setChord = function (doc, bi, t, entry) {
    const h = doc.bars[bi];
    if (!h) return false;
    const list = (h.chords || []).filter((c) => c.t !== t);
    if (entry) list.push(Object.assign({ t }, entry));
    const clean = cleanChords(list, TC.barTicks(h.ts));
    if (clean) h.chords = clean;
    else delete h.chords;
    return true;
  };
  /**
   * The places a chord may stand in bar bi: every step of `grid` ticks (the note value of the panel, like the click
   * grid: eighths -> 1 + 2 + …), without a grid its beats (6/8: the dotted quarters; odd meters: the beam groups);
   * a chord already standing elsewhere keeps its place in the list.
   */
  SC.chordSlots = function (doc, bi, grid) {
    const h = doc.bars[bi];
    if (!h) return [0];
    const L = TC.barTicks(h.ts), out = new Set();
    if (grid > 0) for (let t = 0; t < L; t += grid) out.add(Math.round(t));
    else (TC.timeline ? TC.timeline.clickTicks(h) : [0]).forEach((t) => out.add(t));
    (h.chords || []).forEach((c) => out.add(c.t));
    return [...out].sort((a, b) => a - b);
  };
  /** How chords guide writing a melody in bar bi: 'off' | 'mark' | 'lock' (a bar's own setting holds from it on). */
  SC.guideAt = function (doc, bi) {
    for (let i = Math.min(bi, doc.bars.length - 1); i >= 0; i--) if (doc.bars[i].guide) return doc.bars[i].guide;
    return (doc.harmony && doc.harmony.guide) || 'mark';
  };

  // ---- Finding repeats (e.g. after a MIDI import from a DAW: everything written out) ---------------------

  /**
   * What a bar of a track plays, as a key to compare (a %-bar: the bar it repeats); '' = empty.
   * loose: the strength (ghost, accent, velocity) does not count.
   */
  SC.barKey = function (doc, track, bi, loose) {
    const bar = track.bars[SC.sourceBar(doc, bi, track)];
    const evs = [];
    bar.voices.forEach((v) => v.forEach((ev) => {
      const ns = ev.notes.map((n) => {
        let k = n.pitch !== undefined ? 'p' + n.pitch + (n.tie ? 't' : '') + ':' + ev.dur : 'a' + n.art;
        if (!loose) k += [n.accent || 0, n.ghost ? 1 : 0, n.vel || '', n.orn || '', n.trem || 0, n.stick || '', n.head || '', n.stroke || ''].join(',');
        if (n.lyr) k += '"' + n.lyr.join('|'); // (other words: not the same bar - a %-bar would lose them)
        return k;
      }).sort();
      if (ns.length) evs.push(ev.tick + '=' + ns.join('+'));
    }));
    // (other dynamics: not the same bar - a %-bar would lose them)
    const dyn = track.bars[bi] && track.bars[bi].dyn;
    const ks = track.bars[bi] && track.bars[bi].ks; // (other keyswitches: not the same bar either)
    return evs.sort().join(' ') + (dyn && !loose ? ' ~' + dyn.map((d) => d.t + (d.v || d.w + d.len)).join(',') : '') + (ks && !loose ? ' ^' + ks.map((m) => m.t + m.k).join(',') : '');
  };
  /** Bar headers alike for a repeat (time signature, tempo, signs, chords … - line breaks do not count). */
  const sameHeader = (a, b) => {
    const strip = (h) => JSON.stringify(Object.assign({}, h, { lineBreak: false }));
    return strip(a) === strip(b);
  };
  /** Does a bar carry repeat signs, endings or jumps already (no new repeat over it)? */
  const formed = (h) => h.repeatStart || h.repeatEnd > 1 || h.volta || h.mark || h.end || h.jump;

  /**
   * Bars that repeat what comes right before them:
   *   simile:   [{ track, from, bars: [i …] }]  in one track bars i … play the same as bar `from` right before them
   *                                             (not yet %, not empty, same time signature) -> %-bars
   *   sections: [{ from, len, times }]          in all tracks bars from … from+len-1 come `times` times in a row
   *                                             (len >= 2; not made of one bar repeated: that is %) -> |: :| times×
   * opts.loose: the strength of the notes does not count; opts.tracks: only these tracks (default: all).
   */
  SC.findRepeats = function (doc, opts = {}) {
    const tracks = opts.tracks || doc.tracks, N = doc.bars.length;
    const keys = tracks.map((t) => doc.bars.map((h, i) => SC.barKey(doc, t, i, opts.loose)));
    const simile = [];
    tracks.forEach((t, k) => {
      let run = null;
      for (let i = 1; i < N; i++) {
        const same = !t.bars[i].simile && keys[k][i] && keys[k][i] === keys[k][i - 1] && doc.bars[i].ts.join('/') === doc.bars[i - 1].ts.join('/');
        if (same) {
          if (!run) simile.push((run = { track: t, from: SC.sourceBar(doc, i - 1, t), bars: [] }));
          run.bars.push(i);
        } else if (!(t.bars[i].simile && run)) run = null; // (a % already there: the run goes on after it)
      }
    });
    // sections: all tracks together
    const all = doc.bars.map((h, i) => keys.map((ks) => ks[i]).join('|'));
    const empty = (i) => keys.every((ks) => !ks[i]);
    const blockEq = (a, b, len) => {
      for (let j = 0; j < len; j++) if (all[a + j] !== all[b + j] || !sameHeader(Object.assign({}, doc.bars[a + j], { marker: '', tempo: null }), Object.assign({}, doc.bars[b + j], { marker: '', tempo: null })) || doc.bars[b + j].marker || doc.bars[b + j].tempo || formed(doc.bars[a + j]) || formed(doc.bars[b + j])) return false;
      return true;
    };
    const sections = [];
    for (let a = 0; a < N;) {
      let found = null;
      for (let len = 2; !found && a + 2 * len <= N; len++) {
        const block = all.slice(a, a + len);
        if (block.every((x) => x === block[0])) continue; // one bar again and again: %-bars
        let filled = false;
        for (let j = 0; j < len; j++) if (!empty(a + j)) filled = true;
        if (!filled || !blockEq(a, a + len, len)) continue;
        let times = 2;
        while (a + (times + 1) * len <= N && blockEq(a, a + times * len, len)) times++;
        found = { from: a, len, times };
      }
      if (found) {
        sections.push(found);
        a += found.len * found.times;
      } else a++;
    }
    return { simile, sections };
  };
  /** A section found: its copies go, the first one gets |: … :| times× (one undo step). */
  SC.foldSection = function (doc, s) {
    const end = s.from + s.len - 1;
    if (!SC.deleteBars(doc, end + 1, s.len * (s.times - 1))) return false;
    doc.bars[s.from].repeatStart = true;
    doc.bars[end].repeatEnd = s.times;
    return true;
  };

  /**
   * Set every repeat found at once: first the sections (|: :| n×, from the back so the bar numbers ahead stay),
   * then %-bars in every track. Returns { sections, similes } (how many).
   */
  SC.autoRepeats = function (doc, opts = {}) {
    const secs = SC.findRepeats(doc, opts).sections.slice().reverse();
    secs.forEach((s) => SC.foldSection(doc, s));
    let n = 0;
    SC.findRepeats(doc, opts).simile.forEach((r) => r.bars.forEach((i) => { if (SC.setSimile(doc, r.track, i, true)) n++; }));
    return { sections: secs.length, similes: n };
  };
  /** The repeat (|: … :| n×) bar bi lies in, without endings: { from, to, times } or null. */
  SC.repeatAround = function (doc, bi) {
    let a = bi;
    while (a > 0 && !doc.bars[a].repeatStart && !(doc.bars[a - 1].repeatEnd > 1)) a--;
    let z = bi;
    while (z < doc.bars.length - 1 && !(doc.bars[z].repeatEnd > 1)) z++;
    if (!(doc.bars[z].repeatEnd > 1)) return null;
    for (let i = a; i <= z; i++) if (doc.bars[i].volta || (i < z && doc.bars[i].repeatEnd > 1) || (i > a && doc.bars[i].repeatStart)) return null;
    return { from: a, to: z, times: doc.bars[z].repeatEnd };
  };
  /** Write one repeat out again (the notes of every pass as bars of their own; the signs go). */
  SC.unfoldSection = function (doc, bi) {
    const r = SC.repeatAround(doc, bi);
    if (!r) return false;
    const clip = SC.copyBars(doc, r.from, r.to), len = r.to - r.from + 1;
    doc.bars[r.from].repeatStart = false;
    doc.bars[r.to].repeatEnd = 0;
    for (let k = 1; k < r.times; k++) {
      const at = r.from + k * len;
      for (let j = 0; j < len; j++) {
        SC.insertBars(doc, at + j, 1, doc.bars[r.from + j].ts);
        const h = doc.bars[r.from + j];
        Object.assign(doc.bars[at + j], { beam: h.beam ? h.beam.slice() : null, tempo: null });
      }
      SC.pasteBars(doc, at, clip); // (%-bars come as the notes they play)
    }
    return r;
  };

  // ---- Melody: ties (a note tied on from the one before it - also across the bar line) -------------
  // A tied note is a note of its own (note.tie, at the place where the one before it ends, same pitch); each
  // bar keeps its notes, as in Guitar Pro and MusicXML. A tie only counts where it fits (tiedFrom): a note
  // moved away, or another pitch before it, simply loses it.

  /** The note `n` (event ev, bar bi, voice vi) is tied on from: { bar, ev, note } (same pitch, ending where n starts), or null. */
  SC.tiedFrom = function (doc, track, bi, vi, ev, n) {
    if (!n.tie || n.pitch === undefined) return null;
    let pb = bi, prev = null;
    if (ev.tick > 0) {
      prev = (track.bars[bi].voices[vi] || []).filter((e) => e.tick < ev.tick).pop();
      if (!prev || prev.tick + prev.dur !== ev.tick) return null;
    } else {
      if (bi === 0 || track.bars[bi].simile || track.bars[bi - 1].simile) return null; // (no tie into or out of a %-bar)
      pb = bi - 1;
      prev = (track.bars[pb].voices[vi] || []).slice(-1)[0];
      if (!prev || prev.tick + prev.dur !== TC.barTicks(doc.bars[pb].ts)) return null;
    }
    const note = prev.notes.find((x) => x.pitch === n.pitch);
    return note ? { bar: pb, ev: prev, note } : null;
  };
  /** The note tied on from `n`: { bar, ev, note }, or null. */
  SC.tiedTo = function (doc, track, bi, vi, ev, n) {
    const x = SC.nextNote(doc, track, bi, vi, ev, n);
    return x && x.note.tie ? x : null;
  };
  /** The note of the same pitch that starts where `n` ends (tied or not): { bar, ev, note }, or null - what a tie could go to. */
  SC.nextNote = function (doc, track, bi, vi, ev, n) {
    if (n.pitch === undefined) return null;
    const L = TC.barTicks(doc.bars[bi].ts);
    let nb = bi, next = null;
    if (ev.tick + ev.dur < L) next = (track.bars[bi].voices[vi] || []).find((e) => e.tick === ev.tick + ev.dur);
    else if (bi + 1 < track.bars.length && !track.bars[bi].simile && !track.bars[bi + 1].simile) {
      nb = bi + 1;
      next = (track.bars[nb].voices[vi] || []).find((e) => e.tick === 0);
    }
    const note = next && next.notes.find((x) => x.pitch === n.pitch);
    return note ? { bar: nb, ev: next, note } : null;
  };
  /**
   * What a tie from note `n` could go to: the next note of its voice, if it is the same tone - right after it, or after
   * a rest (only rests between, in this bar; the next bar: its note on beat 1). { bar, ev, note, gap: ticks of rest
   * between (0: right after it) }, or null.
   */
  SC.tieTarget = function (doc, track, bi, vi, ev, n) {
    const right = SC.nextNote(doc, track, bi, vi, ev, n);
    if (right) return Object.assign(right, { gap: 0 });
    if (n.pitch === undefined || track.bars[bi].simile) return null;
    const L = TC.barTicks(doc.bars[bi].ts), end = ev.tick + ev.dur;
    const later = (track.bars[bi].voices[vi] || []).filter((e) => e.tick >= end).sort((a, b) => a.tick - b.tick)[0];
    let nb = bi, next = later;
    if (!later) {
      if (bi + 1 >= track.bars.length || track.bars[bi + 1].simile) return null;
      nb = bi + 1;
      next = (track.bars[nb].voices[vi] || []).find((e) => e.tick === 0);
    }
    const note = next && next.notes.find((x) => x.pitch === n.pitch);
    return note ? { bar: nb, ev: next, note, gap: (nb === bi ? next.tick : L) - end } : null;
  };
  /**
   * Ties of a chord (event ev): every tone of it that the next event has too. Returns { targets: [tieTarget …], gap,
   * all: every one of them tied already }, or null when none can be tied.
   */
  SC.chordTies = function (doc, track, bi, vi, ev) {
    const first = ev.notes.map((n) => SC.tieTarget(doc, track, bi, vi, ev, n)).find(Boolean);
    if (!first) return null;
    const targets = ev.notes.map((n) => SC.tieTarget(doc, track, bi, vi, ev, n)).filter((x) => x && x.ev === first.ev);
    return { targets, gap: first.gap, all: !first.gap && targets.every((x) => x.note.tie) };
  };
  /** Tie the chord ev to the next one (on; a rest between: ev fills it) or untie it. False if nothing can be tied. */
  SC.tieChord = function (doc, track, bi, vi, ev, on) {
    const c = SC.chordTies(doc, track, bi, vi, ev);
    if (!c) return false;
    if (on && c.gap) ev.dur += c.gap;
    c.targets.forEach((x) => { if (on) x.note.tie = true; else delete x.note.tie; });
    return true;
  };
  /** The whole chain of tied notes a note belongs to, from its first one: [{ note, ev, bar, voice, track }]. */
  SC.tieChain = function (doc, id) {
    const h = SC.findNote(doc, id);
    if (!h) return [];
    if (h.note.pitch === undefined) return [h];
    const at = (p, vi) => Object.assign({ voice: vi, track: h.track }, p);
    let cur = h;
    for (let p; (p = SC.tiedFrom(doc, h.track, cur.bar, cur.voice, cur.ev, cur.note));) cur = at(p, cur.voice);
    const out = [cur];
    for (let p; (p = SC.tiedTo(doc, h.track, cur.bar, cur.voice, cur.ev, cur.note));) out.push((cur = at(p, cur.voice)));
    return out;
  };
  /** Ids of the notes tied on from these notes (not the notes themselves). */
  SC.tiedOn = function (doc, ids) {
    const out = new Set();
    ids.forEach((id) => {
      const chain = SC.tieChain(doc, id), k = chain.findIndex((c) => c.note.id === id);
      chain.slice(k + 1).forEach((c) => out.add(c.note.id)); // (only what comes after it: the notes before stay)
    });
    ids.forEach((id) => out.delete(id));
    return [...out];
  };
  /** Total length in ticks of a tied chain (from its first note). */
  SC.chainTicks = (chain) => chain.reduce((a, c) => a + c.ev.dur, 0);

  /**
   * Melody: the event ev (bar bi, voice vi) sounds `total` ticks - across the bar lines as tied notes
   * (all of its notes, a chord as a chord). It stops at the next note of its voice (in its bar, or one at
   * the start of a following bar) and before a %-bar. What was tied on from it before is replaced.
   * Returns the length it got.
   */
  SC.setMelodyLength = function (doc, track, bi, vi, ev, total) {
    const old = SC.tiedOn(doc, ev.notes.map((n) => n.id));
    if (old.length) SC.removeNotes(doc, old);
    const voiceOf = (k) => track.bars[k].voices[vi] || [];
    const L = (k) => TC.barTicks(doc.bars[k].ts);
    const nextAt = (k, t) => voiceOf(k).filter((e) => e.tick > t).reduce((m, e) => Math.min(m, e.tick), L(k));
    ev.dur = Math.max(1, Math.min(total, nextAt(bi, ev.tick) - ev.tick));
    let got = ev.dur, prev = ev, k = bi;
    while (got < total && prev.tick + prev.dur === L(k) && k + 1 < track.bars.length) {
      k++;
      if (track.bars[k].simile || track.bars[k - 1].simile || voiceOf(k).some((e) => e.tick === 0)) break;
      const notes = prev.notes.map((n) => Object.assign(TC.newPitchNote(n.pitch, n.dia), { tie: true }));
      const res = SC.place(doc, track, k, vi, 0, total - got, notes[0]);
      if (!res.ev) break;
      res.ev.notes.push(...notes.slice(1));
      got += res.ev.dur;
      prev = res.ev;
    }
    return got;
  };
  /** Melody: how many ticks a note at (bar bi, tick, voice vi) could sound at most (up to the next note, across bar lines). */
  SC.melodyRoom = function (doc, track, bi, vi, tick) {
    let room = 0;
    for (let k = bi, t = tick; k < track.bars.length; k++, t = 0) {
      if (k > bi && (track.bars[k].simile || track.bars[k - 1].simile)) break;
      const L = TC.barTicks(doc.bars[k].ts), v = track.bars[k].voices[vi] || [];
      const next = v.filter((e) => e.tick > t || (k > bi && e.tick === 0)).reduce((m, e) => Math.min(m, e.tick), L);
      room += next - t;
      if (next < L) break;
    }
    return room;
  };

  /**
   * Melody notes (ids) into voice vi (0 / 1): each keeps its place, tone and length; in the other voice it ends at the
   * next note there (or the bar end). Returns how many moved.
   */
  SC.toVoice = function (doc, ids, vi) {
    let n = 0;
    for (const id of ids) {
      const h = SC.findNote(doc, id);
      if (!h || h.track.kind !== 'pitched' || h.voice === vi) continue;
      const v = h.track.bars[h.bar].voices[h.voice];
      h.ev.notes = h.ev.notes.filter((x) => x !== h.note);
      if (!h.ev.notes.length) v.splice(v.indexOf(h.ev), 1);
      const res = SC.place(doc, h.track, h.bar, vi, h.ev.tick, h.ev.dur, h.note);
      if (res.status === 'exists') continue; // (the same tone there already)
      n++;
    }
    return n;
  };
  /** Call fn(note, event, voiceIndex, barIndex, track) for every note. */
  SC.eachNote = function (doc, fn) {
    for (const t of doc.tracks) {
      t.bars.forEach((bar, bi) => bar.voices.forEach((voice, vi) => voice.forEach((ev) => ev.notes.forEach((n) => fn(n, ev, vi, bi, t)))));
    }
  };

  /** { note, ev, voice, bar, track } of a note id, or null. */
  SC.findNote = function (doc, id) {
    let hit = null;
    SC.eachNote(doc, (n, ev, voice, bar, track) => {
      if (!hit && n.id === id) hit = { note: n, ev, voice, bar, track };
    });
    return hit;
  };

  /** Events of a voice sorted by time; drops parts beyond the end of the bar. */
  SC.fitBar = function (doc, track, bi) {
    const L = TC.barTicks(doc.bars[bi].ts);
    const bar = track.bars[bi];
    bar.voices = bar.voices.map((voice) => {
      const v = voice.filter((e) => e.tick < L).sort((a, b) => a.tick - b.tick);
      v.forEach((e, i) => {
        const next = i + 1 < v.length ? v[i + 1].tick : L;
        e.dur = Math.max(1, Math.min(e.dur, next - e.tick, L - e.tick));
      });
      return v;
    });
  };

  /** Insert `count` empty bars before index `at` (time signature of the bar before, or ts). */
  SC.insertBars = function (doc, at, count = 1, ts) {
    at = TC.clamp(at, 0, doc.bars.length);
    const like = ts || (doc.bars[Math.max(0, at - 1)] || doc.bars[0] || { ts: [4, 4] }).ts;
    for (let k = 0; k < count; k++) {
      doc.bars.splice(at, 0, TC.newBarHeader(like));
      doc.tracks.forEach((t) => t.bars.splice(at, 0, TC.newTrackBar()));
    }
  };

  /** Remove bars from … count (at least one bar stays). */
  SC.deleteBars = function (doc, from, count = 1) {
    count = Math.min(count, doc.bars.length - 1);
    if (count <= 0) return false;
    doc.bars.splice(from, count);
    doc.tracks.forEach((t) => {
      t.bars.splice(from, count);
      t.bars[0].simile = false; // the first bar has nothing before it to repeat
    });
    return true;
  };

  /** A bar put in place of `old` keeps the scale change of `old` (melody tracks). */
  function keepScale(bar, old) {
    if (old && old.scale) bar.scale = old.scale;
    else delete bar.scale;
    return bar;
  }

  /** Empty bar `bi` (its %-sign goes too): in every track, or in track `only`. */
  SC.clearBar = function (doc, bi, only) {
    doc.tracks.forEach((t) => {
      if (!only || t === only) t.bars[bi] = keepScale(TC.newTrackBar(t.bars[bi].voices.length), t.bars[bi]);
    });
  };

  /**
   * Time signature from bar `bi` on: it applies to this bar and to the following bars that
   * had the same time signature as this one (up to the next change), like in notation programs.
   * onlyThis: change this bar alone.
   */
  SC.setTimeSig = function (doc, bi, ts, onlyThis) {
    if (!validTs(ts)) return false;
    const old = doc.bars[bi].ts.join('/');
    let i = bi;
    do {
      if (doc.bars[i].ts.join('/') !== ts.join('/')) doc.bars[i].beam = null;
      doc.bars[i].ts = ts.slice();
      if (doc.bars[i].chords) SC.setChord(doc, i, -1, null); // (chords past the new end go)
      doc.tracks.forEach((t) => SC.fitBar(doc, t, i));
      i++;
    } while (!onlyThis && i < doc.bars.length && doc.bars[i].ts.join('/') === old);
    return true;
  };

  /**
   * Time signature of bar `bi` alone, and the music after it moves along (e.g. a MIDI import without its time
   * signature change: a 2/4 bar written into 4/4 bars). All notes and chord symbols from bar bi on keep their
   * order and distance and are put into the bars again: a shorter bar pulls them forward, a longer one pushes them
   * back (a bar is added at the end when the last one runs over). The following bars keep their time signatures; bar signs
   * (repeats, texts, tempo) stay with their bars. %-bars from here on are written out first. A melody note that
   * now crosses a bar line is split and tied, a drum note is cut at it.
   */
  SC.setTimeSigShift = function (doc, bi, ts) {
    if (!validTs(ts) || !doc.bars[bi]) return false;
    if (doc.bars[bi].ts.join('/') === ts.join('/')) return true;
    const start = SC.absTick(doc, bi, 0);
    doc.tracks.forEach((t) => { for (let i = Math.max(1, bi); i < doc.bars.length; i++) if (t.bars[i].simile) SC.setSimile(doc, t, i, false); });
    // everything from bar bi on, counted from its start
    let end = 0;
    const evs = doc.tracks.map((t) => {
      const list = [];
      for (let i = bi; i < doc.bars.length; i++) {
        const off = SC.absTick(doc, i, 0) - start;
        t.bars[i].voices.forEach((v, vi) => v.forEach((ev) => {
          list.push({ vi, at: off + ev.tick, ev });
          end = Math.max(end, off + ev.tick + ev.dur);
        }));
        t.bars[i].voices = t.bars[i].voices.map(() => []);
      }
      return list;
    });
    const chords = [];
    for (let i = bi; i < doc.bars.length; i++) {
      const off = SC.absTick(doc, i, 0) - start;
      (doc.bars[i].chords || []).forEach((c) => chords.push(Object.assign({}, c, { t: off + c.t })));
      delete doc.bars[i].chords;
    }
    doc.bars[bi].ts = ts.slice();
    doc.bars[bi].beam = null;
    // room for all of it (the bars added at the end are like the last one)
    const room = () => SC.absTick(doc, doc.bars.length, 0) - start;
    while (room() < end) SC.insertBars(doc, doc.bars.length, 1, doc.bars[doc.bars.length - 1].ts);
    const where = (abs) => SC.atAbs(doc, start + abs);
    doc.tracks.forEach((t, k) => evs[k].forEach(({ vi, at, ev }) => {
      let dur = ev.dur, first = true;
      while (dur > 0) {
        const p = where(at);
        if (!p) break;
        const L = TC.barTicks(doc.bars[p.bar].ts), d = Math.min(dur, L - p.tick);
        const bar = t.bars[p.bar];
        while (bar.voices.length <= vi) bar.voices.push([]);
        const notes = first ? ev.notes : ev.notes.filter((n) => n.pitch !== undefined).map((n) => Object.assign(TC.clone(n), { id: TC.uid('n'), tie: true }));
        if (notes.length) bar.voices[vi].push(Object.assign({}, ev, { id: first ? ev.id : TC.uid('e'), tick: p.tick, dur: d, notes }));
        if (!notes.length || t.kind === 'drums') break; // (drums: cut at the bar line)
        first = false;
        at += d;
        dur -= d;
      }
    }));
    chords.forEach((c) => {
      const p = where(c.t);
      if (!p) return;
      const h = doc.bars[p.bar];
      h.chords = (h.chords || []).concat(Object.assign({}, c, { t: p.tick }));
    });
    for (let i = bi; i < doc.bars.length; i++) {
      if (doc.bars[i].chords) {
        const ch = cleanChords(doc.bars[i].chords, TC.barTicks(doc.bars[i].ts));
        if (ch) doc.bars[i].chords = ch;
        else delete doc.bars[i].chords;
      }
      doc.tracks.forEach((t) => SC.fitBar(doc, t, i));
    }
    return true;
  };

  /**
   * Beam groups from bar `bi` on (like the time signature: up to the next bar with another
   * time signature or other groups). groups: null = default.
   */
  SC.setBeam = function (doc, bi, groups) {
    const ts = doc.bars[bi].ts;
    if (groups && groups.reduce((a, b) => a + b, 0) !== ts[0]) return false;
    const key = (h) => h.ts.join('/') + '|' + (h.beam ? h.beam.join('+') : '');
    const old = key(doc.bars[bi]);
    let i = bi;
    do {
      doc.bars[i].beam = groups ? groups.slice() : null;
      i++;
    } while (i < doc.bars.length && key(doc.bars[i]) === old);
    return true;
  };

  /**
   * The order in which the bars are played - repeats, endings and jumps written out, as a MIDI file has them:
   * [{ bar, pass, n, via }]  bar: index of the written bar, pass: 1st, 2nd … time through its repeat,
   * n: number of the played bar (1, 2, …; what Cubase counts), via: 'dc' | 'ds' | 'coda' on the first
   * bar after a jump.
   *   |: … :|        repeatStart … repeatEnd (n times); a repeat end without a start goes back to
   *                  the bar after the previous repeat end (or to bar 1)
   *   endings        a bar with volta [1] is played in pass 1 only, [2] in pass 2 … (also bars before
   *                  the repeat end, e.g. a two-bar first ending)
   *   D.C. / D.S.    at the end of the bar (after its repeat is done): back to bar 1 / to the 𝄋 bar, once.
   *                  After it the repeats are played once and the last ending is taken (jumpRep: as at first);
   *                  "al Fine": it ends after the Fine bar, "al Coda": at To Coda on to the ⊕ bar.
   *                  Fine and To Coda count only after the jump.
   *   D.S.S.        the same, back to the 𝄋𝄋 bar (Segno Segno); "al Double Coda": at To Double Coda on to the ⊕⊕ bar
   */
  /**
   * Does bar i - the last bar of an ending, without a repeat end of its own - go back to the repeat start after
   * pass `pass` (default: its last pass)? Yes, if a later ending of the same group waits for a later pass: it could
   * not be reached otherwise (written in many scores: 1.–2. :| 4×, 3. without :|, 4.).
   */
  SC.endingGoesBack = function (doc, i, pass) {
    const bars = doc.bars, h = bars[i];
    if (!h || !h.volta || !h.volta.length || h.repeatEnd > 1) return false;
    const nx = bars[i + 1];
    if (nx && nx.volta && nx.volta.join() === h.volta.join()) return false; // (not its last bar)
    if (pass === undefined) pass = Math.max(...h.volta);
    for (let j = i + 1; j < bars.length && bars[j].volta && bars[j].volta.length; j++) if (Math.max(...bars[j].volta) > pass) return true;
    return false;
  };

  SC.playOrder = function (doc) {
    const bars = doc.bars, out = [], jumps = new Map(), taken = new Set();
    let i = 0, start = 0, pass = 1, back = false, lastVolta = false;
    let after = null, via = null; // after a jump: { fine, coda, rep }
    // the highest ending of the endings around bar k (after a jump without repeats: the one played)
    const lastEnding = (k) => {
      let a = k, z = k, m = 0;
      while (a > 0 && bars[a - 1].volta && bars[a - 1].volta.length) a--;
      while (z + 1 < bars.length && bars[z + 1].volta && bars[z + 1].volta.length) z++;
      for (let j = a; j <= z; j++) m = Math.max(m, ...bars[j].volta);
      return m;
    };
    const once = () => after && !after.rep;
    while (i < bars.length && out.length < 20000) {
      const h = bars[i], volta = h.volta && h.volta.length ? h.volta : null;
      if (!back) {
        if (h.repeatStart) {
          start = i;
          pass = 1;
        } else if (!volta && lastVolta && pass > 1) {
          start = i; // after the last ending: a new section
          pass = 1;
          jumps.clear(); // (a :| n× inside earlier endings may not have counted all its passes)
        }
      }
      back = false;
      if (volta && !volta.includes(once() ? lastEnding(i) : pass)) {
        i++;
        continue;
      }
      out.push(via ? { bar: i, pass, n: out.length + 1, via } : { bar: i, pass, n: out.length + 1 });
      via = null;
      lastVolta = !!volta;
      // after a jump: Fine ends, To Coda goes on to the coda (To Double Coda: to the double coda)
      if (after && after.al === 'fine' && h.end === 'fine') break;
      const target = after && after.al === 'coda' && h.end === 'toCoda' ? 'coda' : after && after.al === 'doubleCoda' && h.end === 'toDoubleCoda' ? 'doubleCoda' : null;
      if (target) {
        let c = bars.findIndex((b, k) => k > i && b.mark === target);
        if (c < 0) c = bars.findIndex((b) => b.mark === target);
        if (c < 0) break; // no coda: the end
        after.al = null;
        i = start = c;
        pass = 1;
        jumps.clear();
        via = 'coda';
        continue;
      }
      if (h.repeatEnd > 1 && !once()) {
        const done = jumps.get(i) || 0;
        // in an ending the passes go on counting (a :| at the end of the 3rd ending: on to the 4th pass), and it goes
        // back while a later ending waits
        if (done + 1 < h.repeatEnd || (volta && lastEnding(i) > pass)) {
          jumps.set(i, done + 1);
          pass = volta ? pass + 1 : done + 2;
          i = start;
          back = true;
          continue;
        }
        jumps.delete(i);
        start = i + 1;
        pass = 1;
      } else if (volta && !once() && SC.endingGoesBack(doc, i, pass)) {
        // the end of an ending without :| while a later ending still waits (1.-2. :| 4×, then 3., then 4.): back to |:
        pass++;
        i = start;
        back = true;
        continue;
      }
      // D.C. / D.S. / D.S.S. (each one once)
      if (h.jump && !taken.has(i)) {
        taken.add(i);
        const J = TC.jumpInfo(h.jump);
        const segno = J.to === 'start' ? -1 : bars.findIndex((b) => b.mark === J.to);
        after = { al: J.al, rep: !!h.jumpRep };
        i = start = segno >= 0 ? segno : 0;
        pass = 1;
        jumps.clear();
        lastVolta = false;
        via = J.to === 'start' ? 'dc' : 'ds';
        continue;
      }
      i++;
    }
    return out;
  };

  /** What is missing for the jumps of a score: [{ bar, problem: 'noSegno' | 'noFine' | 'noToCoda' | 'noCoda' }]. */
  SC.jumpProblems = function (doc) {
    const has = (k, v) => doc.bars.some((b) => b[k] === v);
    const out = [];
    doc.bars.forEach((b, i) => {
      if (!b.jump) return;
      const J = TC.jumpInfo(b.jump);
      if (J.to === 'segno' && !has('mark', 'segno')) out.push({ bar: i, problem: 'noSegno' });
      if (J.to === 'segnoSegno' && !has('mark', 'segnoSegno')) out.push({ bar: i, problem: 'noSegnoSegno' });
      if (J.al === 'fine' && !has('end', 'fine')) out.push({ bar: i, problem: 'noFine' });
      if (J.al === 'coda' && !has('end', 'toCoda')) out.push({ bar: i, problem: 'noToCoda' });
      if (J.al === 'coda' && !has('mark', 'coda')) out.push({ bar: i, problem: 'noCoda' });
      if (J.al === 'doubleCoda' && !has('end', 'toDoubleCoda')) out.push({ bar: i, problem: 'noToDoubleCoda' });
      if (J.al === 'doubleCoda' && !has('mark', 'doubleCoda')) out.push({ bar: i, problem: 'noDoubleCoda' });
    });
    return out;
  };

  /**
   * The played bars from bar `from` up to bar `to` (written bars, e.g. a selection): the play order
   * from the first time `from` is played; bars before `from` that a repeat goes back to are left
   * out, it ends at the first bar after `to`.
   */
  SC.playBars = function (doc, from = 0, to = doc.bars.length - 1) {
    const order = SC.playOrder(doc);
    let k = order.findIndex((o) => o.bar >= from);
    const out = [];
    if (k < 0) return out;
    // played up to the end: after a D.C. / D.S. the bars before `from` belong to it too
    let free = false;
    for (; k < order.length; k++) {
      const o = order[k];
      if (o.via && to >= doc.bars.length - 1) free = true;
      if (o.bar > to) break;
      if (free || o.bar >= from) out.push(o);
    }
    return out;
  };

  /** Does the score have repeats or endings? */
  SC.hasRepeats = (doc) => doc.bars.some((h) => h.repeatStart || h.repeatEnd > 1 || (h.volta && h.volta.length) || h.jump);

  /**
   * Write the repeats out in the score itself: every played bar becomes a bar of its own, so the
   * bar numbers are those of Cubase. %-bars are written out too (what they repeat may change).
   */
  SC.unfold = function (doc) {
    const order = SC.playOrder(doc);
    const headers = [], tracks = doc.tracks.map(() => []);
    // the tempo each written bar is played in (a jump back to before a tempo change takes the tempo there)
    let run = doc.meta.tempo;
    const tempoOf = doc.bars.map((b) => (run = b.tempo || run));
    let prevTempo = doc.meta.tempo;
    for (const o of order) {
      const h = TC.clone(doc.bars[o.bar]);
      Object.assign(h, { repeatStart: false, repeatEnd: 0, volta: null, lineBreak: false, mark: '', end: '', jump: '', jumpRep: false });
      h.tempo = headers.length && tempoOf[o.bar] !== prevTempo ? tempoOf[o.bar] : headers.length ? null : h.tempo;
      prevTempo = tempoOf[o.bar];
      headers.push(h);
      doc.tracks.forEach((t, k) => {
        const bar = TC.clone(t.bars[SC.sourceBar(doc, o.bar, t)]);
        bar.simile = false;
        if (t.kind === 'pitched') bar.scale = TC.clone(SC.scaleAt(t, o.bar)); // (tidied up below)
        bar.voices.forEach((v) => v.forEach((ev) => {
          ev.id = TC.uid('e');
          ev.notes.forEach((n) => { n.id = TC.uid('n'); });
        }));
        tracks[k].push(bar);
      });
    }
    doc.bars = headers;
    doc.tracks.forEach((t, k) => {
      t.bars = tracks[k];
      // melody: the scale every played bar had; written only where it changes
      if (t.kind === 'pitched' && t.bars.length) {
        t.scale = t.bars[0].scale;
        t.bars[0].scale = null;
        SC.setScale(t, 0, t.scale);
      }
    });
    return headers.length;
  };

  /**
   * Put every drum note into the voice its instrument has now (TC.drums.setStems: all up, feet
   * down, feet + low toms down). Notes at the same time in the same voice become one chord (the
   * shorter length wins), the lengths are then cut as usual. Only the notation changes - sound
   * and MIDI do not depend on voices. Returns true if something moved.
   */
  SC.revoice = function (doc) {
    let changed = false;
    const vo = (n) => TC.drums.voiceOf(n.art);
    for (const t of doc.tracks) {
      if (t.kind !== 'drums') continue;
      t.bars.forEach((bar, bi) => {
        if (bar.voices.every((v, vi) => v.every((ev) => ev.notes.every((n) => vo(n) === vi)))) return;
        changed = true;
        const out = [[], []];
        for (const v of bar.voices) {
          for (const ev of v) {
            const groups = new Map();
            ev.notes.forEach((n) => {
              if (!groups.has(vo(n))) groups.set(vo(n), []);
              groups.get(vo(n)).push(n);
            });
            for (const [vi, notes] of groups) {
              while (out.length <= vi) out.push([]);
              const at = out[vi].find((e) => e.tick === ev.tick);
              if (at) {
                at.notes.push(...notes);
                at.dur = Math.min(at.dur, ev.dur);
              } else {
                out[vi].push({ id: notes.length === ev.notes.length ? ev.id : TC.uid('e'), tick: ev.tick, dur: ev.dur, notes });
              }
            }
          }
        }
        bar.voices = out;
        SC.fitBar(doc, t, bi);
      });
    }
    return changed;
  };

  /** Ticks from the start of the score to `tick` in bar `bi` (written bars). */
  /** absTick for many places at once: (bar, tick) -> ticks from the start (the bar starts counted once). */
  SC.tickOf = function (doc) {
    const starts = [0];
    doc.bars.forEach((h, i) => starts.push(starts[i] + TC.barTicks(h.ts)));
    return (bi, tick) => (starts[bi] !== undefined ? starts[bi] : starts[starts.length - 1]) + tick;
  };
  SC.absTick = function (doc, bi, tick) {
    let t = 0;
    for (let i = 0; i < bi; i++) t += TC.barTicks(doc.bars[i].ts);
    return t + tick;
  };
  /** The bar and tick of a time counted from the start of the score, or null outside the score. */
  SC.atAbs = function (doc, abs) {
    if (abs < 0) return null;
    let t = 0;
    for (let i = 0; i < doc.bars.length; i++) {
      const L = TC.barTicks(doc.bars[i].ts);
      if (abs < t + L) return { bar: i, tick: abs - t };
      t += L;
    }
    return null;
  };

  /**
   * Move notes (ids) by `delta` ticks (across bars), optionally to instrument `art` (all of them).
   * Each note keeps its length. Nothing happens (false) if a note would leave the score, land in a
   * %-bar, or on a note of the same instrument that does not move.
   */
  SC.moveNotes = function (doc, ids, delta, art, pitchOf) {
    const first = ids.length && SC.findNote(doc, ids[0]);
    const track = first ? first.track : doc.tracks[0], moving = new Set(ids), items = [], slots = new Set();
    if (ids.some((id) => { const h = SC.findNote(doc, id); return h && h.track !== track; })) return false; // notes of several tracks do not move together
    for (const id of ids) {
      const h = SC.findNote(doc, id);
      if (!h) continue;
      const pos = SC.atAbs(doc, SC.absTick(doc, h.bar, h.ev.tick) + delta);
      if (!pos || track.bars[pos.bar].simile) return false;
      // drums: the instrument (art: another one); melody: the pitch (pitchOf(note): { pitch, dia } another one)
      const to = h.note.pitch !== undefined ? Object.assign({ pitch: h.note.pitch, dia: h.note.dia }, pitchOf ? pitchOf(h.note) : null) : { art: art || h.note.art };
      const key = pos.bar + ':' + pos.tick + ':' + (to.pitch !== undefined ? 'p' + to.pitch : to.art);
      if (slots.has(key)) return false; // two of them onto one place
      slots.add(key);
      for (const v of track.bars[pos.bar].voices) {
        for (const ev of v) {
          if (ev.tick === pos.tick && ev.notes.some((n) => !moving.has(n.id) && sameSlot(n, to))) return false;
        }
      }
      // (a tied note keeps its tie when the note before it moves along)
      const from = h.note.tie && SC.tiedFrom(doc, track, h.bar, h.voice, h.ev, h.note);
      items.push({ note: h.note, pos, dur: h.ev.dur, to, voice: h.voice, keepTie: !!from && moving.has(from.note.id) });
    }
    if (!items.length) return false;
    SC.removeNotes(doc, ids);
    for (const it of items) {
      const n = Object.assign({}, it.note, it.to);
      if (delta && !it.keepTie) delete n.tie; // (moved in time alone: no longer tied to what was before it)
      SC.place(doc, track, it.pos.bar, it.to.art !== undefined ? TC.drums.voiceOf(it.to.art) : it.voice, it.pos.tick, it.dur, n);
    }
    return true;
  };

  /**
   * The bar whose notes bar `bi` of `track` plays: a simile bar ("%") plays the bar before it.
   * The % belongs to a track: one track can repeat its bar while another plays something new.
   */
  SC.sourceBar = function (doc, bi, track = doc.tracks[0]) {
    while (bi > 0 && track.bars[bi].simile) bi--;
    return bi;
  };

  /**
   * Switch the "%" of bar `bi` in `track` on (the bar is emptied: it plays the bar before) or
   * off (the notes it repeated are written out, so they can be changed from there).
   */
  SC.setSimile = function (doc, track, bi, on) {
    if (bi <= 0 || !!track.bars[bi].simile === !!on) return false;
    if (on) {
      track.bars[bi] = keepScale(TC.newTrackBar(track.bars[bi].voices.length), track.bars[bi]);
      track.bars[bi].simile = true;
    } else {
      track.bars[bi] = TC.clone(track.bars[SC.sourceBar(doc, bi, track)]);
      track.bars[bi].simile = false;
      track.bars[bi].voices.forEach((v) => v.forEach((ev) => {
        ev.id = TC.uid('e');
        ev.notes.forEach((n) => { n.id = TC.uid('n'); });
      }));
      SC.fitBar(doc, track, bi);
    }
    return true;
  };

  /**
   * Copy of the notes of a bar (a %-bar: what it plays), for the clipboard: all tracks with the chord symbols - or
   * only `tracks` (e.g. the one being written, a piano: both hands), without the chord symbols.
   */
  SC.copyBar = function (doc, bi, tracks) {
    const src = SC.sourceBar(doc, bi);
    return Object.assign({
      ts: doc.bars[src].ts.slice(),
      tracks: (tracks || doc.tracks).map((t) => Object.assign(TC.clone(t.bars[SC.sourceBar(doc, bi, t)]), { simile: false })),
    }, tracks ? {} : { chords: doc.bars[bi].chords ? TC.clone(doc.bars[bi].chords) : null }); // (the chord symbols go along)
  };


  /**
   * Put copied notes into bar `bi` (replaces its notes; new ids; cut to its length): track k gets
   * the copied track k (a track the copy does not have stays as it is). only: put the copied tracks into these
   * tracks alone, in their order (a track, or [tracks]: e.g. a MIDI import into the track being written, the bar of one
   * track copied into another; a piano: both hands) - the other tracks and the chord symbols stay.
   */
  SC.pasteBar = function (doc, bi, clip, only) {
    if (!clip) return false;
    const targets = only ? [].concat(only) : null;
    doc.tracks.forEach((t, k) => {
      const from = targets ? (targets.includes(t) ? clip.tracks[targets.indexOf(t)] : null) : clip.tracks[k];
      if (!from) return;
      const bar = TC.clone(from);
      bar.simile = false;
      bar.voices.forEach((v) => v.forEach((ev) => {
        ev.id = TC.uid('e');
        ev.notes.forEach((n) => { n.id = TC.uid('n'); });
      }));
      t.bars[bi] = keepScale(bar, t.bars[bi]);
      SC.fitBar(doc, t, bi);
    });
    // all tracks pasted: the chord symbols of the copy too (into one track only: the chords stay)
    if (!only && clip.chords !== undefined) {
      const ch = cleanChords(clip.chords, TC.barTicks(doc.bars[bi].ts));
      if (ch) doc.bars[bi].chords = ch;
      else delete doc.bars[bi].chords;
    }
    return true;
  };

  /** Copy of bars a … b: { bars: [ copyBar … ] } (%-bars: what they play; tracks: only these, see SC.copyBar). */
  SC.copyBars = function (doc, a, b, tracks) {
    const bars = [];
    for (let i = a; i <= b; i++) bars.push(SC.copyBar(doc, i, tracks));
    return { bars };
  };
  /**
   * Paste copied bars from bar `at` on (each replaces the notes of one bar); past the end of the
   * score new bars are added with the copied time signature. Also takes a single copyBar.
   * Returns how many bars were pasted.
   */
  SC.pasteBars = function (doc, at, clip, only) {
    const list = clip && clip.bars ? clip.bars : clip ? [clip] : [];
    list.forEach((c, k) => {
      if (at + k >= doc.bars.length) SC.insertBars(doc, doc.bars.length, 1, c.ts);
      SC.pasteBar(doc, at + k, c, only);
    });
    return list.length;
  };
  /** A copy of bars a … b right after b (their time signatures and beam groups too). */
  SC.duplicateBars = function (doc, a, b) {
    const clip = SC.copyBars(doc, a, b);
    for (let i = a; i <= b; i++) {
      const at = b + 1 + (i - a);
      SC.insertBars(doc, at, 1, doc.bars[i].ts);
      doc.bars[at].beam = doc.bars[i].beam ? doc.bars[i].beam.slice() : null;
    }
    SC.pasteBars(doc, b + 1, clip);
    return b - a + 1;
  };

  /** A copy of bar `bi` right after it. */
  SC.duplicateBar = function (doc, bi) {
    const clip = SC.copyBar(doc, bi);
    SC.insertBars(doc, bi + 1, 1, doc.bars[bi].ts);
    doc.bars[bi + 1].beam = doc.bars[bi].beam ? doc.bars[bi].beam.slice() : null;
    SC.pasteBar(doc, bi + 1, clip);
  };

  /** Two drum notes are "the same" if they sit on the same line of the same instrument. */
  function sameSlot(a, b) {
    if (a.pitch !== undefined || b.pitch !== undefined) return a.pitch === b.pitch; // melody: the same pitch
    const x = TC.drums.byId(a.art), y = TC.drums.byId(b.art);
    return a.art === b.art || (x && y && x.el === y.el && x.line === y.line);
  }

  /**
   * Write a note at (track, bar, voice, tick) with duration `dur`.
   * - an event at the same tick gets the note as an extra chord note
   * - the same instrument there already: 'exists' (another articulation of it replaces it: 'changed')
   * - an event that still sounds at `tick` is shortened, the new one ends at the next event / bar end
   * Returns { status: 'added' | 'chord' | 'changed' | 'exists', note, ev }.
   */
  SC.place = function (doc, track, bi, vi, tick, dur, note) {
    const L = TC.barTicks(doc.bars[bi].ts);
    if (tick < 0 || tick >= L) return { status: 'outside' };
    const bar = track.bars[bi];
    while (bar.voices.length <= vi) bar.voices.push([]);
    const voice = bar.voices[vi];
    const at = voice.find((e) => e.tick === tick);
    if (at) {
      const same = at.notes.find((n) => sameSlot(n, note));
      if (same && same.art === note.art) return { status: 'exists', note: same, ev: at };
      if (same) {
        same.art = note.art;
        return { status: 'changed', note: same, ev: at };
      }
      at.notes.push(note);
      return { status: 'chord', note, ev: at };
    }
    for (const e of voice) if (e.tick < tick && e.tick + e.dur > tick) e.dur = tick - e.tick;
    const next = voice.filter((e) => e.tick > tick).reduce((m, e) => Math.min(m, e.tick), L);
    const ev = { id: TC.uid('e'), tick, dur: Math.max(1, Math.min(dur, next - tick)), notes: [note] };
    voice.push(ev);
    voice.sort((a, b) => a.tick - b.tick);
    return { status: 'added', note, ev };
  };

  /** Remove notes by id; events without notes disappear (their time becomes a rest). */
  SC.removeNotes = function (doc, ids) {
    const set = new Set(ids);
    let n = 0;
    for (const t of doc.tracks) {
      for (const bar of t.bars) {
        bar.voices = bar.voices.map((voice) => voice.filter((ev) => {
          const before = ev.notes.length;
          ev.notes = ev.notes.filter((x) => !set.has(x.id));
          n += before - ev.notes.length;
          return ev.notes.length > 0;
        }));
      }
    }
    return n;
  };

  /** New length for the events of the given notes (clipped at the next event / bar end). */
  SC.setDuration = function (doc, ids, dur) {
    const evs = new Map();
    ids.forEach((id) => {
      const h = SC.findNote(doc, id);
      if (h) evs.set(h.ev, h);
    });
    for (const [ev, h] of evs) {
      ev.dur = dur;
      SC.fitBar(doc, h.track, h.bar);
    }
    return evs.size;
  };

  /**
   * Strength of a drum note in five steps. Only the outer ones are marked: ghost (head in brackets)
   * and accent (>); soft / normal / strong are plain notes for fine tuning, soft and strong are
   * stored as note.vel. vel: MIDI velocity (played back the same; accent plays a little louder).
   */
  TC.STRENGTHS = [
    { key: 'ghost', label: 'Ghost', vel: 28 },
    { key: 'soft', label: 'soft', vel: 70 },
    { key: 'normal', label: 'normal', vel: 91 },
    { key: 'strong', label: 'strong', vel: 110 },
    { key: 'accent', label: 'Accent', vel: 127 },
  ];
  /** Step 0 … 4 of a note. */
  TC.levelOf = (n) => (n.ghost ? 0 : n.accent ? 4 : typeof n.vel === 'number' ? TC.levelOfVelocity(n.vel, true) : 2);
  /** Sets step 0 … 4 (a marcato stays a marcato). */
  TC.setLevel = function (n, lv) {
    n.ghost = lv === 0;
    n.accent = lv === 4 ? n.accent || 1 : 0;
    n.vel = lv === 1 || lv === 3 ? TC.STRENGTHS[lv].vel : null;
  };
  /** Step of a MIDI velocity: the middle between two steps divides (middle = only soft / normal / strong). */
  TC.levelOfVelocity = function (v, middle) {
    const lv = v < 49 ? 0 : v < 81 ? 1 : v < 101 ? 2 : v < 119 ? 3 : 4;
    return middle ? TC.clamp(lv, 1, 3) : lv;
  };

  /** A new melody note (pitch, its spelling dia) from the input settings. */
  TC.newPitchNote = (pitch, dia, inp = {}) => ({
    id: TC.uid('n'), pitch, dia: Number.isInteger(dia) ? dia : null, accent: inp.accent || 0, ghost: false, head: 'auto', vel: null,
    orn: null, trem: 0, stick: '',
  });

  /** A new drum note from the input settings. */
  TC.newDrumNote = (art, inp) => ({
    id: TC.uid('n'), art, accent: inp.accent || 0, ghost: !!inp.ghost, head: inp.head || 'auto', vel: null,
    orn: inp.orn || null, trem: inp.trem || 0, stick: inp.stick || '',
  });

  // ---- Lyrics ---------------------------------------------------------------------------------
  // A syllable belongs to an event of voice 1 of a melody track (kept on its first note: n.lyr[verse]).
  // The notes a syllable can go on ("slots"): the events of voice 1, in the order of the bars (as written,
  // not as played: the verses take the place of the repeats), without the ones only holding tied notes.

  SC.LYRIC_VERSES = 8;
  /** A syllable as stored: one line, no spaces at the ends, at most 40 characters ("Lie-" keeps its hyphen). */
  SC.cleanSyllable = (x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, 40) : '');
  /** The syllable of an event in verse v ('' = none). */
  SC.lyricOf = function (ev, v) {
    for (const n of ev.notes) if (n.lyr && n.lyr[v]) return n.lyr[v];
    return '';
  };
  /** Set the syllable of an event in verse v ('' removes it); it is kept on the first note. */
  SC.setLyric = function (ev, v, text) {
    text = SC.cleanSyllable(text);
    ev.notes.forEach((n, k) => {
      const lyr = (n.lyr || []).slice();
      while (lyr.length <= v) lyr.push('');
      lyr[v] = k === 0 ? text : '';
      while (lyr.length && !lyr[lyr.length - 1]) lyr.pop();
      if (lyr.length) n.lyr = lyr;
      else delete n.lyr;
    });
  };
  /** Is an event only the going on of tied notes (not struck again: no syllable of its own)? */
  SC.tiedOnly = (doc, track, bi, vi, ev) => ev.notes.length > 0 && ev.notes.every((n) => SC.tiedFrom(doc, track, bi, vi, ev, n));
  /** The places of syllables in a melody track: [{ bar, ev }] in the order of the bars (see above). */
  SC.lyricSlots = function (doc, track) {
    const out = [];
    if (!track || track.kind !== 'pitched') return out;
    track.bars.forEach((bar, bi) => {
      if (bar.simile || bi >= doc.bars.length) return;
      const L = TC.barTicks(doc.bars[bi].ts);
      (bar.voices[0] || []).forEach((ev) => {
        if (ev.tick < L && ev.notes.length && !SC.tiedOnly(doc, track, bi, 0, ev)) out.push({ bar: bi, ev });
      });
    });
    return out;
  };
  /** How many verses a track has (up to the last one with a syllable). */
  SC.lyricVerses = function (track) {
    let n = 0;
    if (!track || track.kind !== 'pitched') return 0;
    track.bars.forEach((b) => (b.voices[0] || []).forEach((ev) => ev.notes.forEach((x) => { if (x.lyr) n = Math.max(n, x.lyr.length); })));
    return n;
  };
  /** Does any melody track have lyrics? */
  SC.hasLyrics = (doc) => doc.tracks.some((t) => SC.lyricVerses(t) > 0);
  /**
   * Typed or pasted text as syllables, one per note: words split at spaces, a "-" inside a word splits it
   * into syllables ("Son-nen-schein" -> "Son-", "nen-", "schein"); "_" alone, or at the end of a word, leaves
   * a note out (the syllable before is sung over it: a melisma). Returns [text | null] - null = leave this note out.
   */
  SC.splitLyrics = function (text) {
    const out = [];
    String(text || '').split(/\s+/).forEach((word) => {
      if (!word) return;
      const m = /^(.*?)(_*)$/.exec(word), body = m[1], skip = m[2].length;
      const parts = body.split('-');
      parts.forEach((p, k) => {
        if (!p) return; // ("-" alone, "--": no empty syllables)
        out.push(k < parts.length - 1 ? p + '-' : p); // (a hyphen at the end: "Lie-" - the word goes on at the next note)
      });
      for (let k = 0; k < skip; k++) out.push(null);
    });
    return out;
  };
  /**
   * Write syllables (SC.splitLyrics) into verse v from slot `from` on (slots: SC.lyricSlots); a null leaves that
   * note as it is. Returns the index of the slot after the last one used (more syllables than notes: the rest is left).
   */
  SC.spreadLyrics = function (slots, from, v, syllables) {
    let k = from;
    for (const s of syllables) {
      if (k >= slots.length) break;
      if (s !== null) SC.setLyric(slots[k].ev, v, s);
      k++;
    }
    return k;
  };
  /**
   * Every syllable of a track as it is written out: Map ev -> [{ v, text, syllabic, hyphen, next, endNote }] - text
   * without the hyphen; syllabic 'single' | 'begin' | 'middle' | 'end' (MusicXML); hyphen: the word goes on, next: the
   * slot { bar, ev } of the next syllable of this verse; endNote: the word ends here and the notes after it have no
   * syllable of this verse up to a rest or the next syllable (a melisma: a line under them up to endNote).
   */
  SC.lyricInfo = function (doc, track) {
    const slots = SC.lyricSlots(doc, track), out = new Map(), verses = SC.lyricVerses(track);
    // does the event of slot b follow the one of slot a without a rest between?
    const touches = (a, b) => {
      if (a.bar === b.bar) return a.ev.tick + a.ev.dur >= b.ev.tick;
      if (b.bar !== a.bar + 1 || b.ev.tick > 0) return false;
      return a.ev.tick + a.ev.dur >= TC.barTicks(doc.bars[a.bar].ts);
    };
    for (let v = 0; v < verses; v++) {
      let open = false, last = null; // open: the syllable before ends in "-"
      slots.forEach((s, k) => {
        const raw = SC.lyricOf(s.ev, v);
        if (!raw) return;
        const hy = /-$/.test(raw) && raw.length > 1, text = hy ? raw.slice(0, -1) : raw;
        const info = { v, text, syllabic: open ? (hy ? 'middle' : 'end') : hy ? 'begin' : 'single', hyphen: hy, next: null, endNote: null };
        if (last) last.next = s;
        last = info;
        open = hy;
        if (!hy) {
          for (let j = k + 1; j < slots.length && !SC.lyricOf(slots[j].ev, v) && touches(slots[j - 1], slots[j]); j++) info.endNote = slots[j];
        }
        if (!out.has(s.ev)) out.set(s.ev, []);
        out.get(s.ev).push(info);
      });
      if (last) last.endNote = null; // (the last syllable of a verse: no line - a verse not typed to its end yet)
    }
    return out;
  };

  // ---- Dynamics (ppp … fff, hairpins) of a track ------------------------------------------------------------
  // They change how strongly the notes are played (playback, MIDI) - never the notes themselves (ghost, accent,
  // strength stay as written). Without any: mf, as before. Placed in written order (a repeat plays them again).

  SC.DYN_LEVELS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
  /** How much stronger / softer than mf each level plays (times the strength of the note). */
  SC.DYN_FACTORS = [0.35, 0.48, 0.62, 0.8, 1, 1.15, 1.3, 1.45];
  SC.DYN_MF = 4;
  /** A hairpin without a level after it: this many steps louder / softer. */
  SC.WEDGE_STEPS = 2;

  /** A bar's dynamics, cleaned (levels and hairpins inside the bar, one of each kind per place), or null. */
  SC.cleanDyn = function (list, L) {
    if (!Array.isArray(list)) return null;
    const seen = new Set(), out = [];
    list.forEach((d) => {
      if (!d || typeof d !== 'object') return;
      const t = Math.round(Number(d.t) || 0);
      if (t < 0 || t >= L) return;
      if (SC.DYN_LEVELS.includes(d.v) && !seen.has(t + 'v')) { seen.add(t + 'v'); out.push({ t, v: d.v }); }
      const len = Math.round(Number(d.len) || 0);
      if ((d.w === 'cresc' || d.w === 'dim') && len > 0 && !seen.has(t + 'w')) {
        seen.add(t + 'w');
        out.push(Object.assign({ t, w: d.w, len }, SC.DYN_LEVELS.includes(d.to) ? { to: d.to } : {}));
      }
    });
    return out.length ? out.sort((a, b) => a.t - b.t || (a.v ? -1 : 1)) : null;
  };
  /** The dynamics of bar bi of a track (written there; a %-bar has its own). */
  SC.dynIn = (track, bi) => (track.bars[bi] && track.bars[bi].dyn) || [];
  /**
   * Set a level (v: 'ppp' … 'fff') or a hairpin (w: 'cresc' | 'dim', len ticks) at tick t of bar bi - or remove
   * what is there (v / w null). Returns true when something changed.
   */
  SC.setDyn = function (doc, track, bi, t, what) {
    const bar = track.bars[bi];
    if (!bar) return false;
    const kind = what.w !== undefined ? 'w' : 'v';
    const before = JSON.stringify(bar.dyn || null);
    const list = (bar.dyn || []).filter((d) => !(d.t === t && d[kind]));
    if (what[kind]) list.push(kind === 'v' ? { t, v: what.v } : Object.assign({ t, w: what.w, len: what.len }, what.to ? { to: what.to } : {}));
    const clean = SC.cleanDyn(list, TC.barTicks(doc.bars[bi].ts));
    if (clean) bar.dyn = clean;
    else delete bar.dyn;
    return JSON.stringify(bar.dyn || null) !== before;
  };
  /**
   * The dynamics of a track in written order: [{ abs, lvl } | { abs, end, w, from, to }] - each hairpin with the
   * level it starts from and the one it reaches (the next level written up to one bar after its end, else
   * SC.WEDGE_STEPS steps on; that level holds after it).
   */
  SC.dynEvents = function (doc, track) {
    const marks = [], wedges = [], at = SC.tickOf(doc);
    track.bars.forEach((b, bi) => (b.dyn || []).forEach((d) => {
      const abs = at(bi, d.t);
      if (d.v) marks.push({ abs, lvl: SC.DYN_LEVELS.indexOf(d.v) });
      else wedges.push({ abs, end: abs + d.len, w: d.w, bar: bi, t: d.t, len: d.len, toV: d.to || null });
    }));
    marks.sort((a, b) => a.abs - b.abs);
    wedges.sort((a, b) => a.abs - b.abs);
    const levelAt = (x, list) => { let l = SC.DYN_MF; for (const m of list) if (m.abs <= x) l = m.lvl; return l; };
    const all = marks.slice();
    wedges.forEach((w) => {
      w.from = levelAt(w.abs, all);
      // the level it goes to: its own ("pp < ff"), else the next one written up to a bar after its end, else two steps on
      const next = marks.find((m) => m.abs > w.abs && m.abs <= w.end + 3840);
      w.to = w.toV ? SC.DYN_LEVELS.indexOf(w.toV) : next ? next.lvl : TC.clamp(w.from + (w.w === 'cresc' ? 1 : -1) * SC.WEDGE_STEPS, 0, SC.DYN_LEVELS.length - 1);
      w.target = !!next || !!w.toV;
      w.sign = !!w.toV && !marks.some((m) => m.abs === w.end); // (its own level: drawn at its end)
      if (w.toV || !next) { all.push({ abs: w.end, lvl: w.to, implied: true }); all.sort((a, b) => a.abs - b.abs); }
    });
    return { marks: all, wedges };
  };
  /** The level (index in SC.DYN_LEVELS) a track plays at a place - the last one written before it (mf without one). */
  SC.levelAt = function (doc, track, bi, tick) {
    const x = SC.absTick(doc, bi, tick);
    let l = SC.DYN_MF;
    for (const m of SC.dynEvents(doc, track).marks) if (m.abs <= x) l = m.lvl;
    return l;
  };
  /**
   * The level a track plays at a place: (bar, tick) -> 0 … 7 (index in SC.DYN_LEVELS, mf = 4) - inside a hairpin
   * between its start and end level (a fraction). For a VST whose loudness follows a controller (js/keyswitch.js KS.dynCC).
   */
  SC.dynLevel = function (doc, track) {
    const ev = SC.dynEvents(doc, track), at = SC.tickOf(doc);
    return (bi, tick) => {
      const x = at(bi, tick);
      const w = ev.wedges.find((q) => q.abs <= x && x < q.end);
      if (w) return w.from + (w.to - w.from) * (x - w.abs) / (w.end - w.abs);
      let l = SC.DYN_MF;
      for (const m of ev.marks) if (m.abs <= x) l = m.lvl; else break;
      return l;
    };
  };
  /**
   * How strongly a track plays at a place: (bar, tick) -> factor (1 = mf) - the level written before it, or
   * inside a hairpin the way from its start level to its end level.
   */
  SC.dynFactor = function (doc, track) {
    const ev = SC.dynEvents(doc, track), F = SC.DYN_FACTORS, at = SC.tickOf(doc);
    if (!ev.marks.length && !ev.wedges.length) return () => 1;
    return (bi, tick) => {
      const x = at(bi, tick);
      const w = ev.wedges.find((q) => q.abs <= x && x < q.end);
      if (w) return F[w.from] + (F[w.to] - F[w.from]) * (x - w.abs) / (w.end - w.abs);
      let l = SC.DYN_MF;
      for (const m of ev.marks) if (m.abs <= x) l = m.lvl; else break;
      return F[l];
    };
  };
})(window.TC);
