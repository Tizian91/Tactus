'use strict';
// Several tracks: add / delete / move / duplicate, the track being written, %-bars and clearing per
// track, copy / paste and MIDI import into one track, playback and MIDI export of all tracks, saving.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'midiin.js']);
  const SC = TC.score, S = TC.state;
  const doc = TC.emptyScore(2);
  doc.meta.tempo = 120;
  S.doc = doc;
  const put = (t, bar, tick, art) => SC.place(doc, t, bar, TC.drums.byId(art).voice, tick, 960, TC.newDrumNote(art, {}));
  const arts = (t, bi) => t.bars[bi].voices.flat().flatMap((e) => e.notes.map((n) => e.tick + ':' + n.art)).sort();
  const names = () => doc.tracks.map((t) => t.name);

  // managing tracks
  const drums = doc.tracks[0];
  T.eq('the track being written: the first one without a choice', TC.curTrack() === drums, true);
  const snare = SC.addTrack(doc, 'Snare');
  const cym = SC.addTrack(doc, '', snare);
  T.eq('new tracks: at the end / after a track, as many bars as the score, a free name', [names(), snare.bars.length, cym.bars.length], [['Drums', 'Snare', 'Drums 2'], 2, 2]);
  T.eq('free names count up', [SC.freeTrackName(doc, 'Drums'), SC.freeTrackName(doc, 'Toms')], ['Drums 3', 'Toms']);
  S.trackId = snare.id;
  T.eq('a chosen track', TC.curTrack() === snare, true);
  T.eq('move up / down, not past the ends', [SC.moveTrack(doc, cym, -1), names(), SC.moveTrack(doc, drums, -1), SC.moveTrack(doc, snare, 1)], [true, ['Drums', 'Drums 2', 'Snare'], false, false]);
  SC.moveTrack(doc, cym, 1);
  T.eq('… back again', names(), ['Drums', 'Snare', 'Drums 2']);

  // notes per track; bars are shared
  put(drums, 0, 0, 36);
  put(snare, 0, 960, 38);
  put(cym, 0, 0, 49);
  SC.insertBars(doc, 1, 1);
  T.eq('inserting a bar: in every track', doc.tracks.map((t) => t.bars.length), [3, 3, 3]);
  SC.deleteBars(doc, 1, 1);
  T.eq('notes stay in their track', [arts(drums, 0), arts(snare, 0), arts(cym, 0)], [['0:36'], ['960:38'], ['0:49']]);

  // %-bar and clearing: one track only
  SC.setSimile(doc, snare, 1, true);
  T.eq('% in one track: it plays its bar before, the others not', [SC.sourceBar(doc, 1, snare), SC.sourceBar(doc, 1, drums)], [0, 1]);
  SC.clearBar(doc, 0, cym);
  T.eq('clearing a bar in one track', [arts(drums, 0), arts(snare, 0), arts(cym, 0)], [['0:36'], ['960:38'], []]);
  put(cym, 0, 0, 49);

  // copy / paste a bar: every track gets its own; "only": one track
  SC.pasteBar(doc, 1, SC.copyBar(doc, 0));
  T.eq('paste: every track its own notes, the % is gone', [arts(drums, 1), arts(snare, 1), arts(cym, 1), snare.bars[1].simile], [['0:36'], ['960:38'], ['0:49'], false]);
  SC.clearBar(doc, 1);
  const file = TC.emptyScore(1);
  SC.place(file, file.tracks[0], 0, 0, 0, 480, TC.newDrumNote(42, {}));
  TC.midiIn.insertInto(doc, file, 1, 0, 0, true, cym);
  T.eq('MIDI into the open score: only the track being written', [arts(drums, 1), arts(snare, 1), arts(cym, 1)], [[], [], ['0:42']]);
  SC.clearBar(doc, 1);

  // a clipboard from before a track was added leaves that track alone
  const clip = { ts: [4, 4], tracks: [TC.clone(drums.bars[0])] };
  put(cym, 1, 0, 57);
  SC.pasteBar(doc, 1, clip);
  T.eq('paste with fewer copied tracks: the others stay', [arts(drums, 1), arts(cym, 1)], [['0:36'], ['0:57']]);
  SC.clearBar(doc, 1);

  // playback and MIDI export: all tracks together
  const tl = TC.timeline.build(doc, { from: 0, to: 0 });
  T.eq('playback: the notes of all tracks', tl.hits.map((h) => Math.round((h.t - TC.timeline.LEAD) * 1000) + ':' + h.art).sort(), ['0:36', '0:49', '500:38']);
  const m = TC.midi.read(TC.midi.build(doc, null).bytes);
  T.eq('MIDI export: the notes of all tracks', m.notes.filter((n) => n.t < 3840).map((n) => n.t + ':' + n.note).sort(), ['0:36', '0:49', '960:38']);

  // duplicate, delete
  const copy = SC.duplicateTrack(doc, snare);
  T.eq('duplicate: right after it, same notes with new ids, a free name', [names(), arts(copy, 0), copy.id !== snare.id, copy.bars[0].voices[0][0].id !== snare.bars[0].voices[0][0].id],
    [['Drums', 'Snare', 'Snare 2', 'Drums 2'], ['960:38'], true, true]);
  T.eq('delete', [SC.deleteTrack(doc, copy), names()], [true, ['Drums', 'Snare', 'Drums 2']]);
  S.trackId = 'gone';
  T.eq('the chosen track is gone: the first one', TC.curTrack() === drums, true);

  // saving and loading keeps the tracks (names, notes, %)
  SC.setSimile(doc, cym, 1, true);
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  T.eq('saved and loaded: names, ids, notes, % per track', [back.tracks.map((t) => t.name), back.tracks.map((t) => t.id), arts(back.tracks[1], 0), back.tracks.map((t) => t.bars[1].simile)],
    [names(), doc.tracks.map((t) => t.id), ['960:38'], [false, false, true]]);
  const one = TC.emptyScore(1);
  T.eq('the last track is not deleted', SC.deleteTrack(one, one.tracks[0]), false);
};
