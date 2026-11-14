'use strict';
/*
 * Test files for the import of jumps into Guitar Pro (which variant of writing signs and jumps does
 * it understand?): two pieces - D.S. al Coda and D.C. al Fine - in four variants each, into xmltest/.
 * Every bar carries its name ("T1", "T2" …) as a bar text, so the order of play can be followed.
 *
 *   ELECTRON_RUN_AS_NODE=1 "<VS Code>/Code.exe" tools/xml_variants.js "<repo>"
 */
const fs = require('fs'), path = require('path');
const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const T = require('./tests/harness')(repo);
const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'musicxml.js']);
TC.drums.setNotation('gp');

/** A piece of n bars: hi-hat eighths, kick on 1 and 3, snare on 2 and 4; set(doc) adds the signs. */
function piece(n, title, set) {
  const doc = TC.emptyScore(n);
  doc.meta.title = title;
  doc.meta.tempo = 120;
  TC.state.doc = doc;
  const t = doc.tracks[0];
  const put = (bar, tick, dur, art) => TC.score.place(doc, t, bar, TC.drums.byId(art).voice, tick, dur, TC.newDrumNote(art, {}));
  for (let b = 0; b < n; b++) {
    [0, 480, 960, 1440, 1920, 2400, 2880, 3360].forEach((k) => put(b, k, 480, 42));
    [0, 1920].forEach((k) => put(b, k, 960, 36));
    [960, 2880].forEach((k) => put(b, k, 960, 38));
    doc.bars[b].marker = 'T' + (b + 1);
  }
  set(doc.bars);
  return doc;
}
const pieces = {
  // played: T1 T2 T3 T4 T5 T6 T7 T8 | T3 T4 T5 | T9 T10
  'DS-al-Coda': piece(10, 'D.S. al Coda', (b) => { b[2].mark = 'segno'; b[4].end = 'toCoda'; b[7].jump = 'dsCoda'; b[8].mark = 'coda'; }),
  // played: T1 T2 T3 T4 T5 T6 | T1 T2 T3 T4
  'DC-al-Fine': piece(6, 'D.C. al Fine', (b) => { b[3].end = 'fine'; b[5].jump = 'dcFine'; }),
};
const variants = {
  'A-standard': { direction: true, measure: false, sign: true, gp: false },
  'B-im-Takt': { direction: false, measure: true, sign: true, gp: false },
  'C-nur-Text-GP-Woerter': { direction: false, measure: false, sign: true, gp: true },
  'D-standard-GP-Woerter': { direction: true, measure: false, sign: true, gp: true },
};
const dir = path.join(repo, 'xmltest');
fs.mkdirSync(dir, { recursive: true });
for (const [p, doc] of Object.entries(pieces)) {
  for (const [v, jumps] of Object.entries(variants)) {
    const file = path.join(dir, `${v}_${p}.musicxml`);
    fs.writeFileSync(file, TC.musicxml.build(doc, { jumps }));
    console.log(path.relative(repo, file));
  }
}
