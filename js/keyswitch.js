'use strict';
/*
 * Keyswitches of an instrument VST (e.g. UJAM Iron 2 in its Instrument Mode): low keys that change how the notes are
 * played - muted, dead notes, a slide, a down stroke … In the score they are directions above the staff ("P.M. - - -┘",
 * "Dead", "slide"), not notes; playing / exporting, Tactus sends their keys before the notes.
 *
 *   track.ksw = { tpl, name, c3, keys: [{ id, name, short, note, kind }] }   (only when set; saved with the score)
 *     c3     the MIDI note the VST calls C3 (60 or 48) - its keys and its play range follow it
 *     init   keys sent at the start, unseen (Iron: trigger mode on - else its notes do not play)
 *     group  ways of playing of one group replace each other (Iron: open / muted / half / dead; picking its own)
 *     kind   'art'   a way of playing (dead, muted, half muted, open, picking): held until the next one of its group
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
    // (checked with Iron 2: C3 = 60; C1 is free - the slides start on D1; D#1 trigger mode on is needed, else the
    // notes do not play: sent at the start, unseen; open / muted / half / dead exclude each other, picking is its own)
    // (v: the version of the template - a profile saved with an older one is brought to it when loaded)
    tpl: 'ujam-iron2', v: 2, name: 'UJAM Iron 2 (Instrument Mode)', c3: 60, noteShift: 12, poly: 4, init: ['trigOn'],
    keys: [
      ['open', 'Let ring (open)', 'let ring', 'A#2', 'art', 'mute'], ['muted', 'Muted (palm mute)', 'P.M.', 'F#2', 'art', 'mute'],
      ['half', 'Half muted', '½ M.', 'G#2', 'art', 'mute'], ['dead', 'Dead notes', 'Dead', 'D#2', 'art', 'mute'],
      ['pick1', 'Picking (C2)', 'pick', 'C2', 'art', 'pick'], ['pick2', 'Picking (D2)', 'pick 2', 'D2', 'art', 'pick'],
      ['pick3', 'Picking (E2)', 'pick 3', 'E2', 'art', 'pick'], ['pick4', 'Picking (F2)', 'pick 4', 'F2', 'art', 'pick'],
      ['pick5', 'Picking (G2)', 'pick 5', 'G2', 'art', 'pick'], ['pick6', 'Picking (A2)', 'pick 6', 'A2', 'art', 'pick'],
      ['slideUp', 'Slide up', 'sl. ↗', 'D1', 'once'], ['slideDown', 'Slide down', 'sl. ↘', 'E1', 'once'],
      ['slideUpDown', 'Slide up & down', 'sl. ↗↘', 'F1', 'once'], ['pickSlide', 'Pick slide', 'p. sl.', 'G1', 'once'],
      ['up', 'Upstroke', '↑', 'A1', 'up'], ['down', 'Downstroke', '↓', 'B1', 'down'],
      ['stopUp', 'Stop (upstroke)', 'stop ↑', 'G#1', 'event'], ['stopDown', 'Stop (downstroke)', 'stop ↓', 'A#1', 'event'],
      ['release', 'Release', 'rel.', 'C#2', 'event'],
      ['trigOff', 'Trigger mode off', '', 'C#1', 'mode'], ['trigOn', 'Trigger mode on', '', 'D#1', 'mode'],
      ['noArtStrum', 'Disable articulation strumming', '', 'F#1', 'mode'], ['strumAuto', 'Strum – auto', '', 'B2', 'mode'],
    ].map(([id, name, short, note, kind, group]) => Object.assign({ id, name, short, note, kind }, group ? { group } : {})),
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
    // a profile of a template saved before it was corrected (no init keys yet - Iron: slides one key off, no trigger
    // mode, no groups): the corrected template, keeping which C3 was chosen
    const tpl = KS.template(p.tpl);
    if (tpl && (!Array.isArray(p.init) || (p.v || 1) < (tpl.v || 1))) p = Object.assign(KS.fromTemplate(p.tpl), { c3: p.c3 });
    const keys = p.keys.filter((k) => k && typeof k.id === 'string' && KS.KINDS.includes(k.kind) && KS.noteOf(k.note) !== null)
      .map((k) => Object.assign({ id: k.id.slice(0, 40), name: String(k.name || k.id).slice(0, 60), short: String(k.short || '').slice(0, 12), note: k.note, kind: k.kind },
        typeof k.group === 'string' && k.group ? { group: k.group.slice(0, 20) } : {}));
    if (!keys.length) return null;
    const ids = new Set(keys.map((k) => k.id));
    return { tpl: typeof p.tpl === 'string' ? p.tpl : '', v: Number.isInteger(p.v) ? p.v : 1, name: String(p.name || 'Keyswitches').slice(0, 60), c3: p.c3 === 48 ? 48 : 60,
      noteShift: Number.isInteger(p.noteShift) && Math.abs(p.noteShift) <= 36 ? p.noteShift : 0, poly: Number.isInteger(p.poly) && p.poly > 0 ? p.poly : 0,
      init: Array.isArray(p.init) ? p.init.filter((id) => ids.has(id)) : [], keys };
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
    for (const o of order) {
      const bar = track.bars[o.bar];
      for (const m of (bar && bar.ks) || []) {
        const k = KS.keyOf(track, m.k);
        if (!k || k.midi === null) continue;
        const at = timeOf(o, m.t), g = k.group || 'art';
        if (k.kind === 'art') {
          const before = art.get(g);
          if (before) out.push({ at: before.at, key: before.key, hold: Math.max(0, at - before.at) });
          art.set(g, { at, key: k.midi });
        } else if (k.kind === 'once') {
          // a slide: held from the note here up to the end of the next note (that one too) - else the VST does not slide
          const n = notes().find((x) => x.at >= at - 1e-6), next = n && notes().find((x) => x.at > n.at + 1e-6);
          out.push({ at, key: k.midi, hold: next ? Math.max(0, next.end - at) : n ? Math.max(0, n.end - at) : 0 });
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
})(window.TC);
