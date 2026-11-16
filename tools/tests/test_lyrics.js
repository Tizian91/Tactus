'use strict';
// Lyrics: syllables on the notes of voice 1 (several verses), typed / pasted text split into syllables and spread
// over the notes (hyphen, melisma), tied notes and voice 2 left out, saving / loading, a bar with other words is no
// %-bar, MusicXML <lyric> (syllabic, extend, verses), MIDI lyric events (verse 2 on the 2nd pass of a repeat).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'pitch.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'musicxml.js', 'share.js']);
  const SC = TC.score;

  // ---- splitting text
  T.eq('words and syllables', SC.splitLyrics('Al-le mei-ne Ent-chen'), ['Al-', 'le', 'mei-', 'ne', 'Ent-', 'chen']);
  T.eq('"_" leaves notes out (melisma), spaces and line breaks count once', SC.splitLyrics('Licht__  und\nSon-ne _'), ['Licht', null, null, 'und', 'Son-', 'ne', null]);
  T.eq('a hyphen at the end: the word goes on', SC.splitLyrics('Lie-'), ['Lie-']);
  T.eq('"-" alone and "--": no empty syllables', SC.splitLyrics('- a--b'), ['a-', 'b']);
  T.eq('nothing', SC.splitLyrics('   '), []);

  // ---- a melody: bar 1 C D E F (quarters), bar 2 G half tied on from F? no: G half, A half; bar 3 C whole tied into bar 4
  const doc = TC.emptyScore(4);
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const mel = SC.addTrack(doc, 'Vocals', null, 'pitched');
  const put = (bi, vi, tick, dur, pitch) => SC.place(doc, mel, bi, vi, tick, dur, TC.newPitchNote(pitch, null, {}));
  [60, 62, 64, 65].forEach((p, k) => put(0, 0, k * 960, 960, p));
  put(1, 0, 0, 1920, 67);
  put(1, 0, 1920, 1920, 69);
  put(2, 0, 0, 3840, 72);
  const tied = put(3, 0, 0, 3840, 72);
  tied.note.tie = true;
  put(0, 1, 0, 3840, 48); // voice 2: no syllables
  const slots = SC.lyricSlots(doc, mel);
  T.eq('places: voice 1 only, the tied note left out', slots.map((s) => s.bar + ':' + s.ev.tick), ['0:0', '0:960', '0:1920', '0:2880', '1:0', '1:1920', '2:0']);

  // ---- spreading text
  let next = SC.spreadLyrics(slots, 0, 0, SC.splitLyrics('Hal-lo Son-ne_ du'));
  T.eq('written from the first note on, one left out', slots.map((s) => SC.lyricOf(s.ev, 0)), ['Hal-', 'lo', 'Son-', 'ne', '', 'du', '']);
  T.eq('… the next place', next, 6);
  next = SC.spreadLyrics(slots, 6, 0, SC.splitLyrics('Licht und mehr'));
  T.eq('more syllables than notes: the rest is left', [next, SC.lyricOf(slots[6].ev, 0)], [7, 'Licht']);
  SC.spreadLyrics(slots, 0, 1, SC.splitLyrics('Zwei-te'));
  T.eq('verse 2 on its own', [SC.lyricOf(slots[0].ev, 1), SC.lyricOf(slots[1].ev, 1), SC.lyricOf(slots[0].ev, 0), SC.lyricVerses(mel)], ['Zwei-', 'te', 'Hal-', 2]);
  T.eq('stored on the first note of the event', slots[0].ev.notes[0].lyr, ['Hal-', 'Zwei-']);
  SC.setLyric(slots[1].ev, 1, '');
  T.eq('removing a syllable: the list gets shorter', slots[1].ev.notes[0].lyr, ['lo']);
  SC.setLyric(slots[1].ev, 1, 'te');

  // ---- what is drawn / written out
  const info = SC.lyricInfo(doc, mel);
  const v0 = (k) => (info.get(slots[k].ev) || []).find((y) => y.v === 0);
  T.eq('syllabic: begin / end / single', [v0(0).syllabic, v0(1).syllabic, v0(5).syllabic, v0(6).syllabic], ['begin', 'end', 'single', 'single']);
  T.eq('text without the hyphen, hyphen and the next syllable', [v0(0).text, v0(0).hyphen, v0(0).next.ev === slots[1].ev], ['Hal', true, true]);
  T.eq('"Son-ne" then a note without a syllable: a melisma line to it', [v0(3).text, v0(3).endNote.ev === slots[4].ev], ['ne', true]);
  T.eq('no melisma after "lo" (the next note has its own syllable)', v0(1).endNote, null);

  // ---- saving and loading, share link
  const back = TC.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  const mel2 = back.tracks.find((t) => t.name === 'Vocals');
  T.eq('saved and loaded', SC.lyricSlots(back, mel2).map((s) => SC.lyricOf(s.ev, 0)), ['Hal-', 'lo', 'Son-', 'ne', '', 'du', 'Licht']);
  const raw = JSON.parse(JSON.stringify(doc));
  raw.tracks[1].bars[0].voices[0][0].notes[0].lyr = ['  viel   zu  lang '.repeat(5), 42, '', ''];
  const cl = TC.normalizeDoc(raw).tracks[1].bars[0].voices[0][0].notes[0].lyr;
  T.eq('loading: one line, at most 40 characters, no empty verses at the end', [cl.length, cl[0].length <= 40, /\s\s/.test(cl[0])], [1, true, false]);
  const packed = JSON.parse(TC.share.pack(doc));
  T.eq('share link keeps the lyrics', packed.tracks[1].bars[0].voices[0][0].notes[0].lyr, ['Hal-', 'Zwei-']);

  // ---- a bar with other words is not the same bar (find repeats: it must not become a %-bar)
  const d2 = TC.emptyScore(2);
  const m2 = SC.addTrack(d2, 'V', null, 'pitched');
  [0, 1].forEach((bi) => SC.place(d2, m2, bi, 0, 0, 3840, TC.newPitchNote(64, null, {})));
  T.eq('same notes, no words: the same', SC.barKey(d2, m2, 0) === SC.barKey(d2, m2, 1), true);
  SC.setLyric(m2.bars[1].voices[0][0], 0, 'Oh');
  T.eq('other words: not the same', SC.barKey(d2, m2, 0) === SC.barKey(d2, m2, 1), false);

  // ---- MusicXML
  const xml = TC.musicxml.build(doc);
  T.eq('MusicXML: begin syllable', /<lyric number="1" placement="below"><syllabic>begin<\/syllabic><text>Hal<\/text><\/lyric>/.test(xml), true);
  T.eq('MusicXML: verse 2', /<lyric number="2" placement="below"><syllabic>begin<\/syllabic><text>Zwei<\/text><\/lyric>/.test(xml), true);
  T.eq('MusicXML: melisma with <extend/>', /<text>ne<\/text><extend\/><\/lyric>/.test(xml), true);
  const notesXml = xml.match(/<note>[^]*?<\/note>/g) || [];
  T.eq('MusicXML: lyrics only on notes of voice 1, 8 syllables in all', [notesXml.filter((x) => /<lyric/.test(x) && !/<voice>1<\/voice>/.test(x)).length,
    notesXml.reduce((a, x) => a + (x.match(/<lyric /g) || []).length, 0)], [0, 8]);
  T.eq('MusicXML: the tied whole note in bar 4 has no lyric', /<measure number="4">(?:(?!<\/measure>)[^])*<lyric/.test(xml.split('<part id="P2">')[1]), false);

  // ---- MIDI: lyric events; verse 2 on the second pass of a repeat
  doc.bars[0].repeatStart = true;
  doc.bars[0].repeatEnd = 2;
  const midi = TC.midi.read(TC.midi.build(doc, null, {}).bytes);
  const words = midi.metas.filter((m) => m.type === 0x05).map((m) => decodeURIComponent(escape(String.fromCharCode(...m.data))));
  T.eq('MIDI: syllables (word end with a space), verse 2 on the 2nd pass', words, ['Hal', 'lo ', 'Son', 'ne ', 'Zwei', 'te ', 'Son', 'ne ', 'du ', 'Licht ']);
};
