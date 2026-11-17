'use strict';
/*
 * Keyswitches of an instrument VST (UJAM Iron 2, a Virtual Bassist, an orchestral library …): low keys that change how
 * the notes are played - muted, a slide, staccato, pizz., tremolo … In the score they are directions under the staff
 * ("P.M. - - -┘", "pizz.") or signs at each note (staccato dots, tremolo strokes), not notes; playing / exporting,
 * Tactus sends their keys before the notes.
 *
 * The ways of playing are given by Tactus (KS.CATALOG, like the drum instruments of a kit profile): name, how they are
 * written, how long they hold. A profile only says which key of the VST plays each one (and has switches of its own).
 *
 *   track.ksw = { tpl, name, c3, keys: [{ id, name, short, note, kind }] }   (only when set; saved with the score)
 *     c3     the MIDI note the VST calls C3 (60 or 48) - its keys and its play range follow it
 *     init   keys sent at the start, unseen (Iron: trigger mode on - else its notes do not play)
 *     group  ways of playing of one group replace each other (Iron: open / muted / half / dead; picking its own)
 *     def    the way of playing of its group sent at the start when none is written before (ord., let ring …): a VST
 *            that latches its keys does not stay in what was played before (a P.M. taken out of the score)
 *     span   a slide ('once'): held over the note at its place and the next one (default), or 'note' only that one
 *     sign   written at each note while it holds: 'stacc' dot, 'staccmo' wedge, 'ten' line, 'port' line and dot,
 *            'acc' >, 'marc' ^, 'trem' strokes through the stem
 *     line   a dashed line to the next one of its group (P.M. - - -┘)
 *     kind   'art'   a way of playing: held until the next one of its group (with latch on or off)
 *            'once'  before the note at its place (a slide)
 *            'event' at its place (stop, release)
 *            'down' / 'up'  sent before a chord struck down / up (note.stroke) - the VST strums it itself
 *            'mode'  a switch of the VST (trigger mode, strum auto …): only with ▶ or at the start, not in the score -
 *                    named by the profile (the only keys not in the catalog)
 *     note   the key as the VST names it, counted from its C3 ('C1' … 'B2')
 *   bar.ks = [{ t, k }]   a keyswitch k (its id) at tick t of a track's bar
 *
 * The notes of the play range: the VST plays them shifted (Iron: a guitar written an octave up, its C3 = the tone D2):
 * profile noteShift (semitones added when sending).
 */
