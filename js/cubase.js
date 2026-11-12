'use strict';
/*
 * Cubase drum maps (*.drm): read, recognise the instruments, rewrite the notation part.
 * Pure text in, text out (no DOM), so it runs in the browser and in the tests.
 *
 * A .drm file is XML: <list name="Map"> holds 128 <item>s, one per input note:
 *   INote        the note stored in the Cubase part (what Tactus exports)
 *   ONote        the note sent to the instrument (VST)
 *   DisplayNote  the pitch it is shown on (treble clef positions: 64 = E4 bottom line,
 *                72 = C5 third space, 77 = F5 top line, 79 = G5 above the staff)
 *   NoteheadSet  Cubase notehead set (0 normal, 34 cross, 3 open hi-hat, 23 side stick,
 *                2 rim shot, 25 diamond / bell, 28 triangle)
 *   InstrumentEntityID / TechniqueEntityID  instrument and playing technique (Cubase score):
 *                entries on the same display note need different pairs, or Cubase cannot
 *                tell them apart
 * <list name="Order"> holds the input notes in the order Cubase lists them.
 *
 *   TC.cubase.parse(text)         -> { name, entries: [ {inote, onote, display, head, voice, name, instrument, technique} ], order }
 *   TC.cubase.roleOf(entry)       -> role key of TC.cubase.ROLES or null (pattern keys, empty entries)
 *   TC.cubase.restyle(text, opts) -> { text, changes, collisions }  notation of every recognised entry
 *                                    set to ROLES (the UJAM Virtual Drummer layout)
 */
