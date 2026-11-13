'use strict';
// MIDI import (js/midiin.js): reading files, snapping (straight / triplets), velocity, flam, bars, tempo, markers, kit profiles.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js', 'playback.js', 'cubase.js', 'kits.js', 'midi.js', 'midiin.js']);
  const SC = TC.score, MI = TC.midiIn;
  const doc = TC.emptyScore(3);
  doc.meta.tempo = 100;
  TC.state.doc = doc;
  const tr = doc.tracks[0];
  const put = (bar, tick, dur, art, extra) => SC.place(doc, tr, bar, TC.drums.byId(art).voice, tick, dur, Object.assign(TC.newDrumNote(art, {}), extra || {}));
  [0, 480, 960, 1440, 1920, 2400, 2880, 3360].forEach((t) => put(0, t, 480, 42));
  put(0, 0, 960, 36);
  put(0, 960, 960, 38, { accent: 1 });
  put(0, 2400, 240, 38, { ghost: true });
  put(0, 2880, 960, 38, { orn: 'flam' });
  [0, 320, 640, 960, 1280, 1600].forEach((t) => put(1, t, 320, 38)); // eighth triplets on beats 1 and 2
  put(1, 1920, 240, 45); put(1, 2160, 240, 45); put(1, 2400, 240, 43); put(1, 2640, 240, 43);
  doc.bars[2].ts = [3, 4];
  doc.bars[2].tempo = 120;
  doc.bars[2].marker = 'Chorus';
  put(2, 0, 960, 49);
  put(2, 0, 960, 36);

  const sig = (d) => d.tracks[0].bars.map((b) => b.voices.map((v) => v.map((e) => e.tick + ':' + e.notes.map((n) => n.art + (n.accent ? '>' : '') + (n.ghost ? '()' : '') + (n.orn ? '~' + n.orn : '')).sort().join('+')).join(' ')));
  const midi = MI.parse(TC.midi.build(doc, null).bytes);
  const res = MI.toScore(midi, { grid: 240, triplets: true });
  T.eq('round trip (export -> import): same notes, accent, ghost, flam, triplets', sig(res.doc), sig(doc));
  T.eq('round trip: bars, time signatures, tempo, marker', [res.doc.bars.length, res.doc.bars.map((b) => b.ts.join('/')), res.doc.meta.tempo, res.doc.bars[2].tempo, res.doc.bars[2].marker],
    [3, ['4/4', '4/4', '3/4'], 100, 120, 'Chorus']);
  T.eq('nothing unknown', res.unknown, []);

  // played by hand: 480 ticks per quarter, a bit early / late, two tracks (type 1), unknown key 99
  const bytes = [];
  const vlq = (n) => { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; };
  const trk = (events) => { // events: [t, bytes]
    const d = []; let last = 0;
    events.sort((a, b) => a[0] - b[0]).forEach(([t, b]) => { d.push(...vlq(t - last), ...b); last = t; });
    d.push(0, 0xff, 0x2f, 0);
    return [0x4d, 0x54, 0x72, 0x6b, (d.length >>> 24) & 255, (d.length >>> 16) & 255, (d.length >>> 8) & 255, d.length & 255, ...d];
  };
  const on = (t, n, v) => [[t, [0x99, n, v]], [t + 30, [0x89, n, 0]]];
  const t1 = trk([[0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]], [0, [0xff, 0x58, 4, 4, 2, 24, 8]], [0, [0xff, 0x06, 5, ...Array.from('Verse', (c) => c.charCodeAt(0))]]]);
  const notes = [].concat(on(5, 36, 100), on(236, 42, 90), on(482, 42, 30), on(717, 42, 90), on(962, 38, 120),
    on(1120, 46, 90), on(1283, 46, 90), on(1437, 46, 90), on(1924, 99, 80), on(1900, 38, 40), on(1916, 38, 90));
  const t2 = trk(notes.map(([t, b]) => [t, b]));
  bytes.push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0, ...t1, ...t2);
  const hm = MI.parse(new Uint8Array(bytes));
  T.eq('parse: type 1, 480 per quarter, 11 notes, tempo 120, marker', [hm.tpq, hm.notes.length, Math.round(hm.tempos[0].bpm), hm.markers[0].text], [480, 11, 120, 'Verse']);
  const hr = MI.toScore(hm, { grid: 240, triplets: true });
  const v = (vi) => hr.doc.tracks[0].bars[0].voices[vi].map((e) => e.tick + ':' + e.notes.map((n) => n.art + (n.accent ? '>' : '') + (n.ghost ? '()' : '') + (n.orn ? '~' + n.orn : '')).join('+'));
  T.eq('played by hand: snapped to 16ths, ghost (soft), accent (loud), triplet beat, flam (soft hit just before)',
    [v(0), hr.doc.tracks[0].bars[1].voices[0].map((e) => e.tick + ':' + e.notes[0].art + '~' + e.notes[0].orn)],
    [['480:42', '960:42()', '1440:42', '1920:38>', '2240:46', '2560:46', '2880:46'], ['0:38~flam']]);
  T.eq('played by hand: kick in the feet voice', v(1), ['0:36']);
  T.eq('unknown key reported', hr.unknown, [{ note: 99, count: 1 }]);
  T.eq('marker becomes the bar text', hr.doc.bars[0].marker, 'Verse');
  T.eq('no triplets wanted: the triplet beat snaps to 16ths', MI.toScore(hm, { grid: 240, triplets: false }).doc.tracks[0].bars[0].voices[0].map((e) => e.tick).filter((t) => t > 1920 && t < 3000), [2160, 2640, 2880]);

  // a whole project exported: the drum track is found and read alone
  T.eq('tracks: names and note counts', hm.tracks.map((t) => [t.name, t.notes]), [['', 0], ['', 11]]);
  T.eq('drum track: the one with notes', MI.drumTrack(hm), 1);
  const proj = { tracks: [{ name: 'Drums U5', notes: 0, channels: new Set() }, { name: 'EZdrummer 01', notes: 3, channels: new Set([0]) }, { name: 'Piano', notes: 40, channels: new Set([0]) }] };
  T.eq('drum track found by name, even with fewer notes than the piano', MI.drumTrack(proj), 1);
  const two = { tpq: 960, notes: [{ t: 0, note: 36, vel: 90, trk: 1 }, { t: 0, note: 60, vel: 90, trk: 2 }], tempos: [{ t: 0, bpm: 102 }], sigs: [], markers: [], names: [], tracks: proj.tracks };
  const tr1 = MI.toScore(two, { track: 1, tempo: 120 });
  T.eq('only the chosen track; tempo set in the dialog wins over the file', [tr1.notes, tr1.unknown, tr1.doc.meta.tempo], [1, [], 120]);

  // kit profile: every key of an instrument counts (also the extra ones)
  const item = (i, name) => `<item><int name="INote" value="${i}"/><int name="ONote" value="${i}"/><int name="DisplayNote" value="${i}"/><string name="Name" value="${name}"/></item>`;
  const p = TC.kits.fromDrm(`<DrumMap><string name="Name" value="EZ"/><list name="Map" type="list">${[item(61, 'Hi-Hat Closed Tip'), item(22, 'Hi-Hat Closed Edge'), item(34, 'Kick')].join('')}</list></DrumMap>`);
  const pm = { tpq: 960, notes: [{ t: 0, note: 34, vel: 90 }, { t: 0, note: 61, vel: 90 }, { t: 480, note: 22, vel: 90 }], tempos: [], sigs: [], markers: [], names: [] };
  const pr = MI.toScore(pm, { profile: p, grid: 240 });
  T.eq('kit profile: both hi-hat keys are the closed hi-hat, 34 the kick; the score keeps the profile',
    [pr.doc.tracks[0].bars[0].voices[0].map((e) => e.tick + ':' + e.notes[0].art), pr.doc.tracks[0].bars[0].voices[1].map((e) => e.notes[0].art), pr.doc.meta.kitName], [['0:42', '480:42'], [36], 'EZ']);
};
