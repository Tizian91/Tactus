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
 *                                    set to ROLES (the Tactus layout)
 */
(function (TC) {
  const C = (TC.cubase = {});

  // Role: display note, notehead set, instrument, technique. The Tactus layout: set up by hand in
  // the Cubase drum map used for UJAM Virtual Drummer (its note numbers fit UJAM, the notation is our own);
  // instruments that map lacks are placed next to their relatives.
  const R = (display, head, instrument, technique = '') => ({ display, head, instrument: instrument ? 'instrument.' + instrument : '', technique });
  const SIDE = 'orchestral.unpitched.side.drum', SNARE = 'orchestral.unpitched.snare.drum';
  const HH = 'orchestral.unpitched.hihat', PEDAL = 'orchestral.unpitched.hihat.pedal';
  const RIDE = 'orchestral.unpitched.ride.cymbal.high';
  C.ROLES = {
    kick: R(64, 0, 'unpitched.kick.drum.low'),
    kick2: R(64, 0, 'unpitched.kick.drum.very.low'), // with the kick, as in the UJAM map
    snare: R(72, 0, SIDE, 'pt.centre'),
    snareEdge: R(72, 0, SNARE, 'pt.centre'),
    snare2: R(72, 0, SNARE),
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
    tomFloor2: R(62, 0, 'band.unpitched.floortom.high'), // second floor tom, below the staff
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
    ride2: R(74, 34, 'orchestral.unpitched.ride.cymbal.low'),
    ride2Edge: R(74, 34, 'orchestral.unpitched.ride.cymbal.low', 'pt.edgeCymbals'),
    ride2Bell: R(74, 25, 'orchestral.unpitched.ride.cymbal.low', 'pt.bell'),
    china: R(84, 34, 'unpitched.china.cymbal'),
    splash: R(86, 34, 'unpitched.splash.cymbal'),
    cowbell: R(76, 28, 'percussion.other.cowbell.high'),
    clapPerc: R(71, 34, 'body.patsch'), // clap-like percussion (BeatMaker FX 1 / Perc 1)
    accent: R(69, 34, 'latin.unpitched.claves'), // short accent click (BeatMaker "Kick 2"), on the claves line
  };
  /** Keys whose name misleads, per map name: { input note: role }. */
  C.KNOWN = {
    BeatMaker: { 38: 'accent' }, // "Kick 2" is a short accent click, not a kick
    // UJAM Virtual Drummer plays Crash 1 on 49 and Crash 2 on 57 (named "Crash L" / "Crash R" in the map;
    // 48 "Crash 1" is not used by the instrument)
    'UJAM-Drummer': { 49: 'crash1', 57: 'crash2' },
  };

  /**
   * Cubase 13 and older: one "HeadSymbol" number per key (index in Cubase's list of heads, checked with
   * a map saved by Cubase 13): 0 normal, 1 circle with slash, 2 x, 3 diamond, 4 slash, 5 square, 6 bold x,
   * 7 circle with x, 8 long slash, 9 small, 10 / 11 triangle left / right, 14 triangle down.
   * C.OLD_HEAD: from a Tactus notehead; C.OLD_FROM_SET: from a Cubase 14 notehead set.
   */
  C.OLD_HEAD = { normal: 0, x: 2, heavyX: 6, heavyXHat: 6, circleX: 7, circleSlash: 1, diamond: 3, triangle: 14, slashed: 4 };
  C.OLD_FROM_SET = { 0: 0, 34: 2, 3: 7, 23: 2, 2: 3, 25: 3, 28: 14 };

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
    // "(Snare)": a second key of the same sound (MT Power Drum Kit)
    const n = e.name.toLowerCase().replace(/hi-hat|hi hat/g, 'hihat').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n || /^-+$/.test(n) || /^sound \d+$/.test(n)) return null;
    // pattern / style keys of UJAM and Groove Agent (Intro, Kick A, Fill 2 …): no display note, no instrument,
    // a section name or a letter at the end (other keys without a display note are instruments, e.g. "Hi-Hat Pedal")
    if (e.display === 0 && e.inote !== 0 && !e.instrument &&
      (/\b(intro|verse|chorus|bridge|fill|ending|outro|break|style|pattern|groove|stop|part|var)\b/.test(n) || /\s[a-h]\d?$/.test(n) || !/kick|bass ?drum|snare|hihat|tom|crash|ride|chin[ae]|splash|cowbell|clap|stick|shaker|tamb/.test(n))) return null;
    const tom = (role) => {
      if (/rim ?shot/.test(n)) return role + ':rimshot';
      if (/rim only|rim click/.test(n)) return role + ':rim';
      return role;
    };
    // UJAM BeatMaker: numbered slots (HiHat 1–3, Cym 1–3, Tom L / M / H, FX 1–2)
    const slot = /^hihat ([123])$/.exec(n);
    if (slot) return ['hhClosed', 'hhHalf', 'hhOpen'][slot[1] - 1];
    const cym = /^cym ([123])\b/.exec(n);
    if (cym) return ['crash1', 'ride', 'crash2'][cym[1] - 1];
    const t = /^tom ([lmh])\b/.exec(n);
    if (t) return { l: 'tomLow', m: 'tomMid', h: 'tomHigh' }[t[1]];
    // "Tom Hi / Mid / Low" (MT Power Drum Kit)
    const t2 = /^tom (hi|high|mid|middle|lo|low)\b/.exec(n);
    if (t2) return tom(/^h/.test(t2[1]) ? 'tomHigh' : /^m/.test(t2[1]) ? 'tomMid' : 'tomLow');
    const fx = /^fx ([12])\b/.exec(n);
    if (fx) return fx[1] === '1' ? 'clapPerc' : 'tambourine';
    if (/^snare 2$/.test(n)) return 'snare2';
    if (/hihat/.test(n)) {
      if (/pedal/.test(n)) return /open/.test(n) ? 'hhPedalOpen' : 'hhPedal';
      if (/half/.test(n)) return 'hhHalf';
      if (/open/.test(n)) return /open (tip |edge )?[01]\b/.test(n) ? 'hhHalf' : 'hhOpen';
      return 'hhClosed';
    }
    if (/side[ -]?stick|cross ?stick/.test(n)) return 'sidestick';
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
      const k = /crash ?(left|right|[1-4lr])\b/.exec(n);
      const num = !k ? 1 : /^l/.test(k[1]) ? 2 : /^r/.test(k[1]) ? 1 : +k[1];
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
   * opts.name: new map name (Cubase lists maps by name). opts.roles: { inote: role } where the name misleads. Unrecognised entries stay as they are.
   * Returns the new text, the changes and pairs that still collide on one display note.
   */
  C.restyle = function (text, opts = {}) {
    const m = mapList(text);
    const changes = [];
    const body = m[2].replace(/<item>([\s\S]*?)<\/item>/g, (all, item) => {
      const f = fields(item);
      if (f.INote === undefined) return all;
      const e = { name: f.Name || '', inote: +f.INote, display: +f.DisplayNote, instrument: f.InstrumentEntityID || '' };
      const role = (opts.roles && opts.roles[e.inote]) || C.roleOf(e);
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
    return { text: out, changes, collisions: C.collisions(C.parse(out), opts.roles) };
  };

  /**
   * Writes a drum map with the given notation: styles = { inote: {display, head, instrument, technique, name?} }.
   * Other entries stay. opts.name: map name; opts.order: input notes listed first (the rest follow as before).
   */
  C.write = function (text, styles, opts = {}) {
    const m = mapList(text);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const body = m[2].replace(/<item>([\s\S]*?)<\/item>/g, (all, item) => {
      const f = fields(item);
      const s = f.INote !== undefined && styles[+f.INote];
      if (!s) return all;
      let out = item;
      out = setField(out, 'DisplayNote', s.display);
      if (opts.legacy) {
        out = setField(out, 'HeadSymbol', s.old || 0);
      } else {
        out = setField(out, 'NoteheadSet', s.head);
        out = setField(out, 'InstrumentEntityID', s.instrument || '', true);
        out = setField(out, 'TechniqueEntityID', s.technique || '', true);
      }
      if (s.name) out = setField(out, 'Name', esc(s.name), true);
      return '<item>' + out + '</item>';
    });
    // Cubase 13 and older know neither notehead sets nor instruments / techniques: those fields go
    const legacy = (t) => t.replace(/\r?\n[ \t]*<(?:int|string) name="(?:NoteheadSet|InstrumentEntityID|TechniqueEntityID)" value="[^"]*"(?: wide="true")?\/>/g, '');
    let out = text.slice(0, m.index) + m[1] + body + m[3] + text.slice(m.index + m[0].length);
    if (opts.name) out = out.replace(/(<DrumMap>\s*<string name="Name" value=")[^"]*(")/, `$1${esc(opts.name)}$2`);
    if (opts.order) {
      out = out.replace(/(<list name="Order"[^>]*>)([\s\S]*?)(\s*<\/list>)/, (all, open, items, close) => {
        const old = (items.match(/value="(\d+)"/g) || []).map((s) => +s.slice(7, -1));
        const first = opts.order.filter((n, i, a) => a.indexOf(n) === i);
        const indent = (/\n(\s*)<item/.exec(items) || [, '      '])[1];
        return open + first.concat(old.filter((n) => !first.includes(n))).map((n) => `\n${indent}<item value="${n}"/>`).join('') + close;
      });
    }
    // (Windows line ends, as Cubase writes them)
    if (opts.legacy) out = legacy(out).replace(/\r?\n/g, '\r\n');
    return out;
  };

  // ---- Key names of other programs (no notation, only a name per key) ----------------------------
  //   Reaper: "note<tab>name" per line ("// …" comments) · Studio One: <Music.PitchName pitch="36" name="Kick"/>

  /** Key names from a Reaper (.txt) or Studio One (.pitchlist) file: { format, names: { note: name } } or null. */
  C.parseNames = function (text) {
    const names = {};
    if (/<Music\.PitchNameList/.test(text)) {
      text.replace(/<Music\.PitchName\s+pitch="(\d+)"\s+name="([^"]*)"/g, (m, n, v) => { if (+n < 128) names[+n] = unxml(v).trim(); });
      return Object.keys(names).length ? { format: 'studioone', names } : null;
    }
    if (/<|\0/.test(text)) return null;
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(\d{1,3})\s+(\S.*?)\s*$/.exec(line);
      if (m && +m[1] < 128) names[+m[1]] = m[2];
    }
    return Object.keys(names).length >= 3 ? { format: 'reaper', names } : null;
  };
  /** Key names for Reaper (MIDI editor: "Load note names from file"). keys: [{ note, name }] */
  C.toReaper = (keys) => '// MIDI note name map (Tactus)\n' +
    keys.slice().sort((a, b) => b.note - a.note).map((k) => `${k.note}\t${k.name.replace(/[\r\n\t]+/g, ' ')}`).join('\n') + '\n';
  /** Key names for Studio One (pitch name list). */
  C.toPitchList = (keys) => {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return '﻿<?xml version="1.0" encoding="UTF-8"?>\r\n<Music.PitchNameList>\r\n' +
      keys.slice().sort((a, b) => b.note - a.note).map((k) => `\t<Music.PitchName pitch="${k.note}" name="${esc(k.name)}"/>\r\n`).join('') + '</Music.PitchNameList>\r\n';
  };

  /**
   * An empty drum map (no file from the maker): 128 keys, each plays its own note, no names
   * (or the names of another program's key list). channel: MIDI channel 0 … 15 (9 = channel 10, General MIDI drums).
   */
  C.blank = function (name, channel = 9, names = {}) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const items = [];
    for (let n = 0; n < 128; n++) {
      items.push(`      <item>
         <int name="INote" value="${n}"/>
         <int name="ONote" value="${n}"/>
         <int name="Channel" value="${channel}"/>
         <float name="Length" value="200"/>
         <int name="Mute" value="0"/>
         <int name="DisplayNote" value="${n}"/>
         <int name="HeadSymbol" value="0"/>
         <int name="Voice" value="0"/>
         <int name="PortIndex" value="0"/>
         <string name="Name" value="${esc(names[n] || '')}" wide="true"/>
         <int name="QuantizeIndex" value="0"/>
         <int name="NoteheadSet" value="0"/>
         <string name="InstrumentEntityID" value=""/>
         <string name="TechniqueEntityID" value=""/>
      </item>`);
    }
    return `<?xml version="1.0" encoding="utf-8"?>
<DrumMap>
   <string name="Name" value="${esc(name)}" wide="true"/>
   <list name="Quantize" type="list">
      <item>
         <int name="Grid" value="4"/>
         <int name="Type" value="0"/>
         <float name="Swing" value="0"/>
         <int name="Legato" value="50"/>
      </item>
   </list>
   <list name="Map" type="list">
${items.join('\n')}
   </list>
   <list name="Order" type="int">
${Array.from({ length: 128 }, (x, n) => `      <item value="${n}"/>`).join('\n')}
   </list>
   <int name="Flags" value="0"/>
</DrumMap>
`;
  };

  /** Note name as Cubase shows it (C3 = 60, so the kick 36 is C1). */
  C.noteName = (n) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n % 12] + (Math.floor(n / 12) - 2);

  /** Different instruments (by role) that share display note, instrument and technique. */
  C.collisions = function (map, roles = {}) {
    const seen = new Map(), out = [];
    for (const e of map.entries) {
      const role = (roles || {})[e.inote] || C.roleOf(e);
      if (!role || !e.instrument) continue;
      const k = `${e.display}|${e.instrument}|${e.technique}`;
      const base = role;
      if (!seen.has(k)) seen.set(k, { role: base, notes: [e.inote] });
      else if (seen.get(k).role !== base) out.push({ key: k, a: seen.get(k), b: { role: base, inote: e.inote } });
    }
    return out;
  };
})(typeof window !== 'undefined' ? (window.TC = window.TC || {}) : (globalThis.TC = globalThis.TC || {}));