(function (TC) {
  const C = (TC.cubase = {});

  // Role: display note, notehead set, instrument, technique. Taken from the UJAM Virtual Drummer
  // map where it has the instrument; the rest is placed next to its relatives.
  const R = (display, head, instrument, technique = '') => ({ display, head, instrument: instrument ? 'instrument.' + instrument : '', technique });
  const SIDE = 'orchestral.unpitched.side.drum', SNARE = 'orchestral.unpitched.snare.drum';
  const HH = 'orchestral.unpitched.hihat', PEDAL = 'orchestral.unpitched.hihat.pedal';
  const RIDE = 'orchestral.unpitched.ride.cymbal.high';
  C.ROLES = {
    kick: R(64, 0, 'unpitched.kick.drum.low'),
    kick2: R(64, 0, 'unpitched.kick.drum.very.low'),
    snare: R(72, 0, SIDE, 'pt.centre'),
    snareEdge: R(72, 0, SNARE, 'pt.centre'),
    sidestick: R(72, 23, SNARE, 'pt.sideStick'),
    rimshot: R(72, 2, SIDE, 'pt.rimShot'),
    snareRim: R(72, 23, SIDE, 'pt.sideStick'),
    clap: R(71, 34, 'body.hand.claps'),
    shaker: R(71, 28, 'percussion.other.shaker'),
    tambourine: R(72, 28, 'percussion.other.tambourine'),
    tomHigh: R(78, 0, 'band.unpitched.tomtom.high.alias.tom-high'),
    tomMid: R(74, 0, 'band.unpitched.tomtom.medium.alias.tom-medium'),
    tomMidLow: R(71, 0, 'band.unpitched.tomtom.medium-low'),
    tomLow: R(68, 0, 'band.unpitched.tomtom.low.alias.tom-low'),
    tomFloor: R(65, 0, 'band.unpitched.floortom.low'),
    hhClosed: R(79, 34, HH, 'pt.closed'),
    hhHalf: R(79, 3, HH, 'pt.halfOpen'),
    hhOpen: R(79, 3, HH, 'pt.open2'),
    hhPedal: R(64, 34, PEDAL, 'pt.pedal'),
    hhPedalOpen: R(64, 3, PEDAL, 'pt.open2'),
    crash1: R(81, 34, 'orchestral.unpitched.crash.cymbal.low'),
    crash2: R(81, 34, 'orchestral.unpitched.crash.cymbal.high'),
    crash3: R(83, 34, 'orchestral.unpitched.crash.cymbal.low'),
    crash4: R(83, 34, 'orchestral.unpitched.crash.cymbal.high'),
    ride: R(77, 34, RIDE),
    rideEdge: R(77, 34, RIDE, 'pt.edgeCymbals'),
    rideBell: R(77, 25, RIDE, 'pt.bell'),
    china: R(84, 34, 'unpitched.china.cymbal'),
    splash: R(86, 34, 'unpitched.splash.cymbal'),
    cowbell: R(76, 28, 'percussion.other.cowbell.high'),
  };
  // Tom rim shot / rim only: same line, rim-shot or side-stick head
  const TOM_TECH = { rimshot: [2, 'pt.rimShot'], rim: [23, 'pt.sideStick'] };

  const unxml = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  function fields(item) {
    const f = {};
    item.replace(/<(?:int|float|string) name="(\w+)" value="([^"]*)"/g, (m, k, v) => { f[k] = unxml(v); });
    return f;
  }

  const mapList = (text) => /(<list name="Map"[^>]*>)([\s\S]*?)(<\/list>)/.exec(text);

  C.parse = function (text) {
    const name = (/<DrumMap>\s*<string name="Name" value="([^"]*)"/.exec(text) || [])[1] || '';
    const m = mapList(text);
    if (!m) throw new Error('No drum map (list "Map" missing)');
    const entries = [];
    m[2].replace(/<item>([\s\S]*?)<\/item>/g, (all, body) => {
      const f = fields(body);
      if (f.INote === undefined) return;
      entries.push({
        inote: +f.INote, onote: +f.ONote, display: +f.DisplayNote, head: +(f.NoteheadSet || 0),
        voice: +(f.Voice || 0), channel: +(f.Channel || 0), name: f.Name || '',
        instrument: f.InstrumentEntityID || '', technique: f.TechniqueEntityID || '',
      });
    });
    const o = /<list name="Order"[^>]*>([\s\S]*?)<\/list>/.exec(text);
    const order = o ? (o[1].match(/value="(\d+)"/g) || []).map((s) => +s.slice(7, -1)) : entries.map((e) => e.inote);
    return { name: unxml(name), entries, order };
  };

  /** Which instrument an entry is, from its name (falls back to the technique for unnamed hi-hats). */
  C.roleOf = function (e) {
    const n = e.name.toLowerCase().replace(/hi-hat|hi hat/g, 'hihat').replace(/\s+/g, ' ').trim();
    if (!n || n === '-' || /^sound \d+$/.test(n)) return null;
    // pattern / style keys of UJAM and Groove Agent (Intro, Kick A …): no display note, no instrument
    if (e.display === 0 && e.inote !== 0 && !e.instrument) return null;
    const tom = (role) => {
      if (/rim ?shot/.test(n)) return role + ':rimshot';
      if (/rim only|rim click/.test(n)) return role + ':rim';
      return role;
    };
    if (/hihat/.test(n)) {
      if (/pedal/.test(n)) return /open/.test(n) ? 'hhPedalOpen' : 'hhPedal';
      if (/half/.test(n)) return 'hhHalf';
      if (/open/.test(n)) return /open (tip |edge )?[01]\b/.test(n) ? 'hhHalf' : 'hhOpen';
      return 'hhClosed';
    }
    if (/side ?stick/.test(n)) return 'sidestick';
    if (/snares off|clap/.test(n)) return 'clap';
    if (/shaker/.test(n)) return 'shaker';
    if (/tambourine|tamburin/.test(n)) return 'tambourine';
    if (/snare/.test(n)) {
      if (/rim ?shot/.test(n)) return 'rimshot';
      if (/rim only/.test(n)) return 'snareRim';
      if (/edge/.test(n)) return 'snareEdge';
      return 'snare';
    }
    if (n === 'rim shot' || n === 'rimshot') return 'rimshot';
    if (/kick|bass ?drum/.test(n)) return /floor/.test(n) ? null : /2|very low/.test(n) ? 'kick2' : 'kick';
    if (/floor ?tom ?2/.test(n)) return tom('tomFloor');
    if (/floor ?tom/.test(n)) return tom('tomLow');
    if (/rack ?tom ?1/.test(n)) return tom('tomHigh');
    if (/rack ?tom ?2/.test(n)) return tom('tomMid');
    if (/rack ?tom ?3/.test(n)) return tom('tomMidLow');
    if (/high tom/.test(n)) return tom('tomHigh');
    if (/mid tom/.test(n)) return tom('tomMid');
    if (/low tom/.test(n)) return tom('tomLow');
    const muted = (role) => (/muted|choke/.test(n) ? role + ':muted' : role);
    if (/chin[ae]/.test(n)) return muted('china');
    if (/splash/.test(n)) return muted('splash');
    if (/ride/.test(n)) {
      if (/bell/.test(n)) return 'rideBell';
      if (/edge/.test(n)) return 'rideEdge';
      return muted('ride');
    }
    if (/crash/.test(n)) {
      const k = /crash ?([1-4lr])\b/.exec(n);
      const num = !k ? 1 : k[1] === 'l' ? 2 : k[1] === 'r' ? 1 : +k[1];
      return muted('crash' + num);
    }
    if (/cowbell/.test(n)) return 'cowbell';
    return null;
  };

  /** Notation for a role key (with ':muted', ':rimshot', ':rim' suffixes). */
  C.style = function (key) {
    const [base, mod] = key.split(':');
    const r = C.ROLES[base];
    if (!r) return null;
    const s = Object.assign({}, r);
    if (mod === 'muted') s.technique = 'pt.muted';
    if (mod && TOM_TECH[mod]) [s.head, s.technique] = TOM_TECH[mod];
    return s;
  };

  const setField = (body, k, v, str) => {
    const re = new RegExp(`(<${str ? 'string' : 'int'} name="${k}" value=")[^"]*(")`);
    if (re.test(body)) return body.replace(re, `$1${v}$2`);
    return body.replace(/\s*$/, '') + `\n         <${str ? 'string' : 'int'} name="${k}" value="${v}"${str ? ' wide="true"' : ''}/>\n      `;
  };

  /**
   * Rewrites display note, notehead, instrument and technique of every recognised entry.
   * opts.name: new map name (Cubase lists maps by name). Unrecognised entries stay as they are.
   * Returns the new text, the changes and pairs that still collide on one display note.
   */
  C.restyle = function (text, opts = {}) {
    const m = mapList(text);
    const changes = [];
    const body = m[2].replace(/<item>([\s\S]*?)<\/item>/g, (all, item) => {
      const f = fields(item);
      if (f.INote === undefined) return all;
      const e = { name: f.Name || '', inote: +f.INote, display: +f.DisplayNote, instrument: f.InstrumentEntityID || '' };
      const role = C.roleOf(e);
      const s = role && C.style(role);
      if (!s) return all;
      let out = item;
      out = setField(out, 'DisplayNote', s.display);
      out = setField(out, 'NoteheadSet', s.head);
      out = setField(out, 'InstrumentEntityID', s.instrument, true);
      out = setField(out, 'TechniqueEntityID', s.technique, true);
      changes.push({ inote: e.inote, onote: +f.ONote, name: e.name, role,
        from: { display: +f.DisplayNote, head: +(f.NoteheadSet || 0) }, to: { display: s.display, head: s.head } });
      return '<item>' + out + '</item>';
    });
    let out = text.slice(0, m.index) + m[1] + body + m[3] + text.slice(m.index + m[0].length);
    if (opts.name) out = out.replace(/(<DrumMap>\s*<string name="Name" value=")[^"]*(")/, `$1${opts.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}$2`);
    return { text: out, changes, collisions: C.collisions(C.parse(out)) };
  };

  /** Different instruments (by role) that share display note, instrument and technique. */
  C.collisions = function (map) {
    const seen = new Map(), out = [];
    for (const e of map.entries) {
      const role = C.roleOf(e);
      if (!role || !e.instrument) continue;
      const k = `${e.display}|${e.instrument}|${e.technique}`;
      const base = role;
      if (!seen.has(k)) seen.set(k, { role: base, notes: [e.inote] });
      else if (seen.get(k).role !== base) out.push({ key: k, a: seen.get(k), b: { role: base, inote: e.inote } });
    }
    return out;
  };
})(typeof window !== 'undefined' ? (window.TC = window.TC || {}) : (globalThis.TC = globalThis.TC || {}));
