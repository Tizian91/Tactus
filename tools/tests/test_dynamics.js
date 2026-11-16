'use strict';
// Dynamics (ppp … fff, hairpins) of a track and its fader: set / removed, saved and loaded, how strongly each place
// plays (levels, a hairpin to the level after it or two steps on), playback and MIDI strengths (the notes stay as
// written: a ghost stays a ghost), the fader as CC 7, MusicXML <dynamics> / <wedge>, copied with the bar, %-bars.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js']);
  const SC = TC.score, F = SC.DYN_FACTORS;
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  const doc = TC.emptyScore(6);
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const dr = doc.tracks[0];
  for (let b = 0; b < 6; b++) for (let k = 0; k < 4; k++) SC.place(doc, dr, b, 0, k * 960, 960, TC.newDrumNote(38, {}));
  const ghost = SC.place(doc, dr, 1, 1, 480, 480, TC.newDrumNote(38, { ghost: true }));

  // ---- set / remove
  T.eq('no dynamics: mf everywhere', SC.dynFactor(doc, dr)(3, 0), 1);
  T.eq('a level set', [SC.setDyn(doc, dr, 1, 0, { v: 'p' }), dr.bars[1].dyn], [true, [{ t: 0, v: 'p' }]]);
  T.eq('the same again: nothing changes', SC.setDyn(doc, dr, 1, 0, { v: 'p' }), false);
  T.eq('a level and a hairpin at one place', [SC.setDyn(doc, dr, 1, 0, { w: 'cresc', len: 2 * 3840 }), dr.bars[1].dyn.map((d) => d.v || d.w)], [true, ['p', 'cresc']]);
  SC.setDyn(doc, dr, 3, 0, { v: 'f' });
  T.eq('removed: only the kind asked for', [SC.setDyn(doc, dr, 1, 0, { w: null }), dr.bars[1].dyn], [true, [{ t: 0, v: 'p' }]]);
  SC.setDyn(doc, dr, 1, 0, { w: 'cresc', len: 2 * 3840 });

  // ---- how strongly each place plays
  const f = SC.dynFactor(doc, dr);
  T.eq('before the first level: mf', f(0, 960), 1);
  T.eq('at p: p', near(f(1, 0), F[2]), true);
  T.eq('halfway through the crescendo: halfway from p to f', near(f(2, 0), (F[2] + F[5]) / 2), true);
  T.eq('after it, at f: f', near(f(4, 0), F[5]), true);
  const lone = TC.emptyScore(4), lt = lone.tracks[0];
  SC.setDyn(lone, lt, 0, 0, { v: 'pp' });
  SC.setDyn(lone, lt, 1, 0, { w: 'cresc', len: 3840 });
  const g = SC.dynFactor(lone, lt);
  T.eq('a hairpin with no level after it: two steps on, held after it', [near(g(1, 1920), (F[1] + F[3]) / 2), near(g(3, 0), F[3])], [true, true]);
  SC.setDyn(lone, lt, 2, 0, { w: 'dim', len: 3840 });
  T.eq('… a diminuendo from there: two steps back', near(SC.dynFactor(lone, lt)(3, 960), F[1]), true);

  // ---- playback: strengths, the notes stay as written
  const hits = TC.timeline.build(doc).hits.filter((h) => h.art !== undefined);
  const bar = (k) => hits.filter((h) => h.t >= TC.timeline.LEAD + k * 2 && h.t < TC.timeline.LEAD + (k + 1) * 2); // (4/4 at 120: 2 s a bar)
  T.eq('playback: bar 1 mf, bar 2 p (the ghost softer still), bar 5 f', [bar(0)[0].vel, near(bar(1)[0].vel, 0.72 * F[2]), near(bar(4)[0].vel, 0.72 * F[5])], [0.72, true, true]);
  // (bar 2: p, and a crescendo starts there - the ghost on 1+ is a little louder than a ghost in p)
  T.eq('playback: the ghost in the crescendo plays as soft as a ghost there - and stays a ghost', [bar(1).some((h) => near(h.vel, 0.22 * f(1, 480))), ghost.note.ghost === true && !ghost.note.vel], [true, true]);

  // ---- MIDI: the strengths, the fader as CC 7
  dr.volume = 80;
  const m = TC.midi.read(TC.midi.build(doc, null, {}).bytes);
  const v = (k) => m.notes.filter((n) => n.t >= k * 3840 && n.t < (k + 1) * 3840).map((n) => n.vel);
  T.eq('MIDI: mf, p softer, f louder (times the fader 0.8)', [v(1)[0] === Math.round(0.72 * F[2] * 0.8 * 127), v(4)[0] === Math.round(0.72 * F[5] * 0.8 * 127)], [true, true]);
  const cc7 = (bytes) => { for (let i = 0; i < bytes.length - 2; i++) if ((bytes[i] & 0xf0) === 0xb0 && bytes[i + 1] === 7) return bytes[i + 2]; return null; };
  T.eq('MIDI: the fader of a drum track (80): its strengths, no CC 7 (drum VSTs ignore it)', [v(0)[0], cc7(TC.midi.build(doc, null, {}).bytes)], [Math.round(0.72 * 0.8 * 127), null]);
  dr.volume = 100;
  const md = TC.emptyScore(1), mt = SC.addTrack(md, 'Synth', null, 'pitched');
  SC.place(md, mt, 0, 0, 0, 960, TC.newPitchNote(60, null, {}));
  mt.volume = 70;
  const mm = TC.midi.build(md, null, {}).bytes;
  T.eq('MIDI: the fader of a melody track (70): channel volume CC 7, its strength stays', [cc7(mm), TC.midi.read(mm).notes.find((n) => n.note === 60).vel], [70, 91]);

  // ---- saved, loaded, copied; a bar with other dynamics is no %-bar
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded', [back.tracks[0].bars[1].dyn, back.tracks[0].bars[3].dyn], [dr.bars[1].dyn, dr.bars[3].dyn]);
  T.eq('loaded: wrong entries left out', SC.cleanDyn([{ t: 0, v: 'pppp' }, { t: -5, v: 'p' }, { t: 99999, v: 'p' }, { t: 0, w: 'cresc', len: 0 }, { t: 960, v: 'mp' }, { t: 960, v: 'f' }], 3840), [{ t: 960, v: 'mp' }]);
  const packed = TC.normalizeDoc(JSON.parse(TC.share.pack(doc)));
  T.eq('share link: kept', packed.tracks[0].bars[3].dyn, [{ t: 0, v: 'f' }]);
  T.eq('a bar with other dynamics is not the same bar (no %)', SC.barKey(doc, dr, 2) === SC.barKey(doc, dr, 3), false);
  const clip = SC.copyBar(doc, 3);
  SC.pasteBar(doc, 5, clip);
  T.eq('copied with the bar', dr.bars[5].dyn, [{ t: 0, v: 'f' }]);

  // ---- a hairpin with its own level ("pp < ff"): to it, and it holds after it; the level sounding at a place
  const hp = TC.emptyScore(4), ht = hp.tracks[0];
  SC.setDyn(hp, ht, 0, 0, { v: 'pp' });
  SC.setDyn(hp, ht, 0, 0, { w: 'cresc', len: 2 * 3840, to: 'ff' });
  SC.setDyn(hp, ht, 3, 0, { v: 'p' });
  const hf = SC.dynFactor(hp, ht);
  T.eq('"pp < ff": halfway between, ff after it (a level written later than a bar after it does not count)', [near(hf(1, 0), (F[1] + F[6]) / 2), near(hf(2, 0), F[6]), near(hf(3, 0), F[2])], [true, true, true]);
  T.eq('the level sounding: pp at the start, ff after the hairpin', [SC.levelAt(hp, ht, 0, 0), SC.levelAt(hp, ht, 2, 960)], [1, 6]);
  T.eq('saved and loaded: the hairpin keeps its level', TC.normalizeDoc(JSON.parse(JSON.stringify(hp))).tracks[0].bars[0].dyn, [{ t: 0, v: 'pp' }, { t: 0, w: 'cresc', len: 7680, to: 'ff' }]);
  T.eq('MusicXML: its level at the start of the bar after it', /<measure number="3">(?:(?!<\/measure>)[^])*<dynamics><ff\/><\/dynamics>/.test(TC.musicxml.build(hp)), true);

  // ---- MusicXML
  const xml = TC.musicxml.build(doc);
  T.eq('MusicXML: the level, the hairpin and its stop', [/<dynamics><p\/><\/dynamics>/.test(xml), /<wedge type="crescendo" number="1"\/>/.test(xml),
    /<measure number="3">(?:(?!<\/measure>)[^])*<wedge type="stop" number="1"\/><\/direction-type><offset>3840<\/offset>/.test(xml), /<dynamics><f\/><\/dynamics>/.test(xml)], [true, true, true, true]);
};
