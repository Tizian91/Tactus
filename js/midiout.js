'use strict';
/*
 * Playback through a MIDI output (Web MIDI, Chrome / Edge): the notes go to Cubase or any other
 * program and are played there by the real drum VST - e.g. over a virtual MIDI cable (loopMIDI on
 * Windows, IAC driver on a Mac) into a Cubase track with Groove Agent / EZDrummer / UJAM.
 *
 * The keys come from the kit profile of each track (js/kits.js K.ofTrack: its own or the score's, as in
 * the MIDI export; without one: General MIDI on channel 10). Strokes are handed over with their exact
 * time, so they keep the timing of the playback; the cursor and the metronome stay in Tactus.
 *
 * Every track has its own output - one VST plays one instrument (drums, piano …):
 *   track.midiOut          the track's MIDI output ('' = Tactus' own sounds; not connected: Tactus' sounds too)
 *   track.midiCh           its channel 0 … 15 (null: drums the channel of the kit profile, melody track.channel)
 *   settings.midiOff       MIDI off for a moment: everything with Tactus' sounds (toolbar switch)
 *   settings.midiOutSynth  play Tactus' own sounds as well
 *   settings.midiOut       (before 2026-11-16: one output for all tracks - given to the tracks once, js/main.js)
 */
(function (TC) {
  const MO = (TC.midiOut = {});
  const S = TC.state;
  const NOTE_MS = 60; // note length: drum VSTs only need the start
  let access = null, asking = null;
  const used = new Map(); // output -> channels notes went to (for "all notes off")

  MO.supported = () => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;

  /** Asks the browser for MIDI (once; Chrome asks the user the first time). Resolves to true / false. */
  MO.init = function () {
    if (access) return Promise.resolve(true);
    if (!MO.supported()) return Promise.resolve(false);
    if (!asking) {
      asking = navigator.requestMIDIAccess({ sysex: false }).then((a) => {
        access = a;
        a.onstatechange = () => TC.refresh && TC.refresh();
        return true;
      }).catch(() => {
        asking = null;
        return false;
      });
    }
    return asking;
  };

  /**
   * An output that does not take notes (the browser could not open it - e.g. a loopMIDI port made while the
   * browser was running): said once, instead of staying silent. Opened on first use, so the error shows.
   */
  const opened = new Set(), failed = new Set();
  function fail(o, e) {
    if (failed.has(o.name)) return;
    failed.add(o.name);
    if (TC.ui) TC.ui.hint(TC.tr('The MIDI output "{name}" takes no notes ({err}). Close the browser completely (all windows) and open it again - a new loopMIDI port is only seen then.', { name: o.name, err: (e && (e.name || e.message)) || '?' }));
  }
  function ready(o) {
    if (opened.has(o)) return;
    opened.add(o);
    if (o.open) Promise.resolve().then(() => o.open()).then(() => failed.delete(o.name)).catch((e) => fail(o, e));
  }
  /** Send to an output; a failure is said (once per output). */
  function send(o, msg, at) {
    ready(o);
    try {
      o.send(msg, at);
      return true;
    } catch (e) {
      fail(o, e);
      return false;
    }
  }
  /** Outputs that did not take notes (names). */
  MO.failed = () => [...failed];

  /** Names of the MIDI outputs (empty until MO.init has been answered). */
  MO.outputs = () => (access ? [...access.outputs.values()].map((o) => o.name) : []);
  // (a name listed twice - an old port gone, a new one of the same name: the connected one)
  const byName = (name) => {
    if (!access || !name) return null;
    const all = [...access.outputs.values()].filter((o) => o.name === name);
    return all.find((o) => o.state !== 'disconnected') || all[0] || null;
  };
  /** The output of a track (connected, MIDI not switched off), or null: Tactus' sounds. */
  const portOf = (track) => (!S.settings.midiOff && track && track.midiOut && byName(track.midiOut)) || null;
  /** A track's own output is chosen but not connected. */
  MO.trackMissing = (track) => !!(track && track.midiOut && access && !byName(track.midiOut));

  /** Is a MIDI output of this name connected? */
  MO.connected = (name) => !!byName(name);

  /** Does this track play through MIDI (its output connected, MIDI not switched off)? */
  MO.trackActive = (track) => !!portOf(track);
  /** Does anything play through MIDI (then the lead applies)? */
  MO.anyActive = (doc) => !!(doc && doc.tracks.some((t) => portOf(t)));
  /** Does any track of the score play through MIDI now? */
  MO.active = () => MO.anyActive(S.doc);
  /** Has any track a MIDI output chosen (connected or not, switched off or not)? */
  MO.chosen = (doc = S.doc) => doc.tracks.some((t) => !!t.midiOut);
  /** Where a track plays: its output's name, or '' (Tactus' sounds). */
  MO.outputOf = (track) => { const o = portOf(track); return o ? o.name : ''; };
  /** A track's output is chosen but not there (not connected, or MIDI not allowed yet). */
  MO.missing = () => !S.settings.midiOff && S.doc.tracks.some((t) => t.midiOut && !byName(t.midiOut));

  /**
   * A melody track's fader (track.volume, 100 = as before): the channel volume CC 7, sent once per output and channel
   * (a synth keeps its sound). Drum tracks: the strength instead (MO.hit) - drum VSTs mostly ignore CC 7.
   */
  const volSent = new Map();
  function volume(o, ch, track, at) {
    const vol = track && Number.isInteger(track.volume) ? TC.clamp(track.volume, 0, 127) : 100, k = o.name + ':' + ch;
    if (volSent.get(k) === vol) return;
    if (send(o, [0xb0 | ch, 7, vol], at)) volSent.set(k, vol);
  }

  /** Key and channel of an instrument for the kit profile of a track (General MIDI without one). */
  function key(art, track) {
    const a = TC.drums.byId(art);
    if (!a) return null;
    const p = TC.kits && (track ? TC.kits.ofTrack(S.doc, track) : TC.kits.current(S.doc));
    const k = TC.midi.keyFor(a, p, { replaced: new Map(), missing: new Set() });
    if (k && track && Number.isInteger(track.midiCh)) return { note: k.note, ch: track.midiCh }; // the track's own channel
    return k;
  }
  const remember = (o, ch) => {
    if (!used.has(o)) used.set(o, new Set());
    used.get(o).add(ch);
  };

  /**
   * A stroke at audio time `when` (seconds on the audio clock of `ctx`), velocity 0 … 1.2.
   * The browser sends it at the matching moment of its own clock.
   */
  /** Lead in seconds: the receiving program's own delay (audio buffer), set in the panel (0 … 500 ms). */
  MO.lead = () => TC.clamp(Number(S.settings.midiLead) || 0, 0, 500) / 1000;

  MO.hit = function (art, when, vel, ctx, track) {
    const o = portOf(track), k = key(art, track);
    if (!o || !k) return;
    // in time with Tactus' own sound (metronome, cursor): its output delay, minus the lead that
    // makes up for the delay of the drum VST
    const lat = ctx ? TC.audio.outputDelay() : 0;
    const at = performance.now() + Math.max(0, (ctx ? when - ctx.currentTime : 0) + lat - MO.lead()) * 1000;
    // (a drum track's fader: the strength - drum VSTs mostly ignore the channel volume CC 7, e.g. EZDrummer)
    const v = Math.max(1, Math.min(127, Math.round(vel * TC.audio.trackGain(track) * 127)));
    if (send(o, [0x90 | k.ch, k.note, v], at)) {
      send(o, [0x80 | k.ch, k.note, 0], at + NOTE_MS);
      remember(o, k.ch);
    }
  };

  /**
   * A melody tone (MIDI note `pitch`) at audio time `when`, `dur` seconds long, on the channel of its
   * track (its own MIDI channel, else track.channel); the track's program is sent once per output.
   */
  const programSent = new Map(); // output -> Map channel -> program
  MO.note = function (pitch, when, dur, vel, ctx, track, raw) {
    const o = portOf(track);
    if (!o) return;
    // a VST that plays its notes shifted (keyswitch profile, e.g. Iron: a guitar an octave up) - not its keyswitches (raw)
    if (!raw && track && track.ksw && track.ksw.noteShift) pitch = Math.max(0, Math.min(127, pitch + track.ksw.noteShift));
    const ch = track && Number.isInteger(track.midiCh) ? track.midiCh : track ? track.channel || 0 : 0;
    const lat = ctx ? TC.audio.outputDelay() : 0;
    const at = performance.now() + Math.max(0, (ctx ? when - ctx.currentTime : 0) + lat - MO.lead()) * 1000;
    const v = Math.max(1, Math.min(127, Math.round(vel * 127)));
    if (!programSent.has(o)) programSent.set(o, new Map());
    const prog = track ? track.program || 0 : 0;
    if (programSent.get(o).get(ch) !== prog) {
      if (!send(o, [0xc0 | ch, prog], at)) return;
      programSent.get(o).set(ch, prog);
    }
    volume(o, ch, track, at);
    if (send(o, [0x90 | ch, pitch, v], at)) {
      send(o, [0x80 | ch, pitch, 0], at + Math.max(30, dur * 1000 - 5));
      remember(o, ch);
    }
  };

  /**
   * Test of a track's output (▶ at "Plays on"): one note right now - drums the snare (key of its kit profile),
   * a melody middle C on its channel. Returns what the browser says about the port: { name, state, connection } or null.
   */
  MO.test = function (track) {
    const o = track && track.midiOut ? byName(track.midiOut) : null;
    if (!o) return null;
    let note = 60, ch = Number.isInteger(track.midiCh) ? track.midiCh : track.channel || 0;
    if (track.kind === 'drums') {
      const k = key(38, track);
      if (k) ({ note, ch } = k);
    }
    const ok = send(o, [0x90 | ch, note, 100]) && send(o, [0x80 | ch, note, 0], performance.now() + 300);
    remember(o, ch);
    return { name: o.name, state: o.state || '?', connection: o.connection || '?', ok, note, ch: ch + 1 };
  };

  /** One key right now (kit profile dialog: ▶ to hear which sound a key is). */
  MO.sendKey = function (note, ch = 9, vel = 100) {
    // (the output of the track being written, else of the first drum track that has one)
    const cur = TC.curTrack && TC.curTrack();
    const o = portOf(cur && cur.kind === 'drums' ? cur : null) || portOf(S.doc.tracks.find((t) => t.kind === 'drums' && portOf(t)));
    if (!o) return false;
    try {
      o.send([0x90 | ch, note, vel]);
      o.send([0x80 | ch, note, 0], performance.now() + NOTE_MS);
      remember(o, ch);
      return true;
    } catch (e) {
      return false;
    }
  };

  /** Stop: forget what was handed over for later, and silence the channels used. */
  MO.stop = function () {
    programSent.clear();
    volSent.clear();
    for (const [o, chs] of used) {
      try {
        if (o.clear) o.clear();
        for (const ch of chs) o.send([0xb0 | ch, 123, 0]); // all notes off
      } catch (e) {
        /* ignore */
      }
    }
  };

})(window.TC);
