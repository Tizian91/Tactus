'use strict';
/*
 * Playback through a MIDI output (Web MIDI, Chrome / Edge): the notes go to Cubase or any other
 * program and are played there by the real drum VST - e.g. over a virtual MIDI cable (loopMIDI on
 * Windows, IAC driver on a Mac) into a Cubase track with Groove Agent / EZDrummer / UJAM.
 *
 * The keys come from the kit profile of the score (js/kits.js, as in the MIDI export; without one:
 * General MIDI on channel 10). Strokes are handed over with their exact time, so they keep the
 * timing of the playback; the cursor and the metronome stay in Tactus.
 *
 *   settings.midiOut       name of the output ('' = Tactus' own sounds)
 *   settings.midiOutSynth  play Tactus' own sounds as well
 */
(function (TC) {
  const MO = (TC.midiOut = {});
  const S = TC.state;
  const NOTE_MS = 60; // note length: drum VSTs only need the start
  let access = null, asking = null;
  const used = new Set(); // channels notes went to (for "all notes off")

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

  /** Names of the MIDI outputs (empty until MO.init has been answered). */
  MO.outputs = () => (access ? [...access.outputs.values()].map((o) => o.name) : []);
  const port = () => (access && S.settings.midiOut ? [...access.outputs.values()].find((o) => o.name === S.settings.midiOut) : null);

  /** Playback goes to a MIDI output (chosen and connected). */
  MO.active = () => !!port();
  /** The chosen output is not there (not connected, or MIDI not allowed yet). */
  MO.missing = () => !!S.settings.midiOut && !port();

  /** Key and channel of an instrument for the score's kit profile (General MIDI without one). */
  function key(art) {
    const a = TC.drums.byId(art);
    if (!a) return null;
    const p = TC.kits && TC.kits.current(S.doc);
    return TC.midi.keyFor(a, p, { replaced: new Map(), missing: new Set() });
  }

  /**
   * A stroke at audio time `when` (seconds on the audio clock of `ctx`), velocity 0 … 1.2.
   * The browser sends it at the matching moment of its own clock.
   */
  /** Lead in seconds: the receiving program's own delay (audio buffer), set in the panel (0 … 500 ms). */
  MO.lead = () => TC.clamp(Number(S.settings.midiLead) || 0, 0, 500) / 1000;

  MO.hit = function (art, when, vel, ctx) {
    const o = port(), k = key(art);
    if (!o || !k) return;
    // in time with Tactus' own sound (metronome, cursor): its output delay, minus the lead that
    // makes up for the delay of the drum VST
    const lat = ctx ? TC.audio.outputDelay() : 0;
    const at = performance.now() + Math.max(0, (ctx ? when - ctx.currentTime : 0) + lat - MO.lead()) * 1000;
    const v = Math.max(1, Math.min(127, Math.round(vel * 127)));
    try {
      o.send([0x90 | k.ch, k.note, v], at);
      o.send([0x80 | k.ch, k.note, 0], at + NOTE_MS);
      used.add(k.ch);
    } catch (e) {
      /* the port went away */
    }
  };

  /** One key right now (kit profile dialog: ▶ to hear which sound a key is). */
  MO.sendKey = function (note, ch = 9, vel = 100) {
    const o = port();
    if (!o) return false;
    try {
      o.send([0x90 | ch, note, vel]);
      o.send([0x80 | ch, note, 0], performance.now() + NOTE_MS);
      used.add(ch);
      return true;
    } catch (e) {
      return false;
    }
  };

  /** Stop: forget what was handed over for later, and silence the channels used. */
  MO.stop = function () {
    const o = port();
    if (!o) return;
    try {
      if (o.clear) o.clear();
      for (const ch of used) o.send([0xb0 | ch, 123, 0]); // all notes off
    } catch (e) {
      /* ignore */
    }
  };

})(window.TC);
