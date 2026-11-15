'use strict';
// Chord symbols in the score (bar headers): set / remove, as scale degrees (follow a change of scale) or typed,
// the chord at a place, the key without a melody track, saving / loading, link, copy / paste, time signature,
// playback (a pad held to the next chord), MIDI (a track of its own), MusicXML <harmony>.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js']);
  const SC = TC.score, P = TC.pitch;
  const doc = TC.emptyScore(4);
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const names = (bi) => SC.chordsIn(doc, bi).map((x) => x.t + ':' + P.chordName(x.ch)).join(' ');

  // no melody track: the key of the score (C major)
  SC.setChord(doc, 0, 0, { deg: 1 });
  SC.setChord(doc, 0, 1920, { deg: 5, sev: true });
  SC.setChord(doc, 1, 0, { deg: 6 });
  SC.setChord(doc, 2, 0, { name: 'F#m7b5' });
  T.eq('bar 1: C, G7 on beat 3', names(0), '0:C 1920:G7');
  T.eq('degree chords follow the key of the score', (doc.harmony.key = { l: 2, a: 0, id: 'minor' }, names(0)), '0:Em 1920:Bm7');
  doc.harmony.key = { l: 0, a: 0, id: 'major' };
  T.eq('a typed chord keeps its name', names(2), '0:F♯m7♭5');
  T.eq('chord at a place: the last one up to there, also from bars before', [SC.chordAt(doc, 0, 960), SC.chordAt(doc, 0, 2000), SC.chordAt(doc, 3, 0)].map((x) => P.chordName(x.ch)), ['C', 'G7', 'F♯m7♭5']);
  T.eq('one chord per place: set again replaces', (SC.setChord(doc, 1, 0, { deg: 4 }), names(1)), '0:F');
  T.eq('remove', (SC.setChord(doc, 1, 0, null), doc.bars[1].chords), undefined);
  SC.setChord(doc, 1, 0, { deg: 6 });
  T.eq('places for chords: the beats (4/4)', SC.chordSlots(doc, 0), [0, 960, 1920, 2880]);

  // a melody track: its scale (and its change of scale) decides
  const mel = SC.addTrack(doc, 'Vocals', doc.tracks[0], 'pitched');
  SC.setScale(mel, 0, { l: 0, a: 0, id: 'major' });
  SC.setScale(mel, 1, { l: 1, a: 0, id: 'major' }); // D major from bar 2
  T.eq('scale of the chords: of the melody track, per bar', [P.scaleName(SC.harmonyScale(doc, 0)), P.scaleName(SC.harmonyScale(doc, 1))], ['C Major', 'D Major']);
  T.eq('vi in bar 2 is Bm (D major), not Am', names(1), '0:Bm');
  T.eq('a chord held over from bar 1 into a changed scale stays what was written', P.chordName(SC.chordAt(doc, 1, 0).ch), 'Bm');

  // guide (how chords help writing a melody): of the score, a bar's own from it on
  doc.bars[2].guide = 'lock';
  T.eq('guide: score default, bar 3 on locked', [SC.guideAt(doc, 0), SC.guideAt(doc, 2), SC.guideAt(doc, 3)], ['mark', 'lock', 'lock']);
  delete doc.bars[2].guide;

  // time signature: chords past the new end go
  SC.setTimeSig(doc, 0, [2, 4], true);
  T.eq('2/4: the chord on beat 3 is gone', names(0), '0:C');
  SC.setTimeSig(doc, 0, [4, 4], true);
  SC.setChord(doc, 0, 1920, { deg: 5, sev: true });

  // copy / paste / duplicate take the chords along
  const clip = SC.copyBars(doc, 0, 0);
  SC.pasteBars(doc, 3, clip);
  T.eq('pasted bar has the chords (as degrees: in D major there)', names(3), '0:D 1920:A7');
  SC.pasteBar(doc, 3, SC.copyBar(doc, 1), mel);
  T.eq('pasting into one track keeps the chords', names(3), '0:D 1920:A7');

  // saving / loading / link
  doc.harmony.vol = 40;
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded: chords and harmony', [back.bars.map((h) => h.chords || null), back.harmony], [doc.bars.map((h) => h.chords || null), doc.harmony]);
  T.eq('loading drops bad chords (outside the bar, bad degree, empty name), sorts them', TC.normalizeDoc({ bars: [{ ts: [4, 4], chords: [{ t: 1920, deg: 2 }, { t: 0, name: ' Am ' }, { t: 9999, deg: 1 }, { t: 960, deg: 9 }, { t: 480, name: '' }] }], tracks: [] }).bars[0].chords,
    [{ t: 0, name: 'Am' }, { t: 1920, deg: 2 }]);
  T.eq('old files: harmony defaults', TC.normalizeDoc({ bars: [{}], tracks: [] }).harmony, TC.newHarmony());
  const packed = JSON.parse(TC.share.pack(doc));
  T.ok('link: chords travel, harmony only when not default', JSON.stringify(packed.bars[0].chords) === JSON.stringify(doc.bars[0].chords) && packed.harmony.vol === 40);
  T.ok('link: default harmony left out', !('harmony' in JSON.parse(TC.share.pack(TC.emptyScore(1)))));

  // playback: a pad from each chord to the next (C for 2 beats, G7 for 2 beats, Bm a whole bar …)
  doc.harmony.vol = 60;
  const tl = TC.timeline.build(doc, { from: 0, to: 2 });
  const pad = tl.hits.filter((h) => h.chord);
  const at = (t) => pad.filter((h) => Math.abs(h.t - t) < 1e-6).map((h) => h.pitch);
  T.eq('C: bass C2 and G3 C4 E4 at the start', at(0.1), [36, 55, 60, 64]);
  T.eq('… held 2 beats (1 s at 120)', Math.round(pad[0].dur * 100) / 100, 0.98);
  T.eq('G7 on beat 3: bass G2 + 4 tones', at(1.1), [43, 55, 59, 62, 65]);
  T.ok('the pad plays on Tactus\' synth, a track of its own', pad.every((h) => h.trk === TC.timeline.CHORD_TRACK && h.trk.synthOnly));
  T.eq('bar 3 (F♯m7♭5, typed) after bar 2 (Bm)', [at(2.1).length, at(4.1)[0]], [4, 42]);
  // a chord going on over the bar line is held
  SC.setChord(doc, 2, 0, null);
  const tl2 = TC.timeline.build(doc, { from: 1, to: 2 });
  const p2 = tl2.hits.filter((h) => h.chord);
  T.eq('Bm over two bars: struck once, held 4 s', [p2.length, Math.round(p2[0].dur * 100) / 100], [4, 3.98]);
  const tl3 = TC.timeline.build(doc, { from: 2, to: 2 });
  T.eq('playing from a bar without a chord: the chord written before it', tl3.hits.filter((h) => h.chord).map((h) => h.pitch), [47, 59, 62, 66]);
  doc.harmony.pad = false;
  T.eq('pad off: no chords', TC.timeline.build(doc, {}).hits.filter((h) => h.chord).length, 0);
  doc.harmony.pad = true;
  doc.tracks[0].solo = true;
  T.eq('a track plays solo: no chords', TC.timeline.build(doc, {}).hits.filter((h) => h.chord).length, 0);
  doc.tracks[0].solo = false;

  // MIDI: a track of its own (channel 15, pad program), names as text; a file with only the chords
  const m = TC.midi.read(TC.midi.build(doc, null, { multi: true, chords: true }).bytes);
  const ct = m.tracks[m.tracks.length - 1];
  T.eq('MIDI: the last track is the chords, channel 15, program 89', [ct.name, ct.notes[0].ch, ct.programs[0].program], ['Chords', 14, 89]);
  const texts = m.metas.filter((x) => x.type === 0x01 && x.track === m.tracks.length - 1).map((x) => String.fromCharCode(...x.data));
  T.eq('… the chord names as text events', texts.slice(0, 3), ['C', 'G7', 'Bm']);
  T.eq('… C is held two beats', ct.notes.filter((n) => n.t === 0).map((n) => [n.note, n.dur]), [[36, 1910], [55, 1910], [60, 1910], [64, 1910]]);
  const only = TC.midi.read(TC.midi.build(doc, null, { tracks: [], chords: true }).bytes);
  T.ok('a file with only the chords', only.notes.length > 0 && only.notes.every((n) => n.ch === 14));
  T.eq('without opts.chords: no chord notes', TC.midi.read(TC.midi.build(doc, null, { multi: true }).bytes).notes.filter((n) => n.ch === 14).length, 0);

  // MusicXML: <harmony> over the melody part, at its place
  const xml = TC.musicxml.build(doc);
  const p2x = xml.split('<part id="P2">')[1] || '';
  T.ok('harmony in the melody part (P2), not in the drums', !xml.split('<part id="P2">')[0].includes('<harmony>') && p2x.includes('<harmony>'));
  T.ok('C major at the bar start', p2x.includes('<harmony><root><root-step>C</root-step></root><kind text="">major</kind></harmony>'));
  T.ok('G7 on beat 3: offset 1920', p2x.includes('<root-step>G</root-step></root><kind text="7">dominant</kind><offset>1920</offset>'));
  T.eq('typed F♯m7♭5, slash chord, add9', [TC.musicxml.harmonyXml(P.parseChord('F#m7b5'), 0), TC.musicxml.harmonyXml(P.parseChord('C/E'), 0), TC.musicxml.harmonyXml(P.parseChord('Dadd9'), 0)], [
    '<harmony><root><root-step>F</root-step><root-alter>1</root-alter></root><kind text="m7♭5">half-diminished</kind></harmony>',
    '<harmony><root><root-step>C</root-step></root><kind text="">major</kind><bass><bass-step>E</bass-step></bass></harmony>',
    '<harmony><root><root-step>D</root-step></root><kind text="add9">major</kind><degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree></harmony>']);

  // the pad on a MIDI output of its own (a synth VST): channel, saved; default: Tactus' synth
  T.ok('default: the pad plays on Tactus\' synth only', TC.timeline.chordTrack(doc).synthOnly && !doc.harmony.midiOut);
  doc.harmony.midiOut = 'loopMIDI Synth';
  doc.harmony.midiCh = 3;
  const ctr = TC.timeline.chordTrack(doc);
  T.eq('own output: its port and channel 4', [ctr.synthOnly, ctr.ownPort, ctr.midiOut, ctr.midiCh, ctr.program], [false, true, 'loopMIDI Synth', 3, 89]);
  T.ok('the pad hits use it', TC.timeline.build(doc, { from: 0, to: 0 }).hits.filter((h) => h.chord).every((h) => h.trk.midiOut === 'loopMIDI Synth'));
  const mc = TC.midi.read(TC.midi.build(doc, null, { tracks: [], chords: true }).bytes);
  T.ok('MIDI export: the chord channel follows (4)', mc.notes.length && mc.notes.every((n) => n.ch === 3));
  const hb = TC.normalizeDoc(JSON.parse(JSON.stringify(doc))).harmony;
  T.eq('saved: output and channel', [hb.midiOut, hb.midiCh], ['loopMIDI Synth', 3]);
  T.eq('bad channel on loading: channel 15', TC.normalizeDoc({ bars: [{}], tracks: [], harmony: { midiCh: 40 } }).harmony.midiCh, 14);

  // places in the bar: like the click grid (eighths: 1 + 2 + …), a chord standing elsewhere stays in the list
  const d2 = TC.emptyScore(1);
  T.eq('places with eighths: 8', SC.chordSlots(d2, 0, 480), [0, 480, 960, 1440, 1920, 2400, 2880, 3360]);
  T.eq('places with sixteenths: 16', SC.chordSlots(d2, 0, 240).length, 16);
  SC.setChord(d2, 0, 3360, { deg: 5 }); // on "4 +" (pushed)
  T.eq('a chord on 4 + stays a place with quarters', SC.chordSlots(d2, 0, 960), [0, 960, 1920, 2880, 3360]);
  T.eq('… and is sounding from there', P.chordName(SC.chordAt(d2, 0, 3400).ch), 'G');
};
