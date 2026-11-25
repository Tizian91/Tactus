'use strict';
// Checking notes (check.js): notes that do not fit the chord (only where it stands out: on a chord change, held into a
// new chord, long on a beat - or every note, strict), outside the scale (a chord tone outside it is meant), outside
// the range (voices, instruments: guitar / bass by strings, piano); which tracks are checked (a melody - not a left hand,
// not accompaniment, or the track's own choice); setting them right (nearest chord tone, a tone both chords share, a
// sharp up, octaves into the range, the whole tied chain, a chord that has the tone already: skipped).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'accomp.js', 'check.js']);
  const SC = TC.score, P = TC.pitch, CK = TC.check;
  const doc = TC.emptyScore(4);
  TC.state.doc = doc;
  const mel = SC.addTrack(doc, 'Gesang', doc.tracks[0], 'pitched');
  mel.voice = 'soprano';
  const put = (bar, tick, dur, pitch, tie) => {
    const n = Object.assign(TC.newPitchNote(pitch, null, {}), tie ? { tie: true } : {});
    SC.place(doc, mel, bar, 0, tick, dur, n);
    return n;
  };
  SC.setChord(doc, 0, 0, { name: 'Am' });
  SC.setChord(doc, 1, 0, { name: 'F' });
  SC.setChord(doc, 1, 1920, { name: 'G' });
  SC.setChord(doc, 2, 0, { name: 'C' });
  SC.setChord(doc, 2, 1920, { name: 'E7' });
  put(0, 0, 960, 69); // A on Am
  const pass = put(0, 960, 480, 71); // B: a short passing tone
  put(0, 1440, 480, 72); // C
  const held = put(0, 1920, 1920, 76); // E, tied into F
  const heldOn = put(1, 0, 960, 76, true);
  const d = put(1, 960, 960, 74); // D: long on a beat under F
  put(1, 1920, 960, 71); // B on G
  const fis = put(1, 2880, 480, 78); // F♯: outside C major
  const low = put(2, 0, 1920, 55); // G3: under a soprano
  const gis = put(2, 1920, 960, 68); // G♯ on E7: a chord tone outside the scale
  const all = { chord: true, scale: true, range: true };
  const brief = (fs) => fs.map((f) => `${f.kind}:${f.bar}:${f.tick}${f.why ? ':' + f.why : ''}`);

  T.eq('nothing switched on: nothing found', CK.find(doc, {}), []);
  T.eq('found: held into F, D long under F, F♯ outside, G3 too low', brief(CK.find(doc, all)),
    ['chord:1:0:into', 'chord:1:960:long', 'scale:1:2880', 'range:2:0']);
  T.eq('the chord of a find, the note found (the tied-on E in bar 2)', (() => { const f = CK.find(doc, { chord: true })[0]; return [P.chordName(f.ch), f.id === heldOn.id]; })(), ['F', true]);
  T.eq('strict: every note against its chord (the passing B too)', brief(CK.find(doc, { chord: true, strict: true })),
    ['chord:0:960:any', 'chord:1:0:into', 'chord:1:960:any', 'chord:1:2880:any']);
  T.eq('G♯ on E7 is not outside the scale (a tone of the chord)', CK.find(doc, { scale: true }).some((f) => f.id === gis.id), false);
  T.eq('no range chosen for a voice: no range check', (mel.voice = '', CK.find(doc, { range: true }).length), 0);
  mel.voice = 'soprano';

  // ranges
  T.eq('ranges: soprano, guitar default 6 strings, chosen 7 strings, bass 4 strings, piano, strings: none chosen', [
    CK.rangeOf(doc, mel).range,
    CK.rangeOf(doc, { kind: 'pitched', inst: 'guitar', voice: '' }).key,
    CK.rangeOf(doc, { kind: 'pitched', inst: 'guitar', voice: 'gtr7' }).range,
    CK.rangeOf(doc, { kind: 'pitched', inst: 'bass' }).range,
    CK.rangeOf(doc, { kind: 'pitched', inst: 'keys' }).key,
    CK.rangeOf(doc, { kind: 'pitched', inst: 'ensemble' })],
  [[60, 81], 'gtr6', [35, 88], [28, 67], 'piano', null]);
  T.eq('a range of another instrument does not hold (soprano on a guitar: its default)', CK.rangeOf(doc, { kind: 'pitched', inst: 'guitar', voice: 'soprano' }).key, 'gtr6');
  T.eq('ranges offered: voices for a voice, strings for a guitar', [P.rangesFor('voice')[0], P.rangesFor('guitar')], ['soprano', ['gtr6', 'gtrDropD', 'gtr7', 'gtr8']]);

  // which tracks
  const acc = SC.addTrack(doc, 'Gitarre', mel, 'pitched');
  [0, 1920].forEach((t) => [52, 55, 59].forEach((p) => SC.place(doc, acc, 0, 0, t, 1920, TC.newPitchNote(p, null, {}))));
  const pf = SC.addTrack(doc, 'Klavier', acc, 'pitched');
  const lh = SC.setPiano(doc, pf, true);
  T.eq('checked: melody yes, chords (accompaniment) no, piano right hand yes, left hand no, drums no',
    [mel, acc, pf, lh, doc.tracks[0]].map((t) => CK.tracked(doc, t)), [true, false, true, false, false]);
  acc.check = true;
  mel.check = false;
  T.eq('the track\'s own choice wins', [CK.tracked(doc, acc), CK.tracked(doc, mel)], [true, false]);
  delete acc.check;
  delete mel.check;
  T.eq('a piano: the piano\'s range in both hands', [CK.rangeOf(doc, pf).key, CK.rangeOf(doc, lh).key], ['piano', 'piano']);
  T.eq('saved and loaded: the choice stays', (() => { mel.check = false; const b = TC.normalizeDoc(JSON.parse(JSON.stringify(doc))); delete mel.check; return [b.tracks[1].check, b.tracks[2].check]; })(), [false, undefined]);
  T.eq('saved and loaded: an instrument\'s range stays', (() => { acc.inst = 'guitar'; acc.voice = 'gtr7'; const b = TC.normalizeDoc(JSON.parse(JSON.stringify(doc))); acc.voice = ''; return b.tracks[2].voice; })(), 'gtr7');

  // setting right
  const before = CK.find(doc, all);
  const r = CK.fix(doc, before.filter((f) => f.kind === 'chord'));
  T.eq('chord: E held from Am into F -> C (in both chords), the whole chain; D under F -> C', [r, held.pitch, heldOn.pitch, d.pitch], [{ done: 2, skipped: 0 }, 72, 72, 72]);
  T.eq('scale: F♯ goes up to G (a sharp leads up)', (CK.fix(doc, CK.find(doc, { scale: true })), fis.pitch), 79);
  T.eq('range: G3 an octave up into the soprano', (CK.fix(doc, CK.find(doc, { range: true })), low.pitch), 67);
  T.eq('everything set right: nothing found', CK.find(doc, all).length, 0);
  T.eq('the passing tone stays (it was never found)', pass.pitch, 71);
  T.eq('spelled as the chord tone: C on the C line', (() => { const n = TC.newPitchNote(74, null, {}); const t = CK.target(doc, { kind: 'chord', ch: P.parseChord('F'), pitch: 74, prev: null }, n); return [t.pitch, t.dia === P.diaOf(72, 0, 0)]; })(), [72, true]);
  T.eq('a flat goes down: E♭ in C major -> D', CK.target(doc, { kind: 'scale', scale: { l: 0, a: 0, id: 'major' }, pitch: 63, prev: null }, { pitch: 63, dia: P.diaOf(63, 2, -1) }).pitch, 62);
  T.eq('equally near: towards the note before (D on C: from above -> E, from below -> C)', [
    CK.target(doc, { kind: 'chord', ch: P.parseChord('C'), pitch: 62, prev: 65 }, { pitch: 62, dia: null }).pitch,
    CK.target(doc, { kind: 'chord', ch: P.parseChord('C'), pitch: 62, prev: 57 }, { pitch: 62, dia: null }).pitch], [64, 60]);
  // a chord that has the new tone already: skipped
  const two = TC.newPitchNote(65, null, {});
  SC.place(doc, mel, 3, 0, 0, 1920, TC.newPitchNote(72, null, {}));
  SC.place(doc, mel, 3, 0, 0, 1920, two); // F with C under a C chord: F -> E? nearest down E (64); with C it stays possible
  SC.setChord(doc, 3, 0, { name: 'C' });
  const c3 = TC.newPitchNote(74, null, {});
  SC.place(doc, mel, 3, 0, 1920, 1920, c3);
  SC.place(doc, mel, 3, 0, 1920, 1920, TC.newPitchNote(72, null, {})); // D with C: D -> C is there already, so up to E
  const r2 = CK.fix(doc, CK.find(doc, { chord: true }).filter((f) => f.bar === 3));
  T.eq('a chord: a tone the chord already has is not taken twice', [two.pitch, c3.pitch], [64, 76]);
  T.ok('… both set right', r2.done === 2);
};
