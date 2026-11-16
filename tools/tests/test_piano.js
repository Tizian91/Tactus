'use strict';
// Piano: a melody track with a second staff (left hand, bass clef) - one instrument: what both hands share
// (name, sound, scale, mute / solo, hidden), the order of tracks (add / move / duplicate / delete as a block),
// loading (a left hand only after a melody track), one staff again (the lower one becomes a track of its own),
// MusicXML one part with two staves, MIDI one track.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js']);
  const SC = TC.score;
  const ids = (doc) => doc.tracks.map((t) => t.name + (t.lh ? '(L)' : ''));

  const doc = TC.emptyScore(2);
  TC.state.doc = doc;
  const drums = doc.tracks[0];
  drums.name = 'Drums';
  const pf = SC.addTrack(doc, 'Klavier', drums, 'pitched');
  pf.program = 0;
  const lh = SC.setPiano(doc, pf, true);
  T.eq('on: the left hand right after it, bass clef, same name and sound', [ids(doc), lh.clef, lh.program, SC.leftHand(doc, pf) === lh, SC.rightHand(doc, lh) === pf],
    [['Drums', 'Klavier', 'Klavier(L)'], 'bass', 0, true, true]);
  T.eq('hands, instrument, instruments', [SC.handsOf(doc, lh).length, SC.instrumentOf(doc, lh) === pf, SC.instruments(doc).map((t) => t.name), SC.isPiano(doc, pf), SC.isPiano(doc, drums)],
    [2, true, ['Drums', 'Klavier'], true, false]);
  T.eq('switching on twice: still one left hand', [SC.setPiano(doc, lh, true) === lh, doc.tracks.length], [true, 3]);

  // shared: from the upper one (default), or from the hand that was changed
  pf.scale = { l: 2, a: 0, id: 'minor' };
  pf.bars[1].scale = { l: 5, a: 0, id: 'major' };
  pf.mute = true;
  SC.syncHands(doc);
  T.eq('shared: scale, its changes, mute', [lh.scale.id, lh.bars[1].scale && lh.bars[1].scale.l, lh.mute], ['minor', 5, true]);
  lh.program = 4;
  lh.solo = true;
  SC.syncHands(doc, lh);
  T.eq('shared from the left hand (sound chosen while writing it)', [pf.program, pf.solo, pf.clef, lh.clef], [4, true, 'treble', 'bass']);
  lh.bars[1].scale = null;
  SC.syncHands(doc);
  T.eq('the upper one decides by default (a left hand changed alone gets it back)', lh.bars[1].scale && lh.bars[1].scale.l, 5);
  T.eq('chords follow the upper staff, also asked with the left hand', SC.harmonyTrack(doc, lh) === pf, true);

  // the order of tracks: a piano is a block
  const mel = SC.addTrack(doc, 'Gesang', pf, 'pitched');
  T.eq('added after a piano: after both staves', ids(doc), ['Drums', 'Klavier', 'Klavier(L)', 'Gesang']);
  T.eq('moved up: both staves', [SC.moveTrack(doc, lh, -1), ids(doc)], [true, ['Klavier', 'Klavier(L)', 'Drums', 'Gesang']]);
  T.eq('a track moved up past a piano: past both', [SC.moveTrack(doc, drums, -1), ids(doc)], [true, ['Drums', 'Klavier', 'Klavier(L)', 'Gesang']]);
  SC.moveTrack(doc, mel, -1);
  T.eq('… and up past it from below', ids(doc), ['Drums', 'Gesang', 'Klavier', 'Klavier(L)']);
  T.eq('the last one cannot go further down', SC.moveTrack(doc, pf, 1), false);
  SC.place(doc, lh, 0, 0, 0, 1920, TC.newPitchNote(36, null, {}));
  const copy = SC.duplicateTrack(doc, lh);
  T.eq('duplicated: both staves, new ids, the notes too', [ids(doc), SC.leftHand(doc, copy) !== lh, SC.leftHand(doc, copy).bars[0].voices[0][0].notes[0].pitch,
    SC.leftHand(doc, copy).bars[0].voices[0][0].notes[0].id !== lh.bars[0].voices[0][0].notes[0].id],
  [['Drums', 'Gesang', 'Klavier', 'Klavier(L)', 'Klavier 2', 'Klavier 2(L)'], true, 36, true]);
  T.eq('deleted: both staves', [SC.deleteTrack(doc, SC.leftHand(doc, copy)), ids(doc)], [true, ['Drums', 'Gesang', 'Klavier', 'Klavier(L)']]);

  // loading: a left hand only after a melody track that is no left hand itself; shared values follow the upper one
  const raw = JSON.parse(JSON.stringify(doc));
  raw.tracks[3].program = 33;
  const back = TC.normalizeDoc(raw);
  T.eq('saved and loaded: still a piano, shared from the upper one', [ids(back), back.tracks[3].program], [['Drums', 'Gesang', 'Klavier', 'Klavier(L)'], 4]);
  const bad = JSON.parse(JSON.stringify(doc));
  bad.tracks[0].lh = true; // drums: no left hand
  bad.tracks.push(Object.assign(JSON.parse(JSON.stringify(bad.tracks[3])), { id: 'x', name: 'Bass' })); // a 2nd left hand in a row
  T.eq('loaded: a left hand after drums or after a left hand is a track of its own', ids(TC.normalizeDoc(bad)), ['Drums', 'Gesang', 'Klavier', 'Klavier(L)', 'Bass']);

  // MusicXML: one part with two staves; MIDI: one track
  SC.place(doc, pf, 0, 0, 0, 960, TC.newPitchNote(72, null, {}));
  const xml = TC.musicxml.build(doc);
  const part = xml.split('<part id="P3">')[1] || '';
  T.eq('MusicXML: three parts (drums, vocals, piano)', (xml.match(/<score-part /g) || []).length, 3);
  T.eq('MusicXML: the piano has two staves and two clefs', [/<staves>2<\/staves>/.test(part), /<clef number="1"><sign>G<\/sign>/.test(part), /<clef number="2"><sign>F<\/sign><line>4<\/line>/.test(part)], [true, true, true]);
  T.eq('MusicXML: the upper note on staff 1, the left hand after a backup on staff 2 (voice 5)',
    /<step>C<\/step><octave>5<\/octave>(?:(?!<\/note>)[^])*<staff>1<\/staff>(?:(?!<\/measure>)[^])*<backup><duration>3840<\/duration><\/backup>(?:(?!<\/measure>)[^])*<step>C<\/step><octave>2<\/octave>(?:(?!<\/note>)[^])*<voice>5<\/voice>(?:(?!<\/note>)[^])*<staff>2<\/staff>/.test(part), true);
  T.eq('MusicXML: no staff numbers in a part of one staff', /<staff>/.test(xml.split('<part id="P2">')[1].split('</part>')[0]), false);
  const one = TC.midi.read(TC.midi.build(doc, null, { multi: true }).bytes);
  T.eq('MIDI: a track per instrument, the piano with both hands', one.tracks.map((t) => t.name + ':' + t.notes.length), ['Tactus:0', 'Drums:0', 'Gesang:0', 'Klavier:2']);
  const only = TC.midi.read(TC.midi.build(doc, null, { tracks: [pf] }).bytes);
  T.eq('MIDI: the piano alone (one file): both hands', only.notes.map((n) => n.note).sort(), [36, 72]);

  // one staff again: the left hand goes (the action asks first when it has notes); on again: one new, empty left hand
  SC.setPiano(doc, pf, false);
  T.eq('off: the left hand goes', [ids(doc), SC.isPiano(doc, pf)], [['Drums', 'Gesang', 'Klavier'], false]);
  const again = SC.setPiano(doc, pf, true);
  T.eq('on again: one left hand, empty', [ids(doc), again.bars[0].voices[0].length], [['Drums', 'Gesang', 'Klavier', 'Klavier(L)'], 0]);
};
