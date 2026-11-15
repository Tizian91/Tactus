'use strict';
// Melody in two voices: a held tone (voice 2) under a moving melody (voice 1) - both are played and exported, a note
// in voice 1 does not cut the held tone, notes move into the other voice, MusicXML writes <voice>2</voice> with stems down.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js']);
  const SC = TC.score;
  const doc = TC.emptyScore(1);
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const mel = SC.addTrack(doc, 'Piano', null, 'pitched');
  const put = (vi, tick, dur, pitch) => SC.place(doc, mel, 0, vi, tick, dur, TC.newPitchNote(pitch, null, {}));
  const held = put(1, 0, 3840, 60); // C4 whole note, voice 2
  [64, 65, 67, 69].forEach((p, k) => put(0, k * 960, 960, p)); // E F G A quarters, voice 1
  T.eq('the held tone stays whole', held.ev.dur, 3840);
  const tones = TC.timeline.build(doc, {}).hits.filter((h) => h.pitch !== undefined).map((h) => [h.pitch, Math.round(h.dur * 10) / 10]);
  T.eq('played: the held C for the whole bar, the melody in quarters', tones.sort((a, b) => a[0] - b[0]), [[60, 2], [64, 0.5], [65, 0.5], [67, 0.5], [69, 0.5]]);
  const xml = TC.musicxml.build(doc);
  T.eq('MusicXML: voice 2 with stems down', /<voice>2<\/voice>[\s\S]*?<stem>down<\/stem>/.test(xml), true);
  // a note into the other voice
  const e = mel.bars[0].voices[0][1];
  T.eq('F into voice 2', SC.toVoice(doc, [e.notes[0].id], 1), 1);
  T.eq('… voice 1 without it, voice 2 has it at its own place', [mel.bars[0].voices[0].map((x) => x.notes[0].pitch), mel.bars[0].voices[1].map((x) => x.tick + ':' + x.notes[0].pitch)],
    [[64, 67, 69], ['0:60', '960:65']]);
  T.eq('… the held C ends where the F starts (one voice: one rhythm)', mel.bars[0].voices[1][0].dur, 960);
  T.eq('drum notes do not move', SC.toVoice(doc, ['nope'], 0), 0);
};
