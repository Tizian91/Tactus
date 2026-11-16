'use strict';
/*
 * Keyswitches of an instrument VST (e.g. UJAM Iron 2 in its Instrument Mode): low keys that change how the notes are
 * played - muted, dead notes, a slide, a down stroke … In the score they are directions above the staff ("P.M. - - -┘",
 * "Dead", "slide"), not notes; playing / exporting, Tactus sends their keys before the notes.
 *
 *   track.ksw = { tpl, name, c3, keys: [{ id, name, short, note, kind }] }   (only when set; saved with the score)
 *     c3     the MIDI note the VST calls C3 (60 or 48) - its keys and its play range follow it
 *     kind   'art'   a way of playing (dead, muted, half muted, open, picking): held until the next one
 *            'once'  before the note at its place (a slide)
 *            'event' at its place (stop, release)
 *            'down' / 'up'  sent before a chord struck down / up (note.stroke) - the VST strums it itself
 *            'mode'  a switch of the VST (trigger mode, strum auto …): only with ▶, not in the score
 *     note   the key as the VST names it, counted from its C3 ('C1' … 'B2')
 *   bar.ks = [{ t, k }]   a keyswitch k (its id) at tick t of a track's bar
 *
 * The notes of the play range: the VST plays them shifted (Iron: a guitar written an octave up, its C3 = the tone D2):
 * profile noteShift (semitones added when sending).
 */
(function (TC) {
  const KS = (TC.ksw = {});
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // UJAM Iron 2, Instrument Mode (the manual's key switch table; play range C3 … F5 = D2 … F4, four tones at a time)
  KS.TEMPLATES = [{
    tpl: 'ujam-iron2', name: 'UJAM Iron 2 (Instrument Mode)', c3: 60, noteShift: 12, poly: 4,
    keys: [
      ['open', 'Open', 'open', 'A#2', 'art'], ['muted', 'Muted (palm mute)', 'P.M.', 'F#2', 'art'],
      ['half', 'Half muted', '½ M.', 'G#2', 'art'], ['dead', 'Dead notes', 'Dead', 'D#2', 'art'],
      ['pick1', 'Picking (C2)', 'pick', 'C2', 'art'], ['pick2', 'Picking (D2)', 'pick 2', 'D2', 'art'],
      ['pick3', 'Picking (E2)', 'pick 3', 'E2', 'art'], ['pick4', 'Picking (F2)', 'pick 4', 'F2', 'art'],
      ['pick5', 'Picking (G2)', 'pick 5', 'G2', 'art'], ['pick6', 'Picking (A2)', 'pick 6', 'A2', 'art'],
      ['slideUp', 'Slide up', 'sl. ↗', 'C1', 'once'], ['slideDown', 'Slide down', 'sl. ↘', 'D1', 'once'],
      ['slideUpDown', 'Slide up & down', 'sl. ↗↘', 'E1', 'once'], ['pickSlide', 'Pick slide', 'p. sl.', 'F1', 'once'],
      ['up', 'Upstroke', '↑', 'A1', 'up'], ['down', 'Downstroke', '↓', 'B1', 'down'],
      ['stopUp', 'Stop (upstroke)', 'stop ↑', 'G#1', 'event'], ['stopDown', 'Stop (downstroke)', 'stop ↓', 'A#1', 'event'],
      ['release', 'Release', 'rel.', 'C#2', 'event'],
      ['trigOff', 'Trigger mode off', '', 'C#1', 'mode'], ['trigOn', 'Trigger mode on', '', 'D#1', 'mode'],
      ['noArtStrum', 'Disable articulation strumming', '', 'F#1', 'mode'], ['strumAuto', 'Strum – auto', '', 'B2', 'mode'],
    ].map(([id, name, short, note, kind]) => ({ id, name, short, note, kind })),
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
  /** A profile cleaned (loading a score), or null. */
  KS.clean = function (p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.keys)) return null;
    const keys = p.keys.filter((k) => k && typeof k.id === 'string' && KS.KINDS.includes(k.kind) && KS.noteOf(k.note) !== null)
      .map((k) => ({ id: k.id.slice(0, 40), name: String(k.name || k.id).slice(0, 60), short: String(k.short || '').slice(0, 12), note: k.note, kind: k.kind }));
    if (!keys.length) return null;
    return { tpl: typeof p.tpl === 'string' ? p.tpl : '', name: String(p.name || 'Keyswitches').slice(0, 60), c3: p.c3 === 48 ? 48 : 60,
      noteShift: Number.isInteger(p.noteShift) && Math.abs(p.noteShift) <= 36 ? p.noteShift : 0, poly: Number.isInteger(p.poly) && p.poly > 0 ? p.poly : 0, keys };
  };
  /** The key of a keyswitch of a track (its MIDI note), or null. */
  KS.keyOf = (track, id) => {
    const k = track && track.ksw && track.ksw.keys.find((x) => x.id === id);
    return k ? Object.assign({ midi: KS.noteOf(k.note, track.ksw.c3) }, k) : null;
  };
  /** The keyswitches of a track that go into the score (ways of playing, slides, stops). */
  KS.scoreKeys = (track) => (track && track.ksw ? track.ksw.keys.filter((k) => k.kind === 'art' || k.kind === 'once' || k.kind === 'event') : []);
  /** Does the track strum with the VST's own stroke keys (then Tactus does not spread a stroke itself)? */
  KS.strums = (track) => !!(track && track.ksw && track.ksw.keys.some((k) => k.kind === 'down' || k.kind === 'up'));

  /**
   * The keyswitch events of a track in the order played - for playback and the MIDI export: [{ at, key, hold }] where
   * `at` is the time (seconds or ticks, as timeOf gives it) and `hold` how long a way of playing is held (to the next
   * one, else to `end`). order: [{ bar, t0 }] the bars as played (start times); timeOf(bar order entry, tick).
   */
  KS.events = function (doc, track, order, timeOf, end, startArt) {
    if (!track.ksw) return [];
    const out = [];
    let art = null;
    // the way of playing that holds where the playing starts (set before it)
    if (startArt) {
      const k = KS.keyOf(track, startArt);
      if (k) art = { at: timeOf(order[0], 0), key: k.midi };
    }
    for (const o of order) {
      const bar = track.bars[o.bar];
      for (const m of (bar && bar.ks) || []) {
        const k = KS.keyOf(track, m.k);
        if (!k || k.midi === null) continue;
        const at = timeOf(o, m.t);
        if (k.kind === 'art') {
          if (art) out.push({ at: art.at, key: art.key, hold: Math.max(0, at - art.at) });
          art = { at, key: k.midi };
        } else out.push({ at, key: k.midi, hold: 0 });
      }
    }
    if (art) out.push({ at: art.at, key: art.key, hold: Math.max(0, end - art.at) });
    return out.sort((a, b) => a.at - b.at);
  };
  /** The way of playing written last before bar `bi` (its id), or null. */
  KS.artBefore = function (track, bi) {
    for (let i = bi - 1; i >= 0; i--) {
      const list = ((track.bars[i] && track.bars[i].ks) || []).filter((m) => { const k = KS.keyOf(track, m.k); return k && k.kind === 'art'; });
      if (list.length) return list[list.length - 1].k;
    }
    return null;
  };
})(window.TC);
