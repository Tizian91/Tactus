'use strict';
// Chords as notes (js/accomp.js): guitar grips (known open chords, bass on the lowest string, slash chords, at most
// four frets, near the grip before), piano voicings (bass clef / treble), the patterns written into bars (strokes,
// bass + chord, waltz, broken, Alberti, a chord changing inside the bar), the voice's notes replaced, strokes kept
// when saved, played spread (down: low → high), MIDI and MusicXML (<down-bow/>).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js', 'accomp.js']);
  const SC = TC.score, P = TC.pitch, AC = TC.accomp;
  const ch = (s) => P.parseChord(s, false);
  const grip = (s) => AC.guitarGrip(ch(s)).pitches.join(' ');

  // ---- guitar grips
  T.eq('open C: x32010', grip('C'), '48 52 55 60 64');
  T.eq('open G: 320003', grip('G'), '43 47 50 55 59 67');
  T.eq('open D: xx0232', grip('D'), '50 57 62 66');
  T.eq('open Am: x02210', grip('Am'), '45 52 57 60 64');
  T.eq('E7: 020100', grip('E7'), '40 47 50 56 59 64');
  T.eq('C/E: E in the bass', grip('C/E').split(' ')[0], '40');
  const fs = AC.guitarGrip(ch('F#m')), frets = fs.pitches.map((p) => p).length;
  T.eq('F#m: every tone, F# the lowest, six strings', [fs.pitches[0] % 12, new Set(fs.pitches.map((p) => p % 12)).size, frets], [6, 3, 6]);
  T.eq('no tone twice on two strings where a better grip exists (Bm, Dsus4)', [grip('Bm').split(' ').length === new Set(grip('Bm').split(' ')).size, grip('Dsus4')], [true, '50 57 62 67']);

  // ---- piano voicings
  T.eq('piano, bass clef: C2 + C3 E3 G3', AC.voicing(ch('C'), 'piano', { clef: 'bass' }), { bass: 36, tones: [48, 52, 55] });
  T.eq('piano, treble clef: an octave higher', AC.voicing(ch('Am'), 'piano', { clef: 'treble' }), { bass: 57, tones: [60, 64, 69] });

  // ---- written into bars
  const doc = TC.emptyScore(3);
  TC.state.doc = doc;
  const gt = SC.addTrack(doc, 'Gitarre', null, 'pitched');
  gt.program = 25;
  gt.clef = 'treble8';
  SC.setChord(doc, 0, 0, { name: 'C' });
  SC.setChord(doc, 1, 0, { name: 'G' });
  SC.setChord(doc, 1, 1920, { name: 'Am' });
  T.eq('default pattern: a guitar strums ↓ ↓↑ ↑↓↑', AC.defaultFor(gt), 'gDDU');
  SC.place(doc, gt, 0, 0, 0, 3840, TC.newPitchNote(60, null, {}));
  T.eq('notes there (to be replaced)', AC.notesIn(gt, 0, 1), 1);
  const n = AC.write(doc, gt, 0, 1, 'gDDU', 0);
  const ev0 = gt.bars[0].voices[0];
  T.eq('↓ ↓↑ ↑↓↑: six strokes a bar, at 1, 2, 2+, 3+, 4, 4+', ev0.map((e) => e.tick), [0, 960, 1440, 2400, 2880, 3360]);
  T.eq('… their directions', ev0.map((e) => e.notes[0].stroke).join(''), 'dduudu');
  T.eq('… the C grip, the old note gone', [ev0[0].notes.map((x) => x.pitch).sort((a, b) => a - b).join(' '), ev0.every((e) => !e.notes.some((x) => x.pitch === 60 && e.notes.length === 1))], ['48 52 55 60 64', true]);
  T.eq('bar 2: G, then Am - struck on the 3 where it changes (the pattern has no stroke there)', [gt.bars[1].voices[0][0].notes.length, (gt.bars[1].voices[0].find((e) => e.tick === 1920) || { notes: [{}] }).notes[0].stroke, gt.bars[1].voices[0].filter((e) => e.tick >= 1920).every((e) => e.notes.some((x) => x.pitch === 45))], [6, 'd', true]);
  T.eq('notes written', n, ev0.reduce((s, e) => s + e.notes.length, 0) + gt.bars[1].voices[0].reduce((s, e) => s + e.notes.length, 0));
  T.eq('G♯ of an E7 spelled as G♯ (its letter)', (() => {
    const d = TC.emptyScore(1), t = SC.addTrack(d, 'P', null, 'pitched');
    SC.setChord(d, 0, 0, { name: 'E7' });
    AC.write(d, t, 0, 0, 'pBlock', 0);
    const gs = t.bars[0].voices[0][0].notes.find((x) => x.pitch % 12 === 8);
    return P.noteSpell(gs, t.scale).dia % 7;
  })(), 4);

  // ---- piano patterns
  const pd = TC.emptyScore(2);
  pd.bars[1].ts = [3, 4];
  const lh = SC.addTrack(pd, 'Klavier', null, 'pitched');
  lh.clef = 'bass';
  SC.setChord(pd, 0, 0, { name: 'C' });
  AC.write(pd, lh, 0, 1, 'pBassChord', 0);
  const shape = (bi) => lh.bars[bi].voices[0].map((e) => (e.notes.length === 1 && e.notes[0].pitch === 36 ? 'B' : 'C')).join('');
  T.eq('bass + chord: 4/4 B C B C, 3/4 (a waltz) B C C - the chord goes on in bar 2', [shape(0), shape(1)], ['BCBC', 'BCC']);
  AC.write(pd, lh, 0, 0, 'pAlberti', 0);
  T.eq('Alberti: C G E G in eighths', lh.bars[0].voices[0].slice(0, 4).map((e) => e.notes[0].pitch), [48, 55, 52, 55]);
  AC.write(pd, lh, 0, 0, 'pBroken', 0);
  T.eq('broken: bass, then the tones up and down', lh.bars[0].voices[0].map((e) => e.notes[0].pitch), [36, 48, 52, 55, 52, 48, 52, 55]);
  AC.write(pd, lh, 0, 0, 'pBlock', 0);
  T.eq('held: one chord, the whole bar', lh.bars[0].voices[0].map((e) => [e.tick, e.dur, e.notes.length]), [[0, 3840, 4]]);

  // ---- kept, played spread, exported
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded: the strokes kept', back.tracks[1].bars[0].voices[0].map((e) => e.notes[0].stroke).join(''), 'dduudu');
  const hits = TC.timeline.build(doc).hits.filter((h) => h.trk === gt && h.t < TC.timeline.LEAD + 0.1);
  const order = hits.slice().sort((a, b) => a.t - b.t).map((h) => h.pitch);
  T.eq('played: a down stroke from the lowest string up, a little apart', [order.join(' '), Math.round((hits.reduce((m, h) => Math.max(m, h.t), 0) - hits.reduce((m, h) => Math.min(m, h.t), 9)) * 1000)], ['48 52 55 60 64', 48]);
  const upHits = TC.timeline.build(doc).hits.filter((h) => h.trk === gt && h.t > TC.timeline.LEAD + 0.7 && h.t < TC.timeline.LEAD + 0.9);
  T.eq('an up stroke from the highest down', upHits.sort((a, b) => a.t - b.t).map((h) => h.pitch)[0], 64);
  const xml = TC.musicxml.build(doc);
  T.eq('MusicXML: <down-bow/> and <up-bow/>', [/<technical><down-bow\/><\/technical>/.test(xml), /<technical><up-bow\/><\/technical>/.test(xml)], [true, true]);
  const m = TC.midi.read(TC.midi.build(doc, null, { tracks: [gt] }).bytes);
  const first = m.notes.filter((x) => x.t < 200).sort((a, b) => a.t - b.t);
  T.eq('MIDI: the stroke spread over the strings', [first.map((x) => x.note).join(' '), first[0].t < first[first.length - 1].t], ['48 52 55 60 64', true]);
};
