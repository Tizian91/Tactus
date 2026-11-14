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

  // instruments of a track: the kit of the settings, or its own (one line)
  const D = TC.drums;
  S.settings.kit = 'standard';
  S.input.art = 42;
  T.eq('a new track: the kit of the settings', [drums.kit, D.ownKit(drums), D.kit(drums).has(42), D.kit(drums).size === D.globalKit().size], [null, false, true, true]);
  snare.kit = [38, 37];
  T.eq('own instruments', [D.ownKit(snare), [...D.kit(snare)].sort()], [true, [37, 38]]);
  T.eq('a click in a track with its own instruments: not the hi-hat selected elsewhere', [D.clickable(snare).has(42), D.clickable(drums).has(42)], [false, true]);
  T.eq('… the line of the snare gives the snare, the hi-hat line nothing near', [D.resolveIn(3, snare).id, D.resolveIn(-1, snare)], [38, null]);
  T.eq('without one line: instruments on their lines', [D.oneLine(snare), D.lineOf(D.byId(38), snare)], [false, D.byId(38).line]);
  snare.oneLine = true;
  T.eq('one line: every instrument on the middle line', [D.oneLine(snare), D.lineOf(D.byId(38), snare), D.lineOf(D.byId(37), snare)], [true, 4, 4]);
  T.eq('one line: near the line its instrument (the selected one if it has it)', [D.resolveIn(4.8, snare).id, (S.input.art = 37, D.resolveIn(3.5, snare).id), D.resolveIn(9, snare)], [38, 37, null]);
  S.input.art = 42;
  T.eq('one line: the drum map / menu offers all of its instruments', D.lineArts(4, snare).map((a) => a.id).sort(), [37, 38]);
  T.eq('one line without own instruments does not count', D.oneLine({ oneLine: true, kit: null }), false);
  T.eq('drum name of an instrument (track names)', [D.elName(D.byId(37)), D.elName(D.byId(42))].map((s) => s.toLowerCase()), ['snare', 'hi-hat']);

  // hidden, saved, loaded, shared
  cym.hidden = true;
  const saved = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  const sv = saved.tracks.find((t) => t.name === 'Snare'), cv = saved.tracks.find((t) => t.name === 'Drums 2');
  T.eq('saved and loaded: own instruments, one line, hidden', [sv.kit.slice().sort(), sv.oneLine, cv.hidden, saved.tracks[0].kit, saved.tracks[0].hidden], [[37, 38], true, true, null, false]);
  const allHidden = TC.normalizeDoc({ bars: [{}], tracks: [{ kind: 'drums', hidden: true, bars: [] }, { kind: 'drums', hidden: true, bars: [] }] });
  T.eq('all tracks hidden in a file: the first one is shown', allHidden.tracks.map((t) => t.hidden), [false, true]);
  T.eq('bad instruments are dropped, one line needs instruments', TC.normalizeDoc({ bars: [{}], tracks: [{ kind: 'drums', kit: [9999], oneLine: true, bars: [] }] }).tracks[0].kit, null);

  // notes of two tracks do not move together
  const mixed = [drums.bars[0].voices.flat()[0].notes[0].id, snare.bars[0].voices.flat()[0].notes[0].id];
  T.eq('moving notes of two tracks: refused', SC.moveNotes(doc, mixed, 480), false);
  T.eq('staff spacing: kept when loaded, bad values: 80 % (standard)', [TC.normalizeDoc({ bars: [{}], page: { staffGap: 40 } }).page.staffGap, TC.normalizeDoc({ bars: [{}], page: { staffGap: 55 } }).page.staffGap, TC.emptyScore(1).page.staffGap], [40, 80, 80]);
  T.eq('line spacing: kept when loaded, bad values: 100 % (standard)', [TC.normalizeDoc({ bars: [{}], page: { lineGap: 60 } }).page.lineGap, TC.normalizeDoc({ bars: [{}], page: { lineGap: 33 } }).page.lineGap, TC.emptyScore(1).page.lineGap], [60, 100, 100]);
};
