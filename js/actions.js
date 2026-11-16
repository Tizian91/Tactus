'use strict';
/*
 * Named commands. Toolbar buttons, panel buttons (data-action="name" data-value="…"),
 * menus and keyboard shortcuts all call into TC.actions.
 */
(function (TC) {
  const S = TC.state;
  const A = (TC.actions = {});
  const tr = (s, v) => TC.tr(s, v);
  const selectedIds = () => [...S.selection];

  // ---- Input (what the next click writes) ---------------------------------------------

  /** Note value 1 … 64. With notes selected: they get the new length. */
  // Note value, dotted, triplet: with notes selected they change the selected notes only (starting from the
  // value of the first one), otherwise they are the setting for the next notes - like accent and instrument.
  A.setValue = function (v) {
    v = Number(v);
    if (!TC.VALUES.includes(v)) return;
    if (S.selection.size) {
      const cur = selectedValue();
      return setSelectedValue({ value: v, dotted: cur.dotted, triplet: cur.triplet && v > 1 });
    }
    S.input.value = v;
    if (S.input.value <= 1) S.input.triplet = false;
    TC.refresh();
  };
  A.toggleDotted = function () {
    if (S.selection.size) {
      const cur = selectedValue();
      return setSelectedValue({ value: cur.value, dotted: !cur.dotted, triplet: false });
    }
    S.input.dotted = !S.input.dotted;
    if (S.input.dotted) S.input.triplet = false;
    TC.refresh();
  };
  A.toggleTriplet = function () {
    if (S.selection.size) {
      const cur = selectedValue();
      return setSelectedValue({ value: cur.value, dotted: false, triplet: !cur.triplet && cur.value > 1 });
    }
    S.input.triplet = !S.input.triplet;
    if (S.input.triplet) S.input.dotted = false;
    TC.refresh();
  };
  /**
   * The value of the first selected note ({ value, dotted, triplet }; a melody note: its tied chain as a whole),
   * or - if its length is no single note value - the setting for the next notes.
   */
  function selectedValue() {
    const id = selectedIds()[0], h = id && TC.score.findNote(S.doc, id);
    if (!h) return { value: S.input.value, dotted: !!S.input.dotted, triplet: !!S.input.triplet };
    const ticks = h.note.pitch !== undefined ? TC.score.chainTicks(TC.score.tieChain(S.doc, id)) : h.ev.dur;
    return TC.valueOfTicks(ticks) || { value: S.input.value, dotted: !!S.input.dotted, triplet: !!S.input.triplet };
  }
  TC.actions.selectedValue = selectedValue;
  /** The selected notes get this value (melody: a tied chain as a whole, tied on over the bar line if it needs to). */
  function setSelectedValue(v) {
    const ticks = TC.inputTicks(v), drums = [], seen = new Set();
    for (const id of selectedIds()) {
      const ch = TC.score.tieChain(S.doc, id), h = ch[0];
      if (!h) continue;
      if (h.note.pitch === undefined) {
        drums.push(id);
        continue;
      }
      if (seen.has(h.ev)) continue; // (a chord: once)
      seen.add(h.ev);
      TC.score.setMelodyLength(S.doc, h.track, h.bar, h.voice, h.ev, ticks);
    }
    if (drums.length) TC.score.setDuration(S.doc, drums, ticks);
    TC.commit();
  }

  /*
   * Note properties: with notes selected they change the selected notes only,
   * otherwise they are the settings for the next notes.
   */

  /**
   * Instrument: the next notes get it (also the lock writes it) - and selected notes change to it. (Only the selected
   * notes, as before, left the instrument of the next notes as it was: a tap on a crash, "crash medium" chosen, and
   * the lock went on writing the other crash.)
   */
  A.setArt = function (id) {
    id = Number(id);
    const art = TC.drums.byId(id);
    if (!art) return;
    S.input.art = id;
    TC.saveSettings();
    if (S.selection.size) {
      forSelected((n) => { if (n.art !== undefined) n.art = id; }); // (melody notes have no instrument)
      TC.commit();
    } else TC.refresh();
    TC.ui.hint(TC.drums.label(art));
  };

  /** Melody: the voice to write in (0: voice 1, 1: voice 2); notes selected: they move into it. */
  A.setMelodyVoice = function (v) {
    v = Number(v) === 1 ? 1 : 0;
    if (S.selection.size && TC.score.toVoice(S.doc, [...S.selection], v)) {
      S.input.voice = v;
      return TC.commit();
    }
    S.input.voice = v;
    TC.refresh();
  };
  A.setAccent = function (a) {
    a = Number(a);
    if (S.selection.size) {
      forSelected((n) => { n.accent = a; });
      TC.commit();
    } else {
      S.input.accent = a;
      TC.refresh();
    }
  };
  A.toggleAccent = function () {
    if (S.selection.size) {
      const first = TC.score.findNote(S.doc, selectedIds()[0]);
      A.setAccent(first && first.note.accent === 1 ? 0 : 1);
    } else A.setAccent(S.input.accent === 1 ? 0 : 1);
  };
  A.toggleGhost = function () {
    if (S.selection.size) {
      const first = TC.score.findNote(S.doc, selectedIds()[0]);
      const on = !(first && first.note.ghost);
      forSelected((n) => { n.ghost = on; });
      TC.commit();
    } else {
      S.input.ghost = !S.input.ghost;
      TC.refresh();
    }
  };
  A.setHead = function (h) {
    if (h !== 'auto' && !TC.HEADS[h]) return;
    if (S.selection.size) {
      forSelected((n) => { n.head = h; });
      TC.commit();
    } else {
      S.input.head = h;
      TC.refresh();
    }
  };

  /** Flam / drag before the note (null = none). */
  A.setOrn = (o) => noteProp('orn', o === 'flam' || o === 'drag' ? o : null);
  /** Roll: 0 … 3 strokes through the stem. */
  A.setTrem = (v) => noteProp('trem', TC.clamp(Math.round(Number(v) || 0), 0, 3));
  /** Sticking under the note: 'R', 'L' or '' (none). */
  A.setStick = (v) => noteProp('stick', v === 'R' || v === 'L' ? v : '');
  function noteProp(k, v) {
    if (S.selection.size) {
      forSelected((n) => { n[k] = v; });
      TC.commit();
    } else {
      S.input[k] = v;
      TC.refresh();
    }
  }

  function forSelected(fn) {
    for (const id of S.selection) {
      const hit = TC.score.findNote(S.doc, id);
      if (hit) fn(hit.note, hit);
    }
  }

  /** Move the selected notes one instrument up / down (to the next line of the kit). */
  A.moveLine = function (dir) {
    if (!S.selection.size) return;
    const lines = TC.drums.lines(TC.drums.kit());
    // melody: to the tone of the scale on the next line / space (up = higher), tied notes along -
    // chords locked ("Only chord tones"): to the next chord tone that way
    changeChains((h, sc) => {
      const P = TC.pitch, dia = P.noteSpell(h.note, sc).dia;
      const at = TC.score.guideAt(S.doc, h.bar) === 'lock' ? TC.score.chordAt(S.doc, h.bar, h.ev.tick) : null;
      let t = P.lineTone(dia - dir, sc);
      if (at) {
        for (let k = 1; k <= 7; k++) {
          const g = P.guideTone(dia - dir * k, sc, at.ch, 'lock');
          if (g.chord) { t = g; break; }
        }
      }
      return { pitch: t.pitch, dia: t.dia };
    });
    forSelected((n) => {
      if (n.pitch !== undefined) return;
      const art = TC.drums.byId(n.art);
      const next = dir < 0 ? lines.filter(([l]) => l < art.line).pop() : lines.find(([l]) => l > art.line);
      if (next) n.art = (next[1].find((a) => a.def) || next[1][0]).id;
    });
    TC.commit();
  };

  /** Instrument lock: a click anywhere in the column writes the selected instrument. */
  A.toggleLock = function () {
    S.input.lock = !S.input.lock;
    TC.ui.hint(tr(S.input.lock ? 'Instrument lock on: the height no longer matters' : 'Instrument lock off'));
    TC.refresh();
    TC.interaction.refreshHover();
  };

  // ---- Drum kit and drum map ------------------------------------------------------------

  A.setKit = function (kit) {
    if (!TC.KITS[kit]) return;
    if (kit === 'custom' && !S.settings.kitCustom) S.settings.kitCustom = [...TC.drums.globalKit()];
    S.settings.kit = kit;
    TC.saveSettings();
    TC.refresh();
  };
  /** Kit profiles: which key of a drum VST is which instrument (dialog, js/kits.js). */
  A.openKits = () => TC.kits.open();
  /** Notation layout (where the instruments sit): a view setting, the score does not change. */
  A.setNotation = function (key) {
    if (!TC.NOTATIONS[key]) return;
    S.settings.notation = key;
    TC.drums.setNotation(key);
    TC.saveSettings();
    TC.refresh();
  };
  /** Stems: 'up' (all up, one voice), 'feet' (feet down), 'low' (feet + chosen low toms down). */
  A.setStems = function (mode) {
    if (!TC.drums.STEM_MODES.includes(mode)) return;
    S.settings.stems = mode;
    applyStems();
  };
  /** A tom goes down with the feet ('low' mode) - or not. */
  A.toggleStemLow = function (id) {
    id = Number(id);
    const low = new Set(Array.isArray(S.settings.stemsLow) ? S.settings.stemsLow : TC.drums.DEFAULT_LOW);
    if (low.has(id)) low.delete(id);
    else low.add(id);
    S.settings.stemsLow = [...low];
    applyStems();
  };
  function applyStems() {
    TC.drums.setStems(S.settings.stems, S.settings.stemsLow);
    // the notes move into the voices of the new setting; no undo step (only the notation changes)
    if (TC.score.revoice(S.doc)) {
      TC.history.rebase();
      S.rev++;
      TC.storage.scheduleAutosave();
    }
    TC.saveSettings();
    TC.refresh();
  }

  /** Rest cleanup of the drum tracks (rhythm.js R.ends): part of the score, so undoable. */
  A.setFill = function (fill) {
    if (!TC.rhythm.FILLS.includes(fill) || TC.curTrack().fill === fill) return;
    S.doc.tracks.forEach((t) => { if (t.kind === 'drums') t.fill = fill; });
    TC.commit();
  };

  // ---- Tracks -------------------------------------------------------------------------------
  // All tracks share the bars (time signature, tempo, repeats, jumps); each has its own notes and
  // %-bars. The track being written is TC.curTrack() (not part of the score, not undone).

  const trackOf = (id) => S.doc.tracks.find((t) => t.id === id) || TC.curTrack();
  /** A piano: the other staff gets what both share (sound, scale, mute / solo, name …) from t. */
  const sync = (t) => TC.score.syncHands(S.doc, t);
  /** Write into this track (and show it). */
  A.selectTrack = function (id) {
    const t = trackOf(id);
    if (!t || t === TC.curTrack()) return;
    S.trackId = t.id;
    S.selection.clear();
    S.hover = null;
    fitArt(t);
    TC.refresh();
  };
  /** A track with instruments of its own: the selected instrument becomes one of them. */
  function fitArt(t) {
    const kit = TC.drums.kit(t);
    if (TC.drums.ownKit(t) && !kit.has(S.input.art)) S.input.art = [...kit][0];
  }
  /** A new track only for the selected instrument (one line, named after it), e.g. a snare part. */
  A.addTrackFor = function () {
    const art = TC.drums.byId(S.input.art);
    if (!art) return;
    const t = TC.score.addTrack(S.doc, TC.score.freeTrackName(S.doc, TC.drums.elName(art)), TC.curTrack());
    if (TC.curTrack().kind === 'drums') t.midiOut = TC.curTrack().midiOut; // (the same drum VST)
    t.kit = [art.id];
    t.oneLine = true;
    S.trackId = t.id;
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('Track "{name}" added - you are writing into it now', { name: t.name }));
  };
  /** Show / hide a track (still played; the one being written goes to a shown one). */
  A.toggleTrackHidden = function (id) {
    const t = TC.score.instrumentOf(S.doc, trackOf(id));
    if (!t.hidden && TC.score.instruments(S.doc).filter((x) => !x.hidden).length < 2) return TC.ui.hint(tr('At least one track stays visible'));
    t.hidden = !t.hidden;
    sync(t);
    if (t.hidden && TC.score.handsOf(S.doc, t).includes(TC.curTrack())) {
      S.trackId = S.doc.tracks.find((x) => !x.hidden).id;
      S.selection.clear();
      fitArt(TC.curTrack());
    }
    TC.commit();
  };
  /** Instruments of the track being written: 'kit' (those of the settings) or 'own' (a list of its own). */
  A.setTrackKit = function (v) {
    const t = TC.curTrack();
    if (v === 'own' && !TC.drums.ownKit(t)) t.kit = [...TC.drums.kit(t)];
    else if (v === 'kit') {
      t.kit = null;
      t.oneLine = false;
    } else return;
    TC.commit();
  };
  /** An instrument in / out of the own instruments of the track being written (one stays). */
  A.toggleTrackArt = function (id) {
    id = Number(id);
    const t = TC.curTrack(), ids = TC.drums.kit(t);
    if (ids.has(id)) {
      if (ids.size < 2) return TC.ui.hint(tr('One instrument stays'));
      ids.delete(id);
    } else ids.add(id);
    t.kit = [...ids];
    fitArt(t);
    TC.commit();
  };
  /** One staff line for the track being written (its own instruments; without any: the selected one). */
  A.toggleTrackOneLine = function () {
    const t = TC.curTrack();
    if (!TC.drums.ownKit(t)) t.kit = [S.input.art];
    t.oneLine = !t.oneLine;
    fitArt(t);
    TC.commit();
  };
  /** Mute / solo a track (playback; heard again at once while playing). */
  A.toggleMute = function (id) {
    const t = trackOf(id);
    t.mute = !t.mute;
    sync(t);
    TC.commit();
  };
  A.toggleSolo = function (id) {
    const t = trackOf(id);
    t.solo = !t.solo;
    sync(t);
    TC.commit();
  };
  /**
   * Kit profile of the track being written: '' = the one of the score, 'gm' = General MIDI, or a
   * profile id. Its keys are used when playing through MIDI and in the MIDI export.
   */
  A.setTrackProfile = function (v) {
    const t = TC.curTrack();
    const p = v && v !== 'gm' ? TC.kits.byId(v) : null;
    t.profile = p ? p.id : v === 'gm' ? 'gm' : '';
    t.profileName = p ? p.name : '';
    TC.commit();
    // instruments of this track the profile has no key for: show them right away
    if (p && TC.kits.check(S.doc, p).length) TC.kits.openCheck(p);
  };
  /** The track's fader (0 … 127, 100 = as before): Tactus' sounds louder / softer, through MIDI the channel volume (CC 7). */
  A.setTrackVolume = function (v) {
    const t = TC.curTrack();
    t.volume = TC.clamp(Math.round(Number(v)), 0, 127);
    sync(t);
    TC.commit();
  };
  /** MIDI output of a track (default: the one being written) while playing: '' = Tactus' sounds, '?' = look for outputs. */
  A.setTrackMidiOut = function (v, track) {
    if (v === '?') return A.findMidiOutputs();
    const t = track && track.id ? track : TC.curTrack();
    if (TC.player.playing) TC.player.stop(true);
    t.midiOut = v || '';
    sync(t);
    if (v) S.settings.midiOff = false; // (an output chosen: it is meant to be heard)
    TC.saveSettings();
    TC.commit();
  };
  /** MIDI channel of the track being written while playing ('' = the one of its kit profile; 1 … 16). */
  A.setTrackMidiCh = function (v) {
    const n = Number(v);
    TC.curTrack().midiCh = v !== '' && n >= 1 && n <= 16 ? n - 1 : null;
    sync(TC.curTrack());
    TC.commit();
  };
  /** The next track (status bar, cycles). */
  A.nextTrack = function () {
    const ts = S.doc.tracks, i = ts.indexOf(TC.curTrack());
    if (ts.length > 1) A.selectTrack(ts[(i + 1) % ts.length].id);
  };
  A.addTrack = function () {
    const name = prompt(tr('Name of the new track (e.g. Snare, Cymbals):'), TC.score.freeTrackName(S.doc, tr('Drums')));
    if (name === null) return;
    const t = TC.score.addTrack(S.doc, name.trim() || TC.score.freeTrackName(S.doc, tr('Drums')), TC.curTrack());
    if (TC.curTrack().kind === 'drums') t.midiOut = TC.curTrack().midiOut; // (the same drum VST)
    S.trackId = t.id;
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('Track "{name}" added - you are writing into it now', { name: t.name }));
  };
  /** A new melody track (treble clef, C major) after the one being written - no questions, rename it later. */
  A.addMelody = function () {
    const t = TC.score.addTrack(S.doc, TC.score.freeTrackName(S.doc, tr('Melody')), TC.curTrack(), 'pitched');
    S.trackId = t.id;
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('Melody track added - tap a line: the tone of the scale there'));
  };
  /** A new piano: two staves (treble: right hand, bass: left hand), one instrument - after the one being written. */
  A.addPiano = function () {
    const t = TC.score.addTrack(S.doc, TC.score.freeTrackName(S.doc, tr('Piano')), TC.curTrack(), 'pitched');
    t.program = 0;
    TC.score.setPiano(S.doc, t, true);
    S.trackId = t.id;
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('Piano added - the upper staff is the right hand, the lower one the left hand'));
  };
  /**
   * Melody track being written: two staves (piano: a lower staff in the bass clef for the left hand) on / off -
   * off, the left hand goes (with notes: asked first; undo brings it back).
   */
  A.togglePiano = function () {
    const t = TC.curTrack();
    if (!t || t.kind !== 'pitched') return;
    const up = TC.score.instrumentOf(S.doc, t), old = TC.score.leftHand(S.doc, up), on = !old;
    if (old) {
      let n = 0;
      old.bars.forEach((b) => b.voices.forEach((v) => v.forEach((ev) => { n += ev.notes.length; })));
      if (n && !confirm(tr('Remove the left hand (lower staff) with its {n} notes? (Undo is possible.)', { n }))) return TC.refresh();
    }
    if (!TC.score.setPiano(S.doc, up, on)) return;
    if (on) up.voice = '';
    S.trackId = up.id;
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr(on ? 'Two staves: tap the lower one to write the left hand' : 'One staff again'));
  };
  /** Melody track being written: clef. */
  A.setTrackClef = function (clef) {
    const t = TC.curTrack();
    if (t.kind !== 'pitched' || !TC.pitch.CLEFS[clef]) return;
    t.clef = clef;
    TC.commit();
  };
  /** Melody track: its sound (General MIDI program; Tactus' synth plays its family). Played at once. */
  A.setTrackProgram = function (p) {
    const t = TC.curTrack();
    p = Number(p);
    if (t.kind !== 'pitched' || !Number.isInteger(p) || p < 0 || p > 127) return;
    t.program = p;
    sync(t);
    TC.commit();
    if (S.settings.sound) TC.audio.previewTone(t.clef === 'bass' ? 48 : t.clef === 'treble8' ? 60 : 67, t);
  };
  /** Melody track: voice (range; sets the clef that fits it). */
  A.setTrackVoice = function (v) {
    const t = TC.curTrack();
    if (t.kind !== 'pitched') return;
    t.voice = TC.pitch.VOICES[v] ? v : '';
    if (t.voice) t.clef = TC.pitch.VOICES[v].clef;
    TC.commit();
  };
  /**
   * Melody track: scale from the selected bar on (bar 1: the whole track) - root as a pitch class
   * (spelled the usual way for that scale) or the kind of scale. The notes keep their pitches.
   */
  A.setTrackScale = function (what, value) {
    const t = TC.curTrack();
    if (t.kind !== 'pitched') return;
    const bi = S.selBar !== null ? S.selBar : 0, cur = TC.score.scaleAt(t, bi), P = TC.pitch;
    const id = what === 'id' ? value : cur.id, pc = what === 'root' ? Number(value) : P.pc(cur.l, cur.a);
    const root = P.bestRoot(pc, id);
    TC.score.setScale(t, bi, { l: root.l, a: root.a, id });
    sync(t);
    TC.commit();
    TC.ui.hint(`${bi > 0 ? tr('From bar {n}', { n: bi + 1 }) + ': ' : ''}${P.scaleName(TC.score.scaleAt(t, bi), TC.getLang() === 'de')}`);
  };
  /**
   * Melody: the whole tied chain of every selected melody note, once each: [[hit, …]] (its first note
   * decides, the tied ones follow it).
   */
  function selectedChains() {
    const seen = new Set(), out = [];
    for (const id of S.selection) {
      const ch = TC.score.tieChain(S.doc, id);
      if (!ch.length || ch[0].note.pitch === undefined || seen.has(ch[0].note.id)) continue;
      ch.forEach((c) => seen.add(c.note.id));
      out.push(ch);
    }
    return out;
  }
  /** Change every selected melody chain: fn(first hit, its scale) -> { pitch?, dia } for all of its notes, or null. */
  function changeChains(fn) {
    let n = 0;
    selectedChains().forEach((ch) => {
      const to = fn(ch[0], TC.score.scaleAt(ch[0].track, ch[0].bar));
      if (!to || to.pitch < 0 || to.pitch > 127) return;
      ch.forEach((c) => Object.assign(c.note, to));
      n++;
    });
    return n;
  }
  TC.actions.selectedChains = selectedChains;

  /** Selected melody notes a semitone up (♯, dir 1) or down (♭, -1), on their own line (tied notes along). */
  A.alterSelection = function (dir) {
    if (changeChains((h, sc) => TC.pitch.alter(TC.pitch.noteSpell(h.note, sc), Number(dir)))) TC.commit();
  };
  // ---- Lyrics (js/lyrics.js) -------------------------------------------------------------
  /** Type lyrics: at the selected note, else at the first note without a syllable (verse: S.lyricVerse). */
  A.startLyrics = () => TC.lyrics.start();
  /** Show or hide the lyrics (they can make bars wide); saved with the score, kept in the exports. */
  A.toggleLyrics = function () {
    if (TC.lyrics.isOpen()) TC.lyrics.close();
    S.doc.page.lyrics = S.doc.page.lyrics === false;
    TC.commit();
  };
  /** The verse to type into (0 = 1st); the field is open: it moves to that verse. */
  A.setLyricVerse = function (v) {
    S.lyricVerse = TC.clamp(Number(v) || 0, 0, TC.score.LYRIC_VERSES - 1);
    TC.refresh();
  };
  /** Delete a verse of the lyrics of the track being written (the verses after it move up). */
  A.deleteLyricVerse = function (v) {
    const t = TC.curTrack();
    v = Number(v) || 0;
    if (!t || !confirm(tr('Delete verse {n} of the lyrics of "{track}"?', { n: v + 1, track: t.name }))) return;
    t.bars.forEach((b) => (b.voices[0] || []).forEach((ev) => ev.notes.forEach((n) => {
      if (!n.lyr) return;
      n.lyr.splice(v, 1);
      while (n.lyr.length && !n.lyr[n.lyr.length - 1]) n.lyr.pop();
      if (!n.lyr.length) delete n.lyr;
    })));
    S.lyricVerse = Math.max(0, Math.min(S.lyricVerse, TC.score.lyricVerses(t) - 1));
    TC.commit();
  };

  /** The first selected melody note: a tie to the next note on / off (only the same tone right after it). */
  A.toggleTie = function () {
    const id = selectedIds()[0], h = id && TC.score.findNote(S.doc, id);
    // a chord: every tone of it that the next chord has too (a rest between: the note becomes longer and fills it)
    const c = h && TC.score.chordTies(S.doc, h.track, h.bar, h.voice, h.ev);
    if (!c) return TC.ui.hint(tr('Tie: only to the same tone right after it - or drag the note longer over the bar line.'));
    TC.score.tieChord(S.doc, h.track, h.bar, h.voice, h.ev, !c.all);
    TC.commit();
  };
  /** A chord: only the selected tone tied to the same tone in the next chord (on / off) - the others are struck again. */
  A.toggleTieOne = function () {
    const id = selectedIds()[0], h = id && TC.score.findNote(S.doc, id);
    const next = h && TC.score.tieTarget(S.doc, h.track, h.bar, h.voice, h.ev, h.note);
    if (!next) return TC.ui.hint(tr('Tie: only to the same tone right after it - or drag the note longer over the bar line.'));
    if (next.gap) h.ev.dur += next.gap;
    if (next.note.tie && !next.gap) delete next.note.tie;
    else next.note.tie = true;
    TC.commit();
  };
  /** Selected melody notes an octave up (1) or down (-1), tied notes along. */
  A.octaveSelection = function (dir) {
    dir = Number(dir);
    if (changeChains((h, sc) => {
      const sp = TC.pitch.noteSpell(h.note, sc);
      return { pitch: h.note.pitch + 12 * dir, dia: sp.dia + 7 * dir };
    })) TC.commit();
  };
  /** Selected melody notes written the other way (F♯ ↔ G♭); the pitch stays. */
  A.respell = function () {
    if (changeChains((h, sc) => {
      const alt = TC.pitch.enharmonics(h.note.pitch, TC.pitch.noteSpell(h.note, sc).dia)[0];
      return alt ? { dia: alt.dia } : null;
    })) TC.commit();
  };
  A.setTrackScaleRoot = (pc) => A.setTrackScale('root', pc);
  A.setTrackScaleId = (id) => A.setTrackScale('id', id);
  /** Melody track: the scale change at the selected bar goes (the scale before it goes on). */
  A.clearScaleChange = function () {
    const t = TC.curTrack();
    if (t.kind !== 'pitched' || !S.selBar || !t.bars[S.selBar].scale) return;
    t.bars[S.selBar].scale = null;
    sync(t);
    TC.commit();
  };
  A.renameTrack = function (id) {
    const t = TC.score.instrumentOf(S.doc, trackOf(id));
    const name = prompt(tr('Name of the track:'), t.name);
    if (name === null || !name.trim() || name.trim() === t.name) return;
    t.name = name.trim();
    sync(t);
    TC.commit();
  };
  A.duplicateTrack = function (id) {
    const t = TC.score.duplicateTrack(S.doc, trackOf(id));
    S.trackId = t.id;
    S.selection.clear();
    TC.commit();
  };
  A.deleteTrack = function (id) {
    const t = trackOf(id);
    if (TC.score.instruments(S.doc).length < 2) return TC.ui.hint(tr('The last track cannot be deleted'));
    let notes = 0;
    TC.score.handsOf(S.doc, t).forEach((h) => h.bars.forEach((b) => b.voices.forEach((v) => v.forEach((ev) => { notes += ev.notes.length; }))));
    if (notes && !confirm(tr('Delete the track "{name}" with its {n} notes? (Undo is possible.)', { name: t.name, n: notes }))) return;
    const i = S.doc.tracks.indexOf(TC.score.instrumentOf(S.doc, t));
    TC.score.deleteTrack(S.doc, t);
    if (!S.doc.tracks.some((x) => x.id === S.trackId)) S.trackId = S.doc.tracks[Math.min(i, S.doc.tracks.length - 1)].id;
    TC.pruneSelection();
    TC.commit();
  };
  A.moveTrackUp = (id) => { if (TC.score.moveTrack(S.doc, trackOf(id), -1)) TC.commit(); };
  A.moveTrackDown = (id) => { if (TC.score.moveTrack(S.doc, trackOf(id), 1)) TC.commit(); };
  /** Instrument in / out of the kit (the kit becomes a custom one). */
  A.toggleKitArt = function (id) {
    id = Number(id);
    const ids = TC.drums.globalKit();
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    S.settings.kitCustom = [...ids];
    S.settings.kit = 'custom';
    TC.saveSettings();
    TC.refresh();
  };
  A.toggleMapUsed = function () {
    S.settings.mapUsedOnly = !S.settings.mapUsedOnly;
    TC.saveSettings();
    TC.refresh();
  };

  /** Tool of the score: 'write', 'select' (frame, move several), 'erase'. */
  A.setTool = function (t) {
    if (!['write', 'select', 'erase'].includes(t)) return;
    S.tool = t;
    TC.ui.hint(tr({ write: 'Write notes', select: 'Select: frame, Shift + click, drag to move', erase: 'Eraser: tap or wipe over notes' }[t]));
    TC.refresh();
    TC.interaction.refreshHover();
  };
  /** All notes - or those of the selected bars, if several are selected. */
  A.selectAll = function () {
    const R = TC.barRange(), part = R && R[1] > R[0];
    S.selection = new Set();
    const cur = TC.curTrack();
    TC.score.eachNote(S.doc, (n, ev, vi, bi, t) => { if (t === cur && (!part || (bi >= R[0] && bi <= R[1]))) S.selection.add(n.id); });
    TC.refresh();
    TC.ui.hint(tr('{n} note(s) selected', { n: S.selection.size }));
  };
  /** Selected notes one grid step earlier (-1) or later (1), across bars. */
  A.shiftSelection = function (dir) {
    if (!S.selection.size) return;
    if (TC.score.moveNotes(S.doc, [...S.selection], TC.gridTicks(S.input) * (dir < 0 ? -1 : 1))) TC.commit();
    else TC.ui.hint(tr('Cannot move there (a note of the same instrument, or the end of the score)'));
  };

  A.deleteSelection = function () {
    if (!S.selection.size) return;
    // melody: the notes tied on from a deleted one go with it (the ones before it stay)
    const ids = selectedIds();
    const n = TC.score.removeNotes(S.doc, ids.concat(TC.score.tiedOn(S.doc, ids)));
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('{n} note(s) deleted', { n }));
  };

  A.selectNone = function () {
    S.selection.clear();
    TC.selectBar(null);
    TC.refresh();
  };

  // ---- Bars -----------------------------------------------------------------------------

  const curBar = () => (S.selBar !== null ? S.selBar : S.doc.bars.length - 1);

  A.addBar = function () {
    TC.score.insertBars(S.doc, S.doc.bars.length, 1);
    TC.selectBar(S.doc.bars.length - 1);
    TC.commit();
  };
  A.insertBarBefore = function (i = curBar()) {
    TC.score.insertBars(S.doc, i, 1, S.doc.bars[i].ts);
    TC.selectBar(i);
    TC.commit();
  };
  A.insertBarAfter = function (i = curBar()) {
    TC.score.insertBars(S.doc, i + 1, 1, S.doc.bars[i].ts);
    TC.selectBar(i + 1);
    TC.commit();
  };
  /** Bar i, or all selected bars if i is one of them: [first, last]. */
  function rangeAt(i) {
    const R = TC.barRange();
    return R && R[1] > R[0] && i >= R[0] && i <= R[1] ? R : [i, i];
  }
  A.rangeAt = rangeAt;
  /** Delete bar i - or all selected bars, if i is one of them (at least one bar stays). */
  A.deleteBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    if (!TC.score.deleteBars(S.doc, a, b - a + 1)) return TC.ui.hint(tr('The last bar cannot be deleted'));
    TC.selectBar(Math.min(a, S.doc.bars.length - 1));
    TC.pruneSelection();
    TC.commit();
    if (b > a) TC.ui.hint(tr('{n} bars deleted', { n: b - a + 1 }));
  };
  /** Empty bar i - or all selected bars, if i is one of them. */
  A.clearBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    for (let k = a; k <= b; k++) TC.score.clearBar(S.doc, k, TC.curTrack()); // the track being written
    TC.pruneSelection();
    TC.commit();
  };

  /** Swing / shuffle of the score (%: 50 straight … 75 hard); part of the score, undoable. */
  A.setSwing = function (v) {
    S.doc.meta.swing = TC.clamp(Math.round(Number(v) || 50), 50, 80);
    TC.commit();
  };
  A.setSwingUnit = function (u) {
    S.doc.meta.swingUnit = Number(u) === 16 ? 16 : 8;
    TC.commit();
  };
  /** Swing also in the MIDI export (off: straight notes, to swing them in the DAW). */
  A.toggleSwingMidi = function () {
    S.settings.swingMidi = S.settings.swingMidi === false;
    TC.saveSettings();
    TC.refresh();
  };

  /** Tempo from bar i on ('' / 0: as the bars before; bar 1: the tempo of the score). */
  A.setBarTempo = function (v, i = curBar()) {
    const n = Math.round(Number(v) || 0);
    if (i === 0) {
      if (n) S.doc.meta.tempo = TC.clamp(n, 20, 400);
    } else {
      S.doc.bars[i].tempo = n ? TC.clamp(n, 20, 400) : null;
    }
    TC.commit();
  };
  A.clearBarTempo = (i) => A.setBarTempo('', Number(i));
  /** Select bar i and scroll it into view (tempo list in the panel). */
  A.gotoBar = function (i) {
    i = Number(i);
    if (!S.doc.bars[i]) return;
    TC.selectBar(i);
    S.selection.clear();
    TC.refresh();
    const L = TC.render.layout, b = L && L.bars[i];
    if (b) TC.player.keepInView({ x: L.systems[b.sys].tx + b.x + b.w / 2, y: L.systems[b.sys].ty + 2 * TC.render.SP });
  };
  A.editBarTempo = function (i = curBar()) {
    const v = prompt(tr('Tempo from bar {n} (quarter notes per minute) – empty: as before', { n: i + 1 }), i === 0 ? S.doc.meta.tempo : S.doc.bars[i].tempo || '');
    if (v !== null) A.setBarTempo(v, i);
  };
  /**
   * Time signature "n/d" from bar i on. mode: 'from' (up to the next change), 'only' (this bar alone),
   * 'shift' (this bar alone, the notes after it move along); default: the choice in the bar panel.
   */
  A.setTimeSig = function (value, i = curBar(), mode = S.tsMode || 'from') {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(value));
    const ts = m && [+m[1], +m[2]];
    const ok = m && (mode === 'shift' ? TC.score.setTimeSigShift(S.doc, i, ts) : TC.score.setTimeSig(S.doc, i, ts, mode === 'only' || mode === true));
    if (!ok) return TC.ui.hint(tr('Invalid time signature'));
    TC.pruneSelection();
    TC.commit();
  };
  A.customTimeSig = function (i = curBar(), mode) {
    const v = prompt(tr('Time signature (e.g. 7/8, 11/16)'), S.doc.bars[i].ts.join('/'));
    if (v) A.setTimeSig(v, i, mode);
  };
  /** How a time signature chosen in the bar panel applies: 'from' | 'only' | 'shift'. */
  A.setTsMode = function (mode) {
    S.tsMode = ['from', 'only', 'shift'].includes(mode) ? mode : 'from';
    TC.refresh();
  };
  /** Beam groups "2+2+3" from bar i on ('default': as usual for the time signature). */
  A.setBeam = function (value, i = curBar()) {
    const groups = !value || value === 'default' ? null : String(value).split('+').map(Number);
    if (!TC.score.setBeam(S.doc, i, groups)) return;
    TC.commit();
  };

  /** Copy bar i - or all selected bars, if i is one of them. */
  A.copyBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    S.clipboard = TC.score.copyBars(S.doc, a, b);
    if (a === b) TC.selectBar(i);
    TC.ui.hint(a === b ? tr('Bar {n} copied – click a bar and paste (Ctrl+V)', { n: a + 1 })
      : tr('Bars {a}–{b} copied – click a bar and paste (Ctrl+V)', { a: a + 1, b: b + 1 }));
    TC.refresh();
  };
  /** Paste the copied bar(s) from bar i on (the first of the selected bars); new bars at the end if needed. */
  A.pasteBar = function (i = curBar()) {
    if (!S.clipboard) return TC.ui.hint(tr('Copy a bar first (Ctrl+C)'));
    const at = rangeAt(i)[0];
    const n = TC.score.pasteBars(S.doc, at, S.clipboard);
    TC.selectBar(at);
    if (n > 1) TC.selectBar(at + n - 1, true);
    TC.pruneSelection();
    TC.commit();
    TC.ui.hint(n > 1 ? tr('Pasted into bars {a}–{b}', { a: at + 1, b: at + n }) : tr('Pasted into bar {n}', { n: at + 1 }));
  };
  /** A copy of the bar (or of the selected bars) right after it. */
  A.duplicateBar = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    const n = TC.score.duplicateBars(S.doc, a, b);
    TC.selectBar(b + 1);
    if (n > 1) TC.selectBar(b + n, true);
    TC.commit();
  };
  /**
   * "%": the bar repeats the bar before it. Switching it on empties the bar; switching it off
   * writes out the notes it repeated, so you can change them from there.
   */
  A.toggleSimile = function (i = curBar()) {
    if (i <= 0) return TC.ui.hint(tr('The first bar has no bar before it to repeat'));
    const track = TC.curTrack(); // the % belongs to the track being written
    TC.score.setSimile(S.doc, track, i, !track.bars[i].simile);
    TC.selectBar(i);
    TC.pruneSelection();
    TC.commit();
  };

  // ---- Finding repeats (model.js SC.findRepeats): colours in the score, a list in the panel -------------

  /** The repeats found in the score now (cached per change; shown tracks, strength counting or not). */
  let foundKey = '', found = null;
  A.found = function () {
    const key = S.rev + ':' + !!S.settings.analyzeLoose + ':' + S.doc.tracks.length;
    if (key !== foundKey) {
      foundKey = key;
      found = TC.score.findRepeats(S.doc, { loose: !!S.settings.analyzeLoose });
    }
    return found;
  };
  /** Show / hide the repeats found (colours in the score, list in the panel). */
  A.toggleAnalyze = function () {
    S.analyze = !S.analyze;
    TC.refresh();
    if (S.analyze) {
      const f = A.found();
      TC.ui.hint(f.simile.length || f.sections.length ? tr('Found: {a} sections, {b} runs of the same bar', { a: f.sections.length, b: f.simile.length }) : tr('No repeats found'));
    }
  };
  A.toggleAnalyzeLoose = function () {
    S.settings.analyzeLoose = !S.settings.analyzeLoose;
    TC.saveSettings();
    TC.refresh();
  };
  const scrollToBar = (i) => {
    const L = TC.render.layout, b = L && L.bars[i];
    if (b) TC.player.keepInView({ x: L.systems[b.sys].tx + b.x + b.w / 2, y: L.systems[b.sys].ty + 2 * TC.render.SP });
  };
  /** A run found: its bars become %-bars (k: index in A.found().simile). */
  A.applySimile = function (k) {
    const r = A.found().simile[Number(k)];
    if (!r) return;
    r.bars.forEach((i) => TC.score.setSimile(S.doc, r.track, i, true));
    TC.pruneSelection();
    TC.commit();
    TC.ui.hint(tr('{name}: bars {a}–{b} as %', { name: r.track.name, a: r.bars[0] + 1, b: r.bars[r.bars.length - 1] + 1 }));
  };
  A.applyAllSimile = function () {
    const f = A.found();
    let n = 0;
    f.simile.forEach((r) => r.bars.forEach((i) => { if (TC.score.setSimile(S.doc, r.track, i, true)) n++; }));
    if (!n) return;
    TC.pruneSelection();
    TC.commit();
    TC.ui.hint(tr('{n} bars as %', { n }));
  };
  /** A section found: written once with |: :| n× (k: index in A.found().sections). */
  A.foldSection = function (k) {
    const s = A.found().sections[Number(k)];
    if (!s || !TC.score.foldSection(S.doc, s)) return;
    TC.selectBar(s.from);
    TC.selectBar(s.from + s.len - 1, true);
    TC.pruneSelection();
    TC.commit();
    TC.ui.hint(tr('Bars {a}–{b} with a repeat ({n}×)', { a: s.from + 1, b: s.from + s.len, n: s.times }));
  };
  /** Everything found at once: sections |: :|, then %-bars. */
  A.autoRepeats = function () {
    const r = TC.score.autoRepeats(S.doc, { loose: !!S.settings.analyzeLoose });
    if (!r.sections && !r.similes) return TC.ui.hint(tr('No repeats found'));
    TC.selectBar(null);
    TC.pruneSelection();
    TC.commit();
    TC.ui.hint(tr('Repeats set: {a} sections, {b} %-bars – right-click a bar: back to the notes', { a: r.sections, b: r.similes }));
  };
  /** Select (and show) the bars of a finding. */
  A.showFound = function (v) {
    const [kind, k] = String(v).split(':'), f = A.found();
    const x = kind === 's' ? f.sections[Number(k)] : f.simile[Number(k)];
    if (!x) return;
    const a = kind === 's' ? x.from : x.from, b = kind === 's' ? x.from + x.len * x.times - 1 : x.bars[x.bars.length - 1];
    if (kind !== 's') S.trackId = x.track.id;
    TC.selectBar(a);
    TC.selectBar(b, true);
    TC.refresh();
    scrollToBar(a);
  };
  /** Bar menu: a %-bar shows its notes again (all selected bars that are % in this track). */
  A.simileToNotes = function (i = curBar()) {
    const t = TC.curTrack(), [a, b] = rangeAt(i);
    let n = 0;
    for (let k = Math.max(1, a); k <= b; k++) if (TC.score.setSimile(S.doc, t, k, false)) n++;
    if (n) TC.commit();
  };
  /** Bar menu: the repeat (|: :|) around bar i written out again (every pass its own bars). */
  A.unfoldSection = function (i = curBar()) {
    const r = TC.score.unfoldSection(S.doc, i);
    if (!r) return;
    TC.pruneSelection();
    TC.commit();
    TC.ui.hint(tr('Repeat written out: bars {a}–{b}', { a: r.from + 1, b: r.from + (r.to - r.from + 1) * r.times }));
  };

  // ---- View -------------------------------------------------------------------------------

  TC.zoomAt = function (zoom, sx, sy) {
    const v = S.doc.view;
    const z = TC.clamp(zoom, 0.25, 4);
    v.x = sx - (sx - v.x) * (z / v.zoom);
    v.y = sy - (sy - v.y) * (z / v.zoom);
    v.zoom = z;
    TC.render.applyView();
    TC.ui.updateZoom();
  };
  function zoomCenter(factor) {
    const r = document.getElementById('viewport').getBoundingClientRect();
    TC.zoomAt(S.doc.view.zoom * factor, r.width / 2, r.height / 2);
  }
  A.zoomIn = () => zoomCenter(1.25);
  A.zoomOut = () => zoomCenter(1 / 1.25);
  /** Back to the default size (160 %). */
  A.zoomReset = () => zoomCenter(TC.DEFAULT_ZOOM / S.doc.view.zoom);
  /** Back to the start of the piece. */
  A.home = function () {
    const v = S.doc.view;
    if (TC.render.isPage()) {
      // the first page, centred
      const w = document.getElementById('viewport').clientWidth;
      v.x = Math.max((S.settings.showDrumMap ? 130 : 20) * v.zoom, (w - TC.render.PAGE_W * v.zoom) / 2);
      v.y = 20;
    } else {
      v.x = (S.settings.showDrumMap ? 150 : 30) * v.zoom;
      v.y = 165 * v.zoom;
    }
    TC.render.applyView();
  };

  A.toggleDrumMap = function () {
    S.settings.showDrumMap = !S.settings.showDrumMap;
    TC.saveSettings();
    if (S.settings.showDrumMap && S.doc.view.x < 150 * S.doc.view.zoom) A.home();
    TC.refresh();
  };
  /** Show / hide a panel: side 'right' = score settings, otherwise the note panel. */
  A.togglePanel = function (side) {
    const k = side === 'right' ? 'showPanelRight' : 'showPanel';
    S.settings[k] = !S.settings[k];
    TC.saveSettings();
    TC.panel.applyLayout();
  };
  A.togglePanelRight = () => A.togglePanel('right');
  /** Settings window (drum kit, notation, page, view, keys): open / close. */
  A.openSettings = () => TC.panel.openSettings();
  /** The window "Tracks & sound": the tracks (add, order, mute / solo, instruments, "Plays on") and the playback. */
  A.openTracks = () => TC.panel.openSettings('tracks');
  /** Left-handed: the note panel goes to the right, the settings to the left. */
  /** Fingers write notes on the lines (off: pen / mouse only, a finger selects and scrolls). */
  A.toggleFingerWrites = function () {
    S.settings.fingerWrites = S.settings.fingerWrites === false;
    TC.saveSettings();
    TC.refresh();
  };
  A.toggleLeftHanded = function () {
    S.settings.leftHanded = !S.settings.leftHanded;
    TC.saveSettings();
    TC.panel.applyLayout();
    TC.refresh();
  };
  function toggleSetting(k) {
    S.settings[k] = !S.settings[k];
    TC.saveSettings();
    TC.refresh();
  }
  A.toggleCounts = () => toggleSetting('showCounts');
  A.toggleSound = () => toggleSetting('sound');
  A.toggleMetronome = () => toggleSetting('metronome');
  A.toggleMidiSynth = () => toggleSetting('midiOutSynth');
  /** Recorded drum sounds instead of the synthesizer (loaded the first time). */
  A.toggleSamples = function () {
    toggleSetting('samples');
    const ctx = S.settings.samples && TC.audio.context();
    if (ctx && TC.samples.state() !== 'ready') {
      TC.samples.load(ctx).then((ok) => TC.ui.hint(tr(ok ? 'Recorded drum sounds ready' : 'The recordings could not be loaded (offline, or opened as a file) – the synthesizer plays.')));
    }
  };
  /** Extra output delay in ms (sound heard later than the browser reports): the cursor waits for it. */
  A.setAudioDelay = function (ms) {
    S.settings.audioDelay = TC.clamp(Math.round(Number(ms) || 0), 0, 500);
    TC.saveSettings();
    TC.refresh();
  };
  /** Lead of the MIDI output in ms (the drum VST's delay is made up for). */
  A.setMidiLead = function (ms) {
    S.settings.midiLead = TC.clamp(Math.round(Number(ms) || 0), 0, 500);
    TC.saveSettings();
    if (TC.player.playing) TC.player.restartHere();
    TC.refresh();
  };
  /** Look for MIDI outputs (the browser asks once whether Tactus may use MIDI). */
  A.findMidiOutputs = function () {
    return TC.midiOut.init().then((ok) => {
      if (!ok) TC.ui.hint(tr('MIDI is not available (Chrome / Edge, and allow it when the browser asks).'));
      else if (!TC.midiOut.outputs().length) TC.ui.hint(tr('No MIDI output found - is the virtual MIDI cable (e.g. loopMIDI) running?'));
      TC.refresh();
      return ok;
    });
  };
  /** (older menus) '?' looks for outputs; an output name: the track being written plays there. */
  A.setMidiOut = (value) => (value === '?' ? A.findMidiOutputs() : A.setTrackMidiOut(value));
  /**
   * Output of a track (playback list): value "trackId|output" - '' = Tactus' sounds, '?' = look for outputs.
   * One VST plays one instrument, so every track has its own.
   */
  A.setOutputOf = function (value) {
    const v = String(value), k = v.indexOf('|'), t = S.doc.tracks.find((x) => x.id === v.slice(0, k));
    if (!t) return;
    A.setTrackMidiOut(v.slice(k + 1), t);
  };
  /** ▶ at "Plays on": one note to the output of the track being written now - and what the browser says about the port. */
  A.testTrackOut = function () {
    const t = TC.curTrack();
    TC.midiOut.init().then(() => {
      const r = TC.midiOut.test(t);
      if (!r) return TC.ui.hint(tr('"{name}" is not connected - is loopMIDI running? A port made while the browser was open: close the browser completely and open it again.', { name: t.midiOut }));
      TC.ui.hint(tr('Test note {note} on channel {ch} sent to "{name}" (port: {state}, {connection}). Nothing heard: does the VST listen to this port? A port made while the browser was open: close the browser completely and open it again.', r));
    });
  };
  /** Toolbar / playback panel: MIDI off for a moment (every track with Tactus' sounds) and on again. */
  A.toggleSoundOut = function () {
    if (!TC.midiOut.chosen()) return TC.ui.hint(tr('No track plays through MIDI: choose it at the track - "Plays on".'));
    if (TC.player.playing) TC.player.stop(true);
    S.settings.midiOff = !S.settings.midiOff;
    TC.saveSettings();
    if (!S.settings.midiOff) {
      TC.midiOut.init().then(() => {
        if (TC.midiOut.missing()) TC.ui.hint(tr('No MIDI output found - is the virtual MIDI cable (e.g. loopMIDI) running?'));
        TC.refresh();
      });
    }
    TC.refresh();
  };
  /** The view follows the playback cursor (off: it stays, to change notes while listening). */
  A.toggleFollowPlay = function () {
    S.settings.followPlay = S.settings.followPlay === false;
    TC.saveSettings();
    TC.refresh();
    TC.ui.hint(tr(S.settings.followPlay ? 'The view follows the playback' : 'The view stays where it is while playing'));
  };
  /** How the view follows: 'jump' or 'smooth' (a setting of this browser). */
  A.setFollowMode = function (m) {
    if (!['jump', 'smooth'].includes(m)) return;
    S.settings.followMode = m;
    S.settings.followPlay = true;
    TC.saveSettings();
    TC.refresh();
  };
  A.toggleCountIn = () => toggleSetting('countIn');
  A.toggleLoop = function () {
    toggleSetting('loop');
    if (TC.player.playing) TC.player.restartHere();
  };
  A.togglePlay = () => TC.player.toggle();
  A.stop = () => TC.player.stop();
  /** Keep the screen on: 'play' | 'always' | 'off' (a setting of this browser). */
  A.setWake = function (m) {
    S.settings.wake = ['play', 'always', 'off'].includes(m) ? m : 'play';
    TC.saveSettings();
    TC.refresh();
  };
  /** Loudness of the click (metronome, count-in), 0 … 2. */
  A.setClickVol = function (v) {
    S.settings.clickVol = TC.clamp(Number(v) || 0, 0, 2);
    TC.saveSettings();
    const c = !TC.player.playing && TC.audio.context();
    if (c) TC.audio.click(c.currentTime + 0.03, 2); // (hear it)
  };
  A.setVolume = function (v) {
    S.settings.volume = TC.clamp(Number(v), 0, 1);
    TC.audio.setVolume(S.settings.volume);
    TC.saveSettings();
  };

  A.toggleTheme = function () {
    const order = ['auto', 'light', 'dark'];
    S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % 3];
    TC.saveSettings();
    TC.applyTheme();
  };
  A.toggleLang = function () {
    TC.setLang(S.settings.lang === 'de' ? 'en' : 'de');
  };
  /** Endless view (all bars in one row) or page view (A4 pages, as printed). */
  A.layout = function (mode) {
    mode = mode === 'page' ? 'page' : 'endless';
    if (S.settings.layout === mode) return;
    S.settings.layout = mode;
    TC.saveSettings();
    const v = S.doc.view;
    if (mode === 'page') {
      // the whole width of a page in view
      const w = document.getElementById('viewport').clientWidth;
      v.zoom = TC.clamp((w - 40) / TC.render.PAGE_W, 0.3, TC.DEFAULT_ZOOM);
    } else {
      v.zoom = TC.DEFAULT_ZOOM;
    }
    TC.render.draw();
    A.home();
    TC.refresh();
  };
  A.toggleLayout = () => A.layout(S.settings.layout === 'page' ? 'endless' : 'page');

  // ---- Pages: turning, stage view, page turning by MIDI (js/remote.js) -----------------------------

  const performing = () => document.body.classList.contains('perform');
  /** The page shown (page view): the one at the top of the viewport. */
  A.currentPage = function () {
    const L = TC.render.layout;
    if (!L || !L.page || !L.pages.length) return 0;
    const v = S.doc.view, top = -v.y / v.zoom + TC.render.PAGE_H / 3;
    let k = 0;
    L.pages.forEach((p, i) => { if (p.y <= top) k = i; });
    return k;
  };
  /** Show page k (0 = first) from its top; the view switches to the page view. */
  A.gotoPage = function (k) {
    if (!TC.render.isPage()) A.layout('page');
    const L = TC.render.layout;
    if (!L || !L.pages.length) return;
    k = TC.clamp(Math.round(k) || 0, 0, L.pages.length - 1);
    const vp = document.getElementById('viewport'), v = S.doc.view;
    const w = vp.clientWidth, h = vp.clientHeight, pw = TC.render.PAGE_W * v.zoom, ph = TC.render.PAGE_H * v.zoom;
    v.x = pw <= w ? (w - pw) / 2 : Math.min(0, Math.max(w - pw, v.x));
    v.y = -L.pages[k].y * v.zoom + (performing() && ph <= h ? (h - ph) / 2 : 8);
    TC.render.applyView();
    TC.ui.status(tr('Page {k} / {n}', { k: k + 1, n: L.pages.length }));
    showPerformBar(k, L.pages.length);
  };
  /** The next page (d = 1) or the one before (d = -1). */
  A.turnPage = (d) => A.gotoPage(A.currentPage() + (d < 0 ? -1 : 1));
  A.nextPage = () => A.turnPage(1);
  A.prevPage = () => A.turnPage(-1);

  /** The stage view's own bar: page n / m, turning, leaving. */
  function showPerformBar(k, n) {
    let bar = document.getElementById('perform-bar');
    if (!performing()) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'perform-bar';
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-p]');
        if (b) A[b.dataset.p]();
      });
      document.body.appendChild(bar);
    }
    const midi = TC.remote && S.settings.remoteIn ? (TC.remote.active() ? ' · MIDI' : ' · MIDI ⚠') : '';
    bar.innerHTML = `<button type="button" data-p="prevPage" title="${esc(tr('Page before'))}">‹</button>` +
      `<span>${k + 1} / ${n}${midi}</span><button type="button" data-p="nextPage" title="${esc(tr('Next page'))}">›</button>` +
      `<button type="button" data-p="togglePerform" title="${esc(tr('Leave the stage view (Esc)'))}">✕</button>`;
  }
  /** The whole page in the viewport (stage view). */
  function fitPage() {
    const vp = document.getElementById('viewport'), v = S.doc.view;
    v.zoom = TC.clamp(Math.min((vp.clientWidth - 8) / TC.render.PAGE_W, (vp.clientHeight - 8) / TC.render.PAGE_H), 0.15, 4);
  }
  /**
   * Stage view: only the pages, full screen, a whole page at a time (on a tablet: tap the right / left
   * third, or Page Down / Up, or MIDI from a player of backing tracks). Esc leaves it.
   */
  A.togglePerform = function () {
    const on = !performing();
    const k = TC.render.isPage() ? A.currentPage() : 0;
    document.body.classList.toggle('perform', on);
    if (on) {
      if (TC.player.playing) TC.player.stop();
      S.selection.clear();
      TC.selectBar(null);
      if (!TC.render.isPage()) A.layout('page');
      fitPage();
      TC.refresh();
      A.gotoPage(k);
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
      if (TC.remote && S.settings.remoteIn) TC.remote.init();
    } else {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      showPerformBar();
      TC.refresh();
    }
  };
  A.isPerforming = performing;
  if (typeof document !== 'undefined') {
    // the browser left full screen (Esc, back gesture): the stage view ends too
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && performing()) A.togglePerform(); });
    // a turned tablet: the whole page again
    window.addEventListener('resize', () => {
      if (!performing()) return;
      const k = A.currentPage();
      fitPage();
      TC.refresh();
      A.gotoPage(k);
    });
  }

  /** Page turning by MIDI: the input ('' = off). Asks the browser for MIDI first. */
  A.setRemoteIn = function (name) {
    S.settings.remoteIn = name || '';
    TC.saveSettings();
    if (TC.remote) TC.remote.init().then(() => { TC.remote.connect(); TC.refresh(); });
    TC.refresh();
  };
  /** Shows the MIDI inputs (asks the browser for MIDI). */
  A.remoteInit = function () {
    TC.remote.init().then((ok) => {
      if (!ok) TC.ui.hint(tr('MIDI is not available (Chrome / Edge, over https, MIDI allowed?)'));
      TC.refresh();
    });
  };
  A.setRemoteMode = function (m) {
    S.settings.remoteMode = m === 'step' ? 'step' : 'page';
    TC.saveSettings();
    TC.refresh();
  };
  A.setRemoteCh = function (v) {
    S.settings.remoteCh = v === 'all' || v === '' ? 'all' : TC.clamp(Number(v) - 1, 0, 15);
    TC.saveSettings();
    TC.refresh();
  };
  A.learnNext = () => TC.remote.learn('next');
  A.learnPrev = () => TC.remote.learn('prev');
  A.setTurnLead = function (v) {
    S.settings.turnLead = TC.clamp(Number(v) || 0, 0, 4);
    TC.saveSettings();
    TC.refresh();
  };
  /**
   * The page turning MIDI file: a note when a new page comes while playing (note n = page n), `turnLead`
   * bars before, on channel 16; with tempo, time signatures and the repeats written out like the MIDI
   * export - put next to the backing tracks (Cubase → player), Tactus turns the pages when it hears it.
   */
  A.exportPageTurns = function () {
    const pageOf = TC.render.pagesOfBars();
    const n = Math.max(0, ...pageOf) + 1;
    const name = tr('Page turns');
    const res = TC.midi.build(S.doc, null, { tracks: [], name, pageTurns: { pageOf, lead: S.settings.turnLead === undefined ? 1 : S.settings.turnLead, ch: 15 } });
    const file = `${baseName()} – ${cleanName(name)}.mid`;
    download(res.bytes, file);
    TC.ui.hint(tr('Page turning MIDI exported ({n} pages): {file}', { n, file }));
  };

  /**
   * MusicXML (js/musicxml.js) for Guitar Pro, MuseScore, Sibelius, Dorico: every track a part, as drawn
   * (values, triplets, beams, noteheads, ghost notes, accents, flams, rolls, repeats, endings, jumps).
   */
  A.exportMusicXml = function () {
    const xml = TC.musicxml.build(S.doc, { date: today() });
    const file = baseName() + '.musicxml';
    download(new TextEncoder().encode(xml), file, 'application/vnd.recordare.musicxml+xml');
    TC.ui.hint(tr('MusicXML exported: {file}', { file }));
  };
  const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  /**
   * MusicXML for Guitar Pro: its import takes no D.S. / D.C. / Fine and no "al Coda" (MusicXML cannot say
   * "al Coda", Guitar Pro does not guess it) - so the repeats and jumps are written out: every bar in the
   * order it is played (TC.score.unfold on a copy), and Guitar Pro plays it right. The score stays as it is.
   */
  A.exportMusicXmlGp = function () {
    const copy = TC.normalizeDoc(TC.clone(S.doc));
    const n = TC.score.unfold(copy);
    const xml = TC.musicxml.build(copy, { date: today() });
    const file = baseName() + ' (Guitar Pro).musicxml';
    download(new TextEncoder().encode(xml), file, 'application/vnd.recordare.musicxml+xml');
    TC.ui.hint(tr('MusicXML for Guitar Pro exported ({n} bars, repeats and jumps written out): {file}', { n, file }));
  };

  /** PDF / print: the page view on A4 (the browser's print dialog: "Save as PDF"). */
  A.print = function () {
    if (TC.player.playing) TC.player.stop();
    TC.render.print();
  };

  // ---- Chord symbols (for all tracks; js/pitch.js, model.js SC.setChord) -------------------------

  const de = () => TC.getLang() === 'de';
  /** Where the next chord goes in bar i: the place chosen in the panel (a beat of the bar), else the bar start. */
  const chordGrid = () => TC.gridTicks(S.input); // (the places follow the note value of the panel)
  const chordTick = (i) => (TC.score.chordSlots(S.doc, i, chordGrid()).includes(S.chordSlot) ? S.chordSlot : 0);
  const chordHint = (i, t) => {
    const x = TC.score.chordsIn(S.doc, i).find((c) => c.t === t);
    const where = tr('Bar {n}', { n: i + 1 }) + (t ? ', ' + TC.rhythm.countLabel(t, S.doc.bars[i].ts) : '');
    TC.ui.hint(x ? `${where}: ${TC.pitch.chordName(x.ch, de())}` : `${where}: ${tr('no chord')}`);
  };
  // ---- Dynamics (ppp … fff, hairpins): at the place chosen in the panel (the same places as the chords) -----------
  /** The tracks a dynamic goes into: the one being written (a piano: both hands) - or all of them (panel switch). */
  const dynTracks = () => (S.dynAll ? S.doc.tracks.slice() : TC.score.handsOf(S.doc, TC.curTrack()));
  /** A level (ppp … fff) at the chosen place of the selected bar - the same once more: it goes. */
  A.setDyn = function (v) {
    if (!TC.score.DYN_LEVELS.includes(v)) return;
    const i = curBar(), t = chordTick(i), cur = TC.score.dynIn(TC.curTrack(), i).find((d) => d.t === t && d.v);
    const off = cur && cur.v === v;
    let n = 0;
    dynTracks().forEach((tr) => { if (TC.score.setDyn(S.doc, tr, i, t, { v: off ? null : v })) n++; });
    if (!n) return;
    TC.commit();
    TC.ui.hint(off ? tr('Dynamic removed') : tr('{v} from here on - the notes stay as written', { v }));
  };
  /**
   * A hairpin (cresc. / dim.) from the chosen place of the selected bar to the end of the selected bars ("to bar" in
   * the bar panel) - to the next level written there, else two steps louder / softer. The same once more: it goes.
   */
  A.setWedge = function (w) {
    if (w !== 'cresc' && w !== 'dim') return;
    const R = TC.barRange() || [curBar(), curBar()], i = R[0], t = S.selBar === i ? chordTick(i) : 0;
    const at = TC.score.tickOf(S.doc), len = at(R[1], TC.barTicks(S.doc.bars[R[1]].ts)) - at(i, t);
    const cur = TC.score.dynIn(TC.curTrack(), i).find((d) => d.t === t && d.w);
    const off = cur && cur.w === w && cur.len === len;
    let n = 0;
    dynTracks().forEach((tk) => { if (TC.score.setDyn(S.doc, tk, i, t, { w: off ? null : w, len })) n++; });
    if (!n) return;
    TC.commit();
    TC.ui.hint(off ? tr('Hairpin removed') : tr(w === 'cresc' ? 'Crescendo to the end of bar {n}' : 'Diminuendo to the end of bar {n}', { n: R[1] + 1 }));
  };
  /**
   * The hairpin being set up in the panel ("pp < ff to bar 4"): { bar, t, from, to, end } - from: the level sounding at
   * the place (unless chosen), to: two steps on (louder; from ff on: softer), end: the last selected bar (or this one).
   * What was chosen holds only for this place (S.wedgeDraft).
   */
  A.wedgeDraft = function () {
    const SC = TC.score, L = SC.DYN_LEVELS, i = curBar(), t = chordTick(i), d = S.wedgeDraft;
    const mine = d && d.bar === i && d.t === t ? d : {};
    const from = mine.from || L[SC.levelAt(S.doc, TC.curTrack(), i, t)], fi = L.indexOf(from);
    const to = mine.to || L[fi >= L.length - 2 ? fi - 2 : fi + 2];
    const R = TC.barRange(), end = Number.isInteger(mine.end) && mine.end >= i && mine.end < S.doc.bars.length ? mine.end : R && R[1] > i ? R[1] : i;
    return { bar: i, t, from, to, end };
  };
  const draftSet = (k, v) => {
    S.wedgeDraft = Object.assign(A.wedgeDraft(), { [k]: v });
    TC.refresh();
  };
  A.setWedgeFrom = (v) => { if (TC.score.DYN_LEVELS.includes(v)) draftSet('from', v); };
  A.setWedgeTo = (v) => { if (TC.score.DYN_LEVELS.includes(v)) draftSet('to', v); };
  A.setWedgeEnd = (v) => draftSet('end', Number(v));
  /** Set the hairpin of the panel: its start level at the place, the hairpin to the end of its last bar, its end level. */
  A.makeWedge = function () {
    const d = A.wedgeDraft(), L = TC.score.DYN_LEVELS, a = L.indexOf(d.from), b = L.indexOf(d.to);
    if (a === b) return TC.ui.hint(tr('From and to are the same level - choose a louder or softer one'));
    const at = TC.score.tickOf(S.doc), len = at(d.end, TC.barTicks(S.doc.bars[d.end].ts)) - at(d.bar, d.t);
    dynTracks().forEach((tk) => {
      // (its start level only when it is not the one sounding there anyway - a hairpin goes on from the level before it)
      if (TC.score.DYN_LEVELS[TC.score.levelAt(S.doc, tk, d.bar, d.t)] !== d.from) TC.score.setDyn(S.doc, tk, d.bar, d.t, { v: d.from });
      TC.score.setDyn(S.doc, tk, d.bar, d.t, { w: b > a ? 'cresc' : 'dim', len, to: d.to });
    });
    S.wedgeDraft = null;
    TC.commit();
    TC.ui.hint(tr('{from} {sign} {to} to the end of bar {n}', { from: d.from, sign: b > a ? '<' : '>', to: d.to, n: d.end + 1 }));
  };
  // ---- Chords written like notes (js/interaction.js writeChord): a tap writes the chord of the chord symbols there
  /** What a tap writes in a melody track: '' a tone, 'n' a chord, 'd' a chord struck down ↓, 'u' up ↑. */
  A.setChordMode = function (v) {
    S.input.chordMode = ['n', 'd', 'u'].includes(v) ? v : '';
    TC.saveSettings();
    TC.refresh();
    if (S.input.chordMode) TC.ui.hint(tr('Tap: the chord of the chord symbols there - hold a chord and move down / up: its stroke ↓ / ↑'));
  };
  /** How many tones a tapped chord has: '' as its symbol, '3' a triad, '4' a four-note chord, '5' a power chord. */
  A.setChordSize = function (v) {
    S.input.chordSize = ['3', '4', '5'].includes(String(v)) ? String(v) : '';
    TC.refresh();
  };
  /** The stroke of the selected chords (their whole events): 'd' down, 'u' up, '' none. */
  A.setStroke = function (v) {
    const evs = new Set();
    for (const id of S.selection) { const h = TC.score.findNote(S.doc, id); if (h && h.note.pitch !== undefined) evs.add(h.ev); }
    if (!evs.size) return;
    evs.forEach((ev) => ev.notes.forEach((n) => { if (v === 'd' || v === 'u') n.stroke = v; else delete n.stroke; }));
    TC.commit();
  };

  /** Remove the level ('v') or the hairpin ('w') at the chosen place of the selected bar. */
  A.clearDyn = function (kind) {
    const i = curBar(), t = chordTick(i);
    let n = 0;
    dynTracks().forEach((tk) => { if (TC.score.setDyn(S.doc, tk, i, t, kind === 'w' ? { w: null } : { v: null })) n++; });
    if (n) TC.commit();
  };
  /** Dynamics for the track being written only, or for all tracks at once (not part of the score). */
  A.toggleDynAll = function () {
    S.dynAll = !S.dynAll;
    TC.refresh();
  };

  /** The scale-degree chord `deg` (1 …; seventh chord if switched on in the panel) at the chosen place of bar i. */
  A.setChordDeg = function (deg, i = curBar(), t = chordTick(i)) {
    deg = Number(deg);
    const entry = S.settings.chordSev ? { deg, sev: true } : { deg };
    const old = (S.doc.bars[i].chords || []).find((c) => c.t === t);
    if (old && old.deg === deg && !!old.sev === !!entry.sev) return chordHint(i, t);
    TC.score.setChord(S.doc, i, t, entry);
    TC.commit();
    chordHint(i, t);
    if (TC.player.playing) return;
    const ch = TC.score.chordOf(S.doc, i, entry);
    if (ch) A.previewChord(ch);
  };
  /** A chord as typed (C7, Fadd9, G/B …) at the chosen place of bar i; empty: removes it. */
  A.typeChord = function (text, i = curBar(), t = chordTick(i)) {
    if (!String(text || '').trim()) return A.clearChord(t, i);
    const ch = TC.pitch.parseChord(text, de());
    if (!ch) return TC.ui.hint(tr('No chord found in "{s}" - it starts with its root: C, F#m7, Bb/D …', { s: text }));
    TC.score.setChord(S.doc, i, t, { name: TC.pitch.chordText(ch) });
    TC.commit();
    chordHint(i, t);
    A.previewChord(ch);
  };
  A.editChord = function (i = curBar(), t = chordTick(i)) {
    const x = TC.score.chordsIn(S.doc, i).find((c) => c.t === t);
    const v = prompt(tr('Chord in bar {n} (e.g. Am, F#m7, C/G) – empty: remove', { n: i + 1 }), x ? TC.pitch.chordName(x.ch, de()).replace(/♯/g, '#').replace(/♭/g, 'b') : '');
    if (v !== null) A.typeChord(v, i, t);
  };
  /** Remove the chord at tick t of bar i (default: the chosen place). */
  A.clearChord = function (t, i = curBar()) {
    t = t === undefined ? chordTick(i) : Number(t);
    if (!(S.doc.bars[i].chords || []).some((c) => c.t === t)) return;
    TC.score.setChord(S.doc, i, t, null);
    TC.commit();
    chordHint(i, t);
  };
  /** Remove every chord of the selected bars. */
  A.clearBarChords = function (i = curBar()) {
    const [a, b] = rangeAt(i);
    let any = false;
    for (let k = a; k <= b; k++) if (S.doc.bars[k].chords) { delete S.doc.bars[k].chords; any = true; }
    if (any) TC.commit();
  };
  /** Where the next chord goes in the selected bar: a beat (tick). */
  A.setChordSlot = function (t) {
    S.chordSlot = Number(t) || 0;
    TC.refresh();
  };
  /** Triads or seventh chords in the chord bar of the panel (a setting of this browser). */
  A.toggleChordSev = function () {
    S.settings.chordSev = !S.settings.chordSev;
    TC.saveSettings();
    TC.refresh();
  };
  /** The chords sound along when playing (a soft pad), and how loud. */
  A.toggleChordPad = function () {
    S.doc.harmony.pad = !S.doc.harmony.pad;
    TC.commit();
  };
  /** Where the chords sound: '' Tactus' synth, else a MIDI output (e.g. a synth VST); and its channel (1 … 16). */
  A.setChordOut = function (v) {
    S.doc.harmony.midiOut = v || '';
    TC.commit();
  };
  A.setChordCh = function (v) {
    const n = Number(v);
    if (n >= 1 && n <= 16) S.doc.harmony.midiCh = n - 1;
    TC.commit();
  };
  A.setChordVol = function (v) {
    const n = TC.clamp(Math.round(Number(v) || 0), 0, 100);
    if (n === S.doc.harmony.vol) return;
    S.doc.harmony.vol = n;
    TC.commit({ merge: true });
  };
  /** The key of the chords when there is no melody track: root (pitch class) or kind of scale. */
  A.setHarmonyKey = function (what, value) {
    const P = TC.pitch, cur = S.doc.harmony.key;
    const id = what === 'id' ? value : cur.id, pc = what === 'root' ? Number(value) : P.pc(cur.l, cur.a);
    const root = P.bestRoot(pc, id);
    S.doc.harmony.key = { l: root.l, a: root.a, id };
    TC.commit();
    TC.ui.hint(tr('Chords in {name}', { name: P.scaleName(S.doc.harmony.key, de()) }));
  };
  A.setHarmonyKeyRoot = (pc) => A.setHarmonyKey('root', pc);
  A.setHarmonyKeyId = (id) => A.setHarmonyKey('id', id);
  /**
   * How the chords help writing a melody, from bar i on (bar 1: the whole score): 'off', 'mark' (the chord tones
   * marked), 'lock' (only chord tones). A change that ends up like the setting before it is removed.
   */
  A.setGuide = function (v, i = curBar()) {
    if (!TC.GUIDES.includes(v)) return;
    if (i <= 0) {
      S.doc.harmony.guide = v;
      delete S.doc.bars[0].guide;
    } else S.doc.bars[i].guide = v;
    for (let k = 1; k < S.doc.bars.length; k++) {
      const g = S.doc.bars[k].guide;
      if (g) {
        delete S.doc.bars[k].guide;
        if (TC.score.guideAt(S.doc, k) !== g) S.doc.bars[k].guide = g;
      }
    }
    TC.commit();
    TC.ui.hint((i > 0 ? tr('From bar {n}', { n: i + 1 }) + ': ' : '') + tr(GUIDE_NAMES[v]));
  };
  const GUIDE_NAMES = { off: 'Chords: no help', mark: 'Chord tones marked', lock: 'Only chord tones' };
  A.GUIDE_NAMES = GUIDE_NAMES;
  /** Hear a scale: up an octave and back to the root (the melody track's at the selected bar, else the key of the chords). */
  A.previewScale = function () {
    if (!TC.audio.context() || TC.player.playing) return;
    const t = TC.curTrack(), bi = S.selBar !== null ? S.selBar : 0, P = TC.pitch;
    const sc = t.kind === 'pitched' ? TC.score.scaleAt(t, bi) : TC.score.harmonyScale(S.doc, bi);
    const pc = P.pc(sc.l, sc.a), root = 60 + (pc > 7 ? pc - 12 : pc); // (around middle C)
    const iv = P.scaleById(sc.id).iv, up = iv.map((i) => root + i).concat(root + 12);
    const seq = up.concat(up.slice(0, -1).reverse());
    const now = TC.audio.now() + 0.05, step = 0.22;
    seq.forEach((p, k) => TC.audio.tone(p, now + k * step, k === seq.length - 1 ? 0.6 : step * 0.9, 0.7, null, t.kind === 'pitched' ? t : null));
    TC.ui.hint(P.scaleName(sc, de()));
  };
  /** Play a chord now (when it is chosen). */
  A.previewChord = function (ch) {
    if (!TC.audio || !TC.audio.context() || TC.player.playing) return;
    const v = TC.pitch.chordVoicing(ch), t = TC.audio.now() + 0.01;
    [v.bass].concat(v.tones).forEach((p) => TC.audio.tone(p, t, 0.9, 0.5, null, TC.timeline.chordTrack(S.doc)));
  };

  // ---- Page: bar text, line breaks, bars per line, bar numbers --------------------------------

  /** Text above bar i (Verse, Chorus, Fill …); empty removes it. */
  A.setMarker = function (text, i = curBar()) {
    const h = S.doc.bars[i];
    const t = String(text || '').trim().slice(0, 40);
    if (!h || h.marker === t) return;
    h.marker = t;
    TC.commit();
  };
  A.editMarker = function (i = curBar()) {
    const v = prompt(tr('Text above bar {n} (e.g. Verse, Chorus) – empty: remove', { n: i + 1 }), S.doc.bars[i].marker || '');
    if (v !== null) A.setMarker(v, i);
  };
  /** Page view: bar i starts a new line (the break is kept at the bar after it). */
  A.toggleLineBreak = function (i = curBar()) {
    if (i <= 0) return;
    S.doc.bars[i].lineBreak = !S.doc.bars[i].lineBreak;
    TC.commit();
    if (!TC.render.isPage()) TC.ui.hint(tr('Line breaks show in the page view'));
  };
  /** Page view: a new line after bar i (= from bar i + 1). */
  A.toggleBreakAfter = function (i = curBar()) {
    if (i < S.doc.bars.length - 1) A.toggleLineBreak(i + 1);
  };
  A.setBarsPerLine = function (n) {
    n = TC.clamp(Math.round(Number(n) || 0), 0, 12);
    if (S.doc.page.barsPerLine === n) return;
    S.doc.page.barsPerLine = n;
    TC.commit();
  };
  /** Space between the staves of several tracks (% of the standard): part of the score, like the margins. */
  A.setStaffGap = function (p) {
    p = Number(p);
    if (!TC.STAFF_GAPS.includes(p) || (S.doc.page.staffGap || 80) === p) return;
    S.doc.page.staffGap = p;
    TC.commit();
  };
  /** Space between the lines of the page view (% of the basic space). */
  A.setLineGap = function (p) {
    p = Number(p);
    if (!TC.LINE_GAPS.includes(p) || (S.doc.page.lineGap || 100) === p) return;
    S.doc.page.lineGap = p;
    TC.commit();
  };
  /** Page margins in mm (page view / PDF). */
  A.setMargin = function (mm) {
    mm = Number(mm);
    if (!TC.MARGINS.includes(mm) || S.doc.page.margin === mm) return;
    S.doc.page.margin = mm;
    TC.commit();
  };
  /** Title and "Page 2 / 3" at the top of the pages after the first (else only the number at the bottom). */
  /** The scale written above the music (bar 1, changes). */
  A.toggleScaleNames = function () {
    S.doc.page.scaleNames = S.doc.page.scaleNames === false;
    TC.commit();
  };
  A.togglePageHeader = function () {
    S.doc.page.header = !S.doc.page.header;
    TC.commit();
  };
  /** Page view / PDF: empty bars in a row as one multi-bar rest. */
  A.toggleMultiRest = function () {
    S.doc.page.multiRest = !S.doc.page.multiRest;
    TC.commit();
  };
  /** Page view / PDF: %-bars in a row as they are ('single'), narrow and counted ('count') or as one % with the number ('combine'). */
  A.setSimileMode = function (v) {
    if (!TC.SIMILE_MODES.includes(v) || S.doc.page.simile === v) return;
    S.doc.page.simile = v;
    TC.commit();
  };
  A.setBarNumbers = function (mode) {
    if (!TC.BAR_NUMBERS.includes(mode) || S.doc.page.barNumbers === mode) return;
    S.doc.page.barNumbers = mode;
    TC.commit();
  };

  // ---- History, files -----------------------------------------------------------------------

  A.undo = function () {
    if (TC.history.undo()) {
      S.dirty = true;
      TC.storage.scheduleAutosave();
      TC.refresh();
    }
  };
  A.redo = function () {
    if (TC.history.redo()) {
      S.dirty = true;
      TC.storage.scheduleAutosave();
      TC.refresh();
    }
  };
  A.newScore = () => TC.storage.newScore();
  A.open = () => TC.storage.open();
  A.save = () => TC.storage.save(false);
  A.saveAs = () => TC.storage.save(true);
  A.demo = () => TC.storage.loadDemo();

  // ---- Dropbox (js/dropbox.js) ----------------------------------------------------------------
  A.dropboxConnect = () => TC.dropbox.login(null);
  A.dropboxOpen = () => TC.dropbox.openSongs(); // asks about unsaved changes when a song is chosen
  A.dropboxSave = () => TC.dropbox.saveSong(false);
  A.dropboxSaveAs = () => TC.dropbox.saveSong(true);
  A.dropboxDisconnect = async function () {
    if (!confirm(tr('Disconnect Dropbox in this browser? Your files stay in Dropbox.'))) return;
    await TC.dropbox.disconnect();
    if (S.file.dropbox) S.file.dropbox = null;
    TC.storage.autosave();
    TC.refresh();
    TC.ui.hint(tr('Dropbox disconnected'));
  };
  function dropboxItems() {
    const DB = TC.dropbox;
    if (!DB || !DB.allowed) return [{ label: 'Dropbox (online version only)', disabled: true }];
    if (!DB.signedIn()) return [{ label: 'Connect Dropbox…', action: A.dropboxConnect }];
    const acc = DB.account();
    return [
      { label: 'Open from Dropbox…', action: A.dropboxOpen },
      { label: 'Save to Dropbox', action: A.dropboxSave, shortcut: S.file.dropbox ? 'Ctrl+S' : '' },
      { label: 'Save to Dropbox as…', action: A.dropboxSaveAs },
      { label: TC.tr('Disconnect Dropbox') + (acc ? ' (' + acc + ')' : ''), action: A.dropboxDisconnect },
    ];
  }

  A.fileMenu = function () {
    const r = document.getElementById('file-btn').getBoundingClientRect();
    TC.menu.open([
      { label: 'New score', action: A.newScore },
      { label: 'Open…', action: A.open, shortcut: 'Ctrl+O' },
      '-',
      { label: 'Save', action: A.save, shortcut: 'Ctrl+S' },
      { label: 'Save as…', action: A.saveAs, shortcut: 'Ctrl+Shift+S' },
      '-',
      ...dropboxItems(),
      { label: 'Copy a link to share', action: () => TC.share.copyLink() },
      '-',
      { label: 'Examples', submenu: TC.storage.EXAMPLES.map((e) => ({ label: e.label, action: () => TC.storage.loadExample(e.id) })) },
      { label: 'PDF / print…', action: A.print, shortcut: 'Ctrl+P' },
      '-',
      { label: 'Import MIDI…', action: A.importMidi },
      { label: S.doc.tracks.length > 1 ? TC.tr('Export MIDI…') : TC.tr('Export MIDI ({name})', { name: kitName() }), action: () => A.exportMidiCurrent(), shortcut: 'Ctrl+E' },
      { label: 'Export MIDI for', submenu: A.midiTargets() },
      { label: 'Export page turning MIDI…', action: A.exportPageTurns },
      { label: 'Export MusicXML (Guitar Pro, MuseScore …)', action: A.exportMusicXml },
      { label: 'Export MusicXML for Guitar Pro (repeats written out)', action: A.exportMusicXmlGp },
    ], r.left, r.bottom + 2);
  };

  const curKit = () => { const p = TC.kits.current(S.doc); return p ? p.id : null; };
  const kitName = () => { const p = TC.kits.ofTrack(S.doc, S.doc.tracks[0]); return p ? p.name : 'General MIDI'; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Targets of the MIDI export: General MIDI (also Guitar Pro) and every kit profile. */
  A.midiTargets = function () {
    TC.kits.load();
    const items = [{ label: 'General MIDI (Guitar Pro …)', action: () => A.exportMidi(null) }];
    if (TC.kits.list.length) items.push('-');
    for (const p of TC.kits.list) items.push({ label: TC.tr('Kit profile: {name}', { name: p.name }), action: () => A.exportMidi(p.id) });
    items.push('-', { label: 'Kit profiles (Cubase)…', action: A.openKits });
    return items;
  };

  /** MIDI import (js/midiin.js): choose a file, where it comes from and the grid. */
  A.importMidi = () => TC.midiIn.pick();

  /** MIDI export with the kit profile of the track (Ctrl+E); several tracks: the export dialog. */
  A.exportMidiCurrent = () => A.exportMidi();

  /** Kit profile of the score (status bar): which keys the MIDI export uses. Part of the score. */
  A.setKitProfile = function (id) {
    const p = id ? TC.kits.byId(id) : null;
    S.doc.meta.kit = p ? p.id : '';
    S.doc.meta.kitName = p ? p.name : '';
    TC.commit();
    // instruments of the score the profile has no key for: show them right away
    if (p && TC.kits.check(S.doc, p).length) TC.kits.openCheck(p);
  };
  A.kitMenu = function () {
    TC.kits.load();
    const r = document.getElementById('status-kit').getBoundingClientRect();
    const cur = curKit();
    const items = [];
    const p = TC.kits.byId(cur);
    if (p) {
      const n = TC.kits.check(S.doc, p).length;
      items.push({ label: n ? tr('Missing in this profile ({n})…', { n }) : tr('Check the kit profile…'), action: () => TC.kits.openCheck(p) }, '-');
    }
    items.push({ label: 'General MIDI (Guitar Pro …)', checked: !cur, action: () => A.setKitProfile(null) });
    if (TC.kits.list.length) items.push('-');
    for (const p of TC.kits.list) items.push({ label: p.name, checked: p.id === cur, action: () => A.setKitProfile(p.id) });
    items.push('-', { label: 'Kit profiles (Cubase)…', action: A.openKits });
    TC.menu.open(items, r.left, r.top - 4 - items.length * 30);
  };

  const cleanName = (s) => s.replace(/[\\/:*?"<>|]+/g, '-');
  const baseName = () => cleanName(S.doc.meta.title || S.file.name.replace(/\.tactus\.json$|\.json$/i, '') || 'Tactus');
  /** Hands a file to the browser as a download. */
  function download(bytes, name, type = 'audio/midi') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  /** What a kit profile lacked in an export, as lines of text. */
  const lackLines = (res) => {
    const lab = (x) => TC.drums.label(x);
    return res.replaced.map((r) => TC.tr('{a} played as {b}', { a: lab(r.art), b: lab(r.by) }))
      .concat(res.missing.map((x) => TC.tr('{a}: no key in the profile, left out', { a: lab(x) })));
  };

  /**
   * MIDI export. One track: at once, with the kit profile `profileId` (undefined: the track's own /
   * the score's). Several tracks: the export dialog (which tracks, which drum map each, one file per
   * track or all in one); profileId given: preset for every track.
   */
  A.exportMidi = function (profileId) {
    // several tracks, or chord symbols (a MIDI track / file of their own): the dialog
    if (TC.score.instruments(S.doc).length > 1 || S.doc.bars.some((h) => h.chords)) return A.exportMidiDialog(profileId);
    const t = S.doc.tracks[0];
    const p = profileId !== undefined ? (profileId ? TC.kits.byId(profileId) : null) : TC.kits.ofTrack(S.doc, t);
    const res = TC.midi.build(S.doc, p, { straight: S.settings.swingMidi === false });
    const name = baseName() + (p ? ' (' + cleanName(p.name) + ')' : '') + '.mid';
    download(res.bytes, name);
    const lines = lackLines(res);
    if (lines.length) alert(TC.tr('MIDI exported. The kit profile "{name}" has no key for:', { name: p.name }) + '\n\n' + lines.join('\n'));
    else TC.ui.status(TC.tr('MIDI exported: {file}', { file: name }));
  };

  /**
   * Export dialog for several tracks: a tick for each track to export, the drum map it is written for
   * (preset: its kit profile), and one MIDI file per track (each fits its own drum VST in Cubase) or
   * one file with a MIDI track per Tactus track. Every file has tempo, time signatures, markers and the
   * repeats written out, so the files lie on top of each other bar by bar.
   */
  A.exportMidiDialog = function (preset) {
    TC.kits.load();
    const old = document.querySelector('.midi-export-backdrop');
    if (old) old.remove();
    const rows = TC.score.instruments(S.doc).map((t) => { // (a piano: one row, its left hand goes along)
      const own = TC.kits.ofTrack(S.doc, t);
      return { t, on: true, target: preset !== undefined ? preset || 'gm' : own ? own.id : 'gm' };
    });
    let mode = S.settings.midiExportMode === 'one' ? 'one' : 'files';
    // chord symbols: a pad of their own (own file, or own MIDI track)
    const hasChords = S.doc.bars.some((h) => h.chords);
    let chords = hasChords && S.settings.midiChords !== false;
    const root = document.createElement('div');
    root.className = 'dialog-backdrop midi-export-backdrop';
    root.innerHTML = '<div class="dialog midi-dialog" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(root);
    const close = () => root.remove();
    root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
    const targets = [['gm', 'General MIDI (Guitar Pro …)']].concat(TC.kits.list.map((p) => [p.id, p.name]));
    const draw = () => {
      const list = rows.map((r, k) => `<div class="export-row">
          <label class="check"><input type="checkbox" data-k="on" data-i="${k}"${r.on ? ' checked' : ''}> <b>${esc(r.t.name)}</b>${r.t.mute ? ` <span class="muted">(${tr('muted')})</span>` : ''}</label>
          <select data-k="target" data-i="${k}"${r.on ? '' : ' disabled'}>${targets.map(([v, l]) => `<option value="${esc(v)}"${v === r.target ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
        </div>`).join('') + (hasChords ? `<div class="export-row">
          <label class="check"><input type="checkbox" data-k="chords"${chords ? ' checked' : ''}> <b>${tr('Chords')}</b> <span class="muted">(${tr('a pad on channel 15, the names as text')})</span></label></div>` : '');
      const n = rows.filter((r) => r.on).length + (chords ? 1 : 0);
      root.querySelector('.dialog').innerHTML = `<header><h2>${tr('Export MIDI')}</h2><button type="button" class="icon" data-k="close" title="${tr('Close')}">✕</button></header>
        <div class="kit-body">
          <p class="hint tight">${tr('Which tracks, and for which drum map (kit profile) each one is written:')}</p>
          <div class="export-list">${list}</div>
          <div class="row"><label>${tr('Files')}</label><select data-k="mode">
            <option value="files"${mode === 'files' ? ' selected' : ''}>${tr('One MIDI file per track')}</option>
            <option value="one"${mode === 'one' ? ' selected' : ''}>${tr('All in one file (one MIDI track each)')}</option></select></div>
          <p class="hint">${tr(mode === 'files'
            ? 'Each track its own file ("Title – Track.mid") for its own drum VST. All files have the tempo, the time signatures and the repeats written out, so they line up in Cubase when imported at the same place.'
            : 'One file; Cubase makes a track of each MIDI track.')}</p>
        </div>
        <footer><span class="grow"></span><button type="button" data-k="close">${tr('Cancel')}</button>
          <button type="button" class="primary" data-k="ok"${n ? '' : ' disabled'}>${tr(n === 1 || mode === 'one' ? 'Export' : 'Export {n} files', { n })}</button></footer>`;
    };
    root.addEventListener('change', (e) => {
      const el = e.target, k = el.dataset.k, i = Number(el.dataset.i);
      if (k === 'on') rows[i].on = el.checked;
      if (k === 'target') rows[i].target = el.value;
      if (k === 'mode') mode = el.value;
      if (k === 'chords') chords = el.checked;
      draw();
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      if (b.dataset.k === 'close') return close();
      if (b.dataset.k !== 'ok') return;
      const chosen = rows.filter((r) => r.on);
      if (!chosen.length && !chords) return;
      S.settings.midiExportMode = mode;
      if (hasChords) S.settings.midiChords = chords;
      TC.saveSettings();
      close();
      exportTracks(chosen.map((r) => ({ track: r.t, profile: r.target === 'gm' ? null : TC.kits.byId(r.target) })), mode, chords)
        .catch(() => TC.ui.status(TC.tr('Export cancelled')));
    });
    draw();
  };

  /** Writes the chosen tracks: [{ track, profile }] - one file each, or all in one (mode 'one'). */
  async function exportTracks(list, mode, chords) {
    const opts = { straight: S.settings.swingMidi === false };
    const base = baseName(), lacks = [];
    const files = [];
    if (mode === 'one') {
      const of = new Map(list.map((x) => [x.track, x.profile]));
      const res = TC.midi.build(S.doc, null, Object.assign({ tracks: list.map((x) => x.track), targetOf: (t) => of.get(t), multi: true, chords }, opts));
      files.push({ name: base + '.mid', bytes: res.bytes });
      const lines = lackLines(res);
      if (lines.length) lacks.push(lines.join('\n'));
    } else {
      for (const x of list) {
        const res = TC.midi.build(S.doc, x.profile, Object.assign({ tracks: [x.track], name: x.track.name }, opts));
        files.push({ name: `${base} – ${cleanName(x.track.name)}${x.profile ? ' (' + cleanName(x.profile.name) + ')' : ''}.mid`, bytes: res.bytes });
        const lines = lackLines(res);
        if (lines.length) lacks.push(`${x.track.name} (${x.profile.name}):\n` + lines.join('\n'));
      }
      if (chords) files.push({ name: `${base} – ${cleanName(tr('Chords'))}.mid`, bytes: TC.midi.build(S.doc, null, Object.assign({ tracks: [], chords: true, name: tr('Chords') }, opts)).bytes });
    }
    await saveFiles(files);
    if (lacks.length) alert(TC.tr('MIDI exported. Not every instrument has a key in its kit profile:') + '\n\n' + lacks.join('\n\n'));
    else TC.ui.status(files.length > 1 ? TC.tr('MIDI exported: {n} files', { n: files.length }) : TC.tr('MIDI exported: {file}', { file: files[0].name }));
  }
  /**
   * Several files: into a folder chosen once (Chrome / Edge), otherwise one download after another
   * (the browser may ask once whether a page may download several files).
   */
  async function saveFiles(files) {
    if (files.length > 1 && typeof window.showDirectoryPicker === 'function') {
      try {
        const dir = await window.showDirectoryPicker({ id: 'tactus-midi', mode: 'readwrite' });
        for (const f of files) {
          const h = await dir.getFileHandle(f.name, { create: true });
          const w = await h.createWritable();
          await w.write(f.bytes);
          await w.close();
        }
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e; // cancelled: nothing is written
      }
    }
    for (let k = 0; k < files.length; k++) {
      download(files[k].bytes, files[k].name);
      if (k < files.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  A.zoomMenu = function () {
    const r = document.getElementById('zoom-label').getBoundingClientRect();
    TC.menu.open([
      { label: 'Zoom in', action: A.zoomIn, shortcut: 'Ctrl++' },
      { label: 'Zoom out', action: A.zoomOut, shortcut: 'Ctrl+-' },
      { label: 'Default size (160 %)', action: A.zoomReset, shortcut: 'Ctrl+0' },
      '-',
      { label: 'To the start', action: A.home, shortcut: 'Home' },
    ], r.left, r.bottom + 2);
  };

  /** Right-click on a bar. */
  // ---- Repeats and endings (played / exported written out, model.js playOrder) ----------------

  A.toggleRepeatStart = function (i = curBar()) {
    S.doc.bars[i].repeatStart = !S.doc.bars[i].repeatStart;
    TC.commit();
  };
  /** Repeat end at bar i: played n times in all (0: none). */
  A.setRepeatEnd = function (n, i = curBar()) {
    n = TC.clamp(Math.round(Number(n) || 0), 0, 9);
    S.doc.bars[i].repeatEnd = n > 1 ? n : 0;
    TC.commit();
  };
  /** Ending of bar i: '' none, '1', '2', '1,2' … */
  A.setVolta = function (v, i = curBar()) {
    S.doc.bars[i].volta = TC.cleanVolta(String(v || '').split(',').map(Number));
    TC.commit();
  };
  /** The selected bars as a repeat (|: … :|, twice). */
  A.repeatSelection = function (times = 2) {
    const R = TC.barRange();
    if (!R) return TC.ui.hint(tr('Select bars first'));
    S.doc.bars[R[0]].repeatStart = true;
    S.doc.bars[R[1]].repeatEnd = TC.clamp(Number(times) || 2, 2, 9);
    TC.commit();
    TC.ui.hint(tr('Bars {a}–{b} are repeated', { a: R[0] + 1, b: R[1] + 1 }));
  };
  /** Write the repeats out in the score: bar numbers as in Cubase (one undo step). */
  A.unfoldRepeats = function () {
    if (!TC.score.hasRepeats(S.doc)) return TC.ui.hint(tr('The score has no repeats'));
    if (!confirm(tr('Write the repeats out as bars of their own? The bar numbers will then be those of Cubase. (Undo is possible.)'))) return;
    const n = TC.score.unfold(S.doc);
    TC.selectBar(null);
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('Repeats written out: {n} bars', { n }));
  };
  /** 𝄋 Segno / ⊕ Coda at the start of bar i ('' none); only one bar has each sign. */
  A.setMark = function (v, i = curBar()) {
    v = TC.MARKS.includes(v) ? v : '';
    if (v) S.doc.bars.forEach((b) => { if (b.mark === v) b.mark = ''; });
    S.doc.bars[i].mark = v;
    TC.commit();
  };
  /** Fine / To Coda at the end of bar i ('' none). */
  A.setEnd = function (v, i = curBar()) {
    S.doc.bars[i].end = TC.ENDS.includes(v) ? v : '';
    TC.commit();
  };
  /** D.C. / D.S. … at the end of bar i ('' none). */
  A.setJump = function (v, i = curBar()) {
    const h = S.doc.bars[i];
    h.jump = TC.JUMPS.includes(v) ? v : '';
    if (!h.jump) h.jumpRep = false;
    TC.commit();
    const p = TC.score.jumpProblems(S.doc).filter((x) => x.bar === i);
    if (p.length) TC.ui.hint(A.jumpProblemText(p[0]));
  };
  A.toggleJumpRep = function (i = curBar()) {
    S.doc.bars[i].jumpRep = !S.doc.bars[i].jumpRep;
    TC.commit();
  };
  A.jumpProblemText = (p) => tr({ noSegno: 'D.S.: no 𝄋 Segno in the score yet (bar menu or panel)', noFine: 'al Fine: no bar with Fine yet',
    noToCoda: 'al Coda: no bar with "To Coda" yet', noCoda: 'al Coda: no bar with ⊕ Coda (start of the coda) yet',
    noSegnoSegno: 'D.S.S.: no 𝄋𝄋 Segno Segno in the score yet', noToDoubleCoda: 'al Double Coda: no bar with "To Coda ⊕⊕" yet',
    noDoubleCoda: 'al Double Coda: no bar with ⊕⊕ Double Coda yet' }[p.problem]);
  const JUMP_LABELS = [['', '–'], ['dc', 'D.C. (from the start)'], ['dcFine', 'D.C. al Fine'], ['dcCoda', 'D.C. al Coda'], ['dcDoubleCoda', 'D.C. al Double Coda'],
    ['ds', 'D.S. (from 𝄋)'], ['dsFine', 'D.S. al Fine'], ['dsCoda', 'D.S. al Coda'], ['dsDoubleCoda', 'D.S. al Double Coda'],
    ['dss', 'D.S.S. (from 𝄋𝄋)'], ['dssFine', 'D.S.S. al Fine'], ['dssCoda', 'D.S.S. al Coda'], ['dssDoubleCoda', 'D.S.S. al Double Coda']];
  A.JUMP_LABELS = JUMP_LABELS;

  /** The manual (hilfe.html) in its own tab, at a chapter (anchor). */
  A.openHelp = function (anchor) {
    const url = 'hilfe.html' + (anchor ? '#' + anchor : '');
    const w = window.open(url, 'tactus-help');
    if (!w) location.href = url; // pop-ups blocked: open it here
  };
  /** How jumps work: the chapter of the manual. */
  A.jumpHelp = () => A.openHelp('spruenge');
  const VOLTAS = [['', '–'], ['1', '1.'], ['2', '2.'], ['3', '3.'], ['4', '4.'], ['1,2', '1., 2.'], ['1,2,3', '1., 2., 3.']];
  A.VOLTAS = VOLTAS;
  /** Submenu "Repeat" of bar i. */
  function repeatItems(i) {
    const h = S.doc.bars[i], R = TC.barRange(), vk = (h.volta || []).join(',');
    const items = [
      { label: 'Repeat starts here |:', checked: !!h.repeatStart, action: () => A.toggleRepeatStart(i) },
      { label: 'Repeat ends here :|', submenu: [0, 2, 3, 4, 5, 6].map((n) => ({
        label: n ? tr('{n} times', { n }) : tr('none'), checked: (h.repeatEnd || 0) === n, action: () => A.setRepeatEnd(n, i),
      })) },
      { label: 'Ending (1st / 2nd time bar)', submenu: VOLTAS.map(([v, l]) => ({ label: l, checked: vk === v, action: () => A.setVolta(v, i) })) },
      '-',
      { label: 'Sign at the start', submenu: [['', '–'], ['segno', '𝄋 Segno (D.S. jumps here)'], ['coda', '⊕ Coda (the coda starts here)']]
        .map(([v, l]) => ({ label: l, checked: (h.mark || '') === v, action: () => A.setMark(v, i) })) },
      { label: 'At the end', submenu: [['', '–'], ['fine', 'Fine'], ['toCoda', 'To Coda ⊕']]
        .map(([v, l]) => ({ label: l, checked: (h.end || '') === v, action: () => A.setEnd(v, i) })) },
      { label: 'Jump back at the end', submenu: JUMP_LABELS.map(([v, l]) => ({ label: l, checked: (h.jump || '') === v, action: () => A.setJump(v, i) })) },
      ...(h.jump ? [{ label: 'Play the repeats after the jump', checked: !!h.jumpRep, action: () => A.toggleJumpRep(i) }] : []),
      { label: 'How jumps work…', action: A.jumpHelp },
    ];
    if (R && R[1] > R[0]) {
      items.unshift({ label: tr('Repeat bars {a}–{b}', { a: R[0] + 1, b: R[1] + 1 }), action: () => A.repeatSelection(2) },
        { label: tr('𝄋 Segno on bar {a}', { a: R[0] + 1 }), action: () => A.setMark('segno', R[0]) },
        { label: tr('D.S. al Coda after bar {b}', { b: R[1] + 1 }), action: () => A.setJump('dsCoda', R[1]) }, '-');
    }
    items.push('-', { label: 'Write the repeats out (bar numbers as in Cubase)…', action: A.unfoldRepeats, disabled: !TC.score.hasRepeats(S.doc) });
    return items;
  }

  /** Select the bars from the selected one (or `from`) up to bar i (e.g. to play / loop them). */
  A.selectBarsTo = function (i, from) {
    i = Number(i);
    if (!S.doc.bars[i]) return;
    if (from !== undefined && from !== null) TC.selectBar(from);
    if (S.selBar === null) TC.selectBar(i);
    else TC.selectBar(i, true);
    S.selection.clear();
    TC.refresh();
    const [a, b] = TC.barRange();
    TC.ui.hint(a === b ? tr('Bar {n} selected', { n: a + 1 }) : tr('Bars {a}–{b} selected', { a: a + 1, b: b + 1 }));
  };

  /** Bar menu → Chord: the scale-degree chords for the start of bar i, typing one, removing. */
  function chordItems(i) {
    const P = TC.pitch, sc = TC.score.harmonyScale(S.doc, i), sev = !!S.settings.chordSev;
    const cur = (S.doc.bars[i].chords || []).find((c) => c.t === 0);
    const items = P.degreeChords(sc, sev).map((c) => ({
      label: `${P.chordName(c, de())}   ${c.roman}`, checked: !!(cur && cur.deg === c.deg && !!cur.sev === sev),
      action: () => A.setChordDeg(c.deg, i, 0),
    }));
    return items.concat(['-', { label: 'Type a chord…', action: () => A.editChord(i, 0) },
      { label: 'Seventh chords', checked: sev, action: A.toggleChordSev },
      { label: 'Remove the chords of this bar', action: () => A.clearBarChords(i), disabled: !S.doc.bars[i].chords }]);
  }

  /** Right-click / long press on bar i; before: the bar selected until then (offers "bars before … to i"). */
  A.barMenu = function (i, x, y, before) {
    const h = S.doc.bars[i];
    const R = TC.barRange();
    const multi = R && R[1] > R[0];
    // copy / duplicate / clear / delete work on all selected bars when the menu is opened on one of them
    const [ra, rb] = rangeAt(i), many = rb > ra, ab = { a: ra + 1, b: rb + 1 };
    const clipN = S.clipboard ? (S.clipboard.bars ? S.clipboard.bars.length : 1) : 0;
    const extend = before !== undefined && before !== null && before !== i && !(multi && i >= R[0] && i <= R[1])
      ? { label: tr('Select bars {a}–{b}', { a: Math.min(before, i) + 1, b: Math.max(before, i) + 1 }), action: () => A.selectBarsTo(i, before) }
      : null;
    const play = multi && i >= R[0] && i <= R[1]
      ? { label: tr('Play bars {a}–{b}', { a: R[0] + 1, b: R[1] + 1 }), action: () => TC.player.play(), shortcut: tr('Space') }
      : { label: 'Play from here', action: () => TC.player.play(i), shortcut: tr('Space') };
    const sigs = (mode) => TC.TIME_SIGS.map((ts) => ({
      label: ts.join('/'), checked: h.ts.join('/') === ts.join('/'), action: () => A.setTimeSig(ts.join('/'), i, mode),
    })).concat(['-', { label: 'Other…', action: () => A.customTimeSig(i, mode) }]);
    const groups = TC.beamChoices(h.ts);
    const cur = (TC.beamGroups(h.ts, h.beam) || []).join('+');
    const beamItems = groups.map((g, k) => ({
      label: g.join('+') + (k === 0 ? ' ' + tr('(default)') : ''), checked: g.join('+') === cur,
      action: () => A.setBeam(k === 0 ? 'default' : g.join('+'), i),
    }));
    TC.menu.open([
      { label: 'Time signature from here', submenu: sigs('from') },
      { label: 'Time signature of this bar only', submenu: sigs('only') },
      { label: 'Time signature of this bar, the notes after it move along', submenu: sigs('shift') },
      beamItems.length ? { label: 'Beam groups', submenu: beamItems } : null,
      { label: 'Repeat & jump', submenu: repeatItems(i) },
      '-',
      extend,
      play,
      '-',
      { label: many ? tr('Copy bars {a}–{b}', ab) : 'Copy bar', action: () => A.copyBar(i), shortcut: 'Ctrl+C' },
      { label: clipN > 1 ? tr('Paste {n} bars from here', { n: clipN }) : 'Paste into this bar', action: () => A.pasteBar(i), shortcut: 'Ctrl+V', disabled: !S.clipboard },
      { label: many ? tr('Duplicate bars {a}–{b}', ab) : 'Duplicate bar', action: () => A.duplicateBar(i), shortcut: 'Ctrl+D' },
      TC.curTrack().bars[i].simile ? { label: 'Show the notes instead of %', action: () => A.simileToNotes(i) }
        : { label: 'Repeat the bar before (%)', action: () => A.toggleSimile(i), disabled: i === 0 },
      TC.score.repeatAround(S.doc, i) ? { label: tr('Write this repeat out (bars {a}–{b}, {n}×)', (() => { const r = TC.score.repeatAround(S.doc, i); return { a: r.from + 1, b: r.to + 1, n: r.times }; })()), action: () => A.unfoldSection(i) } : null,
      '-',
      { label: TC.tr('Tempo from here…') + (i > 0 && h.tempo ? ` (${h.tempo})` : ''), action: () => A.editBarTempo(i) },
      { label: 'Text above the bar…', action: () => A.editMarker(i) },
      { label: 'Chord', submenu: chordItems(i) },
      { label: 'Line break after this bar', checked: !!(S.doc.bars[i + 1] && S.doc.bars[i + 1].lineBreak), action: () => A.toggleBreakAfter(i), disabled: i === S.doc.bars.length - 1 },
      { label: 'New line from this bar', checked: !!h.lineBreak, action: () => A.toggleLineBreak(i), disabled: i === 0 },
      '-',
      { label: 'Insert bar before', action: () => A.insertBarBefore(i) },
      { label: 'Insert bar after', action: () => A.insertBarAfter(i) },
      { label: many ? tr('Clear bars {a}–{b}', ab) : 'Clear bar', action: () => A.clearBar(i) },
      { label: many ? tr('Delete bars {a}–{b}', ab) : 'Delete bar', action: () => A.deleteBar(i), disabled: S.doc.bars.length < 2 },
    ].filter(Boolean), x, y);
  };
})(window.TC);
