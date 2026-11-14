'use strict';
// Kit profiles (js/kits.js): automatic assignment, one instrument per key, Cubase drum map with the Tactus notation.
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'cubase.js', 'kits.js']);
  const K = TC.kits, C = TC.cubase;
  TC.drums.setNotation('tactus');
  const item = (i, o, name) => `      <item>
         <int name="INote" value="${i}"/>
         <int name="ONote" value="${o}"/>
         <int name="DisplayNote" value="${i}"/>
         <string name="Name" value="${name}" wide="true"/>
         <int name="NoteheadSet" value="0"/>
         <string name="InstrumentEntityID" value=""/>
         <string name="TechniqueEntityID" value=""/>
      </item>`;
  const drm = (name, items, order) => `<?xml version="1.0" encoding="utf-8"?>
<DrumMap>
   <string name="Name" value="${name}" wide="true"/>
   <list name="Map" type="list">
${items.join('\n')}
   </list>
   <list name="Order" type="int">
${order.map((n) => `      <item value="${n}"/>`).join('\n')}
   </list>
</DrumMap>
`;
  T.eq('line -> pitch', [0, 3, 8, 9, -1, -2, -5].map(K.linePitch), [77, 72, 64, 62, 79, 81, 86]);
  T.eq('line names', [8, 3, -2].map(K.lineName), ['E4', 'C5', 'A5']);

  const ez = drm('EZDrummer3', [item(36, 36, 'Kick'), item(38, 38, 'Snare Center'), item(61, 61, 'Hi-Hat Closed Tip'),
    item(22, 22, 'Hi-Hat Closed Edge'), item(44, 41, 'Floortom 2 Center'), item(73, 73, 'Floortom 2 Rimshot'),
    item(57, 57, 'Crash 3 Crash'), item(20, 20, 'Intro')], [38, 36, 61, 22]);
  const p = K.fromDrm(ez);
  T.eq('profile name from the map', p.name, 'EZDrummer3');
  T.eq('auto: kick, snare, hi-hat with two keys (order of the map), floor tom', [p.assign[36], p.assign[38], p.assign[42], p.assign[43]], [[36], [38], [61, 22], [44]]);
  T.eq('auto: crash 3 joins crash 1 (high); floor tom rim shot has its own instrument; nothing left over', [p.assign[49], p.assign[243], K.unassigned(p).map((e) => e.inote)], [[57], [73], []]);
  T.eq('unnamed keys that were set up can be chosen', K.keys(K.fromDrm(drm('U', [item(30, 30, '').replace('name="DisplayNote" value="30"', 'name="DisplayNote" value="79"'), item(31, 31, 'Sound 32')], [30, 31]))).map((e) => e.inote), [30]);
  T.eq('keys list: named only, map order first', K.keys(p).map((e) => e.inote), [38, 36, 61, 22, 44, 73, 57, 20]);

  K.setKeys(p, 46, [22]);
  T.eq('a key belongs to one instrument: 22 moves to hi-hat open', [p.assign[42], p.assign[46]], [[61], [22]]);
  K.setKeys(p, 46, []);
  T.eq('empty: instrument without key', p.assign[46], undefined);

  K.setKeys(p, 243, []); // a drum key left without instrument
  const out = C.parse(K.toDrm(p));
  const at = (n) => out.entries.find((e) => e.inote === n);
  T.eq('drum map: name', out.name, 'EZDrummer3 (Tactus)');
  T.eq('drum map: kick on the bottom line, snare C5, hi-hat G5 with cross', [at(36).display, at(38).display, at(61).display, at(61).head], [64, 72, 79, 34]);
  T.eq('drum map: floor tom (F4) keeps its output note', [at(44).display, at(44).onote], [65, 41]);
  T.eq('drum map: drum key without instrument placed like its kind, no Cubase instrument; pattern key unchanged', [at(73).display, at(73).head, at(73).instrument, at(20).display], [65, 2, '', 20]);
  T.eq('drum map: order = top of the staff first, then the rest', out.order, [57, 61, 38, 44, 36, 22]);
  T.eq('drum map: no collisions', C.collisions(out), []);

  const bm = K.fromDrm(drm('BeatMaker', [item(36, 36, 'Kick 1'), item(38, 38, 'Kick 2'), item(57, 57, 'FX 2, Perc')], [36, 38, 57]));
  T.eq('BeatMaker: "Kick 2" is the accent (claves / click), FX 2 the tambourine', [bm.assign[36], bm.assign[35], bm.assign[54], bm.assign[75], K.unassigned(bm).map((e) => e.inote)], [[36], undefined, [57], [38], []]);

  const u = K.fromDrm(drm('U', [item(42, 42, 'Hihat.Closed'), item(30, 30, '-')], [42, 30]));
  K.setKeys(u, 49, [30]);
  const uo = C.parse(K.toDrm(u)).entries.find((e) => e.inote === 30);
  T.eq('unnamed key assigned to the crash: crash line, named after the instrument', [uo.display, uo.name], [81, 'Crash high']);

  const odd = K.fromDrm(drm('EZDrummer3', [item(40, 43, 'Hi-Hat Closed Tip'), item(61, 61, 'Hi-Hat Closed Tip'), item(42, 43, 'Floortom 1  Center')], [40, 61, 42]));
  T.eq('mislabelled key (sends the note of another instrument) is not the first key, and is reported', [odd.assign[42], K.suspicious(odd).map((e) => e.inote)], [[61, 40], [40, 42]]);

  TC.drums.setNotation('gp');
  const gpOut = C.parse(K.toDrm(p)).entries.find((e) => e.inote === 44);
  T.eq('drum map uses the Tactus layout even while the view shows Guitar Pro', [gpOut.display, K.rows()[0].id], [65, K.rows()[0].id]);
  TC.drums.setNotation('tactus');

  const la = K.fromDrm(drm('L', [item(42, 42, 'Hihat.Closed'), item(30, 30, 'Reverse')], [42]));
  K.setKeys(la, 30, [30]);
  T.eq('look-alikes: reverse cymbal and crash medium (B5, cross); hi-hat alone is fine', K.lookalikes(la).length, 0);
  K.setKeys(la, 57, [42]);
  T.eq('look-alikes found', K.lookalikes(la).map((g) => g.map((a) => a.id)), [[57, 30]]);

  const uj = K.fromDrm(drm('UJAM-Drummer', [item(48, 48, 'Crash 1'), item(49, 49, 'Crash L'), item(57, 57, 'Crash R')], [49, 57, 48]));
  T.eq('UJAM: 49 is crash 1 (high), 57 crash 2, as in the instrument', [uj.assign[49], uj.assign[57]], [[49, 48], [57]]);

  // a profile without the maker's drum map: 128 keys, General MIDI filled in, Cubase map written from it
  const own = K.blank('Superior Rock', true);
  T.eq('own profile: all 128 keys to choose, General MIDI filled in', [K.keys(own).length, own.assign[36], own.assign[38], own.assign[42], own.assign[46], own.assign[92]], [128, [36], [38], [42], [46], undefined]);
  K.setKeys(own, 48, [47]);
  const ownDrm = C.parse(K.toDrm(own));
  const k47 = ownDrm.entries.find((e) => e.inote === 47);
  T.eq('own profile -> Cubase drum map: unnamed key named after its instrument, Tactus line', [ownDrm.name, k47.name, k47.display, k47.onote], ['Superior Rock (Tactus)', 'Tom 2 (high)', 74, 47]);
  T.eq('note names as in Cubase', [36, 60, 42].map(C.noteName), ['C1', 'C3', 'F#1']);

  // drum kit 'like the kit profile': the instruments the VST has
  K.list = [p];
  TC.state.doc = TC.emptyScore(1);
  TC.state.doc.meta.kit = p.id;
  TC.state.settings.kit = 'profile';
  T.eq('drum kit like the kit profile: exactly its instruments', [...TC.drums.kit()].sort((a, b) => a - b), Object.keys(p.assign).map(Number).sort((a, b) => a - b));
  TC.state.doc.meta.kit = '';
  T.eq('drum kit like the kit profile, score without profile: standard kit', TC.drums.kit().size, TC.drums.kitIds('standard').size);
  TC.state.settings.kit = 'standard';

  K.list = [p, bm];
  const sd = TC.emptyScore(1);
  T.eq('score without kit profile: General MIDI', K.current(sd), null);
  sd.meta.kit = bm.id;
  T.eq('score kit profile by id', K.current(sd).name, 'BeatMaker');
  sd.meta.kit = 'other-computer';
  sd.meta.kitName = 'EZDrummer3';
  T.eq('unknown id (other computer): found by name', K.current(sd) === p, true);
  T.eq('kit profile kept when the score is loaded', TC.normalizeDoc(JSON.parse(JSON.stringify(sd))).meta.kitName, 'EZDrummer3');

  K.list = [p, bm];
  const text = K.exportText();
  K.list = [];
  T.eq('export / import', [K.importText(text), K.list.map((q) => q.name)], [2, ['EZDrummer3', 'BeatMaker']]);
  K.save();
  K.list = [];
  K.load();
  T.eq('saved in the browser and loaded again', K.list.length, 2);

  // templates for free drum VSTs
  const mt = K.fromTemplate('mt-power-drum-kit-2');
  T.ok('template: only known instruments, every key once', Object.keys(mt.assign).every((id) => TC.drums.byId(+id)) &&
    new Set(Object.values(mt.assign).flat()).size === Object.values(mt.assign).flat().length);
  T.eq('template: MT Power Drum Kit keys (kick, snare, pedal, main crash)', [mt.assign[36], mt.assign[38][0], mt.assign[44], mt.assign[49]], [[36], 38, [65], [57]]);
  const mtDrm = C.parse(K.toDrm(mt));
  T.eq('template: drum map for Cubase with named keys', ['36', '57', '65'].map((n) => mtDrm.entries.find((e) => e.inote === +n).name), ['Kick', 'Crash high', 'Pedal hi-hat']);
  T.eq('template General MIDI: GM keys', K.fromTemplate('gm').assign[38], [38]);

  // Cubase 13 and older: head symbols only, no notehead sets / instruments / techniques
  const old = K.toDrm(mt, { legacy: true });
  const hs = (n) => +new RegExp(`<int name="INote" value="${n}"/>[\\s\\S]*?<int name="HeadSymbol" value="(\\d+)"/>`).exec(old)[1];
  T.eq('Cubase 13: head symbols (kick normal, hi-hat x, half open ⊘, open ⊗, crash bold x, bell diamond)', [36, 42, 44, 46, 57, 53].map(hs), [0, 2, 1, 7, 6, 3]);
  T.ok('Cubase 13: no notehead sets, instruments or techniques', !/NoteheadSet|InstrumentEntityID|TechniqueEntityID/.test(old));
  T.ok('Cubase 13: Windows line ends, order list as Cubase writes it, display notes kept', !/[^\r]\n/.test(old) && /<list name="Order" type="int">/.test(old) &&
    C.parse(old).entries.find((e) => e.inote === 42).display === C.parse(K.toDrm(mt)).entries.find((e) => e.inote === 42).display);
  T.ok('Cubase 14+: notehead sets and techniques', /<int name="NoteheadSet" value="34"\/>/.test(K.toDrm(mt)) && /pt\.closed/.test(K.toDrm(mt)));
  T.eq('drum map channel -1 ("the track\'s channel") plays on channel 10', [K.channel({ channel: -1 }), K.channel({ channel: 3 }), K.channel(null)], [9, 3, 9]);
};
