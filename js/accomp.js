'use strict';
/*
 * Chords as notes (accompaniment): the chord symbols of the bars written out as notes in a melody track - a piano's
 * left hand (bass and chord, broken, Alberti …) or a strummed / picked guitar (strokes ↓ ↑, guitar voicings).
 * Written into the selected bars of the track being written; after that they are notes like any others.
 *
 *   TC.accomp.PATTERNS              [{ id, group: 'piano' | 'guitar', en, de }]
 *   TC.accomp.voicing(ch, kind, o)  pitches of a chord: kind 'piano' { bass, tones } (o.clef), 'guitar' [pitches low → high]
 *   TC.accomp.write(doc, track, from, to, id, voice) -> number of notes written (the voice's notes there go)
 *
 * A note struck as a stroke keeps it: note.stroke 'd' (down: low → high) | 'u' (up) - drawn above it, played a little
 * spread (js/playback.js), MusicXML <down-bow/> / <up-bow/>.
 */
(function (TC) {
  const AC = (TC.accomp = {});
  const P = () => TC.pitch;
  const mod = (x, m) => ((x % m) + m) % m;

  AC.PATTERNS = [
    { id: 'pBlock', group: 'piano', en: 'Held (a chord each change)', de: 'Ausgehalten (ein Akkord je Wechsel)' },
    { id: 'pBeats', group: 'piano', en: 'Chord on every beat', de: 'Akkord auf jeden Schlag' },
    { id: 'pBassChord', group: 'piano', en: 'Bass + chord (3/4: waltz)', de: 'Bass + Akkord (3/4: Walzer)' },
    { id: 'pBroken', group: 'piano', en: 'Broken (eighths, up and down)', de: 'Gebrochen (Achtel, auf und ab)' },
    { id: 'pAlberti', group: 'piano', en: 'Alberti bass (eighths)', de: 'Alberti-Bass (Achtel)' },
    { id: 'gBlock', group: 'guitar', en: 'Strummed and held ↓', de: 'Angeschlagen, gehalten ↓' },
    { id: 'gBeats', group: 'guitar', en: '↓ on every beat', de: '↓ auf jeden Schlag' },
    { id: 'gDDU', group: 'guitar', en: '↓ ↓↑ ↑↓↑ (pop strum)', de: '↓ ↓↑ ↑↓↑ (Pop-Schlag)' },
    { id: 'gEighths', group: 'guitar', en: '↓↑ eighths', de: '↓↑ Achtel' },
    { id: 'gPick', group: 'guitar', en: 'Picked (bass, then up the strings)', de: 'Gezupft (Bass, dann die Saiten hoch)' },
  ];
  AC.byId = (id) => AC.PATTERNS.find((p) => p.id === id) || null;
  /** Is the track's sound a guitar (General MIDI 24 … 31)? */
  /**
   * The instrument of a melody track (track.inst) - how chords are written for it, not how it sounds (its sound is
   * free): voice (singing, a melody), keys (piano, organ), guitar (grips), bass (the root), ensemble (strings, choir,
   * brass: four parts spread), pad (synth / pad: close).
   */
  AC.INSTRUMENTS = [
    { id: 'voice', en: 'Voice / melody', de: 'Gesang / Melodie', program: 53, clef: 'treble' },
    { id: 'keys', en: 'Piano / keys', de: 'Klavier / Keys', program: 0, clef: 'treble' },
    { id: 'guitar', en: 'Guitar', de: 'Gitarre', program: 25, clef: 'treble8' },
    { id: 'bass', en: 'Bass', de: 'Bass', program: 33, clef: 'bass' },
    { id: 'ensemble', en: 'Strings / choir / brass', de: 'Streicher / Chor / Bläser', program: 48, clef: 'treble' },
    { id: 'pad', en: 'Synth / pad', de: 'Synth / Fläche', program: 89, clef: 'treble' },
  ];
  AC.inst = (id) => AC.INSTRUMENTS.find((x) => x.id === id) || null;
  AC.instFromProgram = (p, lh) => TC.instFromProgram(p, lh);
  AC.isGuitar = (track) => !!track && (track.inst ? track.inst === 'guitar' : track.program >= 24 && track.program <= 31);
  /** The pattern to start with: a guitar strums, a piano's left hand plays bass + chord, else held chords. */
  AC.defaultFor = (track) => (AC.isGuitar(track) ? 'gDDU' : track && track.lh ? 'pBassChord' : 'pBlock');

  // ---- Voicings ------------------------------------------------------------------------------------------------

  /** The bass of a chord (the slash bass, else the root) as a pitch class. */
  const bassPc = (ch) => (ch.bass ? P().pc(ch.bass.l, ch.bass.a) : P().pc(ch.root.l, ch.root.a));
  /** A pitch near `lo` (the lowest pitch of that pitch class at or above it). */
  const from = (pc, lo) => lo + mod(pc - lo, 12);

  /**
   * Piano: the bass (slash bass or root) low, the chord tones close together above it - an octave higher in a treble
   * clef. { bass, tones } (MIDI pitches, tones low → high).
   */
  function pianoVoicing(ch, clef) {
    const hi = clef === 'bass' || clef === 'bass8' ? 0 : 12;
    const pcs = [...new Set(P().chordPcs(ch))];
    const bass = from(bassPc(ch), 36 + hi);
    const tones = pcs.map((pc) => from(pc, 48 + hi)).sort((a, b) => a - b);
    return { bass, tones };
  }

  // a guitar in standard tuning: E2 A2 D3 G3 B3 E4
  const STRINGS = [40, 45, 50, 55, 59, 64];
  /**
   * Guitar: a grip on six strings - the bass (slash bass / root) on the lowest string that sounds, every string above
   * it sounds (none muted in between), at most four frets wide, every tone of the chord in it (with four tones or
   * more the fifth may go), open strings liked, near the grip before (`near`: its position). [pitches low → high]
   * (null: none found - then close tones like a piano).
   */
  function guitarVoicing(ch, near, tight) {
    const pcs = [...new Set(P().chordPcs(ch))], bpc = bassPc(ch), root = P().pc(ch.root.l, ch.root.a);
    const fifth = mod(root + 7, 12), need = pcs.filter((pc) => !(pcs.length >= 4 && pc === fifth && pc !== bpc));
    let best = null;
    // (tight: four strings next to each other in the middle - A D G B or D G B e - one tone each)
    for (let low = tight ? 1 : 0; low <= 2; low++) { // the bass on the 6th, 5th or 4th string
      for (let pos = 0; pos <= 9; pos++) {
        // each string from `low` up: its frets in the window pos … pos+3 (and open) that give a chord tone
        const opts = STRINGS.map((open, s) => {
          if (s < low || (tight && s > low + 3)) return [null];
          const list = [];
          for (let f = pos === 0 ? 0 : pos; f <= pos + 3; f++) if (pcs.includes(mod(open + f, 12))) list.push(f);
          if (pos > 0 && pcs.includes(mod(open, 12)) && !list.includes(0)) list.push(0);
          return list.length ? list : null;
        });
        if (opts.some((o) => o === null)) continue;
        const pick = (s, acc) => {
          if (s === STRINGS.length) {
            const pitches = acc.map((f, k) => (f === null ? null : STRINGS[k] + f)).filter((p) => p !== null);
            if (mod(pitches[0], 12) !== bpc) return;
            if (tight && (pitches.length !== 4 || new Set(pitches.map((p) => mod(p, 12))).size < Math.min(4, pcs.length))) return; // (four strings: every tone once)
            const have = new Set(pitches.map((p) => mod(p, 12)));
            if (!need.every((pc) => have.has(pc))) return;
            const fretted = acc.filter((f) => f !== null && f > 0);
            const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
            if (span > 3) return;
            const opens = acc.filter((f) => f === 0).length;
            const at = fretted.length ? Math.min(...fretted) : 0;
            const twice = pitches.length - new Set(pitches).size; // (the same tone on two strings: a weaker grip)
            const cost = at * 0.6 + span * 0.4 - opens * 0.5 + low * 0.8 + twice * 1.2 + (near !== undefined && near !== null ? Math.abs(at - near) * 0.3 : 0) + fretted.length * 0.1;
            if (!best || cost < best.cost) best = { cost, pitches, at };
            return;
          }
          for (const f of opts[s]) pick(s + 1, acc.concat([f]));
        };
        pick(0, []);
      }
    }
    return best ? { pitches: best.pitches, at: best.at } : null;
  }

  AC.voicing = function (ch, kind, o = {}) {
    if (kind === 'guitar') {
      const g = guitarVoicing(ch, o.near, o.tight);
      if (g) return g.pitches;
      const v = pianoVoicing(ch, 'treble8');
      return [v.bass - 12].concat(v.tones.map((p) => p - 12));
    }
    return pianoVoicing(ch, o.clef);
  };
  AC.guitarGrip = guitarVoicing;

  // ---- Patterns -------------------------------------------------------------------------------------------------

  /**
   * The strokes of a pattern in a bar: [{ t, dur, take, stroke }] - take: 'all' (bass + chord), 'chord' (without the
   * bass), 'bass', or a number (the k-th tone of the voicing, low → high, wrapping), stroke 'd' | 'u' (guitar).
   */
  function steps(id, ts, L) {
    const beat = TC.rhythm ? TC.rhythm.beatTicks(ts) : 960, eighth = 480;
    const beats = [];
    for (let t = 0; t < L; t += beat) beats.push(t);
    const eighths = [];
    for (let t = 0; t < L; t += eighth) eighths.push(t);
    const until = (list, k) => (list[k + 1] !== undefined ? list[k + 1] : L) - list[k];
    switch (id) {
      case 'pBlock': return [{ t: 0, dur: L, take: 'all', held: true }];
      case 'gBlock': return [{ t: 0, dur: L, take: 'all', held: true, stroke: 'd' }];
      case 'pBeats': return beats.map((t, k) => ({ t, dur: until(beats, k), take: 'all' }));
      case 'gBeats': return beats.map((t, k) => ({ t, dur: until(beats, k), take: 'all', stroke: 'd' }));
      case 'pBassChord':
        return beats.map((t, k) => ({ t, dur: until(beats, k), take: (beats.length === 3 ? k === 0 : k % 2 === 0) ? 'bass' : 'chord' }));
      case 'pBroken': {
        // bass, the tones up, back down (without repeating the top and the bottom) - one an eighth
        return eighths.map((t, k) => ({ t, dur: until(eighths, k), take: k === 0 ? 'bass' : 'wave' + k }));
      }
      case 'pAlberti': return eighths.map((t, k) => ({ t, dur: until(eighths, k), take: ['a0', 'a2', 'a1', 'a2'][k % 4] }));
      case 'gEighths': return eighths.map((t, k) => ({ t, dur: until(eighths, k), take: 'all', stroke: k % 2 ? 'u' : 'd' }));
      case 'gDDU': {
        // ↓ - ↓ ↑ - ↑ ↓ ↑ in eighths (a 4/4 bar; other bars: the pattern as far as it goes)
        const pat = ['d', null, 'd', 'u', null, 'u', 'd', 'u'];
        const on = eighths.filter((t, k) => pat[k % 8]);
        return on.map((t, k) => ({ t, dur: until(on, k), take: 'all', stroke: pat[(t / eighth) % 8] }));
      }
      case 'gPick': return eighths.map((t, k) => ({ t, dur: until(eighths, k), take: k === 0 ? 'bass' : 'pick' + k }));
      default: return [];
    }
  }

  /** The pitches a step takes from a voicing (piano { bass, tones }, guitar [low → high]). */
  function take(step, v, kind) {
    const all = kind === 'guitar' ? v : [v.bass].concat(v.tones);
    const tones = kind === 'guitar' ? v.slice(1) : v.tones;
    const bass = all[0];
    if (step.take === 'all') return all;
    if (step.take === 'chord') return tones;
    if (step.take === 'bass') return [bass];
    if (/^a\d$/.test(step.take)) { // Alberti: the lowest three tones of the chord (root, third, fifth as they lie)
      const t3 = tones.slice(0, 3);
      return [t3[Math.min(Number(step.take[1]), t3.length - 1)]];
    }
    if (/^wave/.test(step.take)) { // up the tones and back: 1 2 3 2 1 2 …
      const k = Number(step.take.slice(4)) - 1, n = tones.length;
      if (n < 2) return [tones[0]];
      const cyc = 2 * (n - 1), i = k % cyc;
      return [tones[i < n ? i : cyc - i]];
    }
    if (/^pick/.test(step.take)) { // guitar: up the strings above the bass, again from the lowest
      const k = Number(step.take.slice(4)) - 1;
      return [tones[k % tones.length]];
    }
    return all;
  }

  /** How a pitch is written in this chord (its tone's letter: G♯ in E7), else as the scale has it (dia null). */
  function spell(pitch, ch) {
    const t = P().chordTones(ch).find((x) => P().pc(x.l, x.a) === mod(pitch, 12));
    if (!t) return null;
    return 7 * (Math.floor((pitch - t.a - P().NAT[t.l]) / 12) - 1) + t.l;
  }

  /**
   * Write the chords of bars from … to as notes into a track (voice vi): pattern `id`. The notes of that voice in
   * these bars go first. A chord changing inside the bar: the strokes from there take it; a held chord is cut at
   * the change. Bars before the first chord stay empty. Returns how many notes were written.
   */
  AC.write = function (doc, track, from, to, id, vi = 0) {
    const pat = AC.byId(id);
    if (!pat || !TC.pitch) return 0;
    const SC = TC.score, kind = pat.group;
    let n = 0, near = null;
    for (let bi = from; bi <= to; bi++) {
      const h = doc.bars[bi], L = TC.barTicks(h.ts), bar = track.bars[bi];
      if (!bar) continue;
      while (bar.voices.length <= vi) bar.voices.push([]);
      bar.voices[vi] = [];
      bar.simile = false;
      // the strokes; a held chord: one from each change of chord on
      let list = steps(id, h.ts, L);
      if (list.length === 1 && list[0].held) {
        const changes = [0].concat(SC.chordsIn(doc, bi).map((c) => c.t).filter((t) => t > 0));
        list = changes.map((t, k) => Object.assign({}, list[0], { t, dur: (changes[k + 1] !== undefined ? changes[k + 1] : L) - t }));
      } else {
        // a chord changing where the pattern has no stroke: the new chord is struck there (a guitar: down)
        SC.chordsIn(doc, bi).map((c) => c.t).filter((t) => t > 0 && t < L && !list.some((s) => s.t === t))
          .forEach((t) => list.push({ t, dur: 0, take: 'all', stroke: kind === 'guitar' ? 'd' : undefined }));
        list.sort((a, b) => a.t - b.t);
        list.forEach((s, k) => { s.dur = (list[k + 1] ? list[k + 1].t : L) - s.t; });
      }
      for (const st of list) {
        const at = SC.chordAt(doc, bi, st.t);
        if (!at) continue;
        // (a chord changing before this stroke ends: it ends there)
        const nextChange = SC.chordsIn(doc, bi).map((c) => c.t).filter((t) => t > st.t)[0];
        const dur = Math.min(st.dur, (nextChange !== undefined ? nextChange : L) - st.t);
        let v;
        if (kind === 'guitar') {
          const g = guitarVoicing(at.ch, near);
          v = g ? g.pitches : AC.voicing(at.ch, 'guitar');
          if (g) near = g.at;
        } else v = AC.voicing(at.ch, 'piano', { clef: track.clef });
        const pitches = [...new Set(take(st, v, kind))].filter((p) => p >= 0 && p <= 127);
        pitches.forEach((p) => {
          const note = TC.newPitchNote(p, spell(p, at.ch), {});
          note.chordNote = true;
          if (st.stroke) note.stroke = st.stroke;
          const r = SC.place(doc, track, bi, vi, st.t, dur, note);
          if (r.status === 'added' || r.status === 'chord') n++;
        });
      }
      SC.fitBar(doc, track, bi);
    }
    return n;
  };

  /**
   * A chord made smaller / bigger for writing (note panel "Tones"): size '' as the symbol, '3' a triad (root, third,
   * fifth - 7, 6, add9 … go), '4' a four-note chord (its seventh, else the seventh of the scale there: C in C major
   * Cmaj7, G G7, a diminished triad its minor seventh), '5' a power chord (root and fifth). The slash bass stays.
   */
  AC.resize = function (ch, size, scale) {
    if (!size) return ch;
    const q = P().qual(ch.q), iv = q ? q.iv : ch.iv || [0, 4, 7];
    let out;
    if (size === '5') out = [0, 7];
    else {
      const third = iv.find((i) => i >= 2 && i <= 5), fifth = iv.find((i) => i >= 6 && i <= 8);
      out = [0].concat(third !== undefined ? [third] : [], [fifth !== undefined ? fifth : 7]);
      if (size === '4') {
        let sev = iv.find((i) => i === 10 || i === 11 || (i === 9 && ch.q === 'dim7')); // (a 6 chord's 9 is a sixth)
        if (sev === undefined) {
          const r = P().pc(ch.root.l, ch.root.a), s = scale ? P().scaleById(scale.id) : null;
          const pcs = s ? s.iv.map((i) => mod(P().pc(scale.l, scale.a) + i, 12)) : [];
          sev = [10, 11].concat(out.includes(6) ? [9] : []).find((i) => pcs.includes(mod(r + i, 12)));
          if (sev === undefined) sev = 10;
        }
        out.push(sev);
      }
    }
    return Object.assign({}, ch, { q: null, iv: out });
  };

  /**
   * A chord written with a tap (note panel "Write: chord"): its notes [{ pitch, dia }] - by the track's instrument:
   *   guitar   a grip (o.tight: four strings in the middle, one tone each), a power chord on its E or A string
   *   bass     one tone: the bass of the chord (slash bass / root) nearest the tapped pitch (a power chord: root + fifth)
   *   ensemble four parts spread (strings, choir, brass): close from the tapped tone down as the top, the second
   *            highest an octave lower (drop 2); a triad doubles its root
   *   else     (voice, keys, pad) close together from the tapped pitch up (tapped higher: an inversion higher), a slash
   *            bass below them
   * size '5' (a power chord): root, fifth, octave.
   */
  AC.chordNotes = function (ch, track, tapped, size, o = {}) {
    const inst = (track && track.inst) || (AC.isGuitar(track) ? 'guitar' : 'voice'), tap = Math.max(0, Math.min(115, tapped));
    const r = P().pc(ch.root.l, ch.root.a);
    let pitches;
    if (inst === 'bass') {
      // one tone (a power chord: root and fifth) - the octave nearest the tapped place
      const b = size === '5' ? r : bassPc(ch), low = from(b, tap - 6);
      pitches = size === '5' ? [low, low + 7] : [low];
    } else if (size === '5') {
      const low = inst === 'guitar' ? (mod(r - 4, 12) <= 7 ? 40 + mod(r - 4, 12) : 45 + mod(r - 9, 12)) : from(r, Math.min(108, tap));
      pitches = [low, low + 7, low + 12];
    } else if (inst === 'guitar') pitches = AC.voicing(ch, 'guitar', { tight: o.tight });
    else {
      const pcs = [...new Set(P().chordPcs(ch))];
      if (inst === 'ensemble') {
        // four parts: the tapped tone's chord tone on top, the others close below it, then the second highest an octave lower
        const top = pcs.map((pc) => from(pc, tap)).sort((a, b) => a - b)[0];
        const four = pcs.length >= 4 ? pcs.slice(0, 4) : pcs.concat([r]);
        const close = four.map((pc) => from(pc, top - 11)).sort((a, b) => a - b);
        for (let k = 1; k < close.length; k++) if (close[k] === close[k - 1]) close[k - 1] -= 12; // (the doubled root: an octave lower)
        close.sort((a, b) => a - b);
        close[close.length - 2] -= 12; // (drop 2: the second highest an octave down)
        pitches = close.sort((a, b) => a - b);
      } else {
        // the chord tone at or right above the tapped pitch first, the others above it
        const first = pcs.map((pc) => from(pc, tap)).sort((a, b) => a - b)[0];
        pitches = pcs.map((pc) => from(pc, first)).sort((a, b) => a - b);
      }
      if (ch.bass) {
        const b = bassPc(ch);
        if (mod(pitches[0], 12) !== b) pitches = [from(b, pitches[0] - 12)].concat(pitches.filter((p) => mod(p, 12) !== b));
      }
    }
    return pitches.filter((p) => p >= 0 && p <= 127).map((p) => ({ pitch: p, dia: spell(p, ch) }));
  };

  /** Notes in voice vi of bars from … to (what writing there would replace). */
  AC.notesIn = (track, from, to, vi = 0) => {
    let n = 0;
    for (let bi = from; bi <= to; bi++) ((track.bars[bi] && track.bars[bi].voices[vi]) || []).forEach((ev) => { n += ev.notes.length; });
    return n;
  };
})(window.TC);
