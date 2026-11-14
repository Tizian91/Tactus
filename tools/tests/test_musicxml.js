'use strict';
// MusicXML export (js/musicxml.js): a well-formed file, every voice fills its bar, parts and instruments
// (General MIDI keys), noteheads, ghost notes, accents, flam / drag, rolls, sticking, triplets, beams,
// repeats, endings, jumps, bar texts, tempo, %-bars, one-line tracks.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'musicxml.js']);
  const SC = TC.score, X = TC.musicxml;
  TC.drums.setNotation('gp');
  const doc = TC.emptyScore(5);
  doc.meta.title = 'Groove & Co';
  doc.meta.tempo = 100;
  TC.state.doc = doc;
  const tr = doc.tracks[0];
  const put = (t, bar, tick, dur, art, extra) => SC.place(doc, t, bar, TC.drums.byId(art).voice, tick, dur, Object.assign(TC.newDrumNote(art, {}), extra || {}));
  // bar 1: hi-hat eighths, kick on 1 and 3, snare on 2 (accent) and 4 (flam), a ghost note, sticking
  [0, 480, 960, 1440, 1920, 2400, 2880, 3360].forEach((t) => put(tr, 0, t, 480, 42));
  put(tr, 0, 0, 960, 36);
  put(tr, 0, 1920, 960, 36);
  put(tr, 0, 960, 480, 38, { accent: 1, stick: 'R' });
  put(tr, 0, 2400, 240, 38, { ghost: true });
  put(tr, 0, 2880, 480, 38, { orn: 'flam' });
  // bar 2: snare triplets on beat 1, sixteenths on beat 2, a drag, a roll on beat 4
  [0, 320, 640].forEach((t) => put(tr, 1, t, 320, 38));
  [960, 1200, 1440, 1680].forEach((t) => put(tr, 1, t, 240, 38));
  put(tr, 1, 1920, 960, 38, { orn: 'drag' });
  put(tr, 1, 2880, 960, 38, { trem: 3 });
  tr.bars[2].simile = true; // bar 3: %
  doc.bars[0].marker = 'Intro';
  doc.bars[1].repeatStart = true;
  doc.bars[2].repeatEnd = 3;
  doc.bars[3].volta = [1];
  doc.bars[3].repeatEnd = 2;
  doc.bars[4].volta = [2];
  doc.bars[1].mark = 'segno';
  doc.bars[4].jump = 'dsFine';
  doc.bars[2].end = 'fine';
  doc.bars[3].tempo = 140;
  // a second track: snare only, one line
  const sn = SC.addTrack(doc, 'Snare');
  sn.kit = [38];
  sn.oneLine = true;
  put(sn, 0, 0, 960, 38);

  const xml = X.build(doc);
  // well-formed: every tag closed in the right order
  const stack = [];
  let wellFormed = true;
  for (const m of xml.replace(/<\?[^>]*\?>|<!DOCTYPE[^>]*>/g, '').matchAll(/<(\/?)([\w-]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) wellFormed = false;
  }
  T.ok('well-formed XML (all tags closed in order)', wellFormed && !stack.length);
  T.ok('MusicXML 3.1 partwise, title escaped', /<score-partwise version="3.1">/.test(xml) && xml.includes('<work-title>Groove &amp; Co</work-title>'));

  const parts = [...xml.matchAll(/<part id="(P\d)">([\s\S]*?)<\/part>/g)].map((m) => ({ id: m[1], body: m[2] }));
  T.eq('a part per track, named', [parts.length, [...xml.matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1])], [2, ['Drums', 'Snare']]);
  T.ok('instruments with their General MIDI key (kick 36 -> 37, 1-based)', /<score-instrument id="P1-I36">[\s\S]*?<midi-instrument id="P1-I36"><midi-channel>10<\/midi-channel><midi-unpitched>37<\/midi-unpitched>/.test(xml));
  const measures = (p) => [...p.body.matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g)].map((m) => m[2]);
  T.eq('every part: one measure per bar', parts.map((p) => measures(p).length), [5, 5]);

  // every voice of every measure fills the bar (grace notes and chord notes take no time)
  const fills = parts.every((p) => measures(p).every((m) => {
    const sums = {};
    let pos = 0;
    for (const e of m.matchAll(/<note>([\s\S]*?)<\/note>|<backup><duration>(\d+)<\/duration><\/backup>/g)) {
      if (e[2]) { pos -= +e[2]; continue; }
      const n = e[1];
      if (/<grace/.test(n) || /<chord\/>/.test(n)) continue;
      const v = (n.match(/<voice>(\d+)<\/voice>/) || [])[1], d = +(n.match(/<duration>(\d+)<\/duration>/) || [])[1];
      sums[v] = (sums[v] || 0) + d;
      pos += d;
    }
    return Object.values(sums).every((s) => s === 3840);
  }));
  T.ok('every voice fills its bar (4/4 = 3840 divisions)', fills);

  const m1 = measures(parts[0])[0], m2 = measures(parts[0])[1];
  T.ok('bar 1: divisions 960, 4/4, percussion clef, tempo 100, rehearsal "Intro"', /<divisions>960<\/divisions>/.test(m1) && /<beats>4<\/beats><beat-type>4<\/beat-type>/.test(m1) &&
    /<sign>percussion<\/sign>/.test(m1) && /<per-minute>100<\/per-minute>/.test(m1) && /<sound tempo="100"\/>/.test(m1) && /<rehearsal>Intro<\/rehearsal>/.test(m1));
  T.ok('hi-hat: x head on G5 (Guitar Pro lines)', /<display-step>G<\/display-step><display-octave>5<\/display-octave><\/unpitched><duration>480<\/duration><instrument id="P1-I42"\/>[\s\S]*?<notehead>x<\/notehead>/.test(m1));
  T.ok('two voices: stems up, then down after a backup', /<stem>up<\/stem>/.test(m1) && /<backup><duration>3840<\/duration><\/backup>/.test(m1) && /<voice>2<\/voice>[\s\S]*?<stem>down<\/stem>/.test(m1));
  T.ok('kick and hi-hat at once: a chord', /<chord\/>/.test(m1));
  T.ok('accent, ghost note in brackets, sticking R under the note', /<accent\/>/.test(m1) && /<notehead parentheses="yes">/.test(m1) && /<lyric[^>]*><syllabic>single<\/syllabic><text>R<\/text><\/lyric>/.test(m1));
  T.ok('flam: a slashed grace note', /<grace slash="yes"\/>/.test(m1));
  T.ok('beams: eighths begin / end', (m1.match(/<beam number="1">begin<\/beam>/g) || []).length >= 3 && /<beam number="1">end<\/beam>/.test(m1));
  T.eq('bar 2: a triplet (3 notes in the time of 2), start and stop', [(m2.match(/<time-modification><actual-notes>3<\/actual-notes><normal-notes>2<\/normal-notes>/g) || []).length, /<tuplet type="start"/.test(m2), /<tuplet type="stop"\/>/.test(m2)], [3, true, true]);
  T.ok('bar 2: sixteenths with two beams, a drag (two graces), a roll (3 strokes)', /<beam number="2">begin<\/beam>/.test(m2) && (m2.match(/<grace\/>/g) || []).length === 2 && /<tremolo type="single">3<\/tremolo>/.test(m2));
  T.ok('bar 2: |: and the segno', /<barline location="left"><bar-style>heavy-light<\/bar-style><repeat direction="forward"\/><\/barline>/.test(m2) && /<segno\/><\/direction-type><sound segno="segno"\/>/.test(m2));
  const m3 = measures(parts[0])[2], m4 = measures(parts[0])[3], m5 = measures(parts[0])[4];
  T.ok('bar 3: %-bar (measure repeat), its notes for playback, Fine, :| 3 times', /<measure-repeat type="start">1<\/measure-repeat>/.test(m3) && (m3.match(/<note>/g) || []).length > 10 &&
    /<sound fine="yes"\/>/.test(m3) && /<repeat direction="backward" times="3"\/>/.test(m3));
  T.ok('bar 4: the % ends, 1st ending closed with :|, tempo 140', /<measure-repeat type="stop"\/>/.test(m4) && /<ending number="1" type="start">1.<\/ending>/.test(m4) &&
    /<ending number="1" type="stop"\/><repeat direction="backward"\/>/.test(m4) && /<per-minute>140<\/per-minute>/.test(m4));
  T.ok('bar 5: 2nd ending, open at the end, D.S. al Fine, final bar line', /<ending number="2" type="start">2.<\/ending>/.test(m5) && /<ending number="2" type="discontinue"\/>/.test(m5) &&
    /D\.S\. al Fine<\/words><\/direction-type><sound dalsegno="segno"\/>/.test(m5) && /<bar-style>light-heavy<\/bar-style>/.test(m5));
  const s1 = measures(parts[1])[0];
  T.ok('one-line track: one staff line, the snare on the line (B4); repeats in every part, texts only in the first',
    /<staff-lines>1<\/staff-lines>/.test(s1) && /<display-step>B<\/display-step><display-octave>4<\/display-octave>/.test(s1) &&
    /<repeat direction="forward"\/>/.test(measures(parts[1])[1]) && !/<rehearsal>/.test(parts[1].body));
  T.ok('an empty voice is left out (no second voice in the snare track)', !/<voice>2<\/voice>/.test(parts[1].body));
  T.eq('staff positions (treble-like: top line F5, middle line B4, below the staff C4)', [0, 4, 10, -2].map((l) => X.display(l)).map((p) => p.step + p.octave), ['F5', 'B4', 'C4', 'A5']);
};