(function (TC) {
  const KS = (TC.ksw = {});
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // ---- The ways of playing Tactus knows (their names in English - js/i18n.js translates them) -----------------------
  // [id, name, short (text in the score, '' none), kind, group, more]
  const cat = (c, list) => list.map(([id, name, short, kind, group, more]) => Object.assign({ id, cat: c, name, short, kind }, group ? { group } : {}, more || {}));
  KS.CATS = [['orch', 'Strings · winds · orchestra'], ['guitar', 'Guitar · bass']];
  KS.CATALOG = [].concat(cat('orch', [
    ['sus', 'Sustain (ord.)', 'ord.', 'art', 'art', { def: true }], ['vib', 'Sustain vibrato', 'vib.', 'art', 'art'],
    ['nonvib', 'Sustain non vibrato', 'non vib.', 'art', 'art'], ['legato', 'Legato', 'legato', 'art', 'art'],
    ['stacc', 'Staccato', '', 'art', 'art', { sign: 'stacc' }], ['staccmo', 'Staccatissimo', '', 'art', 'art', { sign: 'staccmo' }],
    ['spicc', 'Spiccato', 'spicc.', 'art', 'art', { sign: 'stacc' }], ['portato', 'Portato', '', 'art', 'art', { sign: 'port' }],
    ['tenuto', 'Tenuto', '', 'art', 'art', { sign: 'ten' }], ['accented', 'Accented', '', 'art', 'art', { sign: 'acc' }],
    ['marc', 'Marcato', '', 'art', 'art', { sign: 'marc' }], ['trem', 'Tremolo', '', 'art', 'art', { sign: 'trem' }],
    ['trill1', 'Trill (half tone)', 'tr ½', 'art', 'art'], ['trill2', 'Trill (whole tone)', 'tr', 'art', 'art'],
    ['pizz', 'Pizzicato', 'pizz.', 'art', 'art'], ['bartok', 'Bartók pizzicato', 'Bartók pizz.', 'art', 'art'],
    ['colLegno', 'Col legno', 'col legno', 'art', 'art'], ['harm', 'Harmonics', 'harm.', 'art', 'art'],
    ['sulPont', 'Sul ponticello', 'sul pont.', 'art', 'art'], ['sulTasto', 'Sul tasto', 'sul tasto', 'art', 'art'],
    ['flaut', 'Flautando', 'flaut.', 'art', 'art'], ['flz', 'Flutter tongue', 'flz.', 'art', 'art'],
    ['senzaSord', 'Senza sordino', 'senza sord.', 'art', 'sord', { def: true }], ['conSord', 'Con sordino', 'con sord.', 'art', 'sord'],
  ]), cat('guitar', [
    ['open', 'Let ring (open)', 'let ring', 'art', 'mute', { def: true }], ['muted', 'Muted (palm mute)', 'P.M.', 'art', 'mute', { line: true }],
    ['half', 'Half muted', '½ M.', 'art', 'mute', { line: true }], ['dead', 'Dead notes', 'Dead', 'art', 'mute', { line: true }],
    ['pick1', 'Picking 1', 'pick', 'art', 'pick', { line: true }], ['pick2', 'Picking 2', 'pick 2', 'art', 'pick', { line: true }],
    ['pick3', 'Picking 3', 'pick 3', 'art', 'pick', { line: true }], ['pick4', 'Picking 4', 'pick 4', 'art', 'pick', { line: true }],
    ['pick5', 'Picking 5', 'pick 5', 'art', 'pick', { line: true }], ['pick6', 'Picking 6', 'pick 6', 'art', 'pick', { line: true }],
    ['legOff', 'Legato off', 'non leg.', 'art', 'legato', { def: true }], ['legOn', 'Legato on', 'legato', 'art', 'legato', { line: true }],
    ['slideUp', 'Slide up', 'sl. ↗', 'once'], ['slideDown', 'Slide down', 'sl. ↘', 'once'],
    ['slideUpDown', 'Slide up & down', 'sl. ↗↘', 'once'], ['pickSlide', 'Pick slide', 'p. sl.', 'once'],
    ['slide1', 'Slide 1 (pre-intro)', 'sl. 1', 'once', '', { span: 'note' }], ['slide2', 'Slide 2 (pre-intro)', 'sl. 2', 'once', '', { span: 'note' }],
    ['slide3', 'Slide 3 (pre-intro)', 'sl. 3', 'once', '', { span: 'note' }],
    ['down', 'Downstroke', '↓', 'down'], ['up', 'Upstroke', '↑', 'up'],
    ['stopDown', 'Stop (downstroke)', 'stop ↓', 'event'], ['stopUp', 'Stop (upstroke)', 'stop ↑', 'event'],
    ['stop', 'Full stop', 'stop', 'event'], ['release', 'Release', 'rel.', 'event'],
    ['dead1', 'Dead note 1', 'x', 'event'], ['dead2', 'Dead note 2', 'x 2', 'event'],
    ['deadMode', 'Silent dead notes (on / off)', 'dead ⇄', 'event'],
  ]));
  KS.cat = (id) => KS.CATALOG.find((x) => x.id === id) || null;
  /** A key of a profile: a way of playing of the catalog on a key of the VST (its properties from the catalog). */
  KS.catKey = function (id, note) {
    const c = KS.cat(id);
    if (!c) return null;
    const k = Object.assign({}, c, { note });
    delete k.cat;
    return k;
  };
  /** A switch of the VST (named by the profile, not in the score). */
  KS.modeKey = (id, name, note) => ({ id, name, short: '', note, kind: 'mode' });

  // ---- Templates: the keys of a VST on the catalog ----------------------------------------------------------------
  KS.TEMPLATES = [{
    // UJAM Iron 2, Instrument Mode (the manual's key switch table; play range C3 … F5 = D2 … F4, four tones at a time)
    // (checked with Iron 2: C3 = 60; C1 is free - the slides start on D1; D#1 trigger mode on is needed, else the
    // notes do not play: sent at the start, unseen; open / muted / half / dead exclude each other, picking is its own)
    // (v: the version of the template - a profile saved with an older one is brought to it when loaded)
    tpl: 'ujam-iron2', v: 2, name: 'UJAM Iron 2 (Instrument Mode)', c3: 60, noteShift: 12, poly: 4, init: ['trigOn'],
    keys: Object.entries({ open: 'A#2', muted: 'F#2', half: 'G#2', dead: 'D#2', pick1: 'C2', pick2: 'D2', pick3: 'E2', pick4: 'F2', pick5: 'G2', pick6: 'A2',
      slideUp: 'D1', slideDown: 'E1', slideUpDown: 'F1', pickSlide: 'G1', up: 'A1', down: 'B1', stopUp: 'G#1', stopDown: 'A#1', release: 'C#2' })
      .map(([id, note]) => KS.catKey(id, note)).concat([KS.modeKey('trigOff', 'Trigger mode off', 'C#1'), KS.modeKey('trigOn', 'Trigger mode on', 'D#1'),
        KS.modeKey('noArtStrum', 'Disable articulation strumming', 'F#1'), KS.modeKey('strumAuto', 'Strum – auto', 'B2')]),
  }, {
    // UJAM Virtual Bassist Rowdy, Instrument Mode (the manual: the lowest octave C0 … B0; play range C3 … E5 - a bass, sent
    // an octave up - checked with a low E, 2026-11-17)
    tpl: 'ujam-rowdy', v: 2, name: 'UJAM Virtual Bassist Rowdy (Instrument Mode)', c3: 60, noteShift: 12, poly: 1, init: [],
    keys: Object.entries({ slide1: 'C0', slide2: 'D0', slide3: 'E0', legOff: 'C#0', legOn: 'F#0', deadMode: 'G0', dead1: 'A0', dead2: 'B0', stop: 'A#0' })
      .map(([id, note]) => KS.catKey(id, note)),
  }];
  KS.KINDS = ['art', 'once', 'event', 'down', 'up', 'mode'];
  KS.template = (id) => KS.TEMPLATES.find((x) => x.tpl === id) || null;

  /** A key name ('C1', 'F#2', 'Bb2') as a MIDI note, counted from the VST's C3 (c3: 60 or 48); null if no name. */
  KS.noteOf = function (name, c3 = 60) {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(name || '').trim());
    if (!m) return null;
    let pc = NAMES.indexOf(m[1].toUpperCase()) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const n = c3 + (Number(m[3]) - 3) * 12 + pc;
    return n >= 0 && n <= 127 ? n : null;
  };
  /** A MIDI note as the VST names it (C3 = c3). */
  KS.nameOf = (n, c3 = 60) => NAMES[((n % 12) + 12) % 12] + (3 + Math.floor((n - c3) / 12)); // (c3 is a C: 60 or 48)

  /** A profile from the template (a copy: the track keeps it, with what is changed in it). */
  KS.fromTemplate = function (id) {
    const t = KS.template(id);
    return t ? JSON.parse(JSON.stringify(t)) : null;
  };
  /**
   * A profile cleaned (loading a score, the library of own profiles), or null. empty: a profile without keys is kept
   * (the library: a profile being made); a track's profile needs keys.
   *   lib   the id of the own profile (js/kswlib.js) it was taken from - the track finds it again
   */
  KS.clean = function (p, empty) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.keys)) return null;
    // a profile of a template saved before it was corrected (no init keys yet - Iron: slides one key off, no trigger
    // mode, no groups): the corrected template, keeping which C3 was chosen
    const tpl = KS.template(p.tpl);
    if (tpl && (!Array.isArray(p.init) || (p.v || 1) < (tpl.v || 1))) p = Object.assign(KS.fromTemplate(p.tpl), { c3: p.c3 });
    // a way of playing of the catalog: as the catalog says (only its key from the profile); a switch: as named; a key
    // of a profile made before the catalog: as it was
    const seen = new Set();
    const keys = p.keys.filter((k) => k && typeof k.id === 'string' && !seen.has(k.id) && seen.add(k.id) && KS.noteOf(k.note) !== null && (KS.cat(k.id) || KS.KINDS.includes(k.kind)))
      .map((k) => KS.cat(k.id) ? KS.catKey(k.id, k.note) : Object.assign({ id: k.id.slice(0, 40), name: String(k.name || k.id).slice(0, 60), short: String(k.short || '').slice(0, 12), note: k.note, kind: k.kind },
        typeof k.group === 'string' && k.group ? { group: k.group.slice(0, 20) } : {}, k.span === 'note' ? { span: 'note' } : {}));
    const dyn = KS.cleanDyn(p.dyn);
    if (!keys.length && !dyn && !empty) return null;
    const ids = new Set(keys.map((k) => k.id));
    return Object.assign({ tpl: typeof p.tpl === 'string' ? p.tpl : '', v: Number.isInteger(p.v) ? p.v : 1 },
      typeof p.lib === 'string' && p.lib ? { lib: p.lib.slice(0, 40) } : {}, { name: String(p.name || 'Keyswitches').slice(0, 60), c3: p.c3 === 48 ? 48 : 60,
        noteShift: Number.isInteger(p.noteShift) && Math.abs(p.noteShift) <= 36 ? p.noteShift : 0, poly: Number.isInteger(p.poly) && p.poly > 0 ? Math.min(p.poly, 16) : 0,
        init: Array.isArray(p.init) ? p.init.filter((id) => ids.has(id)) : [] }, dyn ? { dyn } : {}, { keys });
  };

  // ---- Dynamics through a controller (Iconica: the loudness on the modulation wheel) ----------------------------
  // profile.dyn = { cc, lo, hi }: the dynamics of the score (ppp … fff, hairpins) also sent as controller cc - ppp = lo,
  // fff = hi, the levels between evenly; a hairpin glides (a step every KS.DYN_STEP ticks). The notes' strengths stay.

  /** The controllers offered: [number, name]. */
  KS.DYN_CCS = [[1, 'CC 1 (modulation wheel)'], [11, 'CC 11 (expression)'], [2, 'CC 2 (breath)']];
  KS.DYN_STEP = 120; // a 32nd
  /** profile.dyn cleaned, or null (off). */
  KS.cleanDyn = function (d) {
    if (!d || typeof d !== 'object' || !KS.DYN_CCS.some(([n]) => n === d.cc)) return null;
    const v = (x, def) => (Number.isInteger(x) ? Math.max(0, Math.min(127, x)) : def);
    return { cc: d.cc, lo: v(d.lo, 20), hi: v(d.hi, 127) };
  };
  /** The value a level (0 … 7, a fraction inside a hairpin) sends. */
  KS.dynValue = (d, lvl) => Math.round(d.lo + (d.hi - d.lo) * lvl / (TC.score.DYN_LEVELS.length - 1));
  /**
   * The controller values of a track as played - [{ at, val }] (only where the value changes; the value that holds
   * at the start first of all, so the VST does not keep an old one). order / timeOf as in KS.events.
   */
  KS.dynCC = function (doc, track, order, timeOf) {
    const d = track && track.ksw && track.ksw.dyn;
    if (!d || !order.length) return [];
    const SC = TC.score, lvl = SC.dynLevel(doc, track), ev = SC.dynEvents(doc, track), abs = SC.tickOf(doc);
    const out = [];
    let last = null;
    for (const o of order) {
      const L = TC.barTicks(doc.bars[o.bar].ts), a0 = abs(o.bar, 0), ticks = new Set([0]);
      ev.marks.forEach((m) => { if (m.abs >= a0 && m.abs < a0 + L) ticks.add(m.abs - a0); });
      ev.wedges.forEach((w) => {
        if (w.end <= a0 || w.abs >= a0 + L) return;
        for (let t = Math.max(0, w.abs - a0); t < Math.min(L, w.end - a0); t += KS.DYN_STEP) ticks.add(t);
        if (w.end - a0 < L) ticks.add(w.end - a0);
      });
      [...ticks].sort((x, y) => x - y).forEach((t) => {
        const val = KS.dynValue(d, lvl(o.bar, t));
        if (val !== last) out.push({ at: timeOf(o, t), val });
        last = val;
      });
    }
    return out;
  };
  /** The key of a keyswitch of a track (its MIDI note), or null. */
  KS.keyOf = (track, id) => {
    const k = track && track.ksw && track.ksw.keys.find((x) => x.id === id);
    return k ? Object.assign({ midi: KS.noteOf(k.note, track.ksw.c3) }, k) : null;
  };
  /** The text of a keyswitch in the score ('' none: a way of playing written as signs at the notes, e.g. staccato). */
  KS.markText = (k) => (k ? (KS.cat(k.id) ? k.short : k.short || k.name) : '');
  /** Does a way of playing draw a dashed line to the next one of its group (P.M. - - -┘)? (before the catalog: all but "open") */
  KS.hasLine = (k) => !!k && k.kind === 'art' && (KS.cat(k.id) ? !!KS.cat(k.id).line : !/^(open|let ring)$/i.test(k.short || k.name));
  /** The button text of a keyswitch (the note panel): its text, else its name. */
  KS.label = (k) => (k ? k.short || (TC.tr ? TC.tr(k.name) : k.name) : '');
  /** The keyswitches of a track that go into the score (ways of playing, slides, stops). */
  KS.scoreKeys = (track) => (track && track.ksw ? track.ksw.keys.filter((k) => k.kind === 'art' || k.kind === 'once' || k.kind === 'event') : []);
  /** Does the track strum with the VST's own stroke keys (then Tactus does not spread a stroke itself)? */
  KS.strums = (track) => !!(track && track.ksw && track.ksw.keys.some((k) => k.kind === 'down' || k.kind === 'up'));

  /**
   * The keyswitch events of a track in the order played - for playback and the MIDI export: [{ at, key, hold }] where
   * `at` is the time (seconds or ticks, as timeOf gives it) and `hold` how long a way of playing is held (to the next
   * one, else to `end`). order: [{ bar, t0 }] the bars as played (start times); timeOf(bar order entry, tick).
   */
  KS.events = function (doc, track, order, timeOf, end, startArts) {
    if (!track.ksw) return [];
    const out = [], art = new Map(), start = timeOf(order[0], 0); // (the way of playing held now, per group)
    // the notes of the track as played (start, end) - a slide holds its key over them (made when first needed)
    let list = null;
    const notes = () => {
      if (list) return list;
      list = [];
      for (const o of order) {
        const src = TC.score.sourceBar(doc, o.bar, track), L = TC.barTicks(doc.bars[o.bar].ts);
        (track.bars[src] ? track.bars[src].voices : []).forEach((v) => v.forEach((ev) => {
          if (ev.tick < L) list.push({ at: timeOf(o, ev.tick), end: timeOf(o, Math.min(L, ev.tick + ev.dur)) });
        }));
      }
      return list.sort((a, b) => a.at - b.at);
    };
    // keys sent at the start, unseen (trigger mode on), first of all
    (track.ksw.init || []).forEach((id) => { const k = KS.keyOf(track, id); if (k && k.midi !== null) out.push({ at: start, key: k.midi, hold: 0, init: true }); });
    // the ways of playing that hold where the playing starts (set before it)
    (startArts || []).forEach((id) => { const k = KS.keyOf(track, id); if (k) art.set(k.group || 'art', { at: start, key: k.midi }); });
    // … else the way of playing of its group to start from (ord., let ring): a VST that latches its keys does not keep
    // what was played last (a P.M. taken out of the score)
    track.ksw.keys.forEach((k) => {
      const g = k.group || 'art', midi = k.def && k.kind === 'art' ? KS.noteOf(k.note, track.ksw.c3) : null;
      if (midi !== null && !art.has(g)) art.set(g, { at: start, key: midi, def: true });
    });
    for (const o of order) {
      const bar = track.bars[o.bar];
      for (const m of (bar && bar.ks) || []) {
        const k = KS.keyOf(track, m.k);
        if (!k || k.midi === null) continue;
        const at = timeOf(o, m.t), g = k.group || 'art';
        if (k.kind === 'art') {
          const before = art.get(g);
          // (the start's way of playing replaced right there: not sent at all)
          if (before && !(before.def && at - before.at <= 1e-9)) out.push({ at: before.at, key: before.key, hold: Math.max(0, at - before.at) });
          art.set(g, { at, key: k.midi });
        } else if (k.kind === 'once') {
          // a slide: held from the note here up to the end of the next note (that one too) - else the VST does not slide
          const n = notes().find((x) => x.at >= at - 1e-6), next = n && notes().find((x) => x.at > n.at + 1e-6);
          // (span 'note': only over the note here - Rowdy's pre-intro slides)
          const upTo = k.span === 'note' ? n : next || n;
          out.push({ at, key: k.midi, hold: upTo ? Math.max(0, upTo.end - at) : 0 });
        } else out.push({ at, key: k.midi, hold: 0 });
      }
    }
    art.forEach((a) => out.push({ at: a.at, key: a.key, hold: Math.max(0, end - a.at) }));
    return out.sort((a, b) => a.at - b.at || (b.init ? 1 : 0) - (a.init ? 1 : 0));
  };
  /** The ways of playing written last before bar `bi` - one per group (their ids). */
  KS.artBefore = function (track, bi) {
    const got = new Map();
    for (let i = bi - 1; i >= 0; i--) {
      const list = ((track.bars[i] && track.bars[i].ks) || []).map((m) => KS.keyOf(track, m.k)).filter((k) => k && k.kind === 'art');
      for (let j = list.length - 1; j >= 0; j--) if (!got.has(list[j].group || 'art')) got.set(list[j].group || 'art', list[j].id);
    }
    return [...got.values()];
  };

  /**
   * The signs written at the notes of a track (staccato dots, tremolo strokes …): signsAt(bi, tick) gives those of the
   * ways of playing that hold there (in written order, bar by bar) - [] when none. Made once per drawing / export.
   */
  KS.signer = function (track) {
    if (!track || !track.ksw || !track.ksw.keys.some((k) => k.sign)) return () => [];
    const starts = [], now = new Map(); // (per bar: the ways of playing holding at its start, by group)
    const marks = (bi) => ((track.bars[bi] && track.bars[bi].ks) || []).map((m) => ({ t: m.t, k: KS.keyOf(track, m.k) })).filter((m) => m.k && m.k.kind === 'art');
    for (let bi = 0; bi < track.bars.length; bi++) {
      starts.push(new Map(now));
      marks(bi).forEach((m) => now.set(m.k.group || 'art', m.k));
    }
    return (bi, tick) => {
      const at = new Map(starts[bi] || now);
      marks(bi).forEach((m) => { if (m.t <= tick) at.set(m.k.group || 'art', m.k); });
      return [...new Set([...at.values()].map((k) => k.sign).filter(Boolean))];
    };
  };

  // ---- Cubase expression maps (*.expressionmap) ----------------------------------------------------------------------

  // the names of a sound slot that say which way of playing it is (the first that fits; English as the makers write them)
  const MATCH = [
    [/non.?vib|senza vib|no vib/, 'nonvib'], [/bart/, 'bartok'], [/pizz/, 'pizz'], [/col.?legno/, 'colLegno'], [/staccatissimo/, 'staccmo'],
    [/spicc/, 'spicc'], [/stacc|short/, 'stacc'], [/portato|loure/, 'portato'], [/tenuto/, 'tenuto'], [/marcato/, 'marc'], [/accent/, 'accented'],
    [/trem/, 'trem'], [/trill.*(half|minor|m2|semi)|(half|minor|semi).*trill/, 'trill1'], [/trill/, 'trill2'], [/harm/, 'harm'],
    [/pont/, 'sulPont'], [/tasto/, 'sulTasto'], [/flaut/, 'flaut'], [/flutter|flz/, 'flz'], [/con.?sord|muted/, 'conSord'], [/senza.?sord/, 'senzaSord'],
    [/legato|slur/, 'legato'], [/vib/, 'vib'], [/sus|long|arco|ord/, 'sus'],
  ];
  /** The way of playing (catalog id) a slot name stands for, or null. */
  KS.matchName = function (name) {
    const s = String(name || '').toLowerCase();
    const m = MATCH.find(([re]) => re.test(s));
    return m ? m[1] : null;
  };
  const xmlAttr = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  /**
   * Reads a Cubase expression map: its sound slots, each with its name and the MIDI it sends - keys (note on) only;
   * a slot that sends a controller, a program change or switches the channel is listed as not taken.
   * Returns { name, slots: [{ name, notes: [MIDI], other: true|false }] } or null (no expression map).
   */
  KS.readExpressionMap = function (text) {
    const src = String(text || '');
    if (!/<InstrumentMap\b/.test(src)) return null;
    const name = (/<InstrumentMap>\s*<string name="name" value="([^"]*)"/.exec(src) || [])[1] || '';
    const slots = src.split(/<obj class="PSoundSlot"/).slice(1).map((part) => {
      const nm = (/<member name="name">\s*<string name="s" value="([^"]*)"/.exec(part) || [])[1] || '';
      const msgs = (/<member name="midiMessages">([\s\S]*?)<\/member>/.exec(part) || [])[1] || '';
      const ev = [...msgs.matchAll(/<obj class="POutputEvent"[\s\S]*?<int name="status" value="(\d+)"\/>\s*<int name="data1" value="(\d+)"\/>/g)]
        .map((m) => ({ status: +m[1], data1: +m[2] }));
      const notes = ev.filter((e) => e.status >> 4 === 9).map((e) => e.data1);
      // (the action's own channel: the last <int name="channel"> before its key - -1: the track's)
      const action = (/<obj class="PSlotMidiAction"[\s\S]*?<\/member>\s*<int name="channel" value="(-?\d+)"\/>/.exec(part) || [])[1];
      return { name: xmlAttr(nm), notes, other: ev.some((e) => e.status >> 4 !== 9) || (action !== undefined && +action !== -1) };
    });
    return { name: xmlAttr(name), slots };
  };
  /**
   * A profile from an expression map: each slot with one key on the way of playing its name says (the part all names
   * begin with left out: "Violins2 Staccato" -> "Staccato"). C3 = 60 as in Cubase.
   * Returns { profile: { name, c3, noteShift, poly, init, keys }, missed: [{ name, note }] } (slots not taken).
   */
  KS.fromExpressionMap = function (text, fallbackName) {
    const map = KS.readExpressionMap(text);
    if (!map) return null;
    const words = map.slots.map((s) => s.name.split(/\s+/));
    let pre = 0;
    while (words.length > 1 && words.every((w) => w.length > pre + 1 && w[pre] === words[0][pre])) pre++;
    const keys = [], missed = [];
    map.slots.forEach((s, i) => {
      const label = words[i].slice(pre).join(' ') || s.name, note = s.notes.length === 1 ? KS.nameOf(s.notes[0], 60) : '';
      const id = KS.matchName(label);
      if (id && note && !s.other && !keys.some((k) => k.id === id)) keys.push(KS.catKey(id, note));
      else missed.push({ name: label, note: s.notes.map((n) => KS.nameOf(n, 60)).join(' + '), why: s.other ? 'other' : !note ? 'keys' : id ? 'twice' : 'unknown' });
    });
    keys.sort((a, b) => KS.CATALOG.findIndex((c) => c.id === a.id) - KS.CATALOG.findIndex((c) => c.id === b.id));
    return { profile: { tpl: '', v: 1, name: map.name || fallbackName || 'Expression map', c3: 60, noteShift: 0, poly: 0, init: [], keys }, missed };
  };
})(window.TC);
