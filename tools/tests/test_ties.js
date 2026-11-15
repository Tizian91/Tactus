'use strict';
// Melody ties: a note longer than its bar goes on as tied notes (also over several bars), it stops at the next
// note, the chain (tieChain / tiedOn), a tie only counts where it fits, playback and MIDI do not strike a tied
// note again (but do after a repeat jumps back to another tone), MusicXML ties over the bar line, saving.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js']);
  const SC = TC.score;
  const doc = TC.emptyScore(4);
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const mel = SC.addTrack(doc, 'Vocals', null, 'pitched');
  const evs = (bi) => mel.bars[bi].voices[0].map((e) => [e.tick, e.dur, e.notes.map((n) => n.pitch + (n.tie ? '~' : '')).join('+')]);
  const put = (bi, tick, dur, pitch) => SC.place(doc, mel, bi, 0, tick, dur, TC.newPitchNote(pitch, null, {}));

  // a G4 on beat 3 of bar 1, 2½ bars long: half in bar 1, whole bar 2, half in bar 3
  const g = put(0, 1920, 1920, 67);
  T.eq('length over two bar lines', SC.setMelodyLength(doc, mel, 0, 0, g.ev, 1920 + 3840 + 1920), 7680);
  T.eq('… bar 1: G half', evs(0), [[1920, 1920, '67']]);
  T.eq('… bar 2: G whole, tied', evs(1), [[0, 3840, '67~']]);
  T.eq('… bar 3: G half, tied', evs(2), [[0, 1920, '67~']]);
  const chain = SC.tieChain(doc, g.note.id);
  T.eq('the chain from any of its notes', [chain.length, SC.tieChain(doc, mel.bars[2].voices[0][0].notes[0].id).map((c) => c.bar), SC.chainTicks(chain)], [3, [0, 1, 2], 7680]);
  T.eq('tiedOn: only what comes after it', SC.tiedOn(doc, [mel.bars[1].voices[0][0].notes[0].id]), [mel.bars[2].voices[0][0].notes[0].id]);

  // shorter again: the old tied notes go
  SC.setMelodyLength(doc, mel, 0, 0, g.ev, 1920 + 960);
  T.eq('shortened: half + a tied quarter, bar 3 empty', [evs(0), evs(1), evs(2)], [[[1920, 1920, '67']], [[0, 960, '67~']], []]);

  // it stops at the next note: an E4 on beat 2 of bar 2
  put(1, 1920, 960, 64);
  SC.removeNotes(doc, SC.tiedOn(doc, [g.note.id])); // (as when it is dragged: its own tied notes do not stop it)
  T.eq('room up to the next note (over the bar line)', SC.melodyRoom(doc, mel, 0, 0, 1920), 1920 + 1920);
  SC.setMelodyLength(doc, mel, 0, 0, g.ev, 7680);
  T.eq('longer than there is room: stops at the E', [evs(0), evs(1)], [[[1920, 1920, '67']], [[0, 1920, '67~'], [1920, 960, '64']]]);
  T.eq('a note at the start of the next bar: no room over the bar line', (() => { put(3, 0, 960, 60); return SC.melodyRoom(doc, mel, 2, 0, 0); })(), 3840);

  // a tie only counts where it fits: the G moved away -> the tied quarter is a plain note
  const gTied = mel.bars[1].voices[0][0].notes[0];
  T.ok('tied from the G', SC.tiedFrom(doc, mel, 1, 0, mel.bars[1].voices[0][0], gTied));
  g.note.pitch = 65;
  T.eq('the note before is another pitch: not tied', SC.tiedFrom(doc, mel, 1, 0, mel.bars[1].voices[0][0], gTied), null);
  g.note.pitch = 67;
  mel.bars[1].simile = true;
  T.eq('no tie into a %-bar', SC.tiedTo(doc, mel, 0, 0, g.ev, g.note), null);
  mel.bars[1].simile = false;

  // a tie by hand (note menu): the next note of the same pitch, also inside a bar
  const a1 = put(3, 960, 960, 69), a2 = put(3, 1920, 960, 69);
  const nx = SC.nextNote(doc, mel, 3, 0, a1.ev, a1.note);
  T.eq('next note of the same pitch: found, not tied yet', [!!nx && nx.note.id === a2.note.id, SC.tiedTo(doc, mel, 3, 0, a1.ev, a1.note)], [true, null]);
  nx.note.tie = true;
  T.eq('tied inside the bar', SC.tieChain(doc, a1.note.id).length, 2);

  // playback: G over the bar line is one tone of 2 s (two halves at 120 BPM); the tied As one of 1 s
  const tl = TC.timeline.build(doc, {});
  const tones = tl.hits.filter((h) => h.pitch !== undefined).map((h) => [Math.round((h.t - tl.start) * 100) / 100, h.pitch, Math.round(h.dur * 100) / 100]);
  T.eq('playback: tied notes are not struck again', tones, [[1, 67, 1.98], [3, 64, 0.48], [6, 60, 0.48], [6.5, 69, 0.98]]);
  // MIDI: one note on, the note off at the end of the chain
  const f = TC.midi.read(TC.midi.build(doc, null, { tracks: [mel] }).bytes);
  T.eq('MIDI: G once, 3840 ticks (two halves, minus the gap)', f.notes.filter((n) => n.note === 67).map((n) => [n.t, n.dur]), [[1920, 3830]]);
  T.eq('MIDI: the tied As as one note', f.notes.filter((n) => n.note === 69).map((n) => [n.t, n.dur]), [[3840 * 3 + 960, 1910]]);

  // a repeat that jumps back: bar 2 starts with the tied G, but after bar 3 (repeated) there is no G before it
  const d2 = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  d2.bars[1].repeatStart = true;
  d2.bars[2].repeatEnd = 2;
  d2.tracks[1].bars[2].voices[0] = [{ id: 'x', tick: 0, dur: 3840, notes: [TC.newPitchNote(62, null, {})] }];
  const t2 = TC.timeline.build(d2, {}).hits.filter((h) => h.pitch === 67).length;
  T.eq('after a repeat jumps back to another tone: the tied G is struck again', t2, 2);

  // MusicXML: tie start in bar 1, stop in bar 2; no sign again on the tied note
  mel.scale = { l: 0, a: 0, id: 'major' };
  g.note.pitch = 66; // F♯ (a sign in C major)
  g.note.dia = 31;
  gTied.pitch = 66;
  gTied.dia = 31;
  const xml0 = TC.musicxml.build(doc), xml = xml0.slice(xml0.indexOf('<part id="P2">'));
  const m1 = xml.slice(xml.indexOf('<measure number="1">'), xml.indexOf('<measure number="2">'));
  const m2 = xml.slice(xml.indexOf('<measure number="2">'), xml.indexOf('<measure number="3">'));
  T.ok('MusicXML bar 1: F♯ with its sign, tie start', m1.includes('<accidental>sharp</accidental>') && m1.includes('<tie type="start"/>') && m1.includes('<tied type="start"/>'));
  T.ok('MusicXML bar 2: the tied F♯ - tie stop, no sign', m2.includes('<tie type="stop"/>') && m2.includes('<tied type="stop"/>') && !m2.includes('<accidental>'));

  // moving: a tied note moved together with the note before it stays tied; moved alone it loses the tie
  const d3 = TC.emptyScore(3);
  const m3 = SC.addTrack(d3, 'M', null, 'pitched');
  const c1 = SC.place(d3, m3, 0, 0, 1920, 1920, TC.newPitchNote(62, null, {}));
  SC.setMelodyLength(d3, m3, 0, 0, c1.ev, 3840); // D: half + tied half
  const ids3 = SC.tieChain(d3, c1.note.id).map((c) => c.note.id);
  T.ok('move the chain up a step (pitch only): still tied', SC.moveNotes(d3, ids3, 0, null, () => ({ pitch: 64, dia: 30 })) && SC.tieChain(d3, ids3[0]).length === 2);
  SC.moveNotes(d3, ids3, -960, null);
  T.eq('moved together a quarter earlier: both parts in bar 1', [m3.bars[0].voices[0].map((e) => e.tick + (e.notes[0].tie ? '~' : '')), m3.bars[1].voices[0].length], [['960', '2880~'], 0]);
  T.eq('… (bar 1 then holds both parts, the tie stays inside the bar)', SC.tieChain(d3, ids3[0]).length, 2);
  SC.moveNotes(d3, [ids3[1]], 480, null);
  T.eq('the tied note moved alone: no tie', SC.tieChain(d3, ids3[0]).length, 1);

  // saving: the tie flag stays (melody), drums never get one
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded: tied notes', back.tracks[1].bars[1].voices[0][0].notes[0].tie, true);
  const drums = TC.normalizeDoc({ bars: [{}], tracks: [{ kind: 'drums', bars: [{ voices: [[{ tick: 0, dur: 960, notes: [{ art: 38, tie: true }] }]] }] }] });
  T.eq('drum notes: no tie', drums.tracks[0].bars[0].voices[0][0].notes[0].tie, undefined);
};
